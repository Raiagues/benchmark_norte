"""Explicit comparison exclusions, separate from immutable benchmark records."""

import json

from .dataset import ROOT

POLICY_PATH = ROOT / "config/result_exclusions.json"


def exclusions():
    if not POLICY_PATH.exists():
        return {}
    return {
        run_id: {k: v for k, v in rule.items() if k != "run_ids"}
        for rule in json.loads(POLICY_PATH.read_text())
        for run_id in rule["run_ids"]
    }


def annotation(run_id, rules=None):
    excluded = (exclusions() if rules is None else rules).get(run_id)
    return {"comparison_eligible": excluded is None, "comparison_exclusion": excluded}
