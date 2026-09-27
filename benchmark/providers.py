"""Thin REST adapters. One prompt and schema; no provider SDK or hidden retries."""

import time
from datetime import datetime, timezone
from urllib.parse import quote

import httpx

from .security import get_key, redact
from .diagnostics import api_error, describe


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def request_spec(config, prompt, schema, max_tokens, api_key=None):
    provider, model = config["provider"], config["model"]
    key = get_key(provider) if api_key is None else api_key
    temperature = config.get("temperature")
    structured = config.get("structured_output", True)
    if provider == "openai":
        url = "https://api.openai.com/v1/responses"
        headers = {"Authorization": f"Bearer {key}"}
        body = {
            "model": model,
            "input": [{"role": "user", "content": prompt}],
            "max_output_tokens": max_tokens,
            "store": False,
        }
        if structured:
            body["text"] = {
                "format": {
                    "type": "json_schema",
                    "name": "engineering_benchmark",
                    "strict": True,
                    "schema": schema,
                }
            }
        if temperature is not None:
            body["temperature"] = temperature
        if config.get("reasoning_effort"):
            body["reasoning"] = {"effort": config["reasoning_effort"]}
    elif provider == "anthropic":
        url = "https://api.anthropic.com/v1/messages"
        headers = {"x-api-key": key, "anthropic-version": "2023-06-01"}
        body = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if structured:
            body["output_config"] = {
                "format": {"type": "json_schema", "schema": schema}
            }
        if config.get("reasoning_effort"):
            body.setdefault("output_config", {})["effort"] = config["reasoning_effort"]
        if temperature is not None:
            body["temperature"] = temperature
    elif provider == "gemini":
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{quote(model, safe='')}:generateContent"
        headers = {"x-goog-api-key": key}
        generation = {"maxOutputTokens": max_tokens}
        if structured:
            generation.update(
                responseMimeType="application/json", responseJsonSchema=schema
            )
        if temperature is not None:
            generation["temperature"] = temperature
        if config.get("thinking_level"):
            generation["thinkingConfig"] = {"thinkingLevel": config["thinking_level"]}
        body = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": generation,
        }
    else:
        raise ValueError("Unknown provider")
    return url, headers, body


def normalize_response(provider, raw):
    if provider == "openai":
        blocks = [b for item in raw.get("output", []) for b in item.get("content", [])]
        text = "".join(
            b.get("text", "") for b in blocks if b.get("type") == "output_text"
        )
        usage = raw.get("usage") or {}
        error = (
            "refusal"
            if any(b.get("type") == "refusal" for b in blocks)
            else "truncated_output"
            if raw.get("status") == "incomplete"
            else None
        )
        tokens = {
            "input": usage.get("input_tokens"),
            "output": usage.get("output_tokens"),
            "cached_input": (usage.get("input_tokens_details") or {}).get(
                "cached_tokens", 0
            ),
        }
    elif provider == "anthropic":
        text = "".join(
            b.get("text", "") for b in raw.get("content", []) if b.get("type") == "text"
        )
        usage = raw.get("usage") or {}
        extra = usage.get("cache_creation_input_tokens", 0) + usage.get(
            "cache_read_input_tokens", 0
        )
        tokens = {
            "input": usage["input_tokens"] + extra if "input_tokens" in usage else None,
            "output": usage.get("output_tokens"),
            "cached_input": extra,
        }
        error = (
            "truncated_output"
            if raw.get("stop_reason") == "max_tokens"
            else "refusal"
            if raw.get("stop_reason") == "refusal"
            else None
        )
    elif provider == "gemini":
        candidate = next(iter(raw.get("candidates", [])), {})
        text = "".join(
            p.get("text", "")
            for p in candidate.get("content", {}).get("parts", [])
            if not p.get("thought")
        )
        usage = raw.get("usageMetadata") or {}
        out = usage.get("candidatesTokenCount")
        tokens = {
            "input": usage.get("promptTokenCount"),
            "output": out + usage.get("thoughtsTokenCount", 0)
            if out is not None
            else None,
            "cached_input": usage.get("cachedContentTokenCount", 0),
        }
        finish = candidate.get("finishReason")
        error = (
            "truncated_output"
            if finish == "MAX_TOKENS"
            else "refusal"
            if finish in ("SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT")
            or raw.get("promptFeedback", {}).get("blockReason")
            else None
        )
    else:
        raise ValueError("Unknown provider")
    return {
        "text": text,
        "tokens": tokens,
        "error": error,
        "actual_model": raw.get("model", raw.get("modelVersion")),
    }


