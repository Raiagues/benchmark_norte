"""Manual connection checks, separate from benchmark results. Starting uses local gates only."""

import hashlib
import json

from . import storage
from .dataset import ROOT, digest, read_json
from .diagnostics import describe
from .providers import call_provider, utcnow
from .schemas import load_strict_json
from .security import KEY_NAMES, get_key

PROBE_SCHEMA = {
    "type": "object",
    "properties": {"ok": {"type": "boolean"}},
    "required": ["ok"],
    "additionalProperties": False,
}
PROBE_PROMPT = (
    'Connection check only. Return exactly {"ok":true}. Do not add any other text.'
)
REQUEST_FIELDS = (
    "provider",
    "model",
    "temperature",
    "structured_output",
    "reasoning_effort",
    "thinking_level",
)


def config_hash(model):
    return digest({k: model.get(k) for k in REQUEST_FIELDS})


def key_hash(key):
    # One-way fingerprint only, never the credential; stays server-side.
    return hashlib.sha256(key.encode()).hexdigest()


def save_check(model, key, record, db=None):
    with storage.connect(db) as con:
        con.execute(
            "INSERT INTO connection_checks VALUES (?,?,?,?,?) ON CONFLICT(provider,model) DO UPDATE SET key_hash=excluded.key_hash,config_hash=excluded.config_hash,data=excluded.data",
            (
                model["provider"],
                model["model"],
                key_hash(key),
                config_hash(model),
                storage.json_text(record),
            ),
        )


def connection_status(model, db=None):
    key = get_key(model["provider"])
    base = {
        "provider": model["provider"],
        "model": model["model"],
        "env_name": KEY_NAMES[model["provider"]],
        "key_present": bool(key),
        "ready": False,
        "checked_at": None,
        "api_responded": False,
        "generation_confirmed": False,
    }
    if not key:
        return {
            **base,
            "status": "missing_api_key",
            "diagnostic": describe("missing_api_key", model["provider"]),
        }
    with storage.connect(db) as con:
        row = con.execute(
            "SELECT * FROM connection_checks WHERE provider=? AND model=?",
            (model["provider"], model["model"]),
        ).fetchone()
    if (
        not row
        or row["key_hash"] != key_hash(key)
        or row["config_hash"] != config_hash(model)
    ):
        return {
            **base,
            "status": "unverified",
            "diagnostic": describe("unverified", model["provider"]),
        }
    return {**base, **json.loads(row["data"])}


def statuses(models, db=None):
    return [connection_status(m, db) for m in models]


def require_ready(models, db=None):
    pending = [s for s in statuses(models, db) if not s["ready"]]
    if pending:
        raise ValueError(
            "Nenhuma chamada foi iniciada. "
            + " ".join(
                f"{s['model']}: {s['diagnostic']['title']} ({s['env_name']}). {s['diagnostic']['action']}"
                for s in pending
            )
        )


def verify_connections(models, db=None, force=False):
    before = statuses(models, db)
    # Do not spend on ANY provider when the selected set lacks even one key.
    if any(not s["key_present"] for s in before):
        return {
            "checks": before,
            "api_calls": 0,
            "blocked": True,
            "message": "Faltam chaves no .env. Nenhuma chamada foi enviada.",
        }
    calls = 0
    for model, status in zip(models, before):
        if status["ready"] and not force:
            continue
        key = get_key(model["provider"])
        probe_model = dict(model)
        if probe_model.get("reasoning_effort"):
            probe_model["reasoning_effort"] = "low"
        if probe_model.get("thinking_level"):
            probe_model["thinking_level"] = "low"
        call = call_provider(
            probe_model,
            PROBE_PROMPT,
            PROBE_SCHEMA,
            {"max_output_tokens": 2048, "timeout_seconds": 45, "retries": 0},
            read_json(ROOT / "config/pricing.json"),
            api_key=key,
        )
        calls += 1
        valid = False
        if not call["error"]:
            try:
                answer = load_strict_json(call["text"])
                valid = (
                    isinstance(answer, dict)
                    and set(answer) == {"ok"}
                    and answer["ok"] is True
                )
            except (ValueError, TypeError):
                pass
        category = call["error"] or (None if valid else "invalid_response")
        record = {
            "status": "ready" if not category else category,
            "ready": category is None,
            "checked_at": utcnow(),
            "api_responded": any(
                a.get("http_status") is not None for a in call["attempts"]
            ),
            "generation_confirmed": category is None,
            "tokens": call["tokens"],
            "latency_seconds": call["latency_seconds"],
            "diagnostic": call.get("diagnostic")
            or (describe(category, model["provider"]) if category else None),
        }
        save_check(model, key, record, db)
    return {
        "checks": statuses(models, db),
        "api_calls": calls,
        "blocked": False,
        "message": "Verificação concluída. Nenhum resultado de benchmark foi criado.",
    }


def note_provider_failure(model, key, call, db=None):
    """A real access/billing/network failure invalidates the old manual confirmation."""
    if not call.get("error"):
        return
    category = call["error"]
    save_check(
        model,
        key,
        {
            "status": category,
            "ready": False,
            "checked_at": utcnow(),
            "api_responded": any(
                a.get("http_status") is not None for a in call.get("attempts", [])
            ),
            "generation_confirmed": False,
            "diagnostic": call.get("diagnostic")
            or describe(category, model["provider"]),
        },
        db,
    )
