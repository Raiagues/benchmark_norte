"""Deterministic comparisons. Prose quality remains a human-review question."""

import math
import re
from itertools import combinations
from statistics import mean, pstdev

from .schemas import edge_key, normalize_id


def ratio(n, d):
    return n / d if d else None


def compare_sets(predicted, expected):
    p, g = set(predicted), set(expected)
    tp, fp, fn = len(p & g), len(p - g), len(g - p)
    precision = tp / len(p) if p else (1.0 if not g else 0.0)
    recall = tp / len(g) if g else 1.0
    return {
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": 2 * precision * recall / (precision + recall)
        if precision + recall
        else 0.0,
        "correct": sorted(p & g),
        "false_positives": sorted(p - g),
        "missing": sorted(g - p),
    }


def clean_text(s):
    return re.sub(r"\s+", " ", s).strip().casefold()


def evidence_valid(evidence, documents):
    if not evidence:
        return False
    for e in evidence:
        text = documents.get(normalize_id(e["document_id"]), {}).get(e["location"], "")
        excerpt = clean_text(e["excerpt"])
        if len(excerpt) < 6 or excerpt not in clean_text(text):
            return False
    return True


PDF_PAGES = {
    ("FAN", "FAN-01"): ["page-1", "page-2"],
    ("FAN", "FAN-02"): ["page-4"],
    ("FAN", "FAN-03"): ["page-6"],
    ("FAN", "FAN-04"): ["page-4"],
    ("SENSOR", "SENSOR-01"): ["page-1"],
    ("SENSOR", "SENSOR-02"): ["page-5"],
    ("DRIVER", "DRIVER-01"): ["page-1"],
    ("DRIVER", "DRIVER-02"): ["page-1", "page-4"],
    ("DRIVER", "DRIVER-03"): ["page-4"],
}


def attributed(evidence, expected, documents, mode):
    """Require real excerpts AND a relevant location, not just any real quotation."""
    if not evidence_valid(evidence, documents):
        return False
    allowed = set()
    for e in expected:
        doc, loc = e["document_id"], e["location"]
        locs = PDF_PAGES.get((doc, loc), [loc]) if mode == "pdf_text" else [loc]
        allowed.update((doc, location) for location in locs)
    return any(
        (normalize_id(e["document_id"]), e["location"]) in allowed for e in evidence
    )


UNIT_ALIASES = {
    "amp": "A",
    "amps": "A",
    "ampere": "A",
    "a": "A",
    "v": "V",
    "volt": "V",
    "volts": "V",
    "rpm": "rpm",
    "rev/min": "rpm",
    "°c": "degC",
    "degc": "degC",
    "celsius": "degC",
}


def same_values(a, b):
    return len(a) == len(b) and all(
        math.isclose(x, y, rel_tol=1e-6, abs_tol=1e-9) for x, y in zip(a, b)
    )


def same_unit(a, b):
    return UNIT_ALIASES.get(a.strip().lower(), a.strip()) == UNIT_ALIASES.get(
        b.strip().lower(), b.strip()
    )


def fact_checks(predicted, gold, docs, mode):
    lookup = {normalize_id(f["id"]): f for f in gold}
    rows = []
    for fact in predicted:
        expected = lookup.get(normalize_id(fact["id"]))
        values = bool(expected and same_values(fact["values"], expected["values"]))
        unit = bool(expected and same_unit(fact["unit"], expected["unit"]))
        qualifier = bool(expected and fact["qualifier"] == expected["qualifier"])
        evidence = bool(
            expected
            and attributed(
                fact["source_evidence"], expected["source_evidence"], docs, mode
            )
        )
        rows.append(
            {
                "id": fact["id"],
                "matched": bool(expected),
                "value_correct": values,
                "unit_correct": unit,
                "qualifier_correct": qualifier,
                "evidence_correct": evidence,
                "supported": values and unit and qualifier and evidence,
            }
        )
    return rows


