# Source-only protocol and result inspection

Protocol 2.0.0 changes future input, not historical evaluation. Ground-truth version 1.1.0 and its files remain unchanged. No database migration is needed.

Previously L1 received PROJECT-05 (expected change implications), PROJECT-06 (the bounded expected graph), and a fixed inventory of expected entity/parameter IDs. These are answer hints; previous scores must be interpreted in that context. Historical prompts, raw provider responses, snapshots and scores are preserved verbatim. The live inspector marks them as previous-protocol executions. L2 already omitted PROJECT-05/06 but still had the inventory.

New preparation accepts only `pdf_text`. All five manufacturer documents are read in full, page by page, with the same parser. The project architecture document retains assumptions, operating conditions, configuration and factual test procedures. Expected impact statements and explicit edge lists are absent. Requirements remain project-authored inputs, distinguished from manufacturer specifications. Source registry numeric summaries are omitted. Scenario inputs contain only ID, proposed change description and changed element; difficulty/transfer/control labels and expected answers are not sent. Allowed schema types and generic ID naming rules remain necessary for deterministic matching. Confirmed corrections are still confined to the explicitly selected feedback experiment.

Tests change reference entities, edges, expected impacts, reasons, critical labels and control labels and verify the request is unchanged. Test fixtures are isolated and never populate production storage. Older snapshots use the legacy reconstruction branch only for inspection; new execution rejects the old input policy.

The evaluator is deliberately unchanged: this is a small closed reference, not an exhaustive engineering truth database. A matching impact set can have 100% recall while a dependency, citation, qualifier or numerical claim fails. An unknown claim ID is out of scoring scope, not proof of fabricated physics. Human review remains available. The prototype does not compute objective correctness without a reference.

The new model inspector groups category, level, repetition and scenario inside the model. Its requirement table includes expected unaffected requirements as well as affected ones. Counts in that table are answers per requirement, not API calls and not hardware pass/fail measurements. A red row exposes the saved rule failures, submitted dependency, accepted reference dependencies and structured numerical claim comparison. Inspecting a result never writes or replaces a historical metric.

For local upgrade: `./stop`, then `./start`, when no benchmark is active. Existing source files and history are retained. A manually authored local revision based on the old protocol is blocked from new execution; it is not silently migrated or overwritten. Create/review an updated source-only revision before running it.
