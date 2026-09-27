# Live execution and preservation

The live dashboard groups work by provider, model and configured depth. A card contains all repetitions of that model. Models wrap into rows; they are never paginated. The runner remains sequential. It does not imply concurrent API calls when only one request is active.

## Units and outcomes

An **evaluation** (`live_batches`) is one launch from the site. A **repetition** remains the existing `executions` row. A **task execution** (`live_calls`) is one task/level request; retries belong to that request. Impact requests contain all scenarios at their level. The scenario matrix repeats a batched request's completion state, not an invented API call for each scenario.

A task is `QUEUED`, `RUNNING`, `COMPLETED_CORRECT`, `COMPLETED_INCORRECT`, `TECHNICAL_ERROR` or `INTERRUPTED`. `COMPLETED_INCORRECT` includes partial answers. Fully correct means no false positives or negatives in the task's existing set comparisons, with all applicable attribution/evidence/explanation rules satisfied. A non-perfect answer with at least one true positive is partial; one without any true positives is incorrect. These labels supplement the original precision, recall and F1; they are not a new score or a pass threshold. Prose quality still needs human review.

The progress bar is `(evaluated tasks + technical errors) / planned tasks`. It never advances with elapsed time. Interrupted tasks have their own count and do not fill the progress bar. Consequently, a stopped run can finish operationally with progress below 100%.

Quality metrics use only validated, evaluated provider responses, including incorrect answers. Technical errors, interrupted tasks and queued/running work never enter quality denominators. Live precision, recall and F1 sum TP/FP/FN within **one task and one difficulty**. Evidence, unsupported facts and critical misses use their underlying counts. Each metric exposes its numerator, denominator and contributing execution IDs. Consistency compares pairs of valid answers to the same task/level. Evolution points exist only after a real evaluated result; the x-axis counts those results. Result comparison retains the earlier mean/min/max/deviation per task and identifies incomplete batches.

Operational metrics are separate: planned, started, evaluated, technical errors, interruptions, completion rate, technical failures per started task, latency, API attempts/responses, tokens and cost. Latency includes finished technical failures when measured. Token counts sum provider-reported attempt usage, with reporting coverage. Unreported usage is not treated as zero. Cost is unavailable unless every included attempt has usage and applicable configured prices. Original legacy histories may have incomplete operational observations; recovery notes disclose this.

## Persistence and migration

The original forward migration created four tables: `live_batches`, `live_calls`, `live_events`, `execution_recovery`, plus indexes. The continuation upgrade adds `live_continuations`. Neither migration resets SQLite or rewrites original `runs`, `executions`, `task_results`, feedback, reference edits or connection confirmations.

Legacy task plans are read from their saved repetition snapshots. Saved task results remain the source of evaluated results. Unfinished legacy work is annotated separately. The original `running`/`pending` values remain in SQLite; the API exposes `original_status` and a recovery annotation alongside the displayed interrupted state. Historical event timelines are not fabricated. A request that ended without a persisted response remains unknown; it is not silently counted as successful and its token use cannot be recovered.

New task responses are checkpointed on receipt and persisted independently as soon as evaluation finishes. Completed repetitions continue to use the original atomic `runs`/`task_results` publication. During a partial repetition, `/api/runs` exposes only its validated saved task results through an explicitly incomplete view. It does not create a fake completed repetition in the original table. Existing analysis, graphs, impact inspection and downloads can therefore use already evaluated tasks immediately.

Completed task JSON files are written under `results/<provider>/<repetition>/calls/<execution>.json`. Existing `run.json` files are untouched. SQLite is authoritative if file export fails. Inputs, prompts, schema, dataset and ground truth remain snapshotted per repetition.

### Verified local upgrade on 2026-09-27

Before migration, a private SQLite backup and row/file fingerprints were saved under the ignored `.runtime/preservation-20260927/` directory. After migration and tests, every original field in all eight existing tables was compared with the backup. Counts remained: **3 published runs, 9 repetition records, 18 evaluated task results, 3 connection confirmations**. The other four existing tables were empty and remain empty. Original statuses are unchanged in storage: three completed runs; three completed, one running and five pending repetition records. All 13 recorded result/prompt/ground-truth files are byte-identical.

The previous application process was already absent before this work started. Six incomplete repetition records received separate recovery annotations. The new journal describes the existing single batch's 54 planned task requests: 18 preserved evaluated responses and 36 interrupted/uncompleted tasks. Those 54 plan rows are not new API calls or replacement outputs. No historical event entries were invented. The batch is displayed as partially completed; the prior in-flight request's unsaved response, end time and usage remain unknown.

## Observable events and SSE

`GET /api/live/<batch>/stream` sends SSE snapshots read from SQLite whenever the event version changes, with keepalive comments. A new connection always receives the full current snapshot, including after a refresh or a lost connection. The browser does not own execution state. The run ID stays in `#live/<id>`. All stored events are independently available from `/api/live/<batch>/events`.

Events include:

