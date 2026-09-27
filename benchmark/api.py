import threading
import asyncio
import json
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from . import storage, live
from .connections import statuses, verify_connections, select_models
from .dataset import ROOT, TASKS, digest, load_dataset, prompt_bundle
from .evaluate import compare_graph
from .runner import aggregate, configuration, execute_run, prepare_runs
from .schemas import Dependency
from .security import KEY_NAMES, get_key, redact

RUN_LOCK = threading.Lock()


@asynccontextmanager
async def lifespan(app):
    storage.init_db()
    live.recover_history()
    yield


app = FastAPI(title="Norte engineering benchmark", lifespan=lifespan)
app.add_middleware(
    TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Content-Type", "X-Norte-Client"],
)


@app.middleware("http")
async def local_mutations(request: Request, call_next):
    if (
        request.method in ("POST", "PATCH", "DELETE")
        and request.headers.get("x-norte-client") != "local-ui"
    ):
        return JSONResponse({"detail": "Local client header required"}, status_code=403)
    return await call_next(request)


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "norte-benchmark"}


@app.get("/api/config")
def config():
    ds = load_dataset()
    return {
        **configuration(),
        "key_available": {p: bool(get_key(p)) for p in KEY_NAMES},
        "manifest": ds["manifest"],
        "dataset_hash": digest(ds),
        "prompt_hashes": {k: digest(v) for k, v in prompt_bundle().items()},
        "tasks": TASKS,
        "connections": statuses(configuration()["models"]),
        "pdf_ready": all(
            (ROOT / f"data/pdfs/{d}.pdf").exists()
            for d in ("fan", "sensor", "driver", "alt-fan", "alt-driver")
        ),
    }


@app.get("/api/documents")
def documents():
    return load_dataset()


@app.get("/api/sources")
def source_registry():
    from .artifacts import sources

    return sources()


@app.get("/api/sources/{document_id}/pdf")
def source_pdf(document_id: str):
    from .artifacts import find_source, source_path

    source = find_source(document_id)
    path = source_path(source) if source else None
    if not path:
        raise HTTPException(404, "Original PDF is not available locally")
    return FileResponse(
        path,
        media_type="application/pdf",
        content_disposition_type="inline",
        filename=path.name,
    )


@app.post("/api/sources/{document_id}/cache")
def cache_source_pdf(document_id: str):
    from .artifacts import cache_source, sources
    import httpx

    try:
        cache_source(document_id)
    except (ValueError, OSError, httpx.HTTPError):
        raise HTTPException(400, "source_download_failed") from None
    return sources()


@app.get("/api/benchmark")
def benchmark_overview():
    from .workbench import overview

    return overview()


@app.get("/api/benchmark/preview")
def benchmark_preview(
    task: str = "relationship_extraction",
    difficulty: str = "L1_DIRECT",
    input_mode: Literal["pdf_text"] = "pdf_text",
):
    from .workbench import preview

    try:
        return preview(task, difficulty, input_mode)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None


class BenchmarkEdit(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)
    kind: str
    item_id: str
    value: str | float | dict
    note: str = Field(min_length=1, max_length=2000)
    expected_hash: str


class ReferenceReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item_key: str
    verdict: Literal["accepted", "rejected"]
    comment: str = Field(default="", max_length=2000)
    expected_hash: str


@app.post("/api/benchmark/edit")
def benchmark_edit(body: BenchmarkEdit):
    from .workbench import save_edit

    if not RUN_LOCK.acquire(blocking=False):
        raise HTTPException(409, "operation_in_progress")
    try:
        return save_edit(**body.model_dump())
    except ValueError as exc:
        from pydantic import ValidationError

        raise HTTPException(
            400,
            "invalid_reference_fields"
            if isinstance(exc, ValidationError)
            else str(exc),
        ) from None
    finally:
        RUN_LOCK.release()


@app.post("/api/benchmark/review")
def benchmark_review(body: ReferenceReview):
    from .workbench import record_review

    if not RUN_LOCK.acquire(blocking=False):
        raise HTTPException(409, "operation_in_progress")
    try:
        return record_review(**body.model_dump())
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None
    finally:
        RUN_LOCK.release()


