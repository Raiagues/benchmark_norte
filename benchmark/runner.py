"""Sequential benchmark execution. No worker service, queue or autonomous memory."""

import json
import uuid
import platform
from importlib.metadata import version
from collections import defaultdict

from pydantic import ValidationError

from . import storage, live
from .dataset import (
    ROOT,
    TASKS,
    cases_for_task,
    digest,
    load_dataset,
    make_prompt,
    prompt_bundle,
    read_json,
    task_plan,
)
from .evaluate import (
    answer_signature,
    consistency,
    evaluate,
    feedback_metrics,
    statistics,
)
from .providers import call_provider, utcnow
from .security import get_key
from .connections import require_ready, note_provider_failure, with_depth, depth_field
from .diagnostics import describe
from .schemas import (
    load_strict_json,
    normalize_id,
    parse_output,
    response_schema,
)


def configuration():
    config = read_json(ROOT / "config/models.json")
    for m in config["models"]:
        if (
            m["provider"] not in ("openai", "anthropic", "gemini")
            or not m["model"].strip()
        ):
            raise ValueError("Invalid model configuration")
    return config


def source_code_hash():
    return digest(
        {p.name: p.read_text() for p in sorted((ROOT / "benchmark").glob("*.py"))}
    )


def prepare_runs(
    models,
    tasks=None,
    repetitions=3,
    input_mode="pdf_text",
    experiment="first_pass",
    baseline_run_id=None,
    db=None,
    continuation=None,
):
    if input_mode != "pdf_text":
        raise ValueError("New runs require original PDF documents (pdf_text)")
    if not 1 <= repetitions <= 10:
        raise ValueError("Repetitions must be 1 to 10")
    tasks = TASKS if tasks is None else tasks
    if not tasks or any(t not in TASKS for t in tasks) or len(set(tasks)) != len(tasks):
        raise ValueError("Select unique known tasks")
    if experiment not in ("first_pass", "feedback_assisted"):
        raise ValueError("Unknown experiment")
    storage.init_db(db)
    cfg = configuration()
    settings = cfg["defaults"]
    if (
        not 0 <= settings["retries"] <= 2
        or not 1 <= settings["timeout_seconds"] <= 600
        or not 256 <= settings["max_output_tokens"] <= 100000
    ):
        raise ValueError("Invalid timeout, retry or output-token configuration")
    if not models:
        raise ValueError("Select at least one model")
    for model in models:
        base = next(
            (
                m
                for m in cfg["models"]
                if m["provider"] == model["provider"] and m["model"] == model["model"]
            ),
            None,
        )
        if not base or with_depth(base, model.get(depth_field(base))) != model:
            raise ValueError("Model must be present in config/models.json")
    require_ready(models, db)
    ds, prompts = load_dataset(input_mode, db=db), prompt_bundle(db=db)
    if ds["manifest"].get("input_policy") != "source_documents_v2":
        raise ValueError(
            "The active revision uses the historical hinted-input protocol; select the current benchmark before running"
        )
    from .workbench import review_state

    reference_review = review_state(load_dataset(db=db), db)
    if reference_review["rejected"]:
        raise ValueError("reference_has_rejected_items")
    schemas = {t: response_schema(t) for t in tasks}
    feedback = []
    baseline = None
    dependencies = {
        name: version(name)
        for name in (
            "fastapi",
            "httpx",
            "pydantic",
            "pypdf",
            "fonttools",
            "uvicorn",
            "python-dotenv",
        )
    }
    runtime = {"python": platform.python_version(), "dependencies": dependencies}
    comparison_hash = digest(
        {
            "dataset": ds,
            "prompts": prompts,
            "schemas": schemas,
            "code": source_code_hash(),
            "settings": settings,
            "runtime": runtime,
        }
    )
    if experiment == "feedback_assisted":
        if not baseline_run_id or len(models) != 1:
            raise ValueError(
                "Feedback-assisted runs require one model and an explicit first-pass baseline run"
            )
        baseline = storage.get_run(baseline_run_id, db)
        if (
            not baseline
            or baseline["status"] != "completed"
            or baseline["metadata"]["experiment"] != "first_pass"
        ):
            raise ValueError("Select a completed first-pass baseline")
        bm = baseline["metadata"]
        if (
            bm["comparison_hash"] != comparison_hash
            or bm["tasks"] != tasks
            or bm["input_mode"] != input_mode
            or baseline["snapshot"]["model_config"] != models[0]
        ):
            raise ValueError(
                "Baseline must match dataset, code, prompts, schema, tasks, input mode and model settings"
            )
        feedback = [
            f
            for f in storage.list_feedback(db, True)
            if f["dataset_hash"] == digest(ds) and f["run_id"] == baseline_run_id
        ]
        if not feedback:
            raise ValueError(
                "Confirm at least one correction on this baseline before running the experiment"
            )
    batch = uuid.uuid4().hex
    result = []
    records = []
    for model in models:
        for repetition in range(1, repetitions + 1):
            work = (
                [
                    c
                    for c in continuation["work"]
                    if c["snapshot"]["model_config"] == model
                    and c["repetition"] == repetition
                ]
                if continuation
                else []
            )
            if continuation and not work:
                continue
            selected_plan = (
                [(c["task"], c["difficulty"]) for c in work]
                if continuation
                else task_plan(tasks)
            )
            rid = uuid.uuid4().hex
            metadata = {
                "provider": model["provider"],
                "model": model["model"],
                "depth": model.get(depth_field(model)),
                "repetition": repetition,
                "batch_id": batch,
                "tasks": list(dict.fromkeys(t for t, _ in selected_plan)),
                "input_mode": input_mode,
                "experiment": experiment,
                "baseline_run_id": baseline_run_id,
                "origin": "provider_api",
                "comparison_hash": comparison_hash,
                "dataset_hash": digest(ds),
                "dataset_version": ds["manifest"]["dataset_version"],
                "prompt_hashes": {k: digest(v) for k, v in prompts.items()},
                "feedback_hash": digest(feedback),
                "completed_calls": 0,
                "total_calls": len(selected_plan),
            }
            if continuation:
                metadata.update(
                    task_plan=selected_plan,
                    resumed_from=continuation["batch_id"],
                    source_call_ids=[c["id"] for c in work],
                )
            run = {
                "id": rid,
                "created_at": utcnow(),
                "status": "pending",
                "metadata": metadata,
                "snapshot": {
                    "dataset": ds,
                    "reference_review": reference_review,
                    "prompts": prompts,
                    "schemas": schemas,
                    "model_config": model,
                    "settings": settings,
                    "pricing": read_json(ROOT / "config/pricing.json"),
                    "feedback": feedback,
                    "runtime": runtime,
                    "evaluation_code_hash": source_code_hash(),
                },
            }
            records.append(run)
            result.append(rid)
    if continuation:
        from .resume import persist

        persist(records, continuation, db)
    else:
        for run in records:
            storage.save_execution(run, db)
        live.register_batch(result, db)
    return result


