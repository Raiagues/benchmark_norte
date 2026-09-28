import json

import httpx
import pytest
from fastapi.testclient import TestClient

from benchmark import connections, storage
from benchmark.diagnostics import api_error
from benchmark.providers import call_provider, request_spec
from benchmark.runner import configuration, prepare_runs
from benchmark.security import get_key


def models():
    return configuration()["models"][:3]


def mock_connection_api(monkeypatch, responses=None):
    sent = []

    def respond(request):
        sent.append(request)
        if responses:
            status, raw = responses.pop(0)
            return httpx.Response(status, json=raw)
        if "anthropic" in str(request.url):
            raw = {
                "content": [{"type": "text", "text": '{"ok":true}'}],
                "usage": {"input_tokens": 1, "output_tokens": 1},
            }
        elif "googleapis" in str(request.url):
            raw = {
                "candidates": [
                    {
                        "content": {"parts": [{"text": '{"ok":true}'}]},
                        "finishReason": "STOP",
                    }
                ],
                "usageMetadata": {"promptTokenCount": 1, "candidatesTokenCount": 1},
            }
        else:
            raw = {
                "output": [
                    {"content": [{"type": "output_text", "text": '{"ok":true}'}]}
                ],
                "usage": {"input_tokens": 1, "output_tokens": 1},
            }
        return httpx.Response(200, json=raw)

    def call(config, prompt, schema, settings, pricing, api_key=None):
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            return call_provider(
                config,
                prompt,
                schema,
                settings,
                pricing,
                client=client,
                api_key=api_key,
            )

    monkeypatch.setattr(connections, "call_provider", call)
    return sent


def put_keys(monkeypatch):
    for name in ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"):
        monkeypatch.setenv(name, "test-only-" + name)


