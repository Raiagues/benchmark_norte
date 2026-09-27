"""Persisted task executions and SSE snapshots. No scheduling service or demo data.

Legacy records are read-only. Recovery adds an annotation, never rewrites history.
A live call is one existing task/level request (which may contain several scenarios).
"""

import json
import uuid
from collections import defaultdict
from statistics import mean, median

from . import storage
from .dataset import cases_for_task, digest, task_plan
from .evaluate import consistency
from .providers import utcnow

EVALUATED = {"COMPLETED_CORRECT", "COMPLETED_INCORRECT"}
TERMINAL = EVALUATED | {"TECHNICAL_ERROR", "INTERRUPTED"}


def correctness(result):
    """Exact set match AND evidence/rule checks; no invented pass threshold."""
    m = result["metrics"]
    families = [
        m[k] for k in ("entity", "parameter", "relationship", "impact") if k in m
    ]
    exact = bool(families) and all(v["fp"] == v["fn"] == 0 for v in families)
    checks = []
    if "fact_details" in m:
        checks.extend(r["supported"] for r in m["fact_details"])
        checks.append(m.get("source_attribution_accuracy") == 1)
    if "edges" in m:
        checks.extend(e["status"] == "correct" for e in m["edges"])
    if "scenarios" in m:
        checks.extend(
            c["passes_rules"] for s in m["scenarios"] for c in s["explanation_checks"]
        )
    if exact and all(checks):
        return "correct"
    return "partial" if any(v["tp"] for v in families) else "incorrect"


def _event(con, batch, kind, call_id=None, data=None):
    con.execute(
        "INSERT INTO live_events(batch_id,call_id,created_at,type,data) VALUES (?,?,?,?,?)",
        (batch, call_id, utcnow(), kind, storage.json_text(data or {})),
    )


def register_batch(ids, db=None, legacy=False):
    runs = [storage.get_execution(r, db) for r in ids]
    if not runs:
        return
    bid = runs[0]["metadata"]["batch_id"]
    with storage.connect(db) as con:
        if con.execute("SELECT 1 FROM live_batches WHERE id=?", (bid,)).fetchone():
            return bid
        data = {
            "run_ids": ids,
            "legacy": legacy,
            "started_at": None,
            "finished_at": None,
        }
        con.execute(
            "INSERT INTO live_batches VALUES (?,?,?,?,?)",
            (
                bid,
                min(r["created_at"] for r in runs),
                "QUEUED",
                0,
                storage.json_text(data),
            ),
        )
        for run in runs:
            m, ds = run["metadata"], run["snapshot"]["dataset"]
            published = con.execute(
                "SELECT data FROM task_results WHERE run_id=? ORDER BY rowid",
                (run["id"],),
            ).fetchall()
            results = {
                (r["task"], r["difficulty"]): r
                for r in (json.loads(x[0]) for x in published)
            }
            for ordinal, (task, level) in enumerate(task_plan(m["tasks"])):
                result = results.get((task, level))
                status = (
                    (
                        "COMPLETED_CORRECT"
                        if correctness(result) == "correct"
                        else "COMPLETED_INCORRECT"
                    )
                    if result
                    else "QUEUED"
                )
                info = {
                    k: m.get(k)
                    for k in (
                        "provider",
                        "model",
                        "depth",
                        "repetition",
                        "input_mode",
                        "experiment",
                    )
                }
                info.update(
                    task=task,
                    difficulty=level,
                    scenario_ids=[c["id"] for c in cases_for_task(ds, task, level)],
                    legacy=legacy,
                    started_at=result.get("start_time") if result else None,
                    finished_at=result.get("end_time") if result else None,
                    quality=correctness(result) if result else None,
                )
                if legacy and not result:
                    # We cannot reconstruct an unpersisted response or a task's start time.
                    failure = run.get("failure") or {}
                    if (
                        failure.get("task") == task
                        and failure.get("difficulty") == level
                    ):
                        status = "TECHNICAL_ERROR"
                        info.update(
                            error=failure.get("category"),
                            diagnostic=failure.get("diagnostic"),
                            call=failure.get("call"),
                            started_at=(failure.get("call") or {}).get("start_time"),
                            finished_at=(failure.get("call") or {}).get("end_time"),
                        )
                    else:
                        status = "INTERRUPTED"
                        info["interruption_reason"] = (
                            "unknown_after_restart"
                            if run["status"] == "running"
                            else "not_completed_in_legacy_history"
                        )
                cid = result["id"] if result else uuid.uuid4().hex
                con.execute(
                    "INSERT INTO live_calls VALUES (?,?,?,?,?,?,?,?)",
                    (
                        cid,
                        bid,
                        run["id"],
                        ordinal,
                        status,
                        status,
                        storage.json_text(info),
                        storage.json_text(result) if result else None,
                    ),
                )
            if legacy and run["status"] in ("running", "pending"):
                con.execute(
                    "INSERT OR IGNORE INTO execution_recovery VALUES (?,?,?)",
                    (run["id"], utcnow(), "unknown_after_restart"),
                )
        if not legacy:
            _event(
                con,
                bid,
                "RUN_CREATED",
                data={
                    "planned": sum(len(task_plan(r["metadata"]["tasks"])) for r in runs)
                },
            )
            for row in con.execute(
                "SELECT id FROM live_calls WHERE batch_id=? ORDER BY rowid", (bid,)
            ).fetchall():
                _event(con, bid, "EXECUTION_QUEUED", row["id"])
    if legacy:
        finalize_batch(
            bid,
            db,
            recovery=any(
                r["status"] in ("pending", "running", "interrupted") for r in runs
            ),
        )
    return bid


