"""Continuation tests use isolated SQLite/HTTP fixtures only."""

import json
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from benchmark import live, resume, runner, storage
from response_fixtures import install_mock_api


def interrupted_batch(
    ds, db, monkeypatch, tasks=None, repetitions=2, finish_first=False
):
    sent = install_mock_api(monkeypatch, ds, db=db)
    ids = runner.prepare_runs(
        [runner.configuration()["models"][0]],
        tasks or ["relationship_extraction"],
        repetitions,
        db=db,
    )
    bid = storage.get_execution(ids[0], db)["metadata"]["batch_id"]
    if finish_first:
        runner.execute_run(ids[0], db)
    live.stop_batch(bid, db)
    return bid, ids, sent


def table_rows(con, table):
    return [tuple(r) for r in con.execute(f"SELECT * FROM {table} ORDER BY rowid")]


def test_resume_preserves_incorrect_results_and_old_records_and_cannot_repeat(
    db, ds, monkeypatch
):
    bid, old_ids, sent = interrupted_batch(ds, db, monkeypatch, finish_first=True)
    snap = live.snapshot(bid, db)
    assert snap["operations"]["answer_errors"] == 1
    with storage.connect(db) as con:
        old = {
            t: table_rows(con, t)
            for t in (
                "executions",
                "runs",
                "task_results",
                "live_calls",
                "live_batches",
                "live_events",
            )
        }
    preview = resume.public_plan(bid, db)
    assert preview["eligible"] == 1 and preview["completed_preserved"] == 1
    ids = resume.prepare(bid, preview["token"], db)
    with storage.connect(db) as con:
        for t, rows in old.items():
            assert table_rows(con, t)[: len(rows)] == rows
    new = storage.get_execution(ids[0], db)
    assert new["metadata"]["repetition"] == 2
    assert new["metadata"]["resumed_from"] == bid
    assert new["metadata"]["total_calls"] == 1
    assert len(sent) == 1  # preparation never sends requests
    runner.execute_run(ids[0], db)
    assert len(sent) == 2
    assert resume.public_plan(bid, db)["eligible"] == 0
    with pytest.raises(ValueError):
        resume.prepare(bid, preview["token"], db)
    assert len(storage.list_runs(db)) == 2
    assert storage.get_run(old_ids[0], db)["results"][0]["id"] == snap["calls"][0]["id"]


def test_resume_schedules_only_unfinished_task_level_not_entire_repetition(
    db, ds, monkeypatch
):
    sent = install_mock_api(monkeypatch, ds, db=db)
    ids = runner.prepare_runs(
        [runner.configuration()["models"][0]], ["impact_explanation"], 1, db=db
    )
    bid = storage.get_execution(ids[0], db)["metadata"]["batch_id"]
    original = live.finish_call

    def finish(cid, *args, **kwargs):
        original(cid, *args, **kwargs)
        live.stop_batch(bid, db)

    monkeypatch.setattr(live, "finish_call", finish)
    runner.execute_run(ids[0], db)
    monkeypatch.setattr(live, "finish_call", original)
    assert len(sent) == 1
    ids = resume.prepare(bid, resume.public_plan(bid, db)["token"], db)
    work = live.calls_for_run(ids[0], db)
    assert [(r["data"]["task"], r["data"]["difficulty"]) for r in work] == [
        ("impact_explanation", "L2_ONE_HOP")
    ]
    runner.execute_run(ids[0], db)
    assert len(sent) == 2
    assert storage.get_run(ids[0], db)["metadata"]["total_calls"] == 1


def test_resume_excludes_dispatched_lost_responses_and_technical_errors(
    db, ds, monkeypatch
):
    bid, ids, sent = interrupted_batch(ds, db, monkeypatch, repetitions=3)
    calls = live.snapshot(bid, db)["calls"]
    with storage.connect(db) as con:
        row = con.execute(
            "SELECT data FROM live_calls WHERE id=?", (calls[0]["id"],)
        ).fetchone()
        data = json.loads(row[0])
        data["attempt"] = 1
        data["response_checkpoint"] = {"preserved": "original"}
        con.execute(
            "UPDATE live_calls SET data=? WHERE id=?",
            (json.dumps(data), calls[0]["id"]),
        )
        con.execute(
            "UPDATE live_calls SET status='TECHNICAL_ERROR' WHERE id=?",
            (calls[1]["id"],),
        )
    p = resume.public_plan(bid, db)
    assert (
        p["eligible"] == 1
        and p["uncertain"] == 1
        and p["technical_errors_preserved"] == 1
    )
    resumed = resume.prepare(bid, p["token"], db)
    assert storage.get_execution(resumed[0], db)["metadata"]["repetition"] == 3
    assert sent == []


def test_legacy_running_is_uncertain_but_never_started_repetitions_resume_cleanly(
    db, ds, monkeypatch
):
    bid, ids, sent = interrupted_batch(ds, db, monkeypatch)
    with storage.connect(db) as con:
        for rid in ids:
            for row in con.execute(
                "SELECT id,data FROM live_calls WHERE run_id=?", (rid,)
            ).fetchall():
                data = json.loads(row["data"])
                data.update(legacy=True, interruption_reason="unknown_after_restart")
                con.execute(
                    "UPDATE live_calls SET data=? WHERE id=?",
                    (json.dumps(data), row["id"]),
                )
            row = con.execute(
                "SELECT snapshot FROM executions WHERE id=?", (rid,)
            ).fetchone()
            snap = json.loads(row[0])
            snap["dataset"]["manifest"].pop("input_policy")
            snap["dataset"]["documents"]["PROJECT"]["PROJECT-06"] = (
                "Archived answer hints"
            )
            con.execute(
                "UPDATE executions SET snapshot=? WHERE id=?", (json.dumps(snap), rid)
            )
        con.execute("UPDATE executions SET status='running' WHERE id=?", (ids[0],))
    p = resume.public_plan(bid, db)
    assert p["eligible"] == 1 and p["uncertain"] == 1 and p["context_changed"]
    resumed = resume.prepare(bid, p["token"], db)
    runner.execute_run(resumed[0], db)
    assert len(sent) == 1 and "Archived answer hints" not in sent[0]
    assert "PROJECT-06" not in sent[0]


