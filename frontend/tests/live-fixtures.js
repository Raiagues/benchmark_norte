// Isolated browser tests only. These values never populate SQLite or results/.
export function liveFixture({ failed = false, running = false } = {}) {
  const modelDefs = failed
    ? [["openai", "gpt-6-astra"]]
    : [
        ["openai", "gpt-6-astra"],
        ["anthropic", "claude-fable-5-1"],
        ["gemini", "gemini-3.1-pro-preview"],
      ];
  const state = failed ? "TECHNICAL_ERROR" : running ? "QUEUED" : "INTERRUPTED";
  const calls = modelDefs.flatMap(([provider, model], m) =>
    [1, 2, 3].map((repetition) => ({
      id: `ui-call-${m}-${repetition}`,
      run_id: `ui-rep-${m}-${repetition}`,
      ordinal: 0,
      provider,
      model,
      depth: "high",
      task: "relationship_extraction",
      difficulty: "L1_DIRECT",
      repetition,
      input_mode: "controlled_text",
      experiment: "first_pass",
      scenario_ids: [],
      started_at: null,
      finished_at: null,
      quality: null,
      has_result: false,
      status: running && m === 0 && repetition === 1 ? "RUNNING" : state,
      stage:
        running && m === 0 && repetition === 1 ? "WAITING_FOR_RESPONSE" : state,
      error: failed ? "invalid_key" : null,
      diagnostic: failed
        ? {
            title: "Chave inválida ou revogada",
            action: "Confira a chave no .env.",
          }
        : null,
    })),
  );
  const ops = (items) => ({
    planned: items.length,
    started: failed || running ? 1 : 0,
    evaluated: 0,
    correct: 0,
    partial: 0,
    incorrect: 0,
    technical_errors: failed ? items.length : 0,
    interrupted: running || failed ? 0 : items.length,
    running: items.filter((c) => c.status === "RUNNING").length,
    queued: items.filter((c) => c.status === "QUEUED").length,
    remaining: items.filter((c) => ["RUNNING", "QUEUED"].includes(c.status))
      .length,
    processed: failed ? items.length : 0,
    progress: failed ? 1 : 0,
    completion_rate: 0,
    technical_failure_rate: failed ? 1 : null,
    api_calls: failed ? 1 : 0,
    api_responses: failed ? 1 : 0,
    average_latency: null,
    median_latency: null,
    input_tokens: { reported: null, reporting_calls: 0, total_calls: 0 },
    output_tokens: { reported: null, reporting_calls: 0, total_calls: 0 },
    cost_usd: null,
    schema: { numerator: 0, denominator: 0 },
  });
  return {
    id: "ui-live-run",
    created_at: "2026-09-27T12:00:00Z",
    started_at: running ? "2026-09-27T12:00:00Z" : null,
    finished_at: null,
    status: failed
      ? "COMPLETED_WITH_ERRORS"
      : running
        ? "RUNNING"
        : "INTERRUPTED_BY_USER",
    stop_requested: false,
    legacy: false,
    last_event_id: 0,
    models: modelDefs.map(([provider, model]) => {
      const items = calls.filter((c) => c.model === model);
      return {
        provider,
        model,
        depth: "high",
        status: failed
          ? "Completed with errors"
          : running
            ? provider === "openai"
              ? "Running"
              : "Waiting"
            : "Interrupted",
        operations: ops(items),
        quality: [],
        repetitions: [1, 2, 3].map((rep) => ({
          repetition: rep,
          ...ops(items.filter((c) => c.repetition === rep)),
          execution_ids: items
            .filter((c) => c.repetition === rep)
            .map((c) => c.id),
        })),
      };
    }),
    operations: ops(calls),
    calls,
    tasks: ["relationship_extraction"],
    levels: ["L1_DIRECT"],
    scenario_ids: [],
  };
}
