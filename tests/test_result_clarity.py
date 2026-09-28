"""All generated responses and writes are isolated by conftest fixtures."""

import pytest
from fastapi.testclient import TestClient
from benchmark import storage, live, resume, retry, studies
from test_resume import interrupted_batch, table_rows


def test_study_counts_latest_attempt_once_and_keeps_original_rows(db, ds, monkeypatch):
    bid, old, sent = interrupted_batch(ds, db, monkeypatch, finish_first=True)
    with storage.connect(db) as con:
        before = {
            t: table_rows(con, t)
            for t in ("live_calls", "executions", "runs", "task_results")
        }
    child = resume.prepare(bid, resume.public_plan(bid, db)["token"], db)
    child_bid = storage.get_execution(child[0], db)["metadata"]["batch_id"]
    snap = studies.snapshot(child_bid, db)
    assert snap["study_id"] == bid and snap["operations"]["planned"] == 2
    assert snap["operations"]["evaluated"] == 1 and snap["operations"]["queued"] == 1
    assert snap["attempt_count"] == 3 and len(snap["study_batches"]) == 2
    with storage.connect(db) as con:
        for t, rows in before.items():
            assert table_rows(con, t)[: len(rows)] == rows
    live.stop_batch(child_bid, db)
    assert resume.public_plan(bid, db)["eligible"] == 1
    assert len(sent) == 1


def test_retry_completed_selection_preserves_response_and_prevents_duplicate(
    db, ds, monkeypatch
):
    bid, old, sent = interrupted_batch(ds, db, monkeypatch, finish_first=True)
    before = storage.get_run(old[0], db)
    call = live.snapshot(bid, db)["calls"][0]
    proposal = retry.public_plan(bid, db)
    ids = retry.prepare(bid, proposal["token"], [call["id"]], db)
    assert len(ids) == 1 and len(sent) == 1
    assert storage.get_run(old[0], db) == before
    assert storage.get_execution(ids[0], db)["metadata"]["source_call_ids"] == [
        call["id"]
    ]
    with pytest.raises(ValueError):
        retry.prepare(bid, proposal["token"], [call["id"]], db)
    snap = studies.snapshot(bid, db)
    assert snap["operations"]["planned"] == 2
    assert snap["operations"]["queued"] == 1
    assert snap["operations"]["evaluated"] == 0  # prior attempt stays in history


def test_retry_requires_ready_provider_and_rejects_unknown_selection(
    db, ds, monkeypatch
):
    bid, _, sent = interrupted_batch(ds, db, monkeypatch)
    p = retry.public_plan(bid, db)
    with pytest.raises(ValueError, match="eligible"):
        retry.prepare(bid, p["token"], ["not-a-real-call"], db)
    monkeypatch.delenv("OPENAI_API_KEY")
    with pytest.raises(ValueError):
        retry.prepare(bid, p["token"], [p["calls"][0]["id"]], db)
    assert sent == []
    with storage.connect(db) as con:
        assert con.execute("SELECT COUNT(*) FROM live_batches").fetchone()[0] == 1


def test_annotation_persists_without_changing_scores_and_requires_local_header(
    ds, monkeypatch
):
    from benchmark.api import app

    bid, old, _ = interrupted_batch(ds, None, monkeypatch, finish_first=True)
    cid = live.snapshot(bid)["calls"][0]["id"]
    before = storage.get_run(old[0])
    with TestClient(app) as client:
        body = {
            "result_id": cid,
            "target": "REQ-001",
            "verdict": "disagree",
            "comment": "Please review the relationship type.",
        }
        assert client.post("/api/result-reviews", json=body).status_code == 403
        response = client.post(
            "/api/result-reviews", json=body, headers={"X-Norte-Client": "local-ui"}
        )
        assert response.status_code == 200
        assert response.json()["confirmed"] is False
        assert (
            client.get(f"/api/result-reviews/{cid}").json()[0]["comment"]
            == body["comment"]
        )
        assert (
            client.post(
                "/api/result-reviews",
                json={**body, "result_id": "unknown"},
                headers={"X-Norte-Client": "local-ui"},
            ).status_code
            == 400
        )
    assert storage.get_run(old[0]) == before


def test_pdf_hash_guard_never_substitutes_different_file(monkeypatch, tmp_path):
    from benchmark.api import app
    from benchmark import artifacts
    from benchmark.dataset import digest

    pdf = tmp_path / "original.pdf"
    pdf.write_bytes(b"%PDF-isolated-source")
    monkeypatch.setattr(artifacts, "find_source", lambda _: {"document_id": "FAN"})
    monkeypatch.setattr(artifacts, "source_path", lambda _: pdf)
    with TestClient(app) as client:
        assert client.get("/api/sources/FAN/pdf?expected_hash=wrong").status_code == 409
        assert (
            client.get(
                f"/api/sources/FAN/pdf?expected_hash={digest(pdf.read_bytes())}"
            ).content
            == pdf.read_bytes()
        )


def test_study_quality_keeps_protocols_apart(db, ds, monkeypatch):
    import json
    from benchmark import runner

    bid, _, _ = interrupted_batch(ds, db, monkeypatch, finish_first=True)
    ids = resume.prepare(bid, resume.public_plan(bid, db)["token"], db)
    # Isolated fixture: simulate a new comparison protocol for this child.
    run = storage.get_execution(ids[0], db)
    metadata = dict(run["metadata"], comparison_hash="isolated-other-protocol")
    with storage.connect(db) as con:
        con.execute(
            "UPDATE executions SET metadata=? WHERE id=?",
            (json.dumps(metadata), ids[0]),
        )
    runner.execute_run(ids[0], db)
    snap = studies.snapshot(bid, db)
    quality = snap["models"][0]["quality"][0]
    assert snap["operations"]["evaluated"] == 2
    assert quality["excluded_other_protocol"] == 1
    assert len(quality["history"]) == 1
    assert quality["protocol_key"] == "isolated-other-protocol"


def test_old_stop_does_not_disable_stopping_continuation_and_usage_keeps_old_attempts(
    db, ds, monkeypatch
):
    bid, _, _ = interrupted_batch(ds, db, monkeypatch, finish_first=True)
    before = studies.snapshot(bid, db)["attempt_operations"]["api_calls"]
    ids = resume.prepare(bid, resume.public_plan(bid, db)["token"], db)
    child = storage.get_execution(ids[0], db)["metadata"]["batch_id"]
    snap = studies.snapshot(bid, db)
    assert snap["active_batch_ids"] == [child]
    assert snap["stop_requested"] is False
    assert snap["attempt_operations"]["api_calls"] == before