def test_resume_all_or_nothing_missing_key_creates_no_new_work(db, ds, monkeypatch):
    bid, ids, sent = interrupted_batch(ds, db, monkeypatch)
    p = resume.public_plan(bid, db)
    before = storage.list_executions(db)
    monkeypatch.delenv("OPENAI_API_KEY")
    with pytest.raises(ValueError, match="Nenhuma chamada"):
        resume.prepare(bid, p["token"], db)
    assert storage.list_executions(db) == before and sent == []
    with storage.connect(db) as con:
        assert con.execute("SELECT COUNT(*) FROM live_continuations").fetchone()[0] == 0


def test_atomic_reservations_prevent_two_continuations_of_same_calls(
    db, ds, monkeypatch
):
    bid, _, sent = interrupted_batch(ds, db, monkeypatch)
    p = resume.public_plan(bid, db)

    def attempt():
        try:
            return resume.prepare(bid, p["token"], db)
        except ValueError:
            return None

    with ThreadPoolExecutor(2) as pool:
        outcomes = list(pool.map(lambda _: attempt(), range(2)))
    assert sum(o is not None for o in outcomes) == 1
    assert sent == []
    with storage.connect(db) as con:
        assert con.execute("SELECT COUNT(*) FROM live_batches").fetchone()[0] == 2
        assert con.execute("SELECT COUNT(*) FROM live_continuations").fetchone()[0] == 2


def test_resume_validates_every_provider_before_scheduling_any_work(
    db, ds, monkeypatch
):
    from benchmark.connections import save_check
    from benchmark.security import KEY_NAMES

    sent = install_mock_api(monkeypatch, ds, db=db)
    models = runner.configuration()["models"][:3]
    for model in models[1:]:
        monkeypatch.setenv(KEY_NAMES[model["provider"]], "unit-test-only")
        save_check(
            model,
            "unit-test-only",
            {
                "status": "ready",
                "ready": True,
                "api_responded": True,
                "generation_confirmed": True,
                "diagnostic": None,
            },
            db,
        )
    ids = runner.prepare_runs(models, ["relationship_extraction"], 1, db=db)
    bid = storage.get_execution(ids[0], db)["metadata"]["batch_id"]
    live.stop_batch(bid, db)
    preview = resume.public_plan(bid, db)
    before = storage.list_executions(db)
    monkeypatch.delenv("GOOGLE_API_KEY")
    with pytest.raises(ValueError, match="Nenhuma chamada"):
        resume.prepare(bid, preview["token"], db)
    assert storage.list_executions(db) == before
    assert sent == []


def test_continuation_can_itself_resume_without_reusing_original_calls(
    db, ds, monkeypatch
):
    bid, _, _ = interrupted_batch(ds, db, monkeypatch)
    ids = resume.prepare(bid, resume.public_plan(bid, db)["token"], db)
    child = storage.get_execution(ids[0], db)["metadata"]["batch_id"]
    live.stop_batch(child, db)
    ids2 = resume.prepare(child, resume.public_plan(child, db)["token"], db)
    assert len(ids2) == 2
    assert (
        resume.public_plan(bid, db)["eligible"]
        == resume.public_plan(child, db)["eligible"]
        == 0
    )


def test_resume_requires_confirmation_and_api_lock(monkeypatch, ds, tmp_path):
    from benchmark.api import app, RUN_LOCK

    bid, _, sent = interrupted_batch(ds, None, monkeypatch)
    headers = {"x-norte-client": "local-ui"}
    with TestClient(app) as client:
        p = client.get(f"/api/live/{bid}/resume").json()
        assert (
            client.post(
                f"/api/live/{bid}/resume", json={"confirmed": True, "token": p["token"]}
            ).status_code
            == 403
        )
        assert (
            client.post(
                f"/api/live/{bid}/resume", headers=headers, json={"token": p["token"]}
            ).status_code
            == 422
        )
        RUN_LOCK.acquire()
        try:
            assert (
                client.post(
                    f"/api/live/{bid}/resume",
                    headers=headers,
                    json={"confirmed": True, "token": p["token"]},
                ).status_code
                == 409
            )
        finally:
            RUN_LOCK.release()
        r = client.post(
            f"/api/live/{bid}/resume",
            headers=headers,
            json={"confirmed": True, "token": p["token"]},
        )
        assert r.status_code == 202
        assert (
            client.get("/api/live/" + r.json()["batch_id"]).json()["operations"][
                "evaluated"
            ]
            == 2
        )
        assert len(sent) == 2


def test_additive_migration_preserves_every_old_table_row(db):
    with storage.connect(db) as con:
        con.execute("INSERT INTO human_reviews VALUES ('old','run','{}')")
        before = table_rows(con, "human_reviews")
    storage.init_db(db)
    storage.init_db(db)
    with storage.connect(db) as con:
        assert table_rows(con, "human_reviews") == before
        assert table_rows(con, "live_continuations") == []
