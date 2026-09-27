# How scoring works

All scoring is deterministic Python. No second model is a judge. There is no composite winner score.

## Matching

IDs are trimmed, uppercased and normalize spaces/underscores to hyphens. Numeric requirement/change suffixes are padded (`req_2` → `REQ-002`). No fuzzy semantic ID matching is used. Directed edges match `(source, relationship, target)`. Reversing an edge is an error. Duplicate canonical IDs, duplicate edges and dangling endpoints fail the local contract. Repeated predictions never inflate true positives.

Set scores: `TP = |prediction ∩ reference|`, `FP = |prediction − reference|`, `FN = |reference − prediction|`, precision `TP/(TP+FP)`, recall `TP/(TP+FN)`, F1 `2PR/(P+R)`. Both sets empty gives 1/1/1. Empty prediction with positive reference gives 0/0/0. Positive prediction with empty reference gives precision 0, recall 1, F1 0. Undefined accuracy/rate denominators give `null`, displayed as “—”. No-impact controls therefore penalize invented impacts without claiming critical-miss observations where no critical opportunities exist.

## Extraction

Entity matching uses `(ID, type)`. Names are descriptive, not scored as extra technical facts. Parameter matching uses fact ID, including numeric product criteria and configurations. Value accuracy uses matched fact IDs, array order and numerical tolerance `rel_tol=1e-6`, `abs_tol=1e-9`. Unit accuracy is separate: a small documented alias map supports `A`/`amps`, `V`/`volts`, `rpm`/`rev/min`, `degC`/`°C`. No automatic unit scaling is applied: 50 mA instead of the requested 0.05 A will lose unit/value credit. All prompts specify canonical units.

Unsupported fact rate is unsupported submitted structured facts / all submitted structured facts. A fact must match its reference value, unit, qualifier and source attribution. Scope is deliberately closed; incidentally true facts outside the fixed vocabulary are not rewarded. Supported-fact recall counts facts passing all these checks against the complete reference fact set. ID-only parameter F1 is displayed alongside factual accuracy, never substituted for it.

## Evidence and graph conclusions

An evidence record needs a real document ID/location and an excerpt of at least six characters that actually occurs there after whitespace/case normalization. The location must also belong to the reference fact/edge's relevant locations. A real but unrelated quotation is insufficient. PDF mode uses a small explicit page mapping for the specified editions. Evidence outside the excerpt contract loses attribution credit; there is no model-based semantic quote adjudication.

Relationship F1 measures directed conclusion correctness; supported-relationship F1 also requires correct evidence. Its numerator counts correct supported predictions; the precision denominator still includes unsupported submitted edges. The graph distinguishes:

- Correct conclusion with correct evidence: solid line and ✓.
- Correct conclusion with bad evidence: dash-dot line and !.
- False positive: dotted line and +.
- Missing: dashed line and −.

Unsupported relationship rate counts incorrect or incorrectly evidenced predicted edges / all predicted edges. Missing edges count as recall errors, not unsupported submitted claims. No evidence-only score can prove full semantic entailment of free text.

## Impact and explanations

Impact metrics micro-average `(scenario ID, requirement ID)` pairs **within one difficulty level**. False-positive impact rate is false alarms on known unaffected requirements / known unaffected opportunities (FP/(FP+TN)). Unknown requirement IDs still count as precision errors; unknown scenario IDs are also explicit errors. False-negative impact rate is FN / true affected pairs. Critical-impact miss rate is missed critical pairs / true critical pairs, not misses / all scenarios.

Missing scenario entries reduce scenario coverage and fail the scenario contract, even if the omitted scenario has no impacts. A failed, interrupted, malformed or incomplete task prevents publication of its entire repetition. No partial result or zero-score placeholder enters quality aggregates. Attempt diagnostics remain in the separate executions table. Quality statistics are conditional on successful completion; they are not API reliability statistics.