def execute_run(run_id, db=None):
    run = storage.get_execution(run_id, db)
    if not run or run["status"] != "pending":
        raise ValueError("Only a pending execution can be started")
    if live.is_stopped(run["metadata"]["batch_id"], db):
        run["status"] = "interrupted"
        storage.save_execution(run, db)
        return run
    results = []
    active_call = None
    snapshot, meta = run["snapshot"], run["metadata"]
    ds = snapshot["dataset"]
    run["status"] = "running"
    storage.save_execution(run, db)
    try:
        for entry in live.calls_for_run(run_id, db):
            active_call = entry["id"]
            task, level = entry["data"]["task"], entry["data"]["difficulty"]
            if not live.begin_call(active_call, db):
                run["status"] = "interrupted"
                break
            try:
                require_ready([snapshot["model_config"]], db)
            except ValueError:
                run["status"] = "failed"
                run["failure"] = {
                    "category": "connection_not_confirmed",
                    "diagnostic": describe("unverified", meta["provider"]),
                }
                live.finish_call(
                    active_call,
                    error="connection_not_confirmed",
                    diagnostic=run["failure"]["diagnostic"],
                    db=db,
                )
                break
            key = get_key(meta["provider"])
            schema = snapshot["schemas"][task]
            feedback = (
                snapshot["feedback"]
                if meta["experiment"] == "feedback_assisted"
                else []
            )
            context_feedback = [
                {k: f[k] for k in ("edge", "verdict", "correction")} for f in feedback
            ]
            prompt = make_prompt(
                ds, snapshot["prompts"], task, level, schema, context_feedback
            )
            cases = cases_for_task(ds, task, level)
            live.transition(
                active_call,
                "BUILDING_REQUEST",
                "INPUT_PREPARED",
                {"prompt": prompt},
                db,
            )

            def observe(kind, data):
                stages = {
                    "REQUEST_PREPARED": "BUILDING_REQUEST",
                    "API_REQUEST_SENT": "WAITING_FOR_RESPONSE",
                    "API_RESPONSE_RECEIVED": "RESPONSE_RECEIVED",
                    "API_ATTEMPT_FINISHED": "CALL_ERROR"
                    if data.get("error")
                    else "RESPONSE_RECEIVED",
                }
                live.transition(active_call, stages[kind], kind, data, db)

            call = call_provider(
                snapshot["model_config"],
                prompt,
                schema,
                snapshot["settings"],
                snapshot["pricing"],
                api_key=key,
                observer=observe,
                cancelled=lambda: live.is_stopped(meta["batch_id"], db),
            )
            if call.get("error") == "cancelled_before_request":
                live.interrupt_running_before_request(active_call, db)
                run["status"] = "interrupted"
                break
            note_provider_failure(snapshot["model_config"], key, call, db)
            parsed, valid_json, compliant, contract = None, False, False, False
            error = call["error"]
            if not error:
                live.transition(
                    active_call,
                    "VALIDATING_OUTPUT",
                    "VALIDATION_STARTED",
                    {"call": call},
                    db,
                )
                try:
                    load_strict_json(call["text"])
                    valid_json = True
                    parsed = parse_output(task, call["text"])
                    compliant = True
                    contract = "scenarios" not in parsed or {
                        normalize_id(s["scenario_id"]) for s in parsed["scenarios"]
                    } == {s["id"] for s in cases}
                    if not contract:
                        error = error or "scenario_coverage_error"
                except json.JSONDecodeError:
                    error = error or "parsing_failure"
                except (ValidationError, ValueError):
                    error = error or (
                        "invalid_structured_output" if valid_json else "parsing_failure"
                    )
            if error:
                run["status"] = "failed"
                run["failure"] = {
                    "task": task,
                    "difficulty": level,
                    "category": error,
                    "diagnostic": call.get("diagnostic")
                    or describe(error, meta["provider"]),
                    "call": call,
                    "valid_json": valid_json,
                    "schema_compliant": compliant,
                    "contract_compliant": contract,
                }
                live.finish_call(
                    active_call,
                    error=error,
                    call=call,
                    diagnostic=run["failure"]["diagnostic"],
                    db=db,
                )
                break
            live.transition(active_call, "VALIDATING_OUTPUT", "OUTPUT_PARSED", db=db)
            live.transition(active_call, "EVALUATING", "EVALUATION_STARTED", db=db)
            metrics = evaluate(task, parsed, ds, cases)
            metrics.update(
                valid_json_rate=1.0,
                schema_compliance_rate=1.0,
                contract_compliance_rate=1.0,
                call_success_rate=1.0,
            )
            for family in ("entity", "parameter", "relationship"):
                if family in metrics:
                    metrics.update(
                        {
                            f"{family}_{k}": metrics[family][k]
                            for k in ("precision", "recall")
                        }
                    )
            result = {
                "id": active_call,
                "run_id": run_id,
                "provider": meta["provider"],
                "model": meta["model"],
                "task": task,
                "difficulty": level,
                "prompt": prompt,
                "prompt_hash": digest(prompt),
                "schema_hash": digest(schema),
                "dataset_hash": meta["dataset_hash"],
                "dataset_version": meta["dataset_version"],
                **call,
                "error": error,
                "parsed_output": parsed,
                "metrics": metrics,
                "answer_signature": answer_signature(task, parsed),
            }
            if cases:
                result["split_metrics"] = {}
                # Subset evaluation must not classify the other known split as fabricated.
                for split in {s["split"] for s in cases}:
                    subset = [s for s in cases if s["split"] == split]
                    ids = {s["id"] for s in subset}
                    filtered = {
                        "scenarios": [
                            s
                            for s in (parsed or {}).get("scenarios", [])
                            if normalize_id(s["scenario_id"]) in ids
                        ]
                    }
                    result["split_metrics"][split] = evaluate(
                        task, filtered, ds, subset
                    )
            if meta["experiment"] == "feedback_assisted" and parsed and not error:
                baseline = storage.get_run(meta["baseline_run_id"], db)
                before = next(
                    (
                        r
                        for r in baseline["results"]
                        if r["task"] == task and r["difficulty"] == level
                    ),
                    None,
                )
                if before and before["parsed_output"] and not before["error"]:
                    result["feedback_metrics"] = feedback_metrics(
                        task, parsed, before["parsed_output"], feedback, ds, cases
                    )
                    if cases:
                        result["feedback_transfer_metrics"] = {}
                        for split in ("core", "transfer"):
                            subset = [s for s in cases if s["split"] == split]
                            if not subset:
                                continue
                            ids = {s["id"] for s in subset}
                            after_sub = {
                                "scenarios": [
                                    s
                                    for s in parsed["scenarios"]
                                    if normalize_id(s["scenario_id"]) in ids
                                ]
                            }
                            before_sub = {
                                "scenarios": [
                                    s
                                    for s in before["parsed_output"]["scenarios"]
                                    if normalize_id(s["scenario_id"]) in ids
                                ]
                            }
                            result["feedback_transfer_metrics"][split] = (
                                feedback_metrics(
                                    task, after_sub, before_sub, feedback, ds, subset
                                )
                            )
            live.transition(
                active_call, "CALCULATING_METRICS", "EVALUATION_COMPLETED", db=db
            )
            live.transition(active_call, "SAVING", "SAVING_STARTED", db=db)
            live.finish_call(active_call, result=result, db=db)
            results.append(result)
            meta["completed_calls"] += 1
            storage.save_execution(run, db)
        if len(results) == meta["total_calls"]:
            run["status"] = "completed"
            meta["finished_at"] = utcnow()
            storage.publish_run(run, results, db)
    except Exception as exc:
        # Do not log request objects, headers, environment or arbitrary exception strings.
        run["status"] = "failed"
        run["failure"] = {
            "category": "internal_error",
            "exception_type": type(exc).__name__,
        }
        if active_call:
            remaining = next(
                (c for c in live.calls_for_run(run_id, db) if c["id"] == active_call),
                None,
            )
            if remaining and remaining["status"] == "RUNNING":
                live.finish_call(active_call, error="internal_error", db=db)
    finally:
        if run["status"] in ("failed", "interrupted"):
            live.interrupt_queued(
                meta["batch_id"],
                "stopped_by_user"
                if live.is_stopped(meta["batch_id"], db)
                else "blocked_after_error",
                db,
                run_id,
            )
        meta["finished_at"] = utcnow()
        storage.save_execution(run, db)
        live.finalize_batch(meta["batch_id"], db)
    if run["status"] == "completed":
        try:
            storage.export_run(run_id, db)
        except OSError:
            # SQLite remains the authoritative completed result; download still works.
            meta["export_warning"] = "File export failed; use the JSON download"
            storage.save_execution(run, db)
        return storage.get_run(run_id, db)
    return storage.get_execution(run_id, db)