@app.get("/api/runs")
def runs():
    return storage.list_runs()


@app.get("/api/executions")
def executions():
    return storage.list_executions()


@app.get("/api/live")
def live_history():
    return live.list_batches()


@app.get("/api/live/{batch_id}")
def live_snapshot(batch_id: str):
    result = live.snapshot(batch_id)
    if result is None:
        raise HTTPException(404, "Run not found")
    return result


@app.get("/api/live/{batch_id}/events")
def live_events(batch_id: str, after: int = 0):
    return live.events(batch_id, after)


@app.get("/api/live/{batch_id}/stream")
async def live_stream(batch_id: str, request: Request):
    if not live.snapshot(batch_id):
        raise HTTPException(404, "Run not found")

    async def stream():
        # Always send a full persisted snapshot on reconnect (including refresh).
        previous = None
        heartbeat = 0
        while not await request.is_disconnected():
            data = await asyncio.to_thread(live.snapshot, batch_id)
            version = (data["last_event_id"], data["status"])
            if version != previous:
                yield f"id: {data['last_event_id']}\nevent: snapshot\ndata: {json.dumps(redact(data), ensure_ascii=False)}\n\n"
                previous = version
            heartbeat += 1
            if heartbeat % 20 == 0:
                yield ": keepalive\n\n"
            await asyncio.sleep(0.5)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class StopRequest(BaseModel):
    confirmed: Literal[True]


@app.post("/api/live/{batch_id}/stop")
def stop_live(batch_id: str, body: StopRequest):
    try:
        live.stop_batch(batch_id)
    except ValueError:
        raise HTTPException(404, "Run not found") from None
    return live.snapshot(batch_id)