- `RUN_CREATED`, `RUN_STARTED`, `RUN_COMPLETED`, `RUN_STOP_REQUESTED`, `RUN_CANCELLED`, `RUN_RECOVERED`.
- `RUN_RESUMED` links a newly created continuation to the original batch after pending work is reserved.
- `EXECUTION_QUEUED`, `EXECUTION_STARTED`, `EXECUTION_COMPLETED`, `EXECUTION_FAILED`, `EXECUTION_INTERRUPTED`.
- `INPUT_PREPARED`, `REQUEST_PREPARED`, `API_REQUEST_SENT`, `API_RESPONSE_RECEIVED`, `API_ATTEMPT_FINISHED`.
- `VALIDATION_STARTED`, `OUTPUT_PARSED`, `EVALUATION_STARTED`, `EVALUATION_COMPLETED`, `SAVING_STARTED`, `METRICS_UPDATED`.

Each event corresponds to an actual function boundary or saved state transition. HTTP, timeout and schema failures carry a failure stage. No private reasoning, simulated thinking or made-up provider stages are shown. JSON/schema failures are `EXECUTION_FAILED` events with their specific category, not benchmark misses.

A received response, prompt/input, parsed output, reference, comparison, metrics and usage are inspectable from `/api/live-results/<id>`. Relationship graphs reuse the existing application renderer; the model never draws them. Raw diagnostic details remain separate from benchmark quality.

## Stop and restart

The stop endpoint requires `confirmed: true` and the existing local mutation header. A transactional stop flag prevents new tasks and new retry attempts. Queued work is marked `INTERRUPTED`; a dispatched request is allowed to finish, and its response/evaluation is saved. Already completed responses are immutable. The final batch becomes `INTERRUPTED_BY_USER`. Technical failures can produce `COMPLETED_WITH_ERRORS` or `PARTIALLY_COMPLETED` when dependent scheduling stopped.

Browser refresh does not stop execution. Stopping the server with `./stop`, a crash or an operating-system restart can interrupt an in-flight request. At next startup its persisted checkpoint is retained and uncompleted work is explicitly marked interrupted with `unknown_after_restart`. Paid calls are never resumed automatically. For a graceful stop that lets an in-flight response finish, use **Stop benchmark** on the site before closing the server.

## Explicit continuation

`GET /api/live/<batch>/resume` previews eligible work without calling a provider. Only interrupted task/level calls with no persisted dispatch, attempt, checkpoint or result are eligible. For older recovered runs without a per-call journal, the original repetition must still be `pending`; old `running` repetitions are uncertain and excluded. Completed answers, including incorrect ones, and technical failures are never rerun by this action.

`POST /api/live/<batch>/resume` requires the local mutation header, explicit confirmation and the preview token. It uses the existing benchmark lock and all-or-nothing model/key validation. Pending calls are copied into new repetition/batch records under the current document/prompt protocol, with the original repetition numbers and only the remaining task/level pairs. Source records remain unchanged. A changed protocol is disclosed and retained as a separate comparison cohort; obsolete prompts containing answer hints are never replayed.

An SQLite `BEGIN IMMEDIATE` transaction rechecks eligible calls and inserts both new plans and their links. `live_continuations.source_call_id` is unique, so competing requests cannot schedule the same original call twice. A continuation that stops before dispatch can itself be continued. Its parent links to the existing child rather than reserving those calls again. There is no automatic retry of uncertain historical API requests.

## Visual inspection and answer errors

The read-only model summary exposes `answer_errors` separately from technical errors and labels a fully processed model with incorrect answers as `Completed with answer errors`. Original historical statuses and metrics are not rewritten. Partial answers count as answer errors and still contribute their real TP/FP/FN to quality metrics. The run header and history expose the same count.

The inspector opens with input, model output and evaluation panels. Original saved inputs are readable by document and page/passage. Output uses parameter tables, relationship paths, and per-scenario requirement answers. Expected answers remain in a separate reference view; comparison identifies failures per requirement. Exact prompt, raw response, structured output and complete metrics remain downloadable. No new model response or reevaluation is created by inspection.

### Continuation upgrade verification on 2026-09-27

A second private backup was saved under ignored `.runtime/resume-inspector-preservation/` before this change. After startup migration, all rows of all 12 pre-existing tables were compared field by field against that backup. Counts remained **3 published runs, 9 repetition records, 18 evaluated task results, 1 live batch, 54 planned task calls, 6 recovery annotations, 3 connection confirmations**. Their original statuses and contents remain identical. The seven recorded result and ground-truth files also have identical SHA-256 hashes. The new continuation table is empty: no real benchmark was resumed during development.

For this existing interrupted batch, the read-only preview identifies 30 calls in five never-started repetitions as eligible. The six calls belonging to the previously running legacy repetition remain uncertain and excluded. All 18 existing evaluated responses are preserved. The visible model summary now identifies 10 partially correct answers as answers with errors, without modifying their saved evaluation.

## Validation

Tests use isolated temporary databases and HTTP fixtures; none create application benchmark records. Coverage includes exact-count metrics, incorrect answers, evidence failures, all-or-nothing preflight, cancellation during an in-flight request, partial-result publication, immutable legacy recovery, checkpoint preservation and a real local HTTP SSE stream observed during a blocked provider fixture, after completion and after reconnection. Browser tests cover one model card per model, repetition grouping, no pagination, no invented progress, confirmation, refresh and empty states.
