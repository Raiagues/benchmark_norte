"""Execution attempts are separate from completed, API-backed benchmark results."""

import json
import os
import sqlite3
import uuid
from pathlib import Path

from .dataset import ROOT
from .providers import utcnow
from .security import redact


def connect(db=None):
    path = Path(db or ROOT / "data/benchmark.sqlite3")
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=30)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    return con


def init_db(db=None):
    with connect(db) as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, status TEXT NOT NULL, metadata TEXT NOT NULL, snapshot TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS executions (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, status TEXT NOT NULL, metadata TEXT NOT NULL, snapshot TEXT NOT NULL, failure TEXT);
        CREATE TABLE IF NOT EXISTS task_results (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), task TEXT NOT NULL, difficulty TEXT NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, confirmed INTEGER NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS human_reviews (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS connection_checks (provider TEXT NOT NULL, model TEXT NOT NULL, key_hash TEXT NOT NULL, config_hash TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(provider,model));
        CREATE INDEX IF NOT EXISTS results_run ON task_results(run_id);
        """)


def json_text(value):
    return json.dumps(redact(value), ensure_ascii=False, allow_nan=False)


def save_execution(run, db=None):
    with connect(db) as con:
        con.execute(
            "INSERT INTO executions VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,metadata=excluded.metadata,failure=excluded.failure",
            (
                run["id"],
                run["created_at"],
                run["status"],
                json_text(run["metadata"]),
                json_text(run["snapshot"]),
                json_text(run.get("failure")),
            ),
        )


def publish_run(run, results, db=None):
    """Publish the entire repetition atomically. Partial/failed attempts never score."""
    if (
        run["status"] != "completed"
        or run["metadata"].get("origin") != "provider_api"
        or run["metadata"]["provider"] not in ("openai", "anthropic", "gemini")
        or not results
        or len(results) != run["metadata"]["total_calls"]
        or any(
            r.get("error")
            or r.get("parsed_output") is None
            or not r.get("raw_response")
            or not all(
                r["metrics"].get(k) == 1
                for k in (
                    "valid_json_rate",
                    "schema_compliance_rate",
                    "contract_compliance_rate",
                )
            )
            or not r.get("attempts")
            or r["attempts"][-1].get("http_status") != 200
            for r in results
        )
    ):
        raise ValueError(
            "Only complete, validated provider API responses can be published"
        )
    with connect(db) as con:
        con.execute(
            "INSERT INTO runs VALUES (?,?,?,?,?)",
            (
                run["id"],
                run["created_at"],
                run["status"],
                json_text(run["metadata"]),
                json_text(run["snapshot"]),
            ),
        )
        con.executemany(
            "INSERT INTO task_results VALUES (?,?,?,?,?)",
            [
                (r["id"], r["run_id"], r["task"], r["difficulty"], json_text(r))
                for r in results
            ],
        )


def list_runs(db=None):
    with connect(db) as con:
        return [
            {
                "id": r["id"],
                "created_at": r["created_at"],
                "status": r["status"],
                **json.loads(r["metadata"]),
            }
            for r in con.execute(
                "SELECT * FROM runs WHERE status='completed' AND json_extract(metadata, '$.origin')='provider_api' ORDER BY created_at DESC"
            )
        ]


def get_run(run_id, db=None):
    with connect(db) as con:
        row = con.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
        if (
            not row
            or row["status"] != "completed"
            or json.loads(row["metadata"]).get("origin") != "provider_api"
        ):
            return None
        return {
            "id": row["id"],
            "created_at": row["created_at"],
            "status": row["status"],
            "metadata": json.loads(row["metadata"]),
            "snapshot": json.loads(row["snapshot"]),
            "results": [
                json.loads(r[0])
                for r in con.execute(
                    "SELECT data FROM task_results WHERE run_id=? ORDER BY rowid",
                    (run_id,),
                )
            ],
        }


def export_run(run_id, db=None, results_dir=None):
    run = get_run(run_id, db)
    if run is None:
        raise ValueError("No completed API result to export")
    base = Path(db).parent / "results" if db else ROOT / "results"
    folder = Path(results_dir or base) / run["metadata"]["provider"] / run_id
    folder.mkdir(parents=True, exist_ok=True)
    temp = folder / "run.json.tmp"
    temp.write_text(json_text(run) + "\n")
    os.replace(temp, folder / "run.json")


def list_executions(db=None):
    with connect(db) as con:
        return [
            {
                "id": r["id"],
                "created_at": r["created_at"],
                "status": r["status"],
                **json.loads(r["metadata"]),
                "failure": (
                    {
                        k: v
                        for k, v in json.loads(r["failure"]).items()
                        if k in ("task", "difficulty", "category", "diagnostic")
                    }
                    if r["failure"] and json.loads(r["failure"])
                    else None
                ),
            }
            for r in con.execute("SELECT * FROM executions ORDER BY created_at DESC")
        ]


def get_execution(execution_id, db=None):
    with connect(db) as con:
        row = con.execute(
            "SELECT * FROM executions WHERE id=?", (execution_id,)
        ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "created_at": row["created_at"],
            "status": row["status"],
            "metadata": json.loads(row["metadata"]),
            "snapshot": json.loads(row["snapshot"]),
            "failure": json.loads(row["failure"]) if row["failure"] else None,
        }


def save_feedback(data, db=None):
    record = {**data, "id": uuid.uuid4().hex, "created_at": utcnow()}
    with connect(db) as con:
        con.execute(
            "INSERT INTO feedback VALUES (?,?,?,?)",
            (
                record["id"],
                record["created_at"],
                int(record["confirmed"]),
                json_text(record),
            ),
        )
    return redact(record)


def list_feedback(db=None, confirmed_only=False):
    with connect(db) as con:
        query = (
            "SELECT data FROM feedback"
            + (" WHERE confirmed=1" if confirmed_only else "")
            + " ORDER BY created_at"
        )
        return [json.loads(row[0]) for row in con.execute(query)]


def confirm_feedback(feedback_id, confirmed, db=None):
    with connect(db) as con:
        row = con.execute(
            "SELECT data FROM feedback WHERE id=?", (feedback_id,)
        ).fetchone()
        if not row:
            return None
        data = json.loads(row[0])
        data["confirmed"] = confirmed
        con.execute(
            "UPDATE feedback SET confirmed=?, data=? WHERE id=?",
            (int(confirmed), json_text(data), feedback_id),
        )
        return data


def save_review(data, db=None):
    record = {**data, "id": uuid.uuid4().hex, "created_at": utcnow()}
    with connect(db) as con:
        con.execute(
            "INSERT INTO human_reviews VALUES (?,?,?)",
            (record["id"], record["run_id"], json_text(record)),
        )
    return redact(record)


def list_reviews(run_id, db=None):
    with connect(db) as con:
        return [
            json.loads(r[0])
            for r in con.execute(
                "SELECT data FROM human_reviews WHERE run_id=?", (run_id,)
            )
        ]