def evaluate_extraction(output, ds):
    gt = ds["ground_truth"]["entities"]
    nodes = output.get("nodes", [])
    facts = output.get("parameters", [])
    entity = compare_sets(
        [(normalize_id(n["id"]), n["type"]) for n in nodes],
        [(normalize_id(n["id"]), n["type"]) for n in gt["nodes"]],
    )
    parameters = compare_sets(
        [normalize_id(f["id"]) for f in facts], [f["id"] for f in gt["parameters"]]
    )
    rows = fact_checks(facts, gt["parameters"], ds["documents"], ds["input_mode"])
    matched = [r for r in rows if r["matched"]]
    source_correct = 0
    for n in nodes:
        g = next(
            (
                x
                for x in gt["nodes"]
                if x["id"] == normalize_id(n["id"]) and x["type"] == n["type"]
            ),
            None,
        )
        if not g:
            continue
        allowed = (
            PDF_PAGES.get((g["source"], g["source_reference"]), [g["source_reference"]])
            if ds["input_mode"] == "pdf_text"
            else [g["source_reference"]]
        )
        source_correct += (
            normalize_id(n["source"]) == g["source"]
            and n["source_reference"] in allowed
        )
    return {
        "entity": entity,
        "parameter": parameters,
        "fact_details": rows,
        "entity_f1": entity["f1"],
        "parameter_f1": parameters["f1"],
        "value_accuracy": ratio(sum(r["value_correct"] for r in matched), len(matched)),
        "unit_accuracy": ratio(sum(r["unit_correct"] for r in matched), len(matched)),
        "source_attribution_accuracy": ratio(
            sum(r["evidence_correct"] for r in rows) + source_correct,
            len(rows) + len(nodes),
        ),
        "unsupported_fact_rate": ratio(
            sum(not r["supported"] for r in rows), len(rows)
        ),
        "supported_fact_recall": sum(r["supported"] for r in rows)
        / len(gt["parameters"]),
    }


def compare_graph(output, ds):
    expected = {edge_key(e): e for e in ds["ground_truth"]["relationships"]}
    predicted = {edge_key(e): e for e in output.get("edges", [])}
    metrics = compare_sets(predicted, expected)
    details = []
    for key in sorted(predicted.keys() | expected.keys()):
        p, g = predicted.get(key), expected.get(key)
        correct_evidence = bool(
            p
            and g
            and attributed(
                p["source_evidence"],
                g["source_evidence"],
                ds["documents"],
                ds["input_mode"],
            )
        )
        status = (
            "missing"
            if not p
            else "false_positive"
            if not g
            else "correct"
            if correct_evidence
            else "correct_bad_evidence"
        )
        details.append(
            {
                "key": key,
                "status": status,
                "model_edge": p,
                "ground_truth_edge": g,
                "exists_in_ground_truth": bool(g),
                "evidence_correct": correct_evidence,
            }
        )
    supported = sum(d["status"] == "correct" for d in details)
    supported_score = compare_sets(
        [tuple(d["key"]) for d in details if d["status"] == "correct"], expected
    )
    # Bad-evidence conclusions also count as unsupported predictions, not merely omissions.
    supported_precision = (
        supported / len(predicted) if predicted else metrics["precision"]
    )
    supported_recall = supported / len(expected) if expected else 1.0
    supported_score["precision"] = supported_precision
    supported_score["f1"] = (
        2
        * supported_precision
        * supported_recall
        / (supported_precision + supported_recall)
        if supported_precision + supported_recall
        else 0
    )
    return {
        "relationship": metrics,
        "relationship_f1": metrics["f1"],
        "supported_relationship_f1": supported_score["f1"],
        "unsupported_relationship_rate": ratio(
            len(predicted) - supported, len(predicted)
        ),
        "correct_with_evidence": supported,
        "correct_with_bad_evidence": sum(
            d["status"] == "correct_bad_evidence" for d in details
        ),
        "edges": details,
    }