def recover_history(db=None):
    """Called only on process startup, when the previous in-process worker is gone."""
    groups = defaultdict(list)
    for run in storage.list_executions(db):
        if run.get("origin") == "provider_api" and run.get("batch_id"):
            groups[run["batch_id"]].append(run["id"])
    for bid, ids in groups.items():
        with storage.connect(db) as con:
            exists = con.execute(
                "SELECT 1 FROM live_batches WHERE id=?", (bid,)
            ).fetchone()
        if not exists:
            register_batch(list(reversed(ids)), db, legacy=True)
    with storage.connect(db) as con:
        pending = con.execute(
            "SELECT * FROM live_calls WHERE status IN ('QUEUED','RUNNING')"
        ).fetchall()
        affected = set()
        for row in pending:
            data = json.loads(row["data"])
            data.update(
                interruption_reason="unknown_after_restart", finished_at=utcnow()
            )
            con.execute(
                "UPDATE live_calls SET status='INTERRUPTED',stage='INTERRUPTED',data=? WHERE id=?",
                (storage.json_text(data), row["id"]),
            )
            con.execute(
                "INSERT OR IGNORE INTO execution_recovery VALUES (?,?,?)",
                (row["run_id"], utcnow(), "unknown_after_restart"),
            )
            _event(
                con,
                row["batch_id"],
                "EXECUTION_INTERRUPTED",
                row["id"],
                {"reason": "unknown_after_restart"},
            )
            affected.add(row["batch_id"])
    for bid in affected:
        finalize_batch(bid, db, recovery=True)


def calls_for_run(run_id, db=None):
    with storage.connect(db) as con:
        return [
            dict(r)
            | {
                "data": json.loads(r["data"]),
                "result": json.loads(r["result"]) if r["result"] else None,
            }
            for r in con.execute(
                "SELECT * FROM live_calls WHERE run_id=? ORDER BY ordinal", (run_id,)
            )
        ]


def is_stopped(batch_id, db=None):
    with storage.connect(db) as con:
        row = con.execute(
            "SELECT stop_requested FROM live_batches WHERE id=?", (batch_id,)
        ).fetchone()
        return bool(row and row[0])


def begin_call(cid, db=None):
    with storage.connect(db) as con:
        con.execute("BEGIN IMMEDIATE")
        row = con.execute("SELECT * FROM live_calls WHERE id=?", (cid,)).fetchone()
        batch = con.execute(
            "SELECT * FROM live_batches WHERE id=?", (row["batch_id"],)
        ).fetchone()
        if row["status"] != "QUEUED" or batch["stop_requested"]:
            return False
        data = json.loads(row["data"])
        data["started_at"] = utcnow()
        con.execute(
            "UPDATE live_calls SET status='RUNNING',stage='PREPARING',data=? WHERE id=?",
            (storage.json_text(data), cid),
        )
        bd = json.loads(batch["data"])
        if not bd["started_at"]:
            bd["started_at"] = data["started_at"]
            _event(con, row["batch_id"], "RUN_STARTED")
        con.execute(
            "UPDATE live_batches SET status='RUNNING',data=? WHERE id=?",
            (storage.json_text(bd), row["batch_id"]),
        )
        _event(con, row["batch_id"], "EXECUTION_STARTED", cid)
        return True


