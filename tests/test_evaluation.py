import copy

import pytest

from benchmark.evaluate import (
    compare_sets,
    compare_graph,
    consistency,
    evaluate_extraction,
    evaluate_impacts,
    feedback_metrics,
    statistics,
)
from response_fixtures import fixture_output
from benchmark.schemas import normalize_id


def test_precision_recall_f1_and_direction():
    score = compare_sets({"a", "b", "wrong"}, {"a", "b", "c", "d"})
    assert (score["tp"], score["fp"], score["fn"]) == (2, 1, 2)
    assert score["precision"] == pytest.approx(2 / 3)
    assert score["recall"] == 0.5
    assert score["f1"] == pytest.approx(4 / 7)
    assert (
        compare_sets([("A", "depends_on", "B")], [("B", "depends_on", "A")])["tp"] == 0
    )


@pytest.mark.parametrize(
    "pred,expected,p,r,f",
    [([], [], 1, 1, 1), (["x"], [], 0, 1, 0), ([], ["x"], 0, 0, 0)],
)
def test_empty_set_policy(pred, expected, p, r, f):
    score = compare_sets(pred, expected)
    assert (score["precision"], score["recall"], score["f1"]) == (p, r, f)


def test_id_normalization():
    assert normalize_id(" req_2 ") == "REQ-002"
    assert normalize_id("p_fan_speed") == "P-FAN-SPEED"


def test_perfect_extraction_and_wrong_value(ds):
    output = copy.deepcopy(ds["ground_truth"]["entities"])
    score = evaluate_extraction(output, ds)
    assert score["entity_f1"] == score["parameter_f1"] == score["value_accuracy"] == 1
    assert score["unsupported_fact_rate"] == 0
    output["parameters"][0]["values"] = [500]
    output["parameters"][1]["unit"] = "A"
    output["parameters"][2]["source_evidence"][0]["excerpt"] = (
        "The source never said this."
    )
    score = evaluate_extraction(output, ds)
    assert score["unsupported_fact_rate"] == pytest.approx(3 / 13)
    assert score["parameter_f1"] == 1  # ID match is separate from factual accuracy.
    assert score["supported_fact_recall"] == pytest.approx(10 / 13)


def test_unknown_fact_is_unsupported(ds):
    output = copy.deepcopy(ds["ground_truth"]["entities"])
    fake = copy.deepcopy(output["parameters"][0])
    fake["id"] = "P-INVENTED"
    output["parameters"].append(fake)
    score = evaluate_extraction(output, ds)
    assert score["parameter"]["fp"] == 1
    assert score["unsupported_fact_rate"] == pytest.approx(1 / 14)


def test_graph_comparison_all_statuses(ds):
    edges = copy.deepcopy(ds["ground_truth"]["relationships"])
    edges.pop()
    edges[0]["source_evidence"][0]["excerpt"] = "Invented source excerpt"
    fake = copy.deepcopy(edges[1])
    fake["source"] = "REQ-003"
    edges.append(fake)
    score = compare_graph({"edges": edges}, ds)
    assert score["relationship"]["tp"] == 10
    assert score["relationship"]["fp"] == score["relationship"]["fn"] == 1
    assert {e["status"] for e in score["edges"]} == {
        "correct",
        "correct_bad_evidence",
        "missing",
        "false_positive",
    }
    assert score["supported_relationship_f1"] < score["relationship_f1"]


def test_real_but_irrelevant_quote_is_not_rewarded(ds):
    edges = copy.deepcopy(ds["ground_truth"]["relationships"])
    edges[0]["source_evidence"] = edges[-1]["source_evidence"]
    score = compare_graph({"edges": edges}, ds)
    assert score["relationship_f1"] == 1
    assert score["correct_with_bad_evidence"] == 1


def test_impact_critical_miss_and_no_impact_false_alarm(ds):
    cases = [
        s
        for s in ds["ground_truth"]["change_scenarios"]
        if s["id"] in ("CHG-006", "CHG-008")
    ]
    answer = fixture_output("change_impact", ds, cases, 1, [])
    impact = answer["scenarios"][0]["impacts"].pop()
    answer["scenarios"][1]["impacts"].append(impact)
    score = evaluate_impacts(answer, ds, cases)
    assert score["critical_impact_miss_rate"] == 1
    assert score["false_negative_impact_rate"] == 1
    assert score["false_positive_impact_rate"] == pytest.approx(1 / 9)
    assert score["impact"]["fp"] == score["impact"]["fn"] == 1


def test_explanation_requires_change_and_dependency_evidence(ds):
    cases = ds["ground_truth"]["change_scenarios"][:1]
    answer = fixture_output("impact_explanation", ds, cases, 1, [])
    assert evaluate_impacts(answer, ds, cases)["explanation_rule_pass_rate"] == 1
    answer["scenarios"][0]["impacts"][0]["source_evidence"].pop()
    score = evaluate_impacts(answer, ds, cases)
    assert score["impact_f1"] == 1
    assert score["explanation_rule_pass_rate"] == 0.5
    assert score["supported_impact_recall"] == 0.5


def test_unknown_and_omitted_scenarios_are_flagged(ds):
    cases = ds["ground_truth"]["change_scenarios"][:1]
    score = evaluate_impacts(
        {"scenarios": [{"scenario_id": "CHG-999", "impacts": []}]}, ds, cases
    )
    assert score["impact"]["fp"] == 1
    assert score["scenario_coverage"] == 0
    assert score["unknown_scenarios"] == ["CHG-999"]


def test_consistency_and_population_stddev():
    assert consistency([["a"], ["a"], ["b"]]) == pytest.approx(1 / 3)
    assert consistency([None, None]) == 0
    assert consistency([["a"]]) is None
    assert statistics([0, 1, None])["stddev"] == 0.5


def test_feedback_metrics_and_generalization(ds):
    before = fixture_output("relationship_extraction", ds, [], 1, [])
    after = {
        "nodes": ds["ground_truth"]["entities"]["nodes"],
        "edges": ds["ground_truth"]["relationships"],
    }
    edge = next(
        e
        for e in after["edges"]
        if e["source"] == "REQ-002" and e["relationship"] == "constrains"
    )
    feedback = [{"edge": edge, "verdict": "Missing relationship"}]
    score = feedback_metrics("relationship_extraction", after, before, feedback, ds, [])
    assert score["correction_retention_rate"] == 1
    assert score["repeated_error_rate"] == 0
    assert score["new_error_count"] == 0
    assert score["performance_improvement"] > 0
    transfer = [
        s for s in ds["ground_truth"]["change_scenarios"] if s["split"] == "transfer"
    ]
    answers = fixture_output("one_hop", ds, transfer, 1, [])
    score = feedback_metrics("one_hop", answers, answers, feedback, ds, transfer)
    assert score["correction_opportunities"] == 1
    assert score["correction_retention_rate"] == 1