def evaluate_impacts(output, ds, cases):
    answers = {normalize_id(s["scenario_id"]): s for s in output.get("scenarios", [])}
    docs = dict(ds["documents"])
    docs.update({s["id"]: {"change": s["description"]} for s in cases})
    rows, p_pairs, g_pairs = [], set(), set()
    critical_missed = critical_total = negatives = 0
    explanation_rows = []
    for case in cases:
        answer = answers.get(case["id"], {"impacts": []})
        predicted = {normalize_id(i["requirement_id"]) for i in answer["impacts"]}
        expected = set(case["affected_requirements"])
        result = compare_sets(predicted, expected)
        p_pairs.update((case["id"], i) for i in predicted)
        g_pairs.update((case["id"], i) for i in expected)
        critical_total += len(case["critical_requirements"])
        critical_missed += len(set(case["critical_requirements"]) - predicted)
        negatives += len(case["unaffected_requirements"])
        checks = []
        for impact in answer["impacts"]:
            req = normalize_id(impact["requirement_id"])
            key = edge_key(impact["dependency"])
            dep = next(
                (e for e in ds["ground_truth"]["relationships"] if edge_key(e) == key),
                None,
            )
            dependency_ok = (
                key in {edge_key(e) for e in case["affected_relationships"]}
                and key[0] == req
            )
            baseline_evidence = [
                e
                for e in impact["source_evidence"]
                if normalize_id(e["document_id"]) != case["id"]
            ]
            change_evidence = [
                e
                for e in impact["source_evidence"]
                if normalize_id(e["document_id"]) == case["id"]
            ]
            evidence_ok = bool(
                dep
                and attributed(
                    baseline_evidence, dep["source_evidence"], docs, ds["input_mode"]
                )
                and evidence_valid(change_evidence, docs)
            )
            facts = fact_checks(
                impact["technical_claims"],
                ds["ground_truth"]["entities"]["parameters"],
                docs,
                ds["input_mode"],
            )
            check = {
                "requirement_id": req,
                "correct_requirement": req in expected,
                "correct_changed_element": normalize_id(impact["changed_entity"])
                == normalize_id(case["changed_entity"]),
                "correct_dependency": dependency_ok,
                "valid_evidence": evidence_ok,
                "unsupported_structured_claims": sum(not f["supported"] for f in facts),
                "structured_claim_count": len(facts),
                "prose_human_review_required": True,
            }
            check["passes_rules"] = (
                all(
                    check[k]
                    for k in (
                        "correct_requirement",
                        "correct_changed_element",
                        "correct_dependency",
                        "valid_evidence",
                    )
                )
                and check["unsupported_structured_claims"] == 0
                and bool(impact["explanation"].strip())
            )
            checks.append(check)
            explanation_rows.append(check)
        rows.append(
            {
                "scenario_id": case["id"],
                "difficulty": case["difficulty"],
                "split": case["split"],
                "change_type": case["change_type"],
                "comparison": result,
                "explanation_checks": checks,
                "missing_scenario": case["id"] not in answers,
            }
        )
    # Fabricated scenario IDs cannot disappear from the denominator.
    unknown = set(answers) - {s["id"] for s in cases}
    for sid in unknown:
        p_pairs.add((sid, "UNKNOWN-SCENARIO"))
        p_pairs.update(
            (sid, normalize_id(i["requirement_id"])) for i in answers[sid]["impacts"]
        )
    metrics = compare_sets(p_pairs, g_pairs)
    negatives_fp = sum(
        len(
            set(r["comparison"]["false_positives"])
            & set(
                next(s for s in cases if s["id"] == r["scenario_id"])[
                    "unaffected_requirements"
                ]
            )
        )
        for r in rows
    )
    return {
        "impact": metrics,
        "impact_precision": metrics["precision"],
        "impact_recall": metrics["recall"],
        "impact_f1": metrics["f1"],
        "false_positive_impact_rate": ratio(negatives_fp, negatives),
        "false_negative_impact_rate": ratio(metrics["fn"], len(g_pairs)),
        "critical_impact_miss_rate": ratio(critical_missed, critical_total),
        "critical_missed": critical_missed,
        "critical_total": critical_total,
        "scenario_coverage": (len(cases) - sum(r["missing_scenario"] for r in rows))
        / len(cases)
        if cases
        else None,
        "unknown_scenarios": sorted(unknown),
        "scenarios": rows,
        "explanation_rule_pass_rate": ratio(
            sum(r["passes_rules"] for r in explanation_rows), len(explanation_rows)
        ),
        "supported_impact_recall": ratio(
            sum(r["passes_rules"] for r in explanation_rows), len(g_pairs)
        ),
        "unsupported_explanation_claim_rate": ratio(
            sum(r["unsupported_structured_claims"] for r in explanation_rows),
            sum(r["structured_claim_count"] for r in explanation_rows),
        ),
    }