def transition(cid, stage, kind, extra=None, db=None):
    with storage.connect(db) as con:
        row = con.execute("SELECT * FROM live_calls WHERE id=?", (cid,)).fetchone()
        if not row or row["status"] != "RUNNING":
            return
        data = json.loads(row["data"])
        data.update(extra or {})
        if kind == "API_RESPONSE_RECEIVED":
            data["received_attempt"] = data.get("attempt")
        data["stage_started_at"] = utcnow()
        con.execute(
            "UPDATE live_calls SET stage=?,data=? WHERE id=?",
            (stage, storage.json_text(data), cid),
        )
        # Raw responses/prompts stay in call data, not in the human event feed.
        event_data = {
            k: v
            for k, v in (extra or {}).items()
            if k in ("attempt", "http_status", "error", "latency_seconds")
        }
        _event(con, row["batch_id"], kind, cid, event_data)


def finish_call(cid, result=None, error=None, call=None, diagnostic=None, db=None):
    if result and not valid_result(result):
        raise ValueError(
            "Only evaluated, validated API results may contribute to quality"
        )
    with storage.connect(db) as con:
        row = con.execute("SELECT * FROM live_calls WHERE id=?", (cid,)).fetchone()
        if row["status"] != "RUNNING":
            raise ValueError("Only a running call can finish")
        data = json.loads(row["data"])
        data["finished_at"] = utcnow()
        if result:
            data["quality"] = correctness(result)
            status = (
                "COMPLETED_CORRECT"
                if data["quality"] == "correct"
                else "COMPLETED_INCORRECT"
            )
        else:
            status = "TECHNICAL_ERROR"
            data.update(
                error=error,
                call=call or data.get("call"),
                diagnostic=diagnostic,
                failed_stage=row["stage"],
            )
        con.execute(
            "UPDATE live_calls SET status=?,stage=?,data=?,result=? WHERE id=?",
            (
                status,
                status,
                storage.json_text(data),
                storage.json_text(result) if result else None,
                cid,
            ),
        )
        _event(
            con,
            row["batch_id"],
            "EXECUTION_COMPLETED" if result else "EXECUTION_FAILED",
            cid,
            {
                "quality": data.get("quality"),
                "error": error,
                "failed_stage": row["stage"],
            },
        )
        if result:
            _event(con, row["batch_id"], "METRICS_UPDATED", cid)
    if result:
        # New per-call exports never overwrite legacy run.json files.
        from pathlib import Path

        base = Path(db).parent / "results" if db else storage.ROOT / "results"
        folder = base / data["provider"] / row["run_id"] / "calls"
        try:
            folder.mkdir(parents=True, exist_ok=True)
            with (folder / f"{cid}.json").open("x") as f:
                f.write(storage.json_text(result) + "\n")
        except (OSError, FileExistsError):
            pass  # SQLite is authoritative; results remain downloadable.


def interrupt_queued(batch_id, reason, db=None, run_id=None):
    with storage.connect(db) as con:
        query = "SELECT * FROM live_calls WHERE batch_id=? AND status='QUEUED'"
        args = [batch_id]
        if run_id:
            query += " AND run_id=?"
            args.append(run_id)
        for row in con.execute(query, args).fetchall():
            data = json.loads(row["data"])
            data.update(interruption_reason=reason, finished_at=utcnow())
            con.execute(
                "UPDATE live_calls SET status='INTERRUPTED',stage='INTERRUPTED',data=? WHERE id=?",
                (storage.json_text(data), row["id"]),
            )
            _event(
                con, batch_id, "EXECUTION_INTERRUPTED", row["id"], {"reason": reason}
            )


