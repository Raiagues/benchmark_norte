"""Read-only study projection. Attempts remain immutable in their original batches."""

import json
from . import storage, live


def family(batch_id, con):
    rows = {r["id"]: dict(r) for r in con.execute("SELECT * FROM live_batches")}
    if batch_id not in rows:
        raise ValueError("Run not found")
    parent = {k: json.loads(v["data"]).get("resumed_from") for k, v in rows.items()}
    root, seen = batch_id, set()
    while parent.get(root) in rows and root not in seen:
        seen.add(root)
        root = parent[root]
    ids = {root}
    while True:
        added = {k for k, p in parent.items() if p in ids} - ids
        if not added:
            break
        ids.update(added)
    return root, [v for k, v in rows.items() if k in ids]


def leaves(batch_id, con):
    root, batches = family(batch_id, con)
    ids = {b["id"] for b in batches}
    rows = [
        dict(r)
        for r in con.execute("SELECT * FROM live_calls ORDER BY rowid")
        if r["batch_id"] in ids
    ]
    links = {
        r["source_call_id"]: r["target_call_id"]
        for r in con.execute("SELECT * FROM live_continuations")
        if r["source_batch_id"] in ids
    }
    return root, batches, rows, [r for r in rows if r["id"] not in links]


def snapshot(batch_id, db=None):
    with storage.connect(db) as con:
        con.execute("BEGIN")
        root, batches, history, current = leaves(batch_id, con)
        ids = {b["id"] for b in batches}
        metadata = {
            r["id"]: json.loads(r["metadata"])
            for r in con.execute("SELECT id,metadata FROM executions")
        }
        last = max(
            (
                r["id"]
                for r in con.execute("SELECT id,batch_id FROM live_events")
                if r["batch_id"] in ids
            ),
            default=0,
        )
    for row in current:
        meta = metadata[row["run_id"]]
        info = json.loads(row["data"])
        info.update(
            protocol_key=meta["comparison_hash"],
            dataset_version=meta["dataset_version"],
            attempt_batch_id=row["batch_id"],
        )
        row["data"] = json.dumps(info)
    batch = dict(next(b for b in batches if b["id"] == root))
    active = [b for b in batches if b["status"] in ("RUNNING", "QUEUED", "STOPPING")]
    batch["status"] = (
        "STOPPING"
        if active and all(b["status"] == "STOPPING" for b in active)
        else "RUNNING"
        if active
        else "PARTIALLY_COMPLETED"
        if any(r["status"] == "INTERRUPTED" for r in current)
        else "COMPLETED_WITH_ERRORS"
        if any(r["status"] == "TECHNICAL_ERROR" for r in current)
        else "COMPLETED"
    )
    # A past interruption of the root must never disable stopping a new child.
    batch["stop_requested"] = bool(active) and all(b["stop_requested"] for b in active)
    data = json.loads(batch["data"])
    finished = [json.loads(b["data"]).get("finished_at") for b in batches]
    data["finished_at"] = None if active else max(filter(None, finished), default=None)
    batch["data"] = json.dumps(data)
    result = live.snapshot_from_rows(root, batch, current, last)
    attempts = [
        dict(
            json.loads(r["data"]),
            status=r["status"],
            result=json.loads(r["result"]) if r["result"] else None,
        )
        for r in history
    ]
    result.update(
        study_id=root,
        study_batches=[{"id": b["id"], "status": b["status"]} for b in batches],
        active_batch_ids=[b["id"] for b in active],
        attempt_count=len(history),
        attempt_operations=live.operational(attempts),
    )
    return result
