"""Explicit continuation of never-sent work; historical rows are immutable."""

import json
from collections import Counter

from . import storage
from .dataset import ROOT, PDF_DOCUMENTS, digest, load_dataset, prompt_bundle


def candidate_calls(batch_id, con):
    batch = con.execute("SELECT * FROM live_batches WHERE id=?", (batch_id,)).fetchone()
    if not batch:
        raise ValueError("Run not found")
    if batch["status"] in ("QUEUED", "RUNNING", "STOPPING"):
        raise ValueError("Wait until this benchmark stops before resuming")
    rows = con.execute(
        "SELECT c.*,e.status AS original_status,e.snapshot AS execution_snapshot,e.metadata AS execution_metadata FROM live_calls c JOIN executions e ON e.id=c.run_id WHERE c.batch_id=? ORDER BY c.rowid",
        (batch_id,),
    ).fetchall()
    linked = {
        r[0]
        for r in con.execute(
            "SELECT source_call_id FROM live_continuations WHERE source_batch_id=?",
            (batch_id,),
        )
    }
    safe, uncertain = [], []
    for row in rows:
        if row["id"] in linked or row["status"] != "INTERRUPTED":
            continue
        info = json.loads(row["data"])
        # API_REQUEST_SENT is durably recorded before dispatch. A lost response
        # must never cause the same paid request to be sent again by this action.
        sent = any(
            info.get(k)
            for k in (
                "attempt",
                "request_started_at",
                "received_attempt",
                "response_checkpoint",
                "call",
            )
        )
        legacy_unknown = info.get("legacy") and row["original_status"] != "pending"
        if sent or legacy_unknown or row["result"]:
            uncertain.append(row["id"])
        else:
            safe.append(
                dict(
                    info,
                    id=row["id"],
                    run_id=row["run_id"],
                    snapshot=json.loads(row["execution_snapshot"]),
                    metadata=json.loads(row["execution_metadata"]),
                )
            )
    return safe, uncertain


def plan(batch_id, db=None):
    with storage.connect(db) as con:
        safe, uncertain = candidate_calls(batch_id, con)
        children = [
            dict(r)
            for r in con.execute(
                "SELECT DISTINCT target_batch_id AS id FROM live_continuations WHERE source_batch_id=?",
                (batch_id,),
            )
        ]
        counts = dict(
            con.execute(
                "SELECT status,COUNT(*) FROM live_calls WHERE batch_id=? GROUP BY status",
                (batch_id,),
            ).fetchall()
        )
    ds = load_dataset(db=db)
    prompts = prompt_bundle(db=db)
    pdf_hashes = {}
    for doc in PDF_DOCUMENTS:
        path = ROOT / f"data/pdfs/{doc.lower()}.pdf"
        pdf_hashes[doc] = digest(path.read_bytes()) if path.is_file() else None
    current = digest({"dataset": ds, "prompts": prompts})
    token = digest(
        {
            "batch_id": batch_id,
            "ids": [c["id"] for c in safe],
            "configuration": current,
            "pdfs": pdf_hashes,
        }
    )
    groups = Counter((c["provider"], c["model"], c.get("depth")) for c in safe)

    def context_changed(call):
        old = call["snapshot"]["dataset"]
        docs = dict(old["documents"])
        for doc in PDF_DOCUMENTS:
            if doc in ds["documents"]:
                docs[doc] = ds["documents"][doc]
            else:
                docs.pop(doc, None)
        comparable = dict(
            old, documents=docs, input_mode=ds["input_mode"], pdf_hashes={}
        )
        return (
            digest({"dataset": comparable, "prompts": call["snapshot"]["prompts"]})
            != current
            or old.get("pdf_hashes", {}) != pdf_hashes
        )

    changed = any(context_changed(c) for c in safe)
    return {
        "batch_id": batch_id,
        "token": token,
        "eligible": len(safe),
        "uncertain": len(uncertain),
        "completed_preserved": counts.get("COMPLETED_CORRECT", 0)
        + counts.get("COMPLETED_INCORRECT", 0),
        "technical_errors_preserved": counts.get("TECHNICAL_ERROR", 0),
        "children": children,
        "dataset_version": ds["manifest"]["dataset_version"],
        "current_protocol": ds["manifest"].get("input_policy"),
        "context_changed": changed,
        "models": [
            {"provider": p, "model": m, "depth": d, "calls": n}
            for (p, m, d), n in groups.items()
        ],
        "work": safe,
    }


def public_plan(batch_id, db=None):
    return {k: v for k, v in plan(batch_id, db).items() if k != "work"}


def prepare(batch_id, token, db=None):
    from .runner import prepare_runs

    proposal = plan(batch_id, db)
    if proposal["token"] != token:
        raise ValueError("Continuation changed. Review the pending work again.")
    if not proposal["work"]:
        raise ValueError("No never-sent work remains to resume")
    models = list(
        {
            digest(c["snapshot"]["model_config"]): c["snapshot"]["model_config"]
            for c in proposal["work"]
        }.values()
    )
    first = proposal["work"][0]
    return prepare_runs(
        models,
        list(
            dict.fromkeys(t for c in proposal["work"] for t in c["metadata"]["tasks"])
        ),
        max(c["repetition"] for c in proposal["work"]),
        experiment=first["experiment"],
        baseline_run_id=first["metadata"].get("baseline_run_id"),
        db=db,
        continuation=proposal,
    )


def persist(records, proposal, db=None):
    from . import live

    # Revalidate under a writer lock. Duplicate clicks or another local process
    # cannot reserve the same source task twice. No source row is updated.
    with storage.connect(db) as con:
        con.execute("BEGIN IMMEDIATE")
        safe, _ = candidate_calls(proposal["batch_id"], con)
        if [c["id"] for c in safe] != [c["id"] for c in proposal["work"]]:
            raise ValueError(
                "Pending work was already continued. Open its continuation."
            )
        for r in records:
            con.execute(
                "INSERT INTO executions VALUES (?,?,?,?,?,?)",
                (
                    r["id"],
                    r["created_at"],
                    r["status"],
                    storage.json_text(r["metadata"]),
                    storage.json_text(r["snapshot"]),
                    None,
                ),
            )
        ids = [r["id"] for r in records]
        bid = live.register_batch(ids, db, records=records, connection=con)
        for r in records:
            calls = con.execute(
                "SELECT id FROM live_calls WHERE run_id=? ORDER BY ordinal", (r["id"],)
            ).fetchall()
            for source, target in zip(
                r["metadata"]["source_call_ids"], calls, strict=True
            ):
                con.execute(
                    "INSERT INTO live_continuations VALUES (?,?,?,?,?)",
                    (source, target["id"], proposal["batch_id"], bid, r["created_at"]),
                )
        live._event(
            con,
            bid,
            "RUN_RESUMED",
            data={"source_batch_id": proposal["batch_id"], "planned": len(safe)},
        )
