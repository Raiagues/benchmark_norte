"""Transport fixtures are isolated in tmp_path; never create local benchmark history."""

import json
import threading
import time
import socket
from copy import deepcopy

import httpx
import uvicorn
from fastapi.testclient import TestClient

from benchmark import live, storage, runner
from benchmark.runner import prepare_runs, execute_run, configuration, aggregate
from response_fixtures import install_mock_api


def model():
    return configuration()["models"][0]


def batch_of(rid, db):
    return storage.get_execution(rid, db)["metadata"]["batch_id"]


def test_one_model_groups_repetitions_and_exact_metric_denominators(
    db, ds, monkeypatch
):
    install_mock_api(monkeypatch, ds, db=db)
    ids = prepare_runs([model()], ["relationship_extraction"], 3, db=db)
    before = live.snapshot(batch_of(ids[0], db), db)
    assert len(before["models"]) == 1
    assert len(before["models"][0]["repetitions"]) == 3
    assert before["models"][0]["quality"] == []
    assert before["operations"]["input_tokens"]["reported"] is None
    assert before["operations"]["progress"] == 0
    for rid in ids:
        execute_run(rid, db)
    snap = live.snapshot(batch_of(ids[0], db), db)
    assert snap["status"] == "COMPLETED"
    assert snap["operations"]["evaluated"] == snap["operations"]["partial"] == 3
    assert snap["operations"]["technical_errors"] == 0
    assert snap["operations"]["progress"] == 1
    q = snap["models"][0]["quality"][0]
    recall = q["metrics"]["relationship_recall"]
    assert recall["numerator"] == 3 * (len(ds["ground_truth"]["relationships"]) - 1)
    assert recall["denominator"] == 3 * len(ds["ground_truth"]["relationships"])
    assert recall["executions"] == 3
    assert [h["completed"] for h in q["history"]] == [1, 2, 3]
    assert snap["operations"]["input_tokens"]["reported"] == 300
    assert snap["operations"]["output_tokens"]["reported"] == 150
    assert snap["operations"]["cost_usd"] is None


def test_snapshot_version_and_execution_state_use_the_same_read_transaction(
    db, ds, monkeypatch
):
    install_mock_api(monkeypatch, ds, db=db)
    rid = prepare_runs([model()], ["relationship_extraction"], 1, db=db)[0]
    bid = batch_of(rid, db)
    original = storage.connect
    before = live.snapshot(bid, db)
    cid = before["calls"][0]["id"]
    changed = False

    class ConcurrentRead:
        def __enter__(self):
            self.con = original(db)
            return self

        def __exit__(self, *args):
            self.con.__exit__(*args)
            self.con.close()

        def execute(self, query, args=()):
            nonlocal changed
            cursor = self.con.execute(query, args)
            if "SELECT * FROM live_batches" in query and not changed:
                changed = True
                # A separate WAL writer commits between the reader's SELECTs.
                with original(db) as writer:
                    writer.execute(
                        "UPDATE live_calls SET status='RUNNING' WHERE id=?", (cid,)
                    )
                    live._event(writer, bid, "EXECUTION_STARTED", cid)
            return cursor

    monkeypatch.setattr(storage, "connect", lambda *_: ConcurrentRead())
    during = live.snapshot(bid, db)
    assert during["last_event_id"] == before["last_event_id"]
    assert during["calls"][0]["status"] == "QUEUED"
    after = live.snapshot(bid, db)
    assert after["last_event_id"] > before["last_event_id"]
    assert after["calls"][0]["status"] == "RUNNING"


def test_stop_preserves_inflight_and_stops_all_queued_work(db, ds, monkeypatch):
    sent = install_mock_api(monkeypatch, ds, db=db)
    original = runner.call_provider
    entered, release = threading.Event(), threading.Event()

    def blocked(*args, **kwargs):
        # Block only after the transport is actually entered: cancellation may not
        # pretend to unsend an already dispatched request.
        observer = kwargs["observer"]

        def observed(kind, data):
            observer(kind, data)
            if kind == "API_REQUEST_SENT":
                entered.set()
                assert release.wait(5)

        kwargs["observer"] = observed
        return original(*args, **kwargs)

    monkeypatch.setattr(runner, "call_provider", blocked)
    ids = prepare_runs(
        [model()], ["entity_extraction", "relationship_extraction"], 2, db=db
    )
    bid = batch_of(ids[0], db)
    worker = threading.Thread(target=execute_run, args=(ids[0], db))
    worker.start()
    assert entered.wait(5)
    during = live.snapshot(bid, db)
    assert during["operations"]["running"] == 1
    live.stop_batch(bid, db)
    stopped = live.snapshot(bid, db)
    assert stopped["operations"]["interrupted"] == 3
    assert stopped["status"] == "STOPPING"
    release.set()
    worker.join(10)
    assert not worker.is_alive()
    execute_run(ids[1], db)
    snap = live.snapshot(bid, db)
    assert snap["status"] == "INTERRUPTED_BY_USER"
    assert snap["operations"]["evaluated"] == 1
    assert snap["operations"]["interrupted"] == 3
    assert snap["operations"]["progress"] == 0.25
    assert len(sent) == 1
    result = storage.get_run(ids[0], db)
    assert result["status"] == "partially_completed"
    assert result["results"][0]["raw_response"]["id"] == "test-response"
    assert aggregate(db)[0]["n"] == 1
    assert (
        live.call_detail(result["results"][0]["id"], db)["input"]["confirmed_feedback"]
        == []
    )


