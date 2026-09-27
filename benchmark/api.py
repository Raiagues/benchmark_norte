import threading
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from . import storage
from .connections import statuses, verify_connections
from .dataset import ROOT, TASKS, digest, load_dataset, prompt_bundle
from .evaluate import compare_graph
from .runner import aggregate, configuration, execute_run, prepare_runs
from .schemas import Dependency
from .security import KEY_NAMES, get_key, redact

RUN_LOCK = threading.Lock()


@asynccontextmanager
async def lifespan(app):
    storage.init_db()
    # In-process work cannot survive restart. Never silently resume paid calls.
    for info in storage.list_executions():
        if info["status"] in ("running", "pending"):
            run = storage.get_execution(info["id"])
            run["status"] = "interrupted"
            run["failure"] = {"category": "server_restarted"}
            storage.save_execution(run)
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
            (ROOT / f"data/pdfs/{d}.pdf").exists() for d in ("fan", "sensor", "driver")
        ),
    }


@app.get("/api/documents")
def documents():
    return load_dataset()


@app.get("/api/benchmark")
def benchmark_overview():
    from .workbench import overview

    return overview()


@app.get("/api/benchmark/preview")
def benchmark_preview(
    task: str = "relationship_extraction",
    difficulty: str = "L1_DIRECT",
    input_mode: str = "controlled_text",
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
    tasks: list[str] = Field(default_factory=lambda: TASKS.copy())
    repetitions: int = Field(default=3, ge=1, le=10)
    input_mode: Literal["controlled_text", "pdf_text"] = "controlled_text"
    experiment: Literal["first_pass", "feedback_assisted"] = "first_pass"
    baseline_run_id: str | None = None


class ConnectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    models: list[int] = Field(min_length=1, max_length=50)
    force: bool = False


@app.post("/api/connections/verify")
def check_connections(body: ConnectionRequest):
    if not RUN_LOCK.acquire(blocking=False):
        raise HTTPException(
            409, "Aguarde a operação em andamento antes de verificar conexões."
        )
    try:
        cfg = configuration()
        if len(set(body.models)) != len(body.models) or any(
            i < 0 or i >= len(cfg["models"]) for i in body.models
        ):
            raise HTTPException(400, "Seleção de modelos inválida.")
        return verify_connections(
            [cfg["models"][i] for i in body.models], force=body.force
        )
    finally:
        RUN_LOCK.release()


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
        if any(i < 0 or i >= len(cfg["models"]) for i in body.models) or len(
            set(body.models)
        ) != len(body.models):
            raise ValueError("Invalid model selection")
        models = [cfg["models"][i] for i in body.models]
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
    return {"run_ids": ids}


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
