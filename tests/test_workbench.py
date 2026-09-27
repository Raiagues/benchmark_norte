import copy

import pytest
from fastapi.testclient import TestClient

from benchmark import storage
from benchmark.dataset import digest, load_dataset, make_prompt, prompt_bundle
from benchmark.runner import configuration, prepare_runs, execute_run
from benchmark.schemas import response_schema
from benchmark.workbench import (
    overview,
    preview,
    record_review,
    review_state,
    save_edit,
)
from response_fixtures import install_mock_api


def test_preview_is_the_actual_first_pass_prompt_and_never_leaks_reference(db):
    for task, level in [
        ("entity_extraction", "L1_DIRECT"),
        ("relationship_extraction", "L1_DIRECT"),
        ("change_impact", "L1_DIRECT"),
        ("one_hop", "L2_ONE_HOP"),
        ("impact_explanation", "L2_ONE_HOP"),
    ]:
        p = preview(task, level, db=db)
        actual = make_prompt(
            load_dataset(db=db),
            prompt_bundle(db=db),
            task,
            level,
            response_schema(task),
            [],
        )
        assert p["prompt"] == actual and p["prompt_hash"] == digest(actual)
        assert p["input"]["confirmed_feedback"] == []
        for forbidden in (
            "ground_truth",
            "expected_reason",
            "affected_requirements",
            "critical_requirements",
            "unaffected_requirements",
        ):
            assert forbidden not in p["input"]
            assert all(forbidden not in c for c in p["input"]["scenarios"])
        if level == "L2_ONE_HOP":
            assert "PROJECT-05" not in p["input"]["documents"]["PROJECT"]
            assert "PROJECT-06" not in p["input"]["documents"]["PROJECT"]
    assert storage.list_runs(db) == storage.list_executions(db) == []


def test_confirm_and_reject_are_audited_without_editing_reference(db):
    before = load_dataset(db=db)
    key = "parameter:P-FAN-CURRENT"
    record_review(key, "accepted", "Checked against source", digest(before), db)
    assert review_state(before, db)["accepted"] == 1
    record_review(key, "rejected", "Needs another review", digest(before), db)
    state = review_state(before, db)
    assert state["accepted"] == 0 and state["rejected"] == 1
    assert len(overview(db)["history"]["reviews"]) == 2
    assert load_dataset(db=db) == before
    assert storage.list_runs(db) == []


def test_rejected_reference_blocks_paid_benchmark(db, ds, monkeypatch):
    sent = install_mock_api(monkeypatch, ds, db=db)
    record_review(
        "requirement:REQ-001", "rejected", "Check the classification", digest(ds), db
    )
    with pytest.raises(ValueError, match="reference_has_rejected_items"):
        prepare_runs([configuration()["models"][0]], ["entity_extraction"], 1, db=db)
    assert sent == [] and storage.list_executions(db) == []


def test_reference_edit_is_versioned_and_not_exposed_to_models(db):
    b = overview(db)
    edge = copy.deepcopy(b["dataset"]["ground_truth"]["relationships"][0])
    key = "|".join(edge[k] for k in ("source", "relationship", "target"))
    record_review(
        f"relationship:{key}", "accepted", "", b["review"]["dataset_hash"], db
    )
    edge["reason"] = "Human-edited explanation, excluded from model input."
    save_edit("relationship", key, edge, "Clarify rationale", b["edit_hash"], db)
    after = overview(db)
    assert after["dataset"]["manifest"]["dataset_version"].endswith("+local.1")
    assert after["review"]["accepted"] == 0
    assert len(after["history"]["revisions"]) == 1
    assert (
        edge["reason"]
        not in preview("relationship_extraction", "L1_DIRECT", db=db)["prompt"]
    )
    assert (
        load_dataset(use_local=False)["ground_truth"]["relationships"][0]["reason"]
        != edge["reason"]
    )


def test_document_edit_changes_preview_and_requires_reference_evidence_review(db):
    b = overview(db)
    old = b["dataset"]["documents"]["FAN"]["FAN-02"]
    value = "A new independently supplied passage requiring reference review."
    save_edit(
        "document",
        "FAN:FAN-02",
        value,
        "Correct the input transcription",
        b["edit_hash"],
        db,
    )
    p = preview("entity_extraction", "L1_DIRECT", db=db)
    assert p["input"]["documents"]["FAN"]["FAN-02"] == value
    assert load_dataset(use_local=False)["documents"]["FAN"]["FAN-02"] == old
    after = overview(db)
    with pytest.raises(ValueError, match="invalid_reference_evidence"):
        record_review(
            "parameter:P-FAN-CURRENT",
            "accepted",
            "",
            after["review"]["dataset_hash"],
            db,
        )


def test_prompt_and_requirement_edits_change_future_inputs_only(db):
    b = overview(db)
    save_edit(
        "prompt",
        "relationship_extraction",
        "Return evidence-based relationships as strict JSON.",
        "Prompt wording",
        b["edit_hash"],
        db,
    )
    b = overview(db)
    assert b["prompts"]["relationship_extraction"].startswith("Return evidence")
    assert (
        b["dataset"]["manifest"]["prompt_versions"]["relationship_extraction"]
        == "local.1"
    )
    text = (
        b["dataset"]["documents"]["REQUIREMENTS"]["REQ-001"] + " Human clarification."
    )
    save_edit(
        "document",
        "REQUIREMENTS:REQ-001",
        text,
        "Clarify product requirement",
        b["edit_hash"],
        db,
    )
    ds = load_dataset(db=db)
    assert ds["ground_truth"]["requirements"][0]["text"] == text
    assert ds["documents"]["REQUIREMENTS"]["REQ-001"] == text
    assert ds["manifest"]["dataset_version"].endswith("+local.2")


