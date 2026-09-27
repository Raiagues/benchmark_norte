from copy import deepcopy

from benchmark.dataset import cases_for_task
from benchmark.evaluate import evaluate_impacts
from benchmark.inspection import failure_counts, inspect_impacts
from response_fixtures import fixture_output


def test_full_impact_recall_does_not_hide_failed_dependency_or_claim(ds):
    cases = cases_for_task(ds, "change_impact", "L1_DIRECT")
    answer = fixture_output("change_impact", ds, cases, 1, [])
    impact = answer["scenarios"][0]["impacts"][0]
    impact["dependency"]["target"] = "FAN"
    fact = deepcopy(ds["ground_truth"]["entities"]["parameters"][0])
    fact["id"] = "OUTSIDE-REFERENCE"
    impact["technical_claims"] = [fact]
    result = {"parsed_output": answer, "metrics": evaluate_impacts(answer, ds, cases)}
    original = deepcopy(result)
    assert result["metrics"]["impact"]["recall"] == 1
    failures = failure_counts(result["metrics"])
    assert failures["correct_dependency"] == 1
    assert failures["unsupported_structured_claims"] == 1
    table = inspect_impacts(result, ds)
    assert table[0]["incorrect"] == 1
    assert len(table[0]["rows"]) == 5
    row = next(
        r for r in table[0]["rows"] if r["requirement_id"] == impact["requirement_id"]
    )
    assert row["decision_correct"] and row["status"] == "incorrect"
    assert row["claims"][0]["expected"] is None
    assert row["expected_dependencies"]
    assert result == original  # inspection never rewrites a historical score


def test_requirement_table_handles_missed_false_positive_and_no_impact(ds):
    cases = cases_for_task(ds, "change_impact", "L1_DIRECT")
    answer = fixture_output("change_impact", ds, cases, 1, [])
    first = answer["scenarios"][0]
    first["impacts"].pop()
    first["impacts"].append(
        dict(deepcopy(first["impacts"][0]), requirement_id="REQ-999")
    )
    result = {"parsed_output": answer, "metrics": evaluate_impacts(answer, ds, cases)}
    rows = inspect_impacts(result, ds)
    assert any("missing" in r["issues"] for r in rows[0]["rows"])
    assert any("extra" in r["issues"] for r in rows[0]["rows"])
    control = next(r for r in rows if r["id"] == "CHG-008")
    assert control["incorrect"] == 0 and control["correct"] == 5
    assert all(not r["predicted_affected"] for r in control["rows"])
    assert failure_counts({}) == {}
