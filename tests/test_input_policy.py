import json
import shutil
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient

from benchmark import dataset, runner, storage
from benchmark.dataset import make_prompt, prompt_bundle, TASKS, task_plan
from benchmark.schemas import response_schema
from response_fixtures import install_mock_api


def prompt(ds, task="relationship_extraction", level="L1_DIRECT"):
    return make_prompt(
        ds, prompt_bundle(use_local=False), task, level, response_schema(task), []
    )


def test_every_task_withholds_answer_inventory_edges_impacts_and_control_labels(ds):
    for task, level in task_plan(TASKS):
        text = prompt(ds, task, level)
        payload = json.loads(text.split("\nINPUT\n")[1])
        assert set(payload["scope"]) == {"relationship_types", "id_convention"}
        assert not {"PROJECT-05", "PROJECT-06"} & payload["documents"]["PROJECT"].keys()
        assert "Only direct evidence invalidation" not in text
        assert "Graph scope:" not in text
        assert all("parameters" not in s for s in payload["sources"])
        assert all(
            set(s) == {"id", "description", "changed_entity"}
            for s in payload["scenarios"]
        )
        assert payload["confirmed_feedback"] == []
        changed = deepcopy(ds)
        changed["scope"]["nodes"] = [{"id": "SECRET-ANSWER"}]
        changed["scope"]["parameter_ids"] = ["SECRET-ANSWER"]
        changed["ground_truth"]["entities"] = {"hidden": "SECRET-ANSWER"}
        changed["ground_truth"]["relationships"] = [{"hidden": "SECRET-ANSWER"}]
        changed["ground_truth"]["requirements"] = [{"hidden": "SECRET-ANSWER"}]
        for s in changed["ground_truth"]["change_scenarios"]:
            for key in (
                "affected_requirements",
                "unaffected_requirements",
                "affected_relationships",
                "critical_requirements",
                "expected_reason",
                "change_type",
                "split",
            ):
                s[key] = "SECRET-ANSWER"
        assert prompt(changed, task, level) == text


def test_historical_snapshots_reconstruct_their_original_context(ds):
    ds = deepcopy(ds)
    ds["manifest"].pop("input_policy")
    ds["documents"]["PROJECT"]["PROJECT-05"] = "Archived explicit hint"
    ds["documents"]["PROJECT"]["PROJECT-06"] = "Archived expected edge list"
    assert "Archived explicit hint" in prompt(ds)
    assert "Archived expected edge list" in prompt(ds)
    assert "Archived explicit hint" not in prompt(ds, "one_hop", "L2_ONE_HOP")


def test_controlled_text_cannot_start_any_new_run(db):
    with pytest.raises(ValueError, match="original PDF"):
        runner.prepare_runs([], input_mode="controlled_text", db=db)
    assert storage.list_executions(db) == []
    from benchmark.api import app

    with TestClient(app) as client:
        assert (
            client.post(
                "/api/runs",
                headers={"x-norte-client": "local-ui"},
                json={"models": [0], "input_mode": "controlled_text"},
            ).status_code
            == 422
        )
        assert (
            client.get("/api/benchmark/preview?input_mode=controlled_text").status_code
            == 422
        )


def test_missing_pdf_blocks_every_model_before_any_provider_request(
    ds, db, monkeypatch, tmp_path
):
    sent = install_mock_api(monkeypatch, ds, db=db)
    monkeypatch.setattr(runner, "load_dataset", dataset.load_dataset)
    root = dataset.ROOT
    shutil.copytree(
        root / "data",
        tmp_path / "data",
        ignore=shutil.ignore_patterns("*.sqlite*", "*.pdf"),
        dirs_exist_ok=True,
    )
    monkeypatch.setattr(dataset, "ROOT", tmp_path)
    with pytest.raises(ValueError, match="Missing data/pdfs/fan.pdf"):
        runner.prepare_runs(
            [runner.configuration()["models"][0]], ["entity_extraction"], 1, db=db
        )
    assert sent == []
    assert storage.list_runs(db) == storage.list_executions(db) == []


def test_full_original_pdf_pages_are_used_without_handwritten_facts(
    ds, monkeypatch, tmp_path
):
    import pypdf

    root = dataset.ROOT
    shutil.copytree(
        root / "data",
        tmp_path / "data",
        ignore=shutil.ignore_patterns("*.sqlite*", "*.pdf"),
        dirs_exist_ok=True,
    )
    shutil.copytree(root / "prompts", tmp_path / "prompts")
    for doc in dataset.PDF_DOCUMENTS:
        (tmp_path / f"data/pdfs/{doc.lower()}.pdf").write_bytes(
            b"test-only-placeholder"
        )

    class Page:
        def extract_text(self):
            return "Entire original page including tables and unrelated context"

    class Reader:
        def __init__(self, path):
            self.pages = [Page(), Page()]

    monkeypatch.setattr(pypdf, "PdfReader", Reader)
    monkeypatch.setattr(dataset, "ROOT", tmp_path)
    loaded = dataset.load_dataset("pdf_text", use_local=False)
    payload = json.loads(prompt(loaded).split("\nINPUT\n")[1])
    for doc in dataset.PDF_DOCUMENTS:
        assert payload["documents"][doc] == {
            "page-1": Page().extract_text(),
            "page-2": Page().extract_text(),
        }
        assert doc in loaded["pdf_hashes"]