Explanation checks separately inspect the changed-element ID, affected-requirement ID, directed baseline dependency, baseline citations, scenario citation, nonempty explanation, and every declared structured numerical claim. The rule pass rate divides passing explanations by submitted explanations; supported-impact recall divides by the reference affected pairs, penalizing omitted explanations. Unknown prose physics and unstated numerical claims cannot be exhaustively detected by these rules. The prompt prohibits them, the raw prose is preserved, and optional human reviews can mark supported/unsupported/needs review. Human reviews are stored separately and do not secretly alter objective metrics.

## Repetitions, grouping and errors

Default three repetitions. Each task/difficulty call is separate, each repetition has its own run ID, and all selected tasks use independent calls. One repetition has six calls: extraction, graph, L1 impact, L1 explanation, L2 explanation, L2 one-hop. Default all-provider execution is 54 calls before retries.

Aggregates are arithmetic means, minimum, maximum and population standard deviation of per-call scores. Individual impact calls micro-average scenarios; aggregation across repetitions is a mean of those per-call scores. Groups never mix provider/model, experiment, document mode, difficulty, prompt/dataset/schema/evaluator fingerprint, model settings, or feedback context.

Consistency is the fraction of pairs of repeated answers whose canonical decision signatures match exactly. It ignores output order and explanatory prose. Graph signatures compare directed edges; extraction signatures include node IDs/types and numeric values/units/qualifiers; impact signatures include scenario/requirement sets. Citation correctness is scored separately. Fewer than two responses gives `null`. Failed executions do not enter consistency calculations. Stable incorrect answers can be consistent; consistency is not correctness.

JSON validity, schema compliance and scenario coverage are publication gates. A JSON object with wrong fields may be valid JSON but fail schema validation. A successful result necessarily passes all gates; these fields are not cross-attempt reliability scores. Fenced/prose-wrapped output is rejected; it is not silently repaired. Refusal, truncation, HTTP errors, rate limits, timeouts, network errors and parse/schema failures are stored only as execution diagnostics, without benchmark scores or result exports. One transient retry is the default, configurable from zero to two. A provider error can incur unknown cost; the app does not report such totals as complete.

## Cost and feedback

Prices come only from dated `config/pricing.json` rows with a source URL. Null/unverified prices or missing usage means unavailable. Estimates multiply reported input/output tokens by configured prices per million. Cache-tier usage currently makes cost unavailable because the two-price table cannot model it correctly. Gemini reported thought tokens count toward output usage. Estimates are not billing statements. Timing includes all attempts and backoff; each attempt also stores its own times and usage.

Feedback runs require an explicit completed first-pass baseline with matching model settings, dataset, tasks, mode, prompts, schemas and evaluator. Only explicitly confirmed corrections on that baseline enter context. Confirmations are snapshotted; later changes cannot alter old run context. Confirmed model feedback never modifies ground truth. The separate reference workbench permits explicit human edits, creates a local dataset revision, invalidates previous review decisions for the changed dataset, and preserves older run snapshots. A rejected reference item blocks new runs of that version. Human approval of the reference is recorded in the run snapshot; it is not an extra model score.

Correction retention measures the proportion of relevant confirmed directed decisions retained. Accepted/missing edges must appear; rejected edges must remain absent for graph tasks. For impact tasks, only accepted edges with a matching expected scenario dependency create retention opportunities. Rejected edges do not imply an entire requirement is unaffected. Repeated-error rate = original FP/FN decisions still wrong / original wrong decisions. New-error rate = assisted errors absent from baseline / all assisted errors. The new-error count is also retained. Performance improvement = assisted task F1 − paired first-pass task F1, not a mixed aggregate. If a baseline task failed, paired improvement is unavailable.

Transfer cases CHG-011/012 use different values and contexts; their retention and improvement are reported separately from the core cases. Improvement on repeated cases alone is not evidence of generalization. Only completed provider API runs can contribute experimental measurements. Test fixtures never enter the application database.