def test_technical_errors_and_interruptions_do_not_score(db, ds, monkeypatch):
    install_mock_api(
        monkeypatch,
        ds,
        [(200, json.dumps(ds["ground_truth"]["entities"])), (401, "")],
        db=db,
    )
    rid = prepare_runs(
        [model()], ["entity_extraction", "relationship_extraction", "one_hop"], 1, db=db
    )[0]
    execute_run(rid, db)
    snap = live.snapshot(batch_of(rid, db), db)
    assert snap["operations"]["evaluated"] == 1
    assert snap["operations"]["technical_errors"] == 1
    assert snap["operations"]["interrupted"] == 1
    assert snap["operations"]["progress"] == 2 / 3
    assert [q["task"] for q in snap["models"][0]["quality"]] == ["entity_extraction"]
    assert snap["models"][0]["quality"][0]["metrics"]["entity_recall"]["value"] == 1
    failed = next(c for c in snap["calls"] if c["status"] == "TECHNICAL_ERROR")
    detail = live.call_detail(failed["id"], db)
    assert detail["call"]["attempts"][0]["http_status"] == 401
    assert detail["result"] is None
    assert "Invalid" not in str(aggregate(db))


def test_no_invented_full_credit_for_bad_evidence(db, ds, monkeypatch):
    graph = {
        "nodes": deepcopy(ds["ground_truth"]["entities"]["nodes"]),
        "edges": deepcopy(ds["ground_truth"]["relationships"]),
    }
    graph["edges"][0]["source_evidence"][0]["excerpt"] = (
        "A fabricated quotation for isolated testing."
    )
    install_mock_api(monkeypatch, ds, [(200, json.dumps(graph))], db=db)
    rid = prepare_runs([model()], ["relationship_extraction"], 1, db=db)[0]
    execute_run(rid, db)
    call = live.calls_for_run(rid, db)[0]
    assert call["status"] == "COMPLETED_INCORRECT"
    assert call["data"]["quality"] == "partial"
    assert call["result"]["metrics"]["relationship_f1"] == 1
    assert call["result"]["metrics"]["supported_relationship_f1"] < 1


def original_rows(db):
    with storage.connect(db) as con:
        return {
            table: [
                tuple(row)
                for row in con.execute("SELECT * FROM " + table + " ORDER BY rowid")
            ]
            for table in (
                "runs",
                "executions",
                "task_results",
                "feedback",
                "human_reviews",
                "connection_checks",
                "benchmark_reviews",
                "benchmark_revisions",
            )
        }


def test_forward_migration_preserves_every_legacy_byte(db, ds, monkeypatch):
    install_mock_api(monkeypatch, ds, db=db)
    ids = prepare_runs([model()], ["relationship_extraction"], 2, db=db)
    execute_run(ids[0], db)
    # Reconstruct an older schema in an isolated test database only.
    with storage.connect(db) as con:
        for table in (
            "live_calls",
            "live_batches",
            "live_events",
            "execution_recovery",
        ):
            con.execute("DROP TABLE " + table)
        con.execute("UPDATE executions SET status='running' WHERE id=?", (ids[1],))
    before = original_rows(db)
    storage.init_db(db)
    live.recover_history(db)
    assert original_rows(db) == before
    storage.init_db(db)
    live.recover_history(db)
    assert original_rows(db) == before
    snap = live.snapshot(batch_of(ids[0], db), db)
    assert snap["status"] == "PARTIALLY_COMPLETED"
    assert snap["operations"]["evaluated"] == snap["operations"]["interrupted"] == 1
    assert (
        live.events(snap["id"], db=db) == []
    )  # No invented historical event timeline.
    execution = next(e for e in storage.list_executions(db) if e["id"] == ids[1])
    assert execution["status"] == "interrupted"
    assert execution["original_status"] == "running"


