import json

import pytest
from fastapi.testclient import TestClient

from benchmark import storage
from benchmark.dataset import digest, make_prompt, prompt_bundle
from benchmark.runner import aggregate, configuration, execute_run, prepare_runs
from benchmark.schemas import response_schema
from response_fixtures import install_mock_api


def model():
    return configuration()["models"][0]


def test_completed_api_runs_publish_atomically(db, ds, monkeypatch):
    install_mock_api(monkeypatch, ds, db=db)
    ids = prepare_runs([model()], repetitions=3, db=db)
    assert storage.list_runs(db) == []
    assert not (db.parent / "results").exists()
    for rid in ids:
        result = execute_run(rid, db)
        assert result["status"] == "completed"
        assert len(result["results"]) == 6
        export = db.parent / "results/openai" / rid / "run.json"
        saved = json.loads(export.read_text())
        assert saved["metadata"]["origin"] == "provider_api"
        assert saved["snapshot"]["dataset"]["ground_truth"]["relationships"]
        assert all(r["raw_response"]["id"] == "test-response" for r in saved["results"])
        assert all(r["prompt_hash"] == digest(r["prompt"]) for r in saved["results"])
    groups = aggregate(db)
    assert {g["difficulty"] for g in groups} == {"L1_DIRECT", "L2_ONE_HOP"}
    one_hop = next(g for g in groups if g["task"] == "one_hop")
    assert one_hop["depth"] == "high"
    assert one_hop["n"] == 3
    assert one_hop["consistency"] == 1
    assert one_hop["estimated_cost_usd"] is None
    with pytest.raises(ValueError, match="pending"):
        execute_run(ids[0], db)