def interrupt_running_before_request(cid, db=None):
    with storage.connect(db) as con:
        row = con.execute("SELECT * FROM live_calls WHERE id=?", (cid,)).fetchone()
        data = json.loads(row["data"])
        data.update(interruption_reason="stopped_by_user", finished_at=utcnow())
        con.execute(
            "UPDATE live_calls SET status='INTERRUPTED',stage='INTERRUPTED',data=? WHERE id=?",
            (storage.json_text(data), cid),
        )
        _event(
            con,
            row["batch_id"],
            "EXECUTION_INTERRUPTED",
            cid,
            {"reason": "stopped_by_user"},
        )


def stop_batch(batch_id, db=None):
    with storage.connect(db) as con:
        con.execute("BEGIN IMMEDIATE")
        batch = con.execute(
            "SELECT * FROM live_batches WHERE id=?", (batch_id,)
        ).fetchone()
        if not batch:
            raise ValueError("Run not found")
        if batch["status"] not in ("QUEUED", "RUNNING", "STOPPING"):
            return
        if not batch["stop_requested"]:
            con.execute(
                "UPDATE live_batches SET stop_requested=1,status='STOPPING' WHERE id=?",
                (batch_id,),
            )
            _event(con, batch_id, "RUN_STOP_REQUESTED")
    interrupt_queued(batch_id, "stopped_by_user", db)
    finalize_batch(batch_id, db)


def finalize_batch(batch_id, db=None, recovery=False):
    with storage.connect(db) as con:
        batch = con.execute(
            "SELECT * FROM live_batches WHERE id=?", (batch_id,)
        ).fetchone()
        rows = con.execute(
            "SELECT status,data,result FROM live_calls WHERE batch_id=?", (batch_id,)
        ).fetchall()
        if any(r["status"] not in TERMINAL for r in rows):
            return
        states = {r["status"] for r in rows}
        state = (
            "INTERRUPTED_BY_USER"
            if batch["stop_requested"]
            else "PARTIALLY_COMPLETED"
            if "INTERRUPTED" in states
            else "COMPLETED_WITH_ERRORS"
            if "TECHNICAL_ERROR" in states
            else "COMPLETED"
        )
        data = json.loads(batch["data"])
        if recovery:
            data["recovery"] = "unknown_after_restart"
        if not data.get("legacy"):
            data["finished_at"] = data.get("finished_at") or utcnow()
        elif states <= EVALUATED:
            ends = [json.loads(r["data"]).get("finished_at") for r in rows]
            data["finished_at"] = max((e for e in ends if e), default=None)
        if batch["status"] != state:
            con.execute(
                "UPDATE live_batches SET status=?,data=? WHERE id=?",
                (state, storage.json_text(data), batch_id),
            )
            if not data.get("legacy"):
                _event(
                    con,
                    batch_id,
                    "RUN_CANCELLED"
                    if batch["stop_requested"]
                    else "RUN_RECOVERED"
                    if recovery
                    else "RUN_COMPLETED",
                    data={"status": state},
                )


def valid_result(r):
    return bool(
        r
        and not r.get("error")
        and r.get("parsed_output") is not None
        and r.get("raw_response")
        and r.get("attempts")
        and r["attempts"][-1].get("http_status") == 200
        and all(
            r.get("metrics", {}).get(k) == 1
            for k in (
                "valid_json_rate",
                "schema_compliance_rate",
                "contract_compliance_rate",
            )
        )
    )


def partial_results(run_id, db=None):
    return [
        r["result"]
        for r in calls_for_run(run_id, db)
        if r["status"] in EVALUATED and valid_result(r["result"])
    ]