def test_refresh_and_restart_keep_saved_response_and_unparsed_checkpoint(
    db, ds, monkeypatch
):
    install_mock_api(monkeypatch, ds, db=db)
    ids = prepare_runs(
        [model()], ["entity_extraction", "relationship_extraction"], 1, db=db
    )
    call = live.calls_for_run(ids[0], db)[0]
    assert live.begin_call(call["id"], db)
    live.transition(
        call["id"],
        "RESPONSE_RECEIVED",
        "API_RESPONSE_RECEIVED",
        {"response_checkpoint": {"test_only": "actual received envelope"}},
        db,
    )
    before = original_rows(db)
    live.recover_history(db)
    assert original_rows(db) == before
    detail = live.call_detail(call["id"], db)
    assert detail["status"] == "INTERRUPTED"
    assert detail["response_checkpoint"]["test_only"] == "actual received envelope"
    assert detail["result"] is None
    assert aggregate(db) == []


def test_api_stop_requires_explicit_confirmation_and_local_header(ds, monkeypatch):
    from benchmark.api import app

    install_mock_api(monkeypatch, ds)
    with TestClient(app) as client:
        ids = prepare_runs([model()], ["entity_extraction"], 1)
        bid = batch_of(ids[0], None)
        assert (
            client.post(f"/api/live/{bid}/stop", json={"confirmed": True}).status_code
            == 403
        )
        assert (
            client.post(
                f"/api/live/{bid}/stop",
                headers={"X-Norte-Client": "local-ui"},
                json={"confirmed": False},
            ).status_code
            == 422
        )
        assert (
            client.post(
                f"/api/live/{bid}/stop",
                headers={"X-Norte-Client": "local-ui"},
                json={"confirmed": True},
            ).status_code
            == 200
        )
        assert client.get("/api/runs").json() == []
        assert client.get(f"/api/live/{bid}").json()["operations"]["interrupted"] == 1


def test_real_http_sse_reports_transition_and_reconnects_without_paid_calls(
    ds, monkeypatch
):
    from benchmark.api import app

    entered, release = threading.Event(), threading.Event()

    def waiting_transport(request):
        entered.set()
        assert release.wait(8)

    install_mock_api(monkeypatch, ds, on_request=waiting_transport)
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    server = uvicorn.Server(
        uvicorn.Config(app, host="127.0.0.1", port=port, log_level="error")
    )
    worker = threading.Thread(target=server.run, daemon=True)
    worker.start()
    deadline = time.monotonic() + 8
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.01)
    assert server.started
    try:
        ids = prepare_runs([model()], ["relationship_extraction"], 1)
        bid = batch_of(ids[0], None)
        url = f"http://127.0.0.1:{port}/api/live/{bid}/stream"
        with httpx.Client(timeout=5) as client:
            with client.stream("GET", url) as response:
                assert response.headers["content-type"].startswith("text/event-stream")
                lines = response.iter_lines()
                first = next(
                    json.loads(line[6:]) for line in lines if line.startswith("data: ")
                )
                assert first["operations"]["evaluated"] == 0
                execution_worker = threading.Thread(target=execute_run, args=(ids[0],))
                execution_worker.start()
                assert entered.wait(5)
                in_flight = next(
                    data
                    for line in lines
                    if line.startswith("data: ")
                    for data in [json.loads(line[6:])]
                    if data["calls"][0]["stage"] == "WAITING_FOR_RESPONSE"
                )
                assert in_flight["operations"]["running"] == 1
                assert in_flight["operations"]["evaluated"] == 0
                assert in_flight["calls"][0]["stage"] == "WAITING_FOR_RESPONSE"
                assert not in_flight["models"][0]["quality"]
                release.set()
                execution_worker.join(8)
                assert not execution_worker.is_alive()
                second = next(
                    data
                    for line in lines
                    if line.startswith("data: ")
                    for data in [json.loads(line[6:])]
                    if data["status"] == "COMPLETED"
                )
                assert second["operations"]["evaluated"] == 1
                assert second["operations"]["progress"] == 1
                assert second["models"][0]["quality"]
            with client.stream(
                "GET", url, headers={"Last-Event-ID": str(first["last_event_id"])}
            ) as response:
                restored = next(
                    json.loads(line[6:])
                    for line in response.iter_lines()
                    if line.startswith("data: ")
                )
                assert restored["operations"] == second["operations"]
                assert restored["calls"][0]["has_result"]
            result = client.get(
                f"http://127.0.0.1:{port}/api/live-results/{second['calls'][0]['id']}"
            ).json()
            assert result["result"]["raw_response"]["id"] == "test-response"
    finally:
        release.set()
        server.should_exit = True
        worker.join(10)
    assert not worker.is_alive()
