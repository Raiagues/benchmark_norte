"""Study grouping uses isolated responses only; it never edits real history."""

import json

from fastapi.testclient import TestClient

from benchmark import resume, runner, storage
from test_resume import interrupted_batch, table_rows


def test_continuation_protocols_share_study_and_preserve_original_metrics(
    db, ds, monkeypatch
):
    bid, old, _ = interrupted_batch(ds, db, monkeypatch, finish_first=True)
    ids = resume.prepare(bid, resume.public_plan(bid, db)["token"], db)
    child = storage.get_execution(ids[0], db)
    child_bid = child["metadata"]["batch_id"]
    # Test-only protocol variation. Production history must not be rewritten.
    with storage.connect(db) as con:
        con.execute(
            "UPDATE executions SET metadata=? WHERE id=?",
            (
                json.dumps({**child["metadata"], "comparison_hash": "other-protocol"}),
                ids[0],
            ),
        )
    runner.execute_run(ids[0], db)
    with storage.connect(db) as con:
        before = {
            t: table_rows(con, t)
            for t in (
                "runs",
                "executions",
                "task_results",
                "live_calls",
                "live_batches",
            )
        }
    legacy = runner.aggregate(db)
    joined = runner.aggregate(db, by_study=True)
    assert len(joined) == 2  # Different protocols retain their own statistics.
    assert {r["study_id"] for r in joined} == {bid}
    assert sum(r["n"] for r in joined) == 2
    assert {rid for row in joined for rid in row["run_ids"]} == {old[0], ids[0]}
    for row in joined:
        assert set(row["study_batch_ids"]) == {bid, child_bid}
        old_row = next(
            r for r in legacy if r["comparison_hash"] == row["comparison_hash"]
        )
        assert {key: row[key] for key in old_row} == old_row
    with storage.connect(db) as con:
        assert {t: table_rows(con, t) for t in before} == before


def test_summary_does_not_merge_independent_studies_using_the_same_protocol(
    ds, monkeypatch
):
    from benchmark.api import app

    first, _, _ = interrupted_batch(ds, None, monkeypatch, finish_first=True)
    second, _, _ = interrupted_batch(ds, None, monkeypatch, finish_first=True)
    with TestClient(app) as client:
        original = client.get("/api/summary").json()
        assert len(original) == 1 and original[0]["n"] == 2
        response = client.get("/api/summary?by_study=true")
    assert response.status_code == 200
    rows = response.json()
    assert {r["study_id"] for r in rows} == {first, second}
    assert len(rows) == 2 and all(r["n"] == 1 for r in rows)
    assert len({r["comparison_hash"] for r in rows}) == 1
