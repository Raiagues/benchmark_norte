"""Inspectable inputs and explicit, versioned human edits. Never calls a model."""

import copy
import json
import math
import sqlite3

from . import storage
from .dataset import TASKS, digest, load_dataset, make_prompt, prompt_bundle, task_plan
from .evaluate import evidence_valid
from .providers import utcnow
from .schemas import (
    Edge,
    Extraction,
    Graph,
    Node,
    Parameter,
    Strict,
    Evidence,
    Dependency,
    edge_key,
    response_schema,
)
from .security import redact


class ReferenceScenario(Strict):
    id: str
    change_type: str
    difficulty: str
    split: str
    description: str
    changed_entity: str
    affected_requirements: list[str]
    unaffected_requirements: list[str]
    affected_relationships: list[Dependency]
    critical_requirements: list[str]
    expected_reason: str
    source_evidence: list[Evidence]
    title: str


def active_revision(db=None):
    with storage.connect(db) as con:
        try:
            row = con.execute(
                "SELECT * FROM benchmark_revisions ORDER BY id DESC LIMIT 1"
            ).fetchone()
        except sqlite3.OperationalError:
            return None
    return json.loads(row["data"]) if row else None


def reference_items(ds):
    gt = ds["ground_truth"]
    return {
        **{f"node:{v['id']}": v for v in gt["entities"]["nodes"]},
        **{f"parameter:{v['id']}": v for v in gt["entities"]["parameters"]},
        **{f"relationship:{'|'.join(edge_key(v))}": v for v in gt["relationships"]},
        **{f"scenario:{v['id']}": v for v in gt["change_scenarios"]},
        **{f"requirement:{v['id']}": v for v in gt["requirements"]},
    }


def review_state(ds, db=None):
    items, fingerprint = reference_items(ds), digest(ds)
    with storage.connect(db) as con:
        rows = con.execute(
            "SELECT data FROM benchmark_reviews WHERE dataset_hash=? ORDER BY id",
            (fingerprint,),
        ).fetchall()
    reviews = {json.loads(r["data"])["item_key"]: json.loads(r["data"]) for r in rows}
    accepted = sum(r["verdict"] == "accepted" for r in reviews.values())
    rejected = sum(r["verdict"] == "rejected" for r in reviews.values())
    return {
        "items": reviews,
        "accepted": accepted,
        "rejected": rejected,
        "pending": len(items) - len(reviews),
        "total": len(items),
        "dataset_hash": fingerprint,
    }


def record_review(item_key, verdict, comment, expected_hash, db=None):
    ds = load_dataset(db=db)
    if digest(ds) != expected_hash:
        raise ValueError("benchmark_changed")
    if item_key not in reference_items(ds) or verdict not in ("accepted", "rejected"):
        raise ValueError("invalid_reference_review")
    if verdict == "rejected" and not comment.strip():
        raise ValueError("review_comment_required")
    if verdict == "accepted":
        item = reference_items(ds)[item_key]
        docs = {
            **ds["documents"],
            **{
                s["id"]: {"change": s["description"]}
                for s in ds["ground_truth"]["change_scenarios"]
            },
        }
        if "source_evidence" in item and not evidence_valid(
            item["source_evidence"], docs
        ):
            raise ValueError("invalid_reference_evidence")
    record = {
        "item_key": item_key,
        "verdict": verdict,
        "comment": comment,
        "created_at": utcnow(),
        "dataset_hash": expected_hash,
    }
    with storage.connect(db) as con:
        con.execute(
            "INSERT INTO benchmark_reviews(dataset_hash,data) VALUES (?,?)",
            (expected_hash, storage.json_text(record)),
        )
    return redact(record)


def preview(task, difficulty, mode="controlled_text", db=None):
    if task not in TASKS or (task, difficulty) not in task_plan([task]):
        raise ValueError("invalid_task_level")
    ds, prompts = load_dataset(mode, db=db), prompt_bundle(db=db)
    schema = response_schema(task)
    full = make_prompt(ds, prompts, task, difficulty, schema, [])
    return {
        "task": task,
        "difficulty": difficulty,
        "input_mode": mode,
        "prompt": full,
        "prompt_hash": digest(full),
        "dataset_hash": digest(ds),
        "instructions": {"common": prompts["common"], "task": prompts[task]},
        "input": json.loads(full.rsplit("\nINPUT\n", 1)[1]),
        "output_schema": schema,
        "experiment": "first_pass",
    }


