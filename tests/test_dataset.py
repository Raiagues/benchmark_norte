from benchmark.evaluate import evidence_valid
from benchmark.schemas import edge_key


def test_dataset_integrity_and_coverage(ds):
    gt = ds["ground_truth"]
    assert len(gt["requirements"]) == 5
    assert 8 <= len(gt["change_scenarios"]) <= 12
    ids = {n["id"] for n in gt["entities"]["nodes"]}
    assert len(ids) == len(gt["entities"]["nodes"])
    assert len({edge_key(e) for e in gt["relationships"]}) == len(gt["relationships"])
    for edge in gt["relationships"]:
        assert edge["source"] in ids and edge["target"] in ids
        assert evidence_valid(edge["source_evidence"], ds["documents"])
    for fact in gt["entities"]["parameters"]:
        assert evidence_valid(fact["source_evidence"], ds["documents"])
    reqs = {r["id"] for r in gt["requirements"]}
    for s in gt["change_scenarios"]:
        a, u = set(s["affected_requirements"]), set(s["unaffected_requirements"])
        assert not a & u and a | u == reqs
        assert set(s["critical_requirements"]) <= a
        assert s["difficulty"] in ("L1_DIRECT", "L2_ONE_HOP")
        assert all(
            edge_key(e) in {edge_key(g) for g in gt["relationships"]}
            for e in s["affected_relationships"]
        )
    assert (
        len([s for s in gt["change_scenarios"] if not s["affected_requirements"]]) == 2
    )
    assert len([s for s in gt["change_scenarios"] if s["split"] == "transfer"]) == 2


def test_original_source_facts_are_not_project_requirements(ds):
    sources = {s["document_id"]: s for s in ds["sources"]}
    assert sources["FAN"]["parameters"]["rated_current_A"] == 0.05
    assert sources["FAN"]["parameters"]["current_tolerance_percent"] == 10
    assert sources["SENSOR"]["parameters"]["full_temperature_supply_V"] == [1.8, 5.5]
    assert sources["DRIVER"]["parameters"]["continuous_current_rating_A"] == 1.5
    assert all(
        r["manufacturer_specification"] is False
        for r in ds["ground_truth"]["requirements"]
    )