def aggregate(db=None, *, by_study=False):
    """Keep protocol statistics intact; optionally scope each group to its study."""
    groups = defaultdict(list)
    depths = {}
    provenance = defaultdict(list)
    study_info = {}
    with storage.connect(db) as con:
        batch_states = {
            r["id"]: r["status"]
            for r in con.execute("SELECT id,status FROM live_batches")
        }
        if by_study:
            from .studies import family

            for batch_id in batch_states:
                if batch_id in study_info:
                    continue
                root, batches = family(batch_id, con)
                root_batch = next(b for b in batches if b["id"] == root)
                info = {
                    "study_id": root,
                    "study_created_at": root_batch["created_at"],
                    "study_batch_ids": [b["id"] for b in batches],
                }
                study_info.update({b["id"]: info for b in batches})
    for info in storage.list_runs(db):
        if not info["comparison_eligible"]:
            continue
        run = storage.get_run(info["id"], db)
        m = run["metadata"]
        study = study_info.get(
            m.get("batch_id"),
            {
                "study_id": m.get("batch_id") or run["id"],
                "study_created_at": run["created_at"],
                "study_batch_ids": [m["batch_id"]] if m.get("batch_id") else [],
            },
        )
        for r in run["results"]:
            key = (
                study["study_id"] if by_study else None,
                m["provider"],
                m["model"],
                m["experiment"],
                m["input_mode"],
                m["comparison_hash"],
                digest(run["snapshot"]["model_config"]),
                m["feedback_hash"],
                r["task"],
                r["difficulty"],
            )
            groups[key].append(r)
            provenance[key].append(
                {
                    "run_id": run["id"],
                    "batch_id": m.get("batch_id"),
                    "study": study,
                    "incomplete": run["status"] != "completed"
                    or batch_states.get(m.get("batch_id"))
                    not in (None, "COMPLETED", "COMPLETED_WITH_ERRORS"),
                }
            )
            model_config = run["snapshot"]["model_config"]
            depths[key] = model_config.get(depth_field(model_config))
    rows = []
    for key, results in groups.items():
        (
            study_id,
            provider,
            model,
            experiment,
            mode,
            fingerprint,
            settings_hash,
            feedback_hash,
            task,
            level,
        ) = key
        names = {
            name
            for r in results
            for name, value in r["metrics"].items()
            if isinstance(value, (int, float)) or value is None
        }
        costs = [r["cost_usd"] for r in results]
        rows.append(
            {
                **(
                    {
                        **provenance[key][0]["study"],
                        "run_ids": sorted({p["run_id"] for p in provenance[key]}),
                    }
                    if by_study
                    else {}
                ),
                "provider": provider,
                "model": model,
                "experiment": experiment,
                "input_mode": mode,
                "comparison_hash": fingerprint,
                "settings_hash": settings_hash,
                "depth": depths[key],
                "feedback_hash": feedback_hash,
                "task": task,
                "difficulty": level,
                "origin": "provider_api",
                "n": len(results),
                "execution_ids": [r["id"] for r in results],
                "incomplete_batch_ids": sorted(
                    {
                        p["batch_id"]
                        for p in provenance[key]
                        if p["incomplete"] and p["batch_id"]
                    }
                ),
                "metrics": {
                    name: statistics([r["metrics"].get(name) for r in results])
                    for name in sorted(names)
                },
                "consistency": consistency([r["answer_signature"] for r in results]),
                "latency_seconds": statistics([r["latency_seconds"] for r in results]),
                "estimated_cost_usd": sum(costs)
                if all(x is not None for x in costs)
                else None,
                "average_cost_per_task_usd": sum(costs) / len(costs)
                if all(x is not None for x in costs)
                else None,
                "known_input_tokens": sum(
                    r["tokens"].get("input") or 0 for r in results
                ),
                "known_output_tokens": sum(
                    r["tokens"].get("output") or 0 for r in results
                ),
                "token_usage_complete": all(
                    r["tokens"].get("input") is not None
                    and r["tokens"].get("output") is not None
                    for r in results
                ),
            }
        )
    return rows