def quality_metrics(results):
    """Micro-average counts within one task + difficulty; every number has provenance."""
    if not results:
        return {}
    metrics = {}
    ids = [r["id"] for r in results]

    def add(
        name, numerator, denominator, value=None, formula="numerator / denominator"
    ):
        metrics[name] = {
            "value": numerator / denominator if denominator else value,
            "numerator": numerator,
            "denominator": denominator,
            "executions": len(results),
            "execution_ids": ids,
            "formula": formula,
        }

    for family in ("entity", "parameter", "relationship", "impact"):
        parts = [r["metrics"][family] for r in results if family in r["metrics"]]
        if not parts:
            continue
        tp, fp, fn = (sum(p[k] for p in parts) for k in ("tp", "fp", "fn"))
        add(f"{family}_precision", tp, tp + fp)
        add(f"{family}_recall", tp, tp + fn)
        add(f"{family}_f1", 2 * tp, 2 * tp + fp + fn, formula="2 TP / (2 TP + FP + FN)")
    if "relationship" in results[0]["metrics"]:
        rows = [e for r in results for e in r["metrics"]["edges"] if e["model_edge"]]
        add(
            "unsupported_relationship_rate",
            sum(e["status"] != "correct" for e in rows),
            len(rows),
        )
        add("evidence_accuracy", sum(e["status"] == "correct" for e in rows), len(rows))
    if "impact" in results[0]["metrics"]:
        add(
            "critical_impact_miss_rate",
            sum(r["metrics"]["critical_missed"] for r in results),
            sum(r["metrics"]["critical_total"] for r in results),
        )
        checks = [
            c
            for r in results
            for s in r["metrics"]["scenarios"]
            for c in s["explanation_checks"]
        ]
        add("evidence_accuracy", sum(c["valid_evidence"] for c in checks), len(checks))
        add(
            "explanation_rule_pass_rate",
            sum(c["passes_rules"] for c in checks),
            len(checks),
        )
        add(
            "unsupported_explanation_claim_rate",
            sum(c["unsupported_structured_claims"] for c in checks),
            sum(c["structured_claim_count"] for c in checks),
        )
    if "entity" in results[0]["metrics"]:
        facts = [f for r in results for f in r["metrics"]["fact_details"]]
        matched = [f for f in facts if f["matched"]]
        add("unsupported_fact_rate", sum(not f["supported"] for f in facts), len(facts))
        add("value_accuracy", sum(f["value_correct"] for f in matched), len(matched))
        add("unit_accuracy", sum(f["unit_correct"] for f in matched), len(matched))
        denoms = [
            len(r["parsed_output"]["nodes"]) + len(r["metrics"]["fact_details"])
            for r in results
        ]
        add(
            "source_attribution_accuracy",
            sum(
                round((r["metrics"]["source_attribution_accuracy"] or 0) * n)
                for r, n in zip(results, denoms)
            ),
            sum(denoms),
        )
    signatures = [r["answer_signature"] for r in results]
    pairs = len(results) * (len(results) - 1) // 2
    value = consistency(signatures)
    add("consistency", round(value * pairs) if value is not None else 0, pairs)
    return metrics


def operational(calls):
    states = [c["status"] for c in calls]
    evaluated = [c for c in calls if c["status"] in EVALUATED]
    attempts = []
    latency = []
    for c in calls:
        call = c.get("result") or c.get("call") or {}
        observed = list(call.get("attempts", []))
        if (
            c.get("response_checkpoint")
            and c.get("received_attempt")
            and not any(a.get("number") == c["received_attempt"] for a in observed)
        ):
            # The envelope was saved before parsing; its HTTP response is real even
            # if a crash prevented token normalization or evaluation.
            observed.append(
                {"number": c["received_attempt"], "http_status": c.get("http_status")}
            )
        attempts.extend(observed)
        if call.get("latency_seconds") is not None:
            latency.append(call["latency_seconds"])

    def tokens(field):
        vals = [a.get("tokens", {}).get(field) for a in attempts]
        return {
            "reported": sum(v for v in vals if v is not None)
            if any(v is not None for v in vals)
            else None,
            "reporting_calls": sum(v is not None for v in vals),
            "total_calls": len(vals),
        }

    costs = [a.get("cost_usd") for a in attempts]
    started = sum(bool(c.get("started_at")) for c in calls)
    errors = states.count("TECHNICAL_ERROR")
    processed = len(evaluated) + errors
    return {
        "planned": len(calls),
        "started": started,
        "evaluated": len(evaluated),
        "correct": sum(c.get("quality") == "correct" for c in evaluated),
        "partial": sum(c.get("quality") == "partial" for c in evaluated),
        "incorrect": sum(c.get("quality") == "incorrect" for c in evaluated),
        "technical_errors": errors,
        "interrupted": states.count("INTERRUPTED"),
        "running": states.count("RUNNING"),
        "queued": states.count("QUEUED"),
        "remaining": states.count("RUNNING") + states.count("QUEUED"),
        "processed": processed,
        "progress": processed / len(calls) if calls else None,
        "completion_rate": len(evaluated) / len(calls) if calls else None,
        "technical_failure_rate": errors / started if started else None,
        "api_calls": len(attempts),
        "api_responses": sum(a.get("http_status") is not None for a in attempts),
        "average_latency": mean(latency) if latency else None,
        "median_latency": median(latency) if len(latency) >= 2 else None,
        "latency_samples": len(latency),
        "input_tokens": tokens("input"),
        "output_tokens": tokens("output"),
        "cost_usd": sum(costs) if costs and all(c is not None for c in costs) else None,
        "schema": {
            "numerator": len(evaluated),
            "denominator": sum(
                c["status"] in EVALUATED
                or c.get("error")
                in (
                    "parsing_failure",
                    "invalid_structured_output",
                    "scenario_coverage_error",
                )
                for c in calls
            ),
        },
    }


