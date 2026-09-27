import json

import httpx
import pytest

from benchmark.providers import (
    call_provider,
    estimate_cost,
    normalize_response,
    request_spec,
)
from benchmark.schemas import response_schema


@pytest.mark.parametrize(
    "provider,raw,expected",
    [
        (
            "openai",
            {
                "output": [{"content": [{"type": "output_text", "text": "{}"}]}],
                "usage": {"input_tokens": 5, "output_tokens": 2},
            },
            (5, 2),
        ),
        (
            "anthropic",
            {
                "content": [{"type": "text", "text": "{}"}],
                "usage": {
                    "input_tokens": 5,
                    "output_tokens": 2,
                    "cache_read_input_tokens": 3,
                },
            },
            (8, 2),
        ),
        (
            "gemini",
            {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"text": "private reasoning", "thought": True},
                                {"text": "{}"},
                            ]
                        },
                        "finishReason": "STOP",
                    }
                ],
                "usageMetadata": {
                    "promptTokenCount": 5,
                    "candidatesTokenCount": 2,
                    "thoughtsTokenCount": 4,
                },
            },
            (5, 6),
        ),
    ],
)
def test_provider_normalization(provider, raw, expected):
    value = normalize_response(provider, raw)
    assert value["text"] == "{}"
    assert (value["tokens"]["input"], value["tokens"]["output"]) == expected


def test_refusal_and_truncation():
    assert (
        normalize_response("openai", {"output": [{"content": [{"type": "refusal"}]}]})[
            "error"
        ]
        == "refusal"
    )
    assert (
        normalize_response("anthropic", {"stop_reason": "max_tokens"})["error"]
        == "truncated_output"
    )
    assert (
        normalize_response("gemini", {"promptFeedback": {"blockReason": "SAFETY"}})[
            "error"
        ]
        == "refusal"
    )


def test_same_prompt_and_schema_on_every_provider(monkeypatch):
    schema = response_schema("entity_extraction")
    for provider, env in [
        ("openai", "OPENAI_API_KEY"),
        ("anthropic", "ANTHROPIC_API_KEY"),
        ("gemini", "GOOGLE_API_KEY"),
    ]:
        monkeypatch.setenv(env, "test-placeholder")
        url, headers, body = request_spec(
            {"provider": provider, "model": "example", "temperature": None},
            "IDENTICAL PROMPT",
            schema,
            2000,
        )
        serialized = json.dumps(body)
        assert "IDENTICAL PROMPT" in serialized
        assert "test-placeholder" not in serialized
        assert "test-placeholder" not in url
        if provider == "openai":
            actual = body["text"]["format"]["schema"]
        elif provider == "anthropic":
            actual = body["output_config"]["format"]["schema"]
        else:
            actual = body["generationConfig"]["responseJsonSchema"]
        assert actual == schema


def test_retry_records_each_attempt_and_redacts_keys(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "not-a-real-test-secret")
    monkeypatch.setattr("benchmark.providers.time.sleep", lambda _: None)
    count = 0

    def respond(request):
        nonlocal count
        count += 1
        if count == 1:
            return httpx.Response(
                429, json={"error": "rate limit not-a-real-test-secret"}
            )
        return httpx.Response(
            200,
            json={
                "output": [{"content": [{"type": "output_text", "text": "{}"}]}],
                "usage": {"input_tokens": 20, "output_tokens": 2},
            },
        )

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        result = call_provider(
            {"provider": "openai", "model": "example"},
            "prompt",
            {},
            {"retries": 1, "timeout_seconds": 1, "max_output_tokens": 1000},
            {"prices": []},
            client,
        )
    assert len(result["attempts"]) == 2
    assert result["attempts"][0]["error"] == "rate_limit"
    assert result["error"] is None
    assert "not-a-real-test-secret" not in json.dumps(result)


def test_nontransient_error_not_retried(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-placeholder")
    with httpx.Client(
        transport=httpx.MockTransport(
            lambda r: httpx.Response(401, json={"error": "unauthorized"})
        )
    ) as client:
        result = call_provider(
            {"provider": "anthropic", "model": "example"},
            "p",
            {},
            {"retries": 2, "timeout_seconds": 1, "max_output_tokens": 1000},
            {"prices": []},
            client,
        )
    assert len(result["attempts"]) == 1
    assert result["error"] == "invalid_key"


def test_cost_requires_a_verified_pricing_row():
    pricing = {
        "prices": [
            {
                "provider": "openai",
                "model": "example",
                "input": 2,
                "output": 8,
                "date_checked": "2026-09-27",
                "source_url": "https://example.org/pricing",
            }
        ]
    }
    assert (
        estimate_cost({"input": 1000, "output": 500}, pricing, "openai", "example")
        == 0.006
    )
    assert (
        estimate_cost(
            {"input": 1000, "output": 500, "cached_input": 5},
            pricing,
            "openai",
            "example",
        )
        is None
    )
    assert (
        estimate_cost({"input": None, "output": 500}, pricing, "openai", "example")
        is None
    )
    assert (
        estimate_cost({"input": 1000, "output": 500}, pricing, "openai", "unknown")
        is None
    )