def history(db=None):
    with storage.connect(db) as con:
        revisions = [
            {"id": r["id"], **json.loads(r["data"])["change"]}
            for r in con.execute("SELECT * FROM benchmark_revisions ORDER BY id DESC")
        ]
        reviews = [
            json.loads(r["data"])
            for r in con.execute(
                "SELECT * FROM benchmark_reviews ORDER BY id DESC LIMIT 100"
            )
        ]
    return {"revisions": revisions, "reviews": reviews}


def validate_reference(ds):
    gt = ds["ground_truth"]
    Extraction.model_validate(gt["entities"])
    Graph.model_validate(
        {"nodes": gt["entities"]["nodes"], "edges": gt["relationships"]}
    )
    ids = {n["id"] for n in gt["entities"]["nodes"]}
    edges = {edge_key(e) for e in gt["relationships"]}
    if len(ids) != len(gt["entities"]["nodes"]) or len(edges) != len(
        gt["relationships"]
    ):
        raise ValueError("duplicate_reference_id")
    if ids != {n["id"] for n in ds["scope"]["nodes"]}:
        raise ValueError("reference_outside_scope")
    if {p["id"] for p in gt["entities"]["parameters"]} != set(
        ds["scope"]["parameter_ids"]
    ):
        raise ValueError("reference_outside_scope")
    for edge in gt["relationships"]:
        if edge["source"] not in ids or edge["target"] not in ids:
            raise ValueError("unknown_reference_node")
    for fact in gt["entities"]["parameters"]:
        if len(fact["values"]) not in (1, 2) or fact["unit"] not in (
            "A",
            "V",
            "rpm",
            "degC",
        ):
            raise ValueError("invalid_reference_fields")
    if {n["id"]: n["type"] for n in gt["entities"]["nodes"]} != {
        n["id"]: n["type"] for n in ds["scope"]["nodes"]
    }:
        raise ValueError("reference_outside_scope")
    reqs = {r["id"] for r in gt["requirements"]}
    scenario_ids = [s["id"] for s in gt["change_scenarios"]]
    if len(set(scenario_ids)) != len(scenario_ids):
        raise ValueError("duplicate_reference_id")
    for case in gt["change_scenarios"]:
        ReferenceScenario.model_validate(case)
        affected, unaffected = (
            set(case["affected_requirements"]),
            set(case["unaffected_requirements"]),
        )
        if (
            affected & unaffected
            or affected | unaffected != reqs
            or not set(case["critical_requirements"]) <= affected
        ):
            raise ValueError("invalid_scenario_requirements")
        if any(edge_key(e) not in edges for e in case["affected_relationships"]):
            raise ValueError("scenario_dependency_missing")
        if any(e["source"] not in affected for e in case["affected_relationships"]):
            raise ValueError("invalid_scenario_requirements")
        if {e["source"] for e in case["affected_relationships"]} != affected:
            raise ValueError("scenario_dependency_missing")
        if case["difficulty"] not in ("L1_DIRECT", "L2_ONE_HOP") or case[
            "changed_entity"
        ] not in ids | {"DOC-FORMAT"}:
            raise ValueError("invalid_task_level")