def snapshot(batch_id, db=None):
    with storage.connect(db) as con:
        # One SQLite read snapshot: the SSE version must describe these same rows,
        # even if the worker commits another event while this response is built.
        con.execute("BEGIN")
        batch = con.execute(
            "SELECT * FROM live_batches WHERE id=?", (batch_id,)
        ).fetchone()
        if not batch:
            return None
        rows = con.execute(
            "SELECT * FROM live_calls WHERE batch_id=? ORDER BY rowid", (batch_id,)
        ).fetchall()
        last_event = (
            con.execute(
                "SELECT MAX(id) FROM live_events WHERE batch_id=?", (batch_id,)
            ).fetchone()[0]
            or 0
        )
    calls = [
        dict(
            json.loads(r["data"]),
            id=r["id"],
            run_id=r["run_id"],
            ordinal=r["ordinal"],
            status=r["status"],
            stage=r["stage"],
            result=json.loads(r["result"]) if r["result"] else None,
        )
        for r in rows
    ]
    grouped = defaultdict(list)
    for c in calls:
        grouped[(c["provider"], c["model"], c.get("depth"))].append(c)
    models = []
    for (provider, model, depth), items in grouped.items():
        valid = [
            c["result"]
            for c in items
            if c["status"] in EVALUATED and valid_result(c["result"])
        ]
        by_task = defaultdict(list)
        for r in valid:
            by_task[(r["task"], r["difficulty"])].append(r)
        quality = []
        for (task, level), results in by_task.items():
            ordered = sorted(results, key=lambda r: (r.get("end_time") or "", r["id"]))
            quality.append(
                {
                    "task": task,
                    "difficulty": level,
                    "metrics": quality_metrics(results),
                    "history": [
                        {
                            "completed": i,
                            "execution_id": r["id"],
                            "metrics": quality_metrics(ordered[:i]),
                        }
                        for i, r in enumerate(ordered, 1)
                    ],
                }
            )
        ops = operational(items)
        state = (
            "Running"
            if ops["running"]
            else "Waiting"
            if ops["queued"]
            else "Interrupted"
            if ops["interrupted"]
            else "Completed with errors"
            if ops["technical_errors"]
            else "Completed"
        )
        active_error = next(
            (
                c.get("error")
                for c in reversed(items)
                if c.get("error") and c["error"] != "connection_not_confirmed"
            ),
            None,
        )
        if state not in ("Running", "Waiting") and not batch["stop_requested"]:
            if active_error in ("quota_exceeded", "billing_error", "spend_limit"):
                state = "Quota error"
            elif active_error == "rate_limit":
                state = "Rate limited"
            elif active_error in (
                "invalid_key",
                "permission_denied",
                "model_unavailable",
                "network_error",
                "timeout",
                "service_unavailable",
            ):
                state = "Provider error"
        reps = []
        for rep in sorted({c["repetition"] for c in items}):
            part = [c for c in items if c["repetition"] == rep]
            reps.append(
                {
                    "repetition": rep,
                    **operational(part),
                    "execution_ids": [c["id"] for c in part],
                }
            )
        models.append(
            {
                "provider": provider,
                "model": model,
                "depth": depth,
                "status": state,
                "last_error": active_error,
                "operations": ops,
                "quality": quality,
                "repetitions": reps,
                "usage_by_task": [
                    {
                        "task": task,
                        "difficulty": level,
                        **operational(
                            [
                                c
                                for c in items
                                if c["task"] == task and c["difficulty"] == level
                            ]
                        ),
                    }
                    for task, level in sorted(
                        {(c["task"], c["difficulty"]) for c in items}
                    )
                ],
            }
        )
    data = json.loads(batch["data"])
    # Snapshot contains summaries only. Input/raw output are fetched on demand.
    public_calls = [
        {
            k: v
            for k, v in c.items()
            if k not in ("result", "call", "prompt", "response_checkpoint", "request")
        }
        | {
            "has_result": c["status"] in EVALUATED and valid_result(c["result"]),
            "latency_seconds": (c["result"] or c.get("call") or {}).get(
                "latency_seconds"
            ),
            "result_summary": {
                k: v
                for k, v in (c["result"] or {}).get("metrics", {}).items()
                if k
                in (
                    "relationship_recall",
                    "impact_recall",
                    "entity_f1",
                    "critical_missed",
                )
            },
            "missing_count": sum(
                (c["result"] or {}).get("metrics", {}).get(k, {}).get("fn", 0)
                for k in ("entity", "parameter", "relationship", "impact")
            )
            if c["result"]
            else None,
            "scenario_outcomes": {
                s["scenario_id"]: {
                    "correct": s["comparison"]["fp"] == s["comparison"]["fn"] == 0
                    and all(e["passes_rules"] for e in s["explanation_checks"]),
                    "tp": s["comparison"]["tp"],
                    "fp": s["comparison"]["fp"],
                    "fn": s["comparison"]["fn"],
                }
                for s in (c["result"] or {}).get("metrics", {}).get("scenarios", [])
            },
        }
        for c in calls
    ]
    return {
        "id": batch_id,
        "created_at": batch["created_at"],
        "status": batch["status"],
        "stop_requested": bool(batch["stop_requested"]),
        **data,
        "last_event_id": last_event,
        "models": models,
        "operations": operational(calls),
        "calls": public_calls,
        "tasks": sorted({c["task"] for c in calls}),
        "levels": sorted({c["difficulty"] for c in calls}),
        "scenario_ids": sorted({s for c in calls for s in c["scenario_ids"]}),
        "started_at": data.get("started_at")
        or min((c["started_at"] for c in calls if c.get("started_at")), default=None),
    }


