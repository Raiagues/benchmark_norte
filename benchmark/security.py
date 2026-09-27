"""Secrets never enter prompts, snapshots, or browser configuration."""

import json
import os
import re
from dotenv import dotenv_values
from .dataset import ROOT

KEY_NAMES = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GOOGLE_API_KEY",
}
KEY_PATTERN = re.compile(
    r"(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,})"
)


def get_key(provider):
    """Read .env without mutating process environment; edits take effect immediately."""
    name = KEY_NAMES[provider]
    values = dotenv_values(ROOT / ".env", interpolate=False)
    value = values[name] if name in values else os.getenv(name, "")
    return (value or "").strip()


def redact(value, extra_secrets=()):
    text = json.dumps(value, ensure_ascii=False)
    keys = (
        [get_key(p) for p in KEY_NAMES]
        + [os.getenv(n, "") for n in KEY_NAMES.values()]
        + list(extra_secrets)
    )
    for key in keys:
        if key:
            # Replace JSON-escaped secrets too, including quotes or backslashes.
            text = text.replace(json.dumps(key, ensure_ascii=False)[1:-1], "[REDACTED]")
    return json.loads(KEY_PATTERN.sub("[REDACTED]", text))
