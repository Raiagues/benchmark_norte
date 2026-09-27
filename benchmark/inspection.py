"""Explain saved evaluation decisions without changing historical scores."""

from collections import Counter

from .evaluate import fact_checks
from .schemas import normalize_id


def failure_counts(metrics):
    counts = Counter()
    for family in ("entity", "parameter", "relationship", "impact"):
        comparison = metrics.get(family, {})
        counts["missing"] += comparison.get("fn", 0)
        counts["extra"] += comparison.get("fp", 0)
    for scenario in metrics.get("scenarios", []):
        for check in scenario["explanation_checks"]:
            for field in (
                "correct_changed_element",
                "correct_dependency",
                "valid_evidence",
            ):
                if not check[field]:
                    counts[field] += 1
            counts["unsupported_structured_claims"] += check[
                "unsupported_structured_claims"
            ]
            if (
                not check["passes_rules"]
                and all(
                    check[k]
                    for k in (
                        "correct_requirement",
                        "correct_changed_element",
                        "correct_dependency",
                        "valid_evidence",
                    )
                )
                and not check["unsupported_structured_claims"]
            ):
                counts["empty_explanation"] += 1
    for fact in metrics.get("fact_details", []):
        if not fact["supported"]:
            counts["unsupported_structured_claims"] += 1
    counts["valid_evidence"] += sum(
        e["status"] == "correct_bad_evidence" for e in metrics.get("edges", [])
    )
    accuracy = metrics.get("source_attribution_accuracy")
    if accuracy is not None and accuracy < 1:
        entities = metrics.get("entity", {})
        total = (
            len(metrics.get("fact_details", []))
            + entities.get("tp", 0)
            + entities.get("fp", 0)
        )
        counts["source_attribution"] = round((1 - accuracy) * total)
    return {k: n for k, n in counts.items() if n}


def inspect_impacts(result, dataset):
    """A row per project requirement, nested under its change scenario.

    Decisions come from the saved metrics. Claim details explain the unchanged
    matching rules; an out-of-scope fact is never called fabricated physics.
    """
    gt = dataset["ground_truth"]
    cases = {c["id"]: c for c in gt["change_scenarios"]}
    answers = {
        normalize_id(s["scenario_id"]): s
        for s in result["parsed_output"].get("scenarios", [])
    }
    inspected = []
    docs = {
        **dataset["documents"],
        **{k: {"change": c["description"]} for k, c in cases.items()},
    }
    for saved in result["metrics"].get("scenarios", []):
        case = cases[saved["scenario_id"]]
        impacts = {
            normalize_id(i["requirement_id"]): i
            for i in answers.get(case["id"], {}).get("impacts", [])
        }
        checks = {c["requirement_id"]: c for c in saved["explanation_checks"]}
        requirements = {r["id"]: r for r in gt["requirements"]}
        rows = []
        for req in sorted(requirements.keys() | impacts.keys()):
            expected = req in case["affected_requirements"]
            answer = impacts.get(req)
            check = checks.get(req)
            issues = []
            if expected and not answer:
                issues.append("missing")
            if answer and not expected:
                issues.append("extra")
            if check:
                issues.extend(
                    k
                    for k in (
                        "correct_changed_element",
                        "correct_dependency",
                        "valid_evidence",
                    )
                    if not check[k]
                )
                if check["unsupported_structured_claims"]:
                    issues.append("unsupported_structured_claims")
                if not answer["explanation"].strip():
                    issues.append("empty_explanation")
            claims = []
            if answer:
                facts = answer["technical_claims"]
                for fact, evaluated in zip(
                    facts,
                    fact_checks(
                        facts, gt["entities"]["parameters"], docs, dataset["input_mode"]
                    ),
                ):
                    claims.append(
                        {
                            "submitted": fact,
                            "checks": evaluated,
                            "expected": next(
                                (
                                    p
                                    for p in gt["entities"]["parameters"]
                                    if p["id"] == normalize_id(fact["id"])
                                ),
                                None,
                            ),
                        }
                    )
            rows.append(
                {
                    "requirement_id": req,
                    "requirement_text": requirements.get(req, {}).get("text"),
                    "expected_affected": expected,
                    "predicted_affected": bool(answer),
                    "decision_correct": expected == bool(answer),
                    "status": "incorrect" if issues else "correct",
                    "issues": issues,
                    "checks": check,
                    "answer": answer,
                    "claims": claims,
                    "expected_dependencies": [
                        e for e in case["affected_relationships"] if e["source"] == req
                    ],
                }
            )
        inspected.append(
            {
                "id": case["id"],
                "description": case["description"],
                "title": case.get("title"),
                "changed_entity": case["changed_entity"],
                "rows": rows,
                "correct": sum(r["status"] == "correct" for r in rows),
                "incorrect": sum(r["status"] == "incorrect" for r in rows),
                "status": "incorrect" if any(r["issues"] for r in rows) else "correct",
            }
        )
    return inspected