def save_edit(kind, item_id, value, note, expected_hash, db=None):
    ds, prompts = load_dataset(db=db), prompt_bundle(db=db)
    if digest({"dataset": ds, "prompts": prompts}) != expected_hash:
        raise ValueError("benchmark_changed")
    before = copy.deepcopy(ds)
    gt = ds["ground_truth"]
    if kind == "document":
        doc, loc = item_id.split(":", 1)
        if (
            doc not in ds["documents"]
            or loc not in ds["documents"][doc]
            or not isinstance(value, str)
            or not value.strip()
        ):
            raise ValueError("invalid_document_edit")
        ds["documents"][doc][loc] = value
        if doc == "REQUIREMENTS":
            next(r for r in gt["requirements"] if r["id"] == loc)["text"] = value
    elif kind == "configuration":
        if (
            item_id
            not in (
                "fan_voltage_V",
                "sensor_voltage_V",
                "activation_threshold_degC",
            )
            or type(value) not in (int, float)
            or not math.isfinite(value)
        ):
            raise ValueError("invalid_configuration_edit")
        ds["system_config"][item_id] = value
    elif kind == "prompt":
        if item_id not in prompts or not isinstance(value, str) or not value.strip():
            raise ValueError("invalid_prompt_edit")
        prompts[item_id] = value
    elif kind in ("relationship", "parameter", "node", "scenario", "requirement"):
        items = reference_items(ds)
        key = f"{kind}:{item_id}"
        if key not in items or not isinstance(value, dict):
            raise ValueError("unknown_reference_item")
        original = items[key]
        schema = {
            "relationship": Edge,
            "parameter": Parameter,
            "node": Node,
            "scenario": ReferenceScenario,
        }.get(kind)
        if schema:
            schema.model_validate(value)
        if set(value) != set(original):
            raise ValueError("invalid_reference_fields")
        if kind != "relationship" and value.get("id") != original["id"]:
            raise ValueError("reference_id_is_fixed")
        if kind == "scenario":
            # Inputs are edited separately; reviewers cannot silently change what is sent.
            for field in (
                "id",
                "description",
                "changed_entity",
                "difficulty",
                "change_type",
                "split",
                "title",
            ):
                if value[field] != original[field]:
                    raise ValueError("scenario_input_is_fixed")
            docs = {**ds["documents"], item_id: {"change": original["description"]}}
            if not evidence_valid(value["source_evidence"], docs):
                raise ValueError("invalid_reference_evidence")
        if kind == "requirement" and (
            value["text"] != original["text"]
            or value["kind"] != original["kind"]
            or value["manufacturer_specification"] is not False
            or type(value["critical"]) is not bool
        ):
            raise ValueError("requirement_input_is_separate")
        if kind in ("parameter", "relationship") and not evidence_valid(
            value["source_evidence"], ds["documents"]
        ):
            raise ValueError("invalid_reference_evidence")
        if kind == "node" and value["source_reference"] not in ds["documents"].get(
            value["source"], {}
        ):
            raise ValueError("invalid_reference_evidence")
        if kind == "relationship":
            Edge.model_validate(value)
            old_key = edge_key(original)
            for case in gt["change_scenarios"]:
                if (
                    old_key in {edge_key(e) for e in case["affected_relationships"]}
                    and edge_key(value) != old_key
                ):
                    raise ValueError("relationship_used_by_scenario")
        original.clear()
        original.update(value)
        if kind == "requirement":
            critical_ids = {r["id"] for r in gt["requirements"] if r["critical"]}
            for case in gt["change_scenarios"]:
                case["critical_requirements"] = sorted(
                    set(case["affected_requirements"]) & critical_ids
                )
    elif kind == "scenario_input":
        case = next((s for s in gt["change_scenarios"] if s["id"] == item_id), None)
        if not case or not isinstance(value, str) or not value.strip():
            raise ValueError("invalid_document_edit")
        case["description"] = value
        # Keep the old expectation/evidence unchanged; require an explicit human review.
    else:
        raise ValueError("invalid_edit_kind")
    validate_reference(ds)
    # Reject edits that would accidentally put a credential into inputs/history.
    if redact({"dataset": ds, "prompts": prompts, "note": note}) != {
        "dataset": ds,
        "prompts": prompts,
        "note": note,
    }:
        raise ValueError("secret_in_edit")
    with storage.connect(db) as con:
        con.execute("BEGIN IMMEDIATE")
        # Recheck inside the write transaction to prevent lost edits from two tabs.
        current_ds, current_prompts = load_dataset(db=db), prompt_bundle(db=db)
        if digest({"dataset": current_ds, "prompts": current_prompts}) != expected_hash:
            raise ValueError("benchmark_changed")
        number = con.execute(
            "SELECT coalesce(max(id), 0) + 1 FROM benchmark_revisions"
        ).fetchone()[0]
        for field in ("dataset_version", "ground_truth_version"):
            ds["manifest"][field] = (
                before["manifest"][field].split("+")[0] + f"+local.{number}"
            )
        ds["manifest"]["ground_truth_status"] = "human_edited_requires_review"
        if kind == "prompt":
            ds["manifest"]["prompt_versions"][item_id] = f"local.{number}"
        record = {
            "dataset": ds,
            "prompts": prompts,
            "change": {
                "id": number,
                "kind": kind,
                "item_id": item_id,
                "note": note,
                "created_at": utcnow(),
                "dataset_version": ds["manifest"]["dataset_version"],
            },
        }
        con.execute(
            "INSERT INTO benchmark_revisions(id,data) VALUES (?,?)",
            (number, storage.json_text(record)),
        )
    return record["change"]


def overview(db=None):
    ds, prompts = load_dataset(db=db), prompt_bundle(db=db)
    return {
        "dataset": ds,
        "edit_hash": digest({"dataset": ds, "prompts": prompts}),
        "prompts": prompts,
        "review": review_state(ds, db),
        "history": history(db),
    }
