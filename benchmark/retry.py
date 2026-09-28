"""Explicitly selected new attempts; never edits an existing response or score."""

import json
from . import storage
from .dataset import digest, load_dataset, prompt_bundle, ROOT, PDF_DOCUMENTS
from .studies import leaves


def candidates(batch_id, con):
    root, batches, _, current = leaves(batch_id, con)
    if any(b["status"] in ("RUNNING", "QUEUED", "STOPPING") for b in batches):
        raise ValueError("Wait until the study stops before selecting new attempts")
    work = []
    for row in current:
        if row["status"] not in (
            "INTERRUPTED",
            "TECHNICAL_ERROR",
            "COMPLETED_CORRECT",
            "COMPLETED_INCORRECT",
        ):
            continue
        run = con.execute(
            "SELECT * FROM executions WHERE id=?", (row["run_id"],)
        ).fetchone()
        work.append(
            dict(
                json.loads(row["data"]),
                id=row["id"],
                run_id=row["run_id"],
                source_batch_id=row["batch_id"],
                status=row["status"],
                snapshot=json.loads(run["snapshot"]),
                metadata=json.loads(run["metadata"]),
            )
        )
    return root, work


def plan(batch_id, db=None):
    from .runner import configuration, source_code_hash

    with storage.connect(db) as con:
        root, work = candidates(batch_id, con)
    ds = load_dataset(db=db)
    token = digest(
        {
            "root": root,
            "work": [(c["id"], c["status"]) for c in work],
            "dataset": ds,
            "prompts": prompt_bundle(db=db),
            "config": configuration(),
            "code": source_code_hash(),
            "pdfs": {
                doc: digest(p.read_bytes())
                if (p := ROOT / f"data/pdfs/{doc.lower()}.pdf").is_file()
                else None
                for doc in PDF_DOCUMENTS
            },
        }
    )
    return {
        "batch_id": root,
        "token": token,
        "kind": "retry",
        "dataset_version": ds["manifest"]["dataset_version"],
        "work": work,
        "calls": [
            {
                k: c.get(k)
                for k in (
                    "id",
                    "model",
                    "provider",
                    "depth",
                    "task",
                    "difficulty",
                    "repetition",
                    "status",
                )
            }
            for c in work
        ],
    }


def public_plan(batch_id, db=None):
    return {k: v for k, v in plan(batch_id, db).items() if k != "work"}


def prepare(batch_id, token, selected, db=None):
    from .runner import prepare_runs

    proposal = plan(batch_id, db)
    if token != proposal["token"]:
        raise ValueError("Study or protocol changed. Review the selection again.")
    if not selected or len(selected) != len(set(selected)):
        raise ValueError("Select unique executions for the new attempt")
    allowed = {c["id"] for c in proposal["work"]}
    if not set(selected) <= allowed:
        raise ValueError("Selection is no longer eligible")
    proposal["work"] = [c for c in proposal["work"] if c["id"] in selected]
    work = proposal["work"]
    experiments = {
        (c["experiment"], c["metadata"].get("baseline_run_id")) for c in work
    }
    if len(experiments) != 1:
        raise ValueError("Select attempts from the same experiment and baseline")
    experiment, baseline = next(iter(experiments))
    models = list(
        {
            digest(c["snapshot"]["model_config"]): c["snapshot"]["model_config"]
            for c in work
        }.values()
    )
    return prepare_runs(
        models,
        list(dict.fromkeys(c["task"] for c in work)),
        max(c["repetition"] for c in work),
        experiment=experiment,
        baseline_run_id=baseline,
        db=db,
        continuation=proposal,
    )
