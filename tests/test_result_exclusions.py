"""User exclusions affect read projections, never stored responses or scores."""

import json

from benchmark import live, result_validity, runner, storage, studies
from test_resume import interrupted_batch, table_rows


def test_exclusion_preserves_history_and_other_models_protocols(
    db, ds, monkeypatch, tmp_path
):
    bid, original, _ = interrupted_batch(ds, db, monkeypatch, finish_first=True)
    other_bid, other, _ = interrupted_batch(ds, db, monkeypatch, finish_first=True)
    first = storage.get_run(original[0], db)
    before_summary = runner.aggregate(db, by_study=True)
    with storage.connect(db) as con:
        tables = [
            r[0]
            for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")
        ]
        before = {t: table_rows(con, t) for t in tables}
    path = tmp_path / "exclusions.json"
    path.write_text(
        json.dumps([{"run_ids": [original[0]], "reason": "Isolated user exclusion"}])
    )
    monkeypatch.setattr(result_validity, "POLICY_PATH", path)

    summary = runner.aggregate(db, by_study=True)
    assert summary == [r for r in before_summary if r["study_id"] == other_bid]
    assert sum(r["n"] for r in runner.aggregate(db)) == 1
    runs = {r["id"]: r for r in storage.list_runs(db)}
    assert not runs[original[0]]["comparison_eligible"]
    assert runs[other[0]]["comparison_eligible"]
    assert storage.get_run(original[0], db) == first
    for snapshot in (live.snapshot(bid, db), studies.snapshot(bid, db)):
        assert snapshot["models"][0]["quality"] == []
        assert snapshot["operations"]["evaluated"] == 1  # Original execution fact.
        assert snapshot["operations"]["excluded_from_comparison"] == 1
        call = next(c for c in snapshot["calls"] if c["has_result"])
        detail = live.call_detail(call["id"], db)
        assert detail["comparison_eligible"] is False
        assert detail["result"] == first["results"][0]
    with storage.connect(db) as con:
        assert {t: table_rows(con, t) for t in tables} == before


def test_production_policy_targets_only_three_specific_astra_repetitions():
    rules = result_validity.exclusions()
    assert len(rules) == 3
    assert all(
        r["model"] == "gpt-6-astra" and r["comparison_hash"].startswith("d4408d")
        for r in rules.values()
    )
    assert result_validity.annotation("unrelated-execution")["comparison_eligible"]
