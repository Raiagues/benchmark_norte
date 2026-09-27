import copy
import json

import pytest
from pydantic import ValidationError

from benchmark.schemas import parse_output, response_schema


def test_json_round_trip(ds):
    expected = ds["ground_truth"]["entities"]
    assert parse_output("entity_extraction", json.dumps(expected)) == expected


@pytest.mark.parametrize(
    "text",
    ["```json\n{}\n```", '{"nodes":', "{} trailing", '{"a":1,"a":2}', '{"a":NaN}'],
)
def test_reject_bad_json(text):
    with pytest.raises((ValueError, ValidationError)):
        parse_output("entity_extraction", text)


def test_reject_extra_keys_duplicate_ids_and_invalid_confidence(ds):
    graph = {
        "nodes": ds["ground_truth"]["entities"]["nodes"],
        "edges": copy.deepcopy(ds["ground_truth"]["relationships"]),
    }
    graph["edges"][0]["confidence"] = 1.1
    with pytest.raises(ValidationError):
        parse_output("relationship_extraction", json.dumps(graph))
    extraction = copy.deepcopy(ds["ground_truth"]["entities"])
    extraction["nodes"].append({**extraction["nodes"][0], "id": " fan "})
    with pytest.raises(ValueError, match="duplicate_canonical_id"):
        parse_output("entity_extraction", json.dumps(extraction))
    with pytest.raises(ValidationError):
        parse_output("entity_extraction", '{"nodes":[],"parameters":[],"extra":true}')


def test_edge_endpoint_contract(ds):
    with pytest.raises(ValueError, match="dangling_edge"):
        parse_output(
            "relationship_extraction",
            json.dumps({"nodes": [], "edges": ds["ground_truth"]["relationships"]}),
        )


def test_portable_schema_is_closed_and_inlined():
    schema = response_schema("change_impact")
    assert schema["additionalProperties"] is False
    assert "$ref" not in json.dumps(schema)
    assert (
        "minimum"
        not in json.dumps(response_schema("relationship_extraction")).split(
            '"confidence"'
        )[-1]
    )