def evaluate(task, output, ds, cases):
    if task == "entity_extraction":
        return evaluate_extraction(output, ds)
    if task == "relationship_extraction":
        return compare_graph(output, ds)
    return evaluate_impacts(output, ds, cases)


def answer_signature(task, output):
    """Consistency ignores prose/order; extraction includes values, units and provenance."""
    if not output:
        return None
    if task == "relationship_extraction":
        return sorted(edge_key(e) for e in output["edges"])
    if task == "entity_extraction":
        return {
            "nodes": sorted(
                (normalize_id(n["id"]), n["type"]) for n in output["nodes"]
            ),
            "facts": sorted(
                (
                    normalize_id(f["id"]),
                    f["values"],
                    UNIT_ALIASES.get(f["unit"].lower(), f["unit"]),
                    f["qualifier"],
                )
                for f in output["parameters"]
            ),
        }
    return sorted(
        (
            normalize_id(s["scenario_id"]),
            sorted(normalize_id(i["requirement_id"]) for i in s["impacts"]),
        )
        for s in output["scenarios"]
    )


def statistics(values):
    values = [
        x for x in values if isinstance(x, (int, float)) and not isinstance(x, bool)
    ]
    return (
        {
            "mean": mean(values),
            "min": min(values),
            "max": max(values),
            "stddev": pstdev(values),
            "n": len(values),
        }
        if values
        else {"mean": None, "min": None, "max": None, "stddev": None, "n": 0}
    )


def consistency(signatures):
    pairs = list(combinations(signatures, 2))
    return ratio(
        sum(a is not None and b is not None and a == b for a, b in pairs), len(pairs)
    )


def feedback_metrics(task, assisted, baseline, feedback, ds, cases):
    """Retention uses scoped structured decisions; transfer reported separately."""
    checks = []
    if task == "relationship_extraction":
        predicted = {edge_key(e) for e in assisted.get("edges", [])}
        for f in feedback:
            present = edge_key(f["edge"]) in predicted
            checks.append(
                present
                if f["verdict"] in ("Correct", "Missing relationship")
                else not present
            )
    elif task in ("change_impact", "impact_explanation", "one_hop"):
        answers = {
            normalize_id(s["scenario_id"]): {
                normalize_id(i["requirement_id"]) for i in s["impacts"]
            }
            for s in assisted.get("scenarios", [])
        }
        for f in feedback:
            key = edge_key(f["edge"])
            if f["verdict"] not in ("Correct", "Missing relationship"):
                continue  # A rejected edge does not imply that all its requirements are unaffected.
            for s in cases:
                if key in {edge_key(e) for e in s["affected_relationships"]}:
                    checks.append(key[0] in answers.get(s["id"], set()))
    before, after = (
        evaluate(task, baseline, ds, cases),
        evaluate(task, assisted, ds, cases),
    )
    metric = (
        "relationship_f1"
        if task == "relationship_extraction"
        else "entity_f1"
        if task == "entity_extraction"
        else "impact_f1"
    )
    section = (
        "relationship"
        if task == "relationship_extraction"
        else "entity"
        if task == "entity_extraction"
        else "impact"
    )

    def errors(result):
        return {("FP", str(x)) for x in result[section]["false_positives"]} | {
            ("FN", str(x)) for x in result[section]["missing"]
        }

    b, a = errors(before), errors(after)
    return {
        "first_pass_score": before[metric],
        "feedback_assisted_score": after[metric],
        "performance_improvement": after[metric] - before[metric],
        "correction_retention_rate": ratio(sum(checks), len(checks)),
        "correction_opportunities": len(checks),
        "repeated_error_rate": ratio(len(b & a), len(b)),
        "new_error_count": len(a - b),
        "new_error_rate": ratio(len(a - b), len(a)),
        "note": "Retention is structured decision compliance. Prose quality needs human review; repeated errors are baseline FP/FN retained, new-error rate is the fraction of assisted errors absent in the baseline.",
    }