def estimate_cost(tokens, pricing, provider, model):
    price = next(
        (
            p
            for p in pricing["prices"]
            if p["provider"] == provider and p["model"] == model
        ),
        None,
    )
    if (
        not price
        or not price.get("date_checked")
        or not price.get("source_url")
        or any(
            price.get(k) is None or tokens.get(k) is None for k in ("input", "output")
        )
    ):
        return None
    if tokens.get("cached_input"):
        return None  # No cache-tier price model: never report a falsely precise cost.
    return (
        tokens["input"] * price["input"] + tokens["output"] * price["output"]
    ) / 1_000_000


def call_provider(
    config,
    prompt,
    schema,
    settings,
    pricing,
    client=None,
    api_key=None,
    observer=None,
    cancelled=None,
):
    started, clock = utcnow(), time.perf_counter()
    result = {
        "start_time": started,
        "attempts": [],
        "raw_response": None,
        "text": "",
        "tokens": {"input": None, "output": None},
        "cost_usd": None,
        "error": None,
    }
    key = get_key(config["provider"]) if api_key is None else api_key
    if not key:
        result["error"] = "missing_api_key"
    else:
        url, headers, body = request_spec(
            config, prompt, schema, settings["max_output_tokens"], api_key=key
        )
        if observer:
            observer("REQUEST_PREPARED", {})
        owned = client is None
        client = client or httpx.Client(
            timeout=settings["timeout_seconds"], follow_redirects=False
        )
        try:
            for attempt in range(settings["retries"] + 1):
                if cancelled and cancelled():
                    if not result["attempts"]:
                        result["error"] = "cancelled_before_request"
                    break
                entry = {
                    "number": attempt + 1,
                    "start_time": utcnow(),
                    "error": None,
                    "http_status": None,
                }
                tick = time.perf_counter()
                transient = False
                try:
                    if observer:
                        observer(
                            "API_REQUEST_SENT",
                            {
                                "attempt": attempt + 1,
                                "request_started_at": entry["start_time"],
                            },
                        )
                    response = client.post(url, headers=headers, json=body)
                    entry["http_status"] = response.status_code
                    try:
                        raw = response.json()
                    except ValueError:
                        raw = {"non_json_body": response.text[:4000]}
                    entry["raw_response"] = redact(raw)
                    if observer:
                        observer(
                            "API_RESPONSE_RECEIVED",
                            {
                                "attempt": attempt + 1,
                                "http_status": response.status_code,
                                "response_checkpoint": redact(raw, extra_secrets=[key]),
                            },
                        )
                    if response.is_error:
                        diagnostic = api_error(
                            config["provider"], response.status_code, raw
                        )
                        entry["error"] = diagnostic["category"]
                        result["diagnostic"] = diagnostic
                        transient = entry["error"] in (
                            "rate_limit",
                            "timeout",
                            "service_unavailable",
                        )
                    else:
                        try:
                            normalized = normalize_response(config["provider"], raw)
                        except (AttributeError, TypeError, ValueError):
                            normalized = {
                                "text": "",
                                "tokens": {"input": None, "output": None},
                                "error": "invalid_response",
                                "actual_model": None,
                            }
                        result.update(normalized)
                        result.pop("diagnostic", None)
                        result["raw_response"] = redact(raw)
                        entry["error"] = normalized["error"]
                        entry["tokens"] = normalized["tokens"]
                        entry["cost_usd"] = estimate_cost(
                            normalized["tokens"],
                            pricing,
                            config["provider"],
                            config["model"],
                        )
                except httpx.TimeoutException:
                    entry["error"], transient = "timeout", True
                except httpx.RequestError:
                    entry["error"], transient = "network_error", True
                entry.update(
                    end_time=utcnow(), latency_seconds=time.perf_counter() - tick
                )
                result["attempts"].append(entry)
                result["error"] = entry["error"]
                if observer:
                    observer(
                        "API_ATTEMPT_FINISHED",
                        {
                            "call": redact(result, extra_secrets=[key]),
                            "error": entry["error"],
                            "http_status": entry["http_status"],
                            "latency_seconds": entry["latency_seconds"],
                        },
                    )
                if not transient or attempt >= settings["retries"]:
                    break
                time.sleep(min(2**attempt, 4))
            # A failed attempt may have incurred unreported provider work: total unavailable.
            costs = [a.get("cost_usd") for a in result["attempts"]]
            result["cost_usd"] = (
                sum(costs) if costs and all(x is not None for x in costs) else None
            )
        finally:
            if owned:
                client.close()
    result.update(end_time=utcnow(), latency_seconds=time.perf_counter() - clock)
    if result["error"] and "diagnostic" not in result:
        result["diagnostic"] = describe(result["error"], config["provider"])
    return redact(result, extra_secrets=[key])