@app.get("/api/live/{batch_id}/resume")
def resume_preview(batch_id: str):
    from .resume import public_plan

    try:
        return public_plan(batch_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None


class ResumeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmed: Literal[True]
    token: str = Field(min_length=64, max_length=64)


@app.post("/api/live/{batch_id}/resume", status_code=202)
def resume_live(batch_id: str, body: ResumeRequest, background: BackgroundTasks):
    from .resume import prepare

    if not RUN_LOCK.acquire(blocking=False):
        raise HTTPException(409, "An operation is already running")
    try:
        ids = prepare(batch_id, body.token)
    except ValueError as exc:
        RUN_LOCK.release()
        raise HTTPException(400, str(exc)) from None
    except Exception:
        RUN_LOCK.release()
        raise
    background.add_task(execute_batch, ids)
    return {
        "run_ids": ids,
        "batch_id": storage.get_execution(ids[0])["metadata"]["batch_id"],
    }


@app.get("/api/live-results/{call_id}")
def live_result(call_id: str):
    result = live.call_detail(call_id)
    if result is None:
        raise HTTPException(404, "Execution not found")
    return result


def require_run(run_id):
    run = storage.get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return run


@app.get("/api/runs/{run_id}")
def run_detail(run_id: str):
    return require_run(run_id)


@app.get("/api/runs/{run_id}/download")
def download(run_id: str):
    return JSONResponse(
        require_run(run_id),
        headers={"Content-Disposition": f'attachment; filename="{run_id}.json"'},
    )


@app.get("/api/runs/{run_id}/graph")
def graph(run_id: str):
    run = require_run(run_id)
    ds = run["snapshot"]["dataset"]
    output = next(
        (
            r["parsed_output"]
            for r in run["results"]
            if r["task"] == "relationship_extraction" and r["parsed_output"]
        ),
        {"nodes": [], "edges": []},
    )
    return {
        "model": output,
        "ground_truth": {
            "nodes": ds["ground_truth"]["entities"]["nodes"],
            "edges": ds["ground_truth"]["relationships"],
        },
        "comparison": compare_graph(output, ds),
        "run_id": run_id,
        "model_name": run["metadata"]["model"],
    }


@app.get("/api/summary")
def summary():
    return aggregate()


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    models: list[int] = Field(default_factory=list)
    depths: dict[str, str] = Field(default_factory=dict)
    tasks: list[str] = Field(default_factory=lambda: TASKS.copy())
    repetitions: int = Field(default=3, ge=1, le=10)
    input_mode: Literal["pdf_text"] = "pdf_text"
    experiment: Literal["first_pass", "feedback_assisted"] = "first_pass"
    baseline_run_id: str | None = None


class ConnectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    models: list[int] = Field(min_length=1, max_length=50)
    depths: dict[str, str] = Field(default_factory=dict)
    force: bool = False


@app.post("/api/connections/verify")
def check_connections(body: ConnectionRequest):
    if not RUN_LOCK.acquire(blocking=False):
        raise HTTPException(
            409, "Aguarde a operação em andamento antes de verificar conexões."
        )
    try:
        cfg = configuration()
        try:
            models = select_models(cfg["models"], body.models, body.depths)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from None
        return verify_connections(models, force=body.force)
    finally:
        RUN_LOCK.release()


@app.post("/api/connections/status")
def selected_connection_status(body: ConnectionRequest):
    """Local lookup only; changing a selector never calls a provider."""
    try:
        return statuses(
            select_models(configuration()["models"], body.models, body.depths)
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None


def execute_batch(ids):
    try:
        for rid in ids:
            execute_run(rid)
    finally:
        RUN_LOCK.release()


@app.post("/api/runs", status_code=202)
def start_run(body: RunRequest, background: BackgroundTasks):
    if not RUN_LOCK.acquire(blocking=False):
        raise HTTPException(
            409, "A benchmark is already running. Wait for it to finish."
        )
    try:
        cfg = configuration()
        models = select_models(cfg["models"], body.models, body.depths)
        ids = prepare_runs(
            models,
            body.tasks,
            body.repetitions,
            body.input_mode,
            body.experiment,
            body.baseline_run_id,
        )
    except ValueError as exc:
        RUN_LOCK.release()
        raise HTTPException(400, str(exc)) from None
    except Exception:
        RUN_LOCK.release()
        raise
    background.add_task(execute_batch, ids)
    return {
        "run_ids": ids,
        "batch_id": storage.get_execution(ids[0])["metadata"]["batch_id"],
    }


class FeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: str
    edge: Dependency
    verdict: Literal["Correct", "Incorrect", "Missing relationship"]
    correction: str = Field(min_length=1, max_length=1000)
    confirmed: bool = False


@app.get("/api/feedback")
def feedback_list():
    return storage.list_feedback()


@app.post("/api/feedback")
def feedback_create(body: FeedbackRequest):
    run = require_run(body.run_id)
    ds = run["snapshot"]["dataset"]
    data = body.model_dump()
    data["dataset_hash"] = digest(ds)
    return storage.save_feedback(redact(data))


class Confirmation(BaseModel):
    confirmed: bool


@app.patch("/api/feedback/{feedback_id}")
def feedback_confirm(feedback_id: str, body: Confirmation):
    result = storage.confirm_feedback(feedback_id, body.confirmed)
    if not result:
        raise HTTPException(404, "Feedback not found")
    return result


class ExplanationReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: str
    result_id: str
    scenario_id: str
    requirement_id: str
    verdict: Literal["Supported explanation", "Unsupported explanation", "Needs review"]
    comment: str = Field(min_length=1, max_length=2000)


@app.post("/api/reviews")
def review_create(body: ExplanationReview):
    run = require_run(body.run_id)
    if body.result_id not in {r["id"] for r in run["results"]}:
        raise HTTPException(400, "Result does not belong to this run")
    return storage.save_review(body.model_dump())


@app.get("/api/runs/{run_id}/reviews")
def reviews(run_id: str):
    require_run(run_id)
    return storage.list_reviews(run_id)


if (ROOT / "frontend/dist").exists():
    app.mount(
        "/", StaticFiles(directory=ROOT / "frontend/dist", html=True), name="frontend"
    )