def test_edits_do_not_mutate_completed_run_snapshots(db, ds, monkeypatch):
    install_mock_api(monkeypatch, ds, db=db)
    rid = prepare_runs([configuration()["models"][0]], ["entity_extraction"], 1, db=db)[
        0
    ]
    old = execute_run(rid, db)
    b = overview(db)
    save_edit(
        "configuration",
        "activation_threshold_degC",
        36,
        "Change operating setting",
        b["edit_hash"],
        db,
    )
    assert load_dataset(db=db)["system_config"]["activation_threshold_degC"] == 36
    assert storage.get_run(rid, db)["snapshot"] == old["snapshot"]
    assert old["snapshot"]["reference_review"]["accepted"] == 0


def test_edit_conflicts_and_invalid_evidence_are_rejected(db):
    b = overview(db)
    edge = copy.deepcopy(b["dataset"]["ground_truth"]["relationships"][0])
    key = "|".join(edge[k] for k in ("source", "relationship", "target"))
    edge["source_evidence"][0]["excerpt"] = "fabricated evidence outside the source"
    with pytest.raises(ValueError, match="invalid_reference_evidence"):
        save_edit("relationship", key, edge, "Bad evidence test", b["edit_hash"], db)
    save_edit(
        "configuration", "sensor_voltage_V", 3.2, "Set voltage", b["edit_hash"], db
    )
    with pytest.raises(ValueError, match="benchmark_changed"):
        save_edit(
            "configuration", "sensor_voltage_V", 3.1, "Stale edit", b["edit_hash"], db
        )
    assert len(overview(db)["history"]["revisions"]) == 1


def test_critical_classification_stays_consistent_with_scenarios(db):
    b = overview(db)
    r = copy.deepcopy(b["dataset"]["ground_truth"]["requirements"][0])
    r["critical"] = False
    save_edit(
        "requirement", "REQ-001", r, "Human risk classification", b["edit_hash"], db
    )
    ds = load_dataset(db=db)
    assert not ds["ground_truth"]["requirements"][0]["critical"]
    assert all(
        "REQ-001" not in c["critical_requirements"]
        for c in ds["ground_truth"]["change_scenarios"]
    )


def test_workbench_api_is_local_only_and_saves_no_results():
    from benchmark.api import app

    headers = {"X-Norte-Client": "local-ui"}
    with TestClient(app) as client:
        b = client.get("/api/benchmark").json()
        assert b["review"]["total"] == 58
        assert (
            client.get(
                "/api/benchmark/preview?task=one_hop&difficulty=L2_ONE_HOP"
            ).status_code
            == 200
        )
        body = {
            "item_key": "requirement:REQ-001",
            "verdict": "accepted",
            "expected_hash": b["review"]["dataset_hash"],
        }
        assert client.post("/api/benchmark/review", json=body).status_code == 403
        assert (
            client.post("/api/benchmark/review", headers=headers, json=body).status_code
            == 200
        )
        assert client.get("/api/benchmark").json()["review"]["accepted"] == 1
        edit = {
            "kind": "configuration",
            "item_id": "sensor_voltage_V",
            "value": 3.2,
            "note": "Explicit test edit",
            "expected_hash": b["edit_hash"],
        }
        assert client.post("/api/benchmark/edit", json=edit).status_code == 403
        assert (
            client.post("/api/benchmark/edit", headers=headers, json=edit).status_code
            == 200
        )
        assert (
            client.get("/api/benchmark/preview").json()["input"]["system_config"][
                "sensor_voltage_V"
            ]
            == 3.2
        )
        stale = client.post("/api/benchmark/edit", headers=headers, json=edit)
        assert (
            stale.status_code == 400 and stale.json()["detail"] == "benchmark_changed"
        )
        assert (
            client.post(
                "/api/benchmark/edit", headers=headers, json={**edit, "value": True}
            ).status_code
            == 422
        )
        assert client.get("/api/runs").json() == []
        assert client.get("/api/executions").json() == []
        assert (
            client.get(
                "/api/benchmark/preview?task=one_hop&difficulty=L1_DIRECT"
            ).status_code
            == 400
        )


def test_prompt_preview_does_not_break_when_human_prompt_mentions_input_delimiter(db):
    b = overview(db)
    prompt = (
        b["prompts"]["common"]
        + "\nINPUT\nThis is an instruction, not the final input payload."
    )
    save_edit("prompt", "common", prompt, "Mention input boundary", b["edit_hash"], db)
    result = preview("one_hop", "L2_ONE_HOP", db=db)
    assert result["instructions"]["common"] == prompt
    assert result["input"]["documents"]["FAN"]


def test_edit_refuses_to_store_environment_credentials(db, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "temporary-test-credential")
    b = overview(db)
    with pytest.raises(ValueError, match="secret_in_edit"):
        save_edit(
            "prompt",
            "common",
            "temporary-test-credential",
            "Test prevention",
            b["edit_hash"],
            db,
        )
    assert overview(db)["history"]["revisions"] == []