def test_missing_keys_rejected_before_creating_execution(db, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        prepare_runs([model()], repetitions=1, db=db)
    assert storage.list_runs(db) == storage.list_executions(db) == []


@pytest.mark.parametrize(
    "status,text,category",
    [
        (401, "", "invalid_key"),
        (429, "", "rate_limit"),
        (500, "", "service_unavailable"),
        (200, "not JSON", "parsing_failure"),
        (200, '{"wrong":[]}', "invalid_structured_output"),
    ],
)
def test_failed_execution_never_becomes_a_result(
    db, ds, monkeypatch, status, text, category
):
    install_mock_api(monkeypatch, ds, [(status, text)], db=db)
    rid = prepare_runs([model()], ["entity_extraction"], repetitions=1, db=db)[0]
    attempt = execute_run(rid, db)
    assert attempt["status"] == "failed"
    assert attempt["failure"]["category"] == category
    assert "metrics" not in attempt
    assert storage.get_run(rid, db) is None
    assert storage.list_runs(db) == aggregate(db) == []
    assert not (db.parent / "results").exists()
    with storage.connect(db) as con:
        assert con.execute("SELECT count(*) FROM task_results").fetchone()[0] == 0


def test_partial_success_is_preserved_and_published_as_partial(db, ds, monkeypatch):
    install_mock_api(
        monkeypatch,
        ds,
        [(200, json.dumps(ds["ground_truth"]["entities"])), (401, "")],
        db=db,
    )
    rid = prepare_runs(
        [model()],
        ["entity_extraction", "relationship_extraction"],
        repetitions=1,
        db=db,
    )[0]
    attempt = execute_run(rid, db)
    assert attempt["metadata"]["completed_calls"] == 1
    assert attempt["status"] == "failed"
    assert len(storage.list_runs(db)) == 1
    partial = storage.get_run(rid, db)
    assert partial["status"] == "partially_completed"
    assert partial["metadata"]["incomplete"] is True
    assert len(partial["results"]) == 1
    assert partial["results"][0]["task"] == "entity_extraction"
    assert aggregate(db)[0]["n"] == 1
    # Failed calls stay operational records, never fabricated quality results.
    with storage.connect(db) as con:
        assert con.execute("SELECT count(*) FROM task_results").fetchone()[0] == 0


def test_incomplete_scenario_set_not_published(db, ds, monkeypatch):
    install_mock_api(monkeypatch, ds, [(200, '{"scenarios":[]}')], db=db)
    rid = prepare_runs([model()], ["one_hop"], repetitions=1, db=db)[0]
    assert execute_run(rid, db)["failure"]["category"] == "scenario_coverage_error"
    assert aggregate(db) == []


def test_feedback_storage_does_not_touch_ground_truth(db, ds):
    before = digest(ds["ground_truth"])
    record = storage.save_feedback(
        {
            "run_id": "run",
            "edge": {
                "source": "REQ-002",
                "relationship": "constrains",
                "target": "P-FAN-SPEED",
            },
            "verdict": "Missing relationship",
            "correction": "Review the fan speed.",
            "confirmed": False,
            "dataset_hash": digest(ds),
        },
        db,
    )
    assert storage.list_feedback(db, True) == []
    storage.confirm_feedback(record["id"], True, db)
    assert storage.list_feedback(db, True)[0]["confirmed"] is True
    assert before == digest(ds["ground_truth"])
    review = storage.save_review(
        {
            "run_id": "run",
            "comment": "Human explanation review",
            "verdict": "Needs review",
        },
        db,
    )
    assert storage.list_reviews("run", db) == [review]


def test_feedback_is_opt_in_and_paired(db, ds, monkeypatch):
    install_mock_api(monkeypatch, ds, db=db)
    tasks = ["relationship_extraction", "one_hop"]
    rid = prepare_runs([model()], tasks, repetitions=1, db=db)[0]
    baseline = execute_run(rid, db)
    storage.save_feedback(
        {
            "run_id": rid,
            "edge": {
                "source": "REQ-002",
                "relationship": "constrains",
                "target": "P-FAN-SPEED",
            },
            "verdict": "Missing relationship",
            "correction": "REQ-002 constrains P-FAN-SPEED.",
            "confirmed": True,
            "dataset_hash": baseline["metadata"]["dataset_hash"],
        },
        db,
    )
    normal = prepare_runs([model()], tasks, repetitions=1, db=db)[0]
    assert storage.get_execution(normal, db)["snapshot"]["feedback"] == []
    assisted = prepare_runs(
        [model()],
        tasks,
        repetitions=1,
        experiment="feedback_assisted",
        baseline_run_id=rid,
        db=db,
    )[0]
    result = execute_run(assisted, db)
    assert result["status"] == "completed"
    assert result["results"][0]["feedback_metrics"]["performance_improvement"] > 0
    assert (
        result["results"][1]["feedback_transfer_metrics"]["transfer"][
            "correction_retention_rate"
        ]
        == 1
    )
    with pytest.raises(ValueError, match="Baseline must match"):
        prepare_runs(
            [model()],
            ["one_hop"],
            repetitions=1,
            experiment="feedback_assisted",
            baseline_run_id=rid,
            db=db,
        )


def test_prompt_does_not_leak_ground_truth(ds):
    text = make_prompt(
        ds, prompt_bundle(), "one_hop", "L2_ONE_HOP", response_schema("one_hop"), []
    )
    assert "expected_reason" not in text and "affected_requirements" not in text
    assert "PROJECT-05" not in text and "PROJECT-06" not in text
    assert '"confirmed_feedback": []' in text


def test_api_only_exposes_completed_provider_results(monkeypatch, tmp_path, ds):
    from benchmark.api import app

    monkeypatch.setattr(storage, "ROOT", tmp_path)
    install_mock_api(monkeypatch, ds)
    headers = {"X-Norte-Client": "local-ui"}
    with TestClient(app) as client:
        assert client.get("/api/runs").json() == []
        assert client.get("/api/summary").json() == []
        assert client.post("/api/runs", json={}).status_code == 403
        assert (
            client.post("/api/runs", headers=headers, json={"demo": True}).status_code
            == 422
        )
        response = client.post(
            "/api/runs",
            headers=headers,
            json={
                "models": [0],
                "repetitions": 1,
                "tasks": ["relationship_extraction"],
            },
        )
        assert response.status_code == 202
        rid = response.json()["run_ids"][0]
        assert client.get(f"/api/runs/{rid}").json()["status"] == "completed"
        graph = client.get(f"/api/runs/{rid}/graph").json()
        assert graph["model"]["edges"] and graph["ground_truth"]["edges"]
        assert client.get(f"/api/runs/{rid}/download").status_code == 200
        assert client.get("/api/runs/no-such-run").status_code == 404
        assert (
            client.post("/api/runs", headers=headers, json={"models": [-1]}).status_code
            == 400
        )
        install_mock_api(monkeypatch, ds, [(401, "")])
        failed = client.post(
            "/api/runs",
            headers=headers,
            json={"models": [0], "repetitions": 1, "tasks": ["entity_extraction"]},
        ).json()["run_ids"][0]
        assert len(client.get("/api/runs").json()) == 1
        assert client.get(f"/api/runs/{failed}").status_code == 404
        assert client.get(f"/api/runs/{failed}/download").status_code == 404
        assert client.get(f"/api/runs/{failed}/graph").status_code == 404
        assert client.get("/api/executions").json()[0]["status"] == "failed"
        assert all(
            g["task"] != "entity_extraction" for g in client.get("/api/summary").json()
        )


def test_legacy_demo_or_failed_rows_are_never_visible(db):
    with storage.connect(db) as con:
        for rid, status, meta in [
            ("old-demo", "completed", {"demo": True}),
            ("old-error", "failed", {"origin": "provider_api"}),
        ]:
            con.execute(
                "INSERT INTO runs VALUES (?,?,?,?,?)",
                (rid, "date", status, json.dumps(meta), "{}"),
            )
    assert storage.list_runs(db) == aggregate(db) == []
    assert storage.get_run("old-demo", db) is None
    assert storage.get_run("old-error", db) is None


def test_restart_interrupts_without_creating_results(monkeypatch, tmp_path, ds):
    from benchmark.api import app

    monkeypatch.setattr(storage, "ROOT", tmp_path)
    install_mock_api(monkeypatch, ds)
    rid = prepare_runs([model()], ["entity_extraction"], repetitions=1)[0]
    with TestClient(app) as client:
        assert client.get("/api/executions").json()[0]["status"] == "interrupted"
        assert client.get("/api/runs").json() == []
        assert client.get(f"/api/runs/{rid}").status_code == 404
        assert not (tmp_path / "results").exists()