def test_missing_key_blocks_entire_selected_probe_and_benchmark(db, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai")
    sent = mock_connection_api(monkeypatch)
    result = connections.verify_connections(models(), db)
    assert result["blocked"] and result["api_calls"] == 0
    with pytest.raises(ValueError, match="Nenhuma chamada"):
        prepare_runs(models(), repetitions=1, db=db)
    assert not sent and not storage.list_executions(db) and not storage.list_runs(db)


def test_manual_confirmation_persists_without_benchmark_or_repeated_probe(
    db, monkeypatch
):
    put_keys(monkeypatch)
    sent = mock_connection_api(monkeypatch)
    assert connections.verify_connections(models(), db)["api_calls"] == 3
    assert all(c["ready"] for c in connections.statuses(models(), db))
    assert connections.verify_connections(models(), db)["api_calls"] == 0
    assert len(sent) == 3
    assert not storage.list_runs(db) and not storage.list_executions(db)
    assert not (db.parent / "results").exists()
    prepare_runs(models(), ["entity_extraction"], repetitions=1, db=db)
    assert len(sent) == 3  # starting uses local state only
    assert (
        connections.verify_connections(models()[:1], db, force=True)["api_calls"] == 1
    )
    assert len(sent) == 4
    public = json.dumps(connections.statuses(models(), db))
    assert "key_hash" not in public and "test-only-" not in public
    with storage.connect(db) as con:
        assert all(
            "test-only-" not in r["data"]
            for r in con.execute("SELECT * FROM connection_checks")
        )


def test_one_unconfirmed_model_prevents_all_benchmark_work(db, monkeypatch):
    put_keys(monkeypatch)
    sent = mock_connection_api(monkeypatch)
    connections.verify_connections(models()[:2], db)
    with pytest.raises(ValueError, match="Falta verificar"):
        prepare_runs(models(), repetitions=1, db=db)
    assert len(sent) == 2
    assert storage.list_executions(db) == []


def test_rotated_removed_or_changed_config_invalidates_confirmation(db, monkeypatch):
    put_keys(monkeypatch)
    mock_connection_api(monkeypatch)
    m = models()[0]
    connections.verify_connections([m], db)
    assert connections.connection_status(m, db)["ready"]
    assert (
        connections.connection_status({**m, "reasoning_effort": "low"}, db)["status"]
        == "unverified"
    )
    monkeypatch.setenv("OPENAI_API_KEY", "new-test-only-key")
    assert connections.connection_status(m, db)["status"] == "unverified"
    monkeypatch.delenv("OPENAI_API_KEY")
    assert connections.connection_status(m, db)["status"] == "missing_api_key"


def test_env_edits_are_live_and_do_not_interpolate_secrets(tmp_path, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "old-env")
    env = tmp_path / ".env"
    env.write_text("OPENAI_API_KEY=local-${HOME}-test\n")
    assert get_key("openai") == "local-${HOME}-test"
    env.write_text("OPENAI_API_KEY=\n")
    assert get_key("openai") == ""
    env.unlink()
    assert get_key("openai") == "old-env"


@pytest.mark.parametrize(
    "provider,status,error,category",
    [
        ("openai", 401, {"code": "invalid_api_key"}, "invalid_key"),
        (
            "openai",
            429,
            {"code": "credit_balance_exhausted", "type": "insufficient_quota"},
            "billing_error",
        ),
        ("openai", 429, {"code": "organization_spend_limit_exceeded"}, "spend_limit"),
        ("openai", 429, {"code": "insufficient_quota"}, "quota_exceeded"),
        ("openai", 429, {"code": "rate_limit_exceeded"}, "rate_limit"),
        (
            "anthropic",
            400,
            {"message": "Your credit balance is too low to access the API."},
            "billing_error",
        ),
        ("anthropic", 529, {"type": "overloaded_error"}, "service_unavailable"),
        (
            "gemini",
            400,
            {
                "status": "INVALID_ARGUMENT",
                "message": "API key not valid. Please pass a valid API key.",
            },
            "invalid_key",
        ),
        (
            "gemini",
            429,
            {
                "status": "RESOURCE_EXHAUSTED",
                "message": "Quota exceeded for this project",
            },
            "quota_exceeded",
        ),
        ("gemini", 403, {"status": "PERMISSION_DENIED"}, "permission_denied"),
        ("gemini", 404, {"status": "NOT_FOUND"}, "model_unavailable"),
    ],
)
def test_api_error_diagnosis(provider, status, error, category):
    d = api_error(provider, status, {"error": error})
    assert d["category"] == category
    assert d["title"] and d["action"] and d["help_url"]


def test_credit_failure_confirms_http_response_but_never_readiness(db, monkeypatch):
    put_keys(monkeypatch)
    sent = mock_connection_api(
        monkeypatch,
        [
            (
                429,
                {
                    "error": {
                        "code": "credit_balance_exhausted",
                        "message": "Out of credits test-only-OPENAI_API_KEY",
                    }
                },
            )
        ],
    )
    result = connections.verify_connections(models()[:1], db)
    c = result["checks"][0]
    assert (
        c["status"] == "billing_error"
        and c["api_responded"]
        and not c["generation_confirmed"]
    )
    assert "test-only-OPENAI_API_KEY" not in json.dumps(result)
    with pytest.raises(ValueError, match="Saldo"):
        prepare_runs(models()[:1], repetitions=1, db=db)
    assert len(sent) == 1
    assert not storage.list_runs(db) and not storage.list_executions(db)


@pytest.mark.parametrize(
    "text", ['{"ok":false}', '{"ok":1}', '{"ok":true,"extra":1}', "not JSON"]
)
def test_unexpected_probe_json_does_not_confirm(db, monkeypatch, text):
    put_keys(monkeypatch)
    mock_connection_api(
        monkeypatch,
        [
            (
                200,
                {"output": [{"content": [{"type": "output_text", "text": text}]}]},
            )
        ],
    )
    c = connections.verify_connections(models()[:1], db)["checks"][0]
    assert not c["ready"] and c["status"] == "invalid_response"


def test_saved_claude_billing_failure_requires_explicit_recheck_without_benchmark(
    db, monkeypatch
):
    put_keys(monkeypatch)
    selected = [m for m in models() if m["provider"] == "anthropic"]
    sent = mock_connection_api(
        monkeypatch,
        [
            (
                400,
                {
                    "error": {
                        "type": "invalid_request_error",
                        "message": "Your credit balance is too low to access the API.",
                    }
                },
            ),
            (
                200,
                {
                    "content": [{"type": "text", "text": '{"ok":true}'}],
                    "usage": {"input_tokens": 1, "output_tokens": 1},
                },
            ),
        ],
    )
    first = connections.verify_connections(selected, db)
    assert first["checks"][0]["status"] == "billing_error"
    assert not connections.statuses(selected, db)[0]["ready"]
    with pytest.raises(ValueError, match="Nenhuma chamada"):
        connections.require_ready(selected, db)
    assert len(sent) == 1  # Local reads/start gate do not retry a failed check.
    second = connections.verify_connections(selected, db)
    assert second["api_calls"] == 1 and second["checks"][0]["ready"]
    connections.require_ready(selected, db)
    assert connections.verify_connections(selected, db)["api_calls"] == 0
    assert len(sent) == 2 and all("anthropic" in str(r.url) for r in sent)
    assert not storage.list_runs(db) and not storage.list_executions(db)
    with storage.connect(db) as con:
        assert con.execute("SELECT COUNT(*) FROM task_results").fetchone()[0] == 0


def test_connection_endpoint_and_batch_gate_use_no_results(monkeypatch):
    from benchmark.api import app

    put_keys(monkeypatch)
    sent = mock_connection_api(monkeypatch)
    headers = {"X-Norte-Client": "local-ui"}
    with TestClient(app) as client:
        assert (
            client.post(
                "/api/runs", headers=headers, json={"models": [0, 1, 2]}
            ).status_code
            == 400
        )
        assert not sent
        check = client.post(
            "/api/connections/verify", headers=headers, json={"models": [0, 1, 2]}
        ).json()
        assert check["api_calls"] == 3
        assert all(
            c["ready"] for c in client.get("/api/config").json()["connections"][:3]
        )
        assert (
            client.get("/api/runs").json() == client.get("/api/executions").json() == []
        )
        assert (
            client.post(
                "/api/connections/verify", headers=headers, json={"models": [0]}
            ).json()["api_calls"]
            == 0
        )
        assert (
            client.post(
                "/api/connections/verify", headers=headers, json={"models": [-1]}
            ).status_code
            == 400
        )
        assert (
            client.post("/api/connections/verify", json={"models": [0]}).status_code
            == 403
        )
        assert (
            client.post(
                "/api/connections/verify", headers=headers, json={"models": [0, 0]}
            ).status_code
            == 400
        )


def test_featured_request_settings_match_provider_contracts():
    for model in configuration()["models"]:
        _, _, body = request_spec(
            model, "prompt", connections.PROBE_SCHEMA, 2048, api_key="test-placeholder"
        )
        if model["provider"] == "openai":
            assert "temperature" not in body and body["reasoning"]["effort"] == "high"
        elif model["provider"] == "anthropic":
            assert (
                "temperature" not in body and body["output_config"]["effort"] == "high"
            )
        else:
            assert body["generationConfig"]["temperature"] == 1
            assert body["generationConfig"]["thinkingConfig"]["thinkingLevel"] == "high"


def test_malformed_provider_envelope_is_an_actionable_error(db, monkeypatch):
    put_keys(monkeypatch)
    mock_connection_api(monkeypatch, [(200, ["unexpected array"])])
    c = connections.verify_connections(models()[:1], db)["checks"][0]
    assert c["status"] == "invalid_response" and not c["ready"]
    assert c["api_responded"] and c["diagnostic"]["action"]
    assert not storage.list_runs(db)


def test_selected_depth_is_sent_to_probe_and_saved_in_run(db, monkeypatch):
    put_keys(monkeypatch)
    sent = mock_connection_api(monkeypatch)
    selected = connections.select_models(
        configuration()["models"], [0, 1, 2], {"0": "medium", "1": "low", "2": "medium"}
    )
    connections.verify_connections(selected, db)
    bodies = [json.loads(r.content) for r in sent]
    assert bodies[0]["reasoning"]["effort"] == "medium"
    assert bodies[1]["output_config"]["effort"] == "low"
    assert bodies[2]["generationConfig"]["thinkingConfig"]["thinkingLevel"] == "medium"
    assert not connections.connection_status(models()[0], db)["ready"]
    ids = prepare_runs(selected, ["entity_extraction"], repetitions=1, db=db)
    assert len(sent) == 3
    for rid, model in zip(ids, selected):
        record = storage.get_execution(rid, db)
        assert record["snapshot"]["model_config"] == model
        assert record["metadata"]["depth"] == model.get(connections.depth_field(model))
    assert not storage.list_runs(db)


def test_depth_selection_rejects_unsupported_or_unselected_settings():
    catalog = configuration()["models"]
    for indices, depths in [
        ([0], {"0": "none"}),
        ([2], {"2": "max"}),
        ([0], {"1": "low"}),
        ([0, 0], {}),
        ([-1], {}),
        ([], {}),
    ]:
        with pytest.raises(ValueError):
            connections.select_models(catalog, indices, depths)
    selected = connections.select_models(catalog, [0], {"0": "max"})[0]
    assert selected["reasoning_effort"] == "max"
    assert catalog[0]["reasoning_effort"] == "high"


def test_reading_depth_status_never_calls_api_and_invalid_depth_blocks_batch(
    monkeypatch,
):
    from benchmark.api import app

    put_keys(monkeypatch)
    sent = mock_connection_api(monkeypatch)
    headers = {"X-Norte-Client": "local-ui"}
    with TestClient(app) as client:
        body = {"models": [0, 1, 2], "depths": {"0": "medium", "1": "high", "2": "low"}}
        result = client.post("/api/connections/status", headers=headers, json=body)
        assert result.status_code == 200
        assert [r["depth"] for r in result.json()] == ["medium", "high", "low"]
        assert all(not r["ready"] for r in result.json())
        assert not sent
        for path in ("/api/connections/verify", "/api/runs"):
            bad = client.post(
                path, headers=headers, json={"models": [0, 2], "depths": {"2": "max"}}
            )
            assert bad.status_code == 400
            assert bad.json()["detail"] == "invalid_model_depth"
        assert not sent
        assert (
            client.get("/api/runs").json() == client.get("/api/executions").json() == []
        )
        assert client.post("/api/connections/status", json=body).status_code == 403


def test_modified_depth_does_not_allow_arbitrary_model_configuration(db, monkeypatch):
    put_keys(monkeypatch)
    sent = mock_connection_api(monkeypatch)
    changed = connections.with_depth(models()[0], "medium")
    changed["temperature"] = 0.9
    with pytest.raises(ValueError, match="Model must be present"):
        prepare_runs([changed], db=db)
    assert not sent
