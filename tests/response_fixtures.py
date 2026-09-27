import copy
from benchmark.schemas import edge_key


def fixture_output(task, ds, cases, repetition, feedback):
    """Test-only responses. Never imported by the application or written to its database."""
    gt = ds["ground_truth"]
    if task == "entity_extraction":
        return copy.deepcopy(gt["entities"])
    if task == "relationship_extraction":
        edges = copy.deepcopy(gt["relationships"])
        missing = next(
            e
            for e in edges
            if e["source"] == "REQ-002" and e["relationship"] == "constrains"
        )
        edges.remove(missing)
        extra = copy.deepcopy(next(e for e in edges if e["source"] == "REQ-001"))
        extra["source"], extra["reason"] = (
            "REQ-003",
            "Unsupported test association.",
        )
        edges.append(extra)
        for f in feedback:
            key = edge_key(f["edge"])
            edges = [e for e in edges if edge_key(e) != key]
            if f["verdict"] != "Incorrect":
                g = next((e for e in gt["relationships"] if edge_key(e) == key), None)
                if g:
                    edges.append(copy.deepcopy(g))
        return {"nodes": copy.deepcopy(gt["entities"]["nodes"]), "edges": edges}
    answers = []
    for s in cases:
        impacts = []
        for req in s["affected_requirements"]:
            if repetition == 2 and s["id"] == "CHG-010":
                continue
            edge = next(
                e
                for e in gt["relationships"]
                if e["source"] == req
                and edge_key(e) in {edge_key(d) for d in s["affected_relationships"]}
            )
            impacts.append(
                {
                    "requirement_id": req,
                    "changed_entity": s["changed_entity"],
                    "dependency": {
                        k: edge[k] for k in ("source", "relationship", "target")
                    },
                    "explanation": s["expected_reason"],
                    "source_evidence": copy.deepcopy(
                        edge["source_evidence"] + s["source_evidence"]
                    ),
                    "technical_claims": [],
                }
            )
        answers.append({"scenario_id": s["id"], "impacts": impacts})
    return {"scenarios": answers}


def install_mock_api(monkeypatch, ds, replies=None, db=None, on_request=None):
    """HTTP responses for isolated tests only; the normal provider adapter still runs."""
    import json
    import httpx
    from benchmark import runner
    from benchmark.providers import call_provider

    sent = []

    def respond(request):
        body = json.loads(request.content)
        prompt = body["input"][0]["content"]
        sent.append(prompt)
        if on_request:
            on_request(request)
        if replies is not None:
            status, text = replies.pop(0)
        else:
            payload = json.loads(prompt.split("\nINPUT\n", 1)[1])
            props = body["text"]["format"]["schema"]["properties"]
            task = (
                "entity_extraction"
                if "parameters" in props
                else "relationship_extraction"
                if "edges" in props
                else "change_impact"
            )
            ids = {s["id"] for s in payload["scenarios"]}
            cases = [
                s for s in ds["ground_truth"]["change_scenarios"] if s["id"] in ids
            ]
            output = fixture_output(task, ds, cases, 1, payload["confirmed_feedback"])
            status, text = 200, json.dumps(output)
        raw = {
            "id": "test-response",
            "model": body["model"],
            "status": "completed",
            "output": [{"content": [{"type": "output_text", "text": text}]}],
            "usage": {"input_tokens": 100, "output_tokens": 50},
        }
        return httpx.Response(
            status, json=raw if status == 200 else {"error": "Test-only failure"}
        )

    def mocked_call(config, prompt, schema, settings, pricing, api_key=None, **options):
        with httpx.Client(transport=httpx.MockTransport(respond)) as client:
            return call_provider(
                config,
                prompt,
                schema,
                {**settings, "retries": 0},
                pricing,
                client=client,
                api_key=api_key,
                **options,
            )

    monkeypatch.setenv("OPENAI_API_KEY", "unit-test-only")
    from benchmark import storage
    from benchmark.connections import save_check

    storage.init_db(db)
    save_check(
        runner.configuration()["models"][0],
        "unit-test-only",
        {
            "status": "ready",
            "ready": True,
            "api_responded": True,
            "generation_confirmed": True,
            "diagnostic": None,
        },
        db,
    )
    monkeypatch.setattr(runner, "call_provider", mocked_call)
    return sent