def list_batches(db=None):
    with storage.connect(db) as con:
        ids = [
            r[0]
            for r in con.execute("SELECT id FROM live_batches ORDER BY created_at DESC")
        ]
    return [{k: v for k, v in snapshot(b, db).items() if k != "calls"} for b in ids]


def events(batch_id, after=0, db=None):
    with storage.connect(db) as con:
        return [
            dict(r) | {"data": json.loads(r["data"])}
            for r in con.execute(
                "SELECT * FROM live_events WHERE batch_id=? AND id>? ORDER BY id",
                (batch_id, after),
            )
        ]


def call_detail(cid, db=None):
    with storage.connect(db) as con:
        row = con.execute("SELECT * FROM live_calls WHERE id=?", (cid,)).fetchone()
    if not row:
        return None
    run = storage.get_execution(row["run_id"], db)
    info = json.loads(row["data"])
    result = json.loads(row["result"]) if row["result"] else None
    from .dataset import make_prompt
    from .evaluate import compare_graph

    snap = run["snapshot"]
    feedback = [
        {k: f[k] for k in ("edge", "verdict", "correction")}
        for f in snap.get("feedback", [])
    ]
    prompt = (
        (result or {}).get("prompt")
        or info.get("prompt")
        or make_prompt(
            snap["dataset"],
            snap["prompts"],
            info["task"],
            info["difficulty"],
            snap["schemas"][info["task"]],
            feedback,
        )
    )
    return {
        **info,
        "id": cid,
        "run_id": run["id"],
        "batch_id": row["batch_id"],
        "status": row["status"],
        "stage": row["stage"],
        "prompt": prompt,
        "prompt_hash": digest(prompt),
        "input": json.loads(prompt.split("\nINPUT\n", 1)[1]),
        "result": result,
        "ground_truth": snap["dataset"]["ground_truth"],
        "schema": snap["schemas"][info["task"]],
        "comparison": compare_graph(result["parsed_output"], snap["dataset"])
        if result and info["task"] == "relationship_extraction"
        else None,
        "snapshot_metadata": {
            k: run["metadata"][k]
            for k in (
                "dataset_hash",
                "dataset_version",
                "prompt_hashes",
                "comparison_hash",
            )
        },
    }
