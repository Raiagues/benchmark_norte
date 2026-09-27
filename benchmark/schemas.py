"""One semantic response contract, shared by all providers."""

import json
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def normalize_id(value):
    value = re.sub(r"[\s_]+", "-", value.strip().upper())
    value = re.sub(r"-+", "-", value)
    match = re.fullmatch(r"(REQ|CHG)-?(\d+)", value)
    return f"{match[1]}-{int(match[2]):03}" if match else value


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class Evidence(Strict):
    document_id: str
    location: str
    excerpt: str


class Node(Strict):
    id: str
    type: Literal[
        "Requirement",
        "Component",
        "Parameter",
        "Document",
        "Configuration",
        "Verification",
    ]
    name: str
    source: str
    source_reference: str


class Parameter(Strict):
    id: str
    values: list[float]
    unit: str
    qualifier: Literal[
        "rated", "range", "maximum", "minimum", "configured", "threshold"
    ]
    source_evidence: list[Evidence]


class Dependency(Strict):
    source: str
    target: str
    relationship: Literal["has_parameter", "constrains", "depends_on", "verified_by"]


class Edge(Dependency):
    reason: str
    source_evidence: list[Evidence]
    confidence: float = Field(ge=0, le=1)
    inferred_or_explicit: Literal["inferred", "explicit"]


class Extraction(Strict):
    nodes: list[Node]
    parameters: list[Parameter]


class Graph(Strict):
    nodes: list[Node]
    edges: list[Edge]


class Impact(Strict):
    requirement_id: str
    changed_entity: str
    dependency: Dependency
    explanation: str
    source_evidence: list[Evidence]
    technical_claims: list[Parameter]


class ScenarioAnswer(Strict):
    scenario_id: str
    impacts: list[Impact]


class ImpactResponse(Strict):
    scenarios: list[ScenarioAnswer]


RESPONSES = {
    "entity_extraction": Extraction,
    "relationship_extraction": Graph,
    "change_impact": ImpactResponse,
    "impact_explanation": ImpactResponse,
    "one_hop": ImpactResponse,
}


def edge_key(edge):
    return (
        normalize_id(edge["source"]),
        edge["relationship"].strip().lower(),
        normalize_id(edge["target"]),
    )


def load_strict_json(text):
    def pairs(items):
        obj = {}
        for k, v in items:
            if k in obj:
                raise ValueError("duplicate_json_key")
            obj[k] = v
        return obj

    def invalid_constant(_):
        raise ValueError("nonfinite_number")

    return json.loads(text, object_pairs_hook=pairs, parse_constant=invalid_constant)


def parse_output(task, text):
    """Never repair JSON or discard prose/fences silently."""
    data = load_strict_json(text)
    parsed = RESPONSES[task].model_validate(data).model_dump()
    for collection, key in [
        ("nodes", "id"),
        ("parameters", "id"),
        ("scenarios", "scenario_id"),
    ]:
        ids = [normalize_id(x[key]) for x in parsed.get(collection, [])]
        if len(set(ids)) != len(ids):
            raise ValueError("duplicate_canonical_id")
    if "edges" in parsed:
        keys = [edge_key(e) for e in parsed["edges"]]
        if len(set(keys)) != len(keys):
            raise ValueError("duplicate_edge")
        ids = {normalize_id(n["id"]) for n in parsed["nodes"]}
        if any(e[0] not in ids or e[2] not in ids for e in keys):
            raise ValueError("dangling_edge")
    for answer in parsed.get("scenarios", []):
        ids = [normalize_id(i["requirement_id"]) for i in answer["impacts"]]
        if len(set(ids)) != len(ids):
            raise ValueError("duplicate_impact")
    return parsed


def response_schema(task):
    # Inline references; use the same portable schema for every provider.
    schema = RESPONSES[task].model_json_schema()
    defs = schema.pop("$defs", {})

    def inline(value):
        if isinstance(value, list):
            return [inline(x) for x in value]
        if not isinstance(value, dict):
            return value
        if "$ref" in value:
            return inline(defs[value["$ref"].split("/")[-1]])
        # Bounds are enforced locally; some providers do not support them.
        return {
            k: inline(v)
            for k, v in value.items()
            if k not in ("title", "minimum", "maximum")
        }

    return inline(schema)
