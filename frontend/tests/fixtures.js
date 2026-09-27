// Browser-only test data. All /api requests are intercepted; nothing enters SQLite or results/.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (name) => JSON.parse(fs.readFileSync(root + name, "utf8"));
const sources = read("data/sources.json");
const names = {
  FAN: "motor",
  SENSOR: "temperature_sensor",
  DRIVER: "motor_driver",
  REQUIREMENTS: "requirements",
  PROJECT: "project",
};
const documents = Object.fromEntries(
  Object.entries(names).map(([id, name]) => [
    id,
    Object.fromEntries(
      fs
        .readFileSync(`${root}data/normalized/${name}.txt`, "utf8")
        .split("\n")
        .flatMap((line) => {
          const m = line.match(/^\[(.+?)\] (.*)$/);
          return m ? [[m[1], m[2]]] : [];
        }),
    ),
  ]),
);
const ground_truth = Object.fromEntries(
  ["entities", "relationships", "requirements", "change_scenarios"].map((k) => [
    k,
    read(`data/ground_truth/${k}.json`),
  ]),
);
export const dataset = {
  documents,
  sources,
  ground_truth,
  manifest: read("data/manifest.json"),
  system_config: read("data/normalized/system_config.json"),
  scope: read("data/task_scope.json"),
};
const allTasks = [
  "entity_extraction",
  "relationship_extraction",
  "change_impact",
  "impact_explanation",
  "one_hop",
];
const config = {
  ...read("config/models.json"),
  manifest: dataset.manifest,
  key_available: { openai: false, anthropic: false, gemini: false },
  tasks: allTasks,
  pdf_ready: false,
  prompt_hashes: { common: "test-only-prompt-hash" },
};
const key = (e) => [e.source, e.relationship, e.target].join("|");
const stats = (value) => ({
  mean: value,
  min: value,
  max: value,
  stddev: 0,
  n: 3,
});

export function testRecords() {
  const nodes = structuredClone(ground_truth.entities.nodes);
  const edges = structuredClone(ground_truth.relationships);
  edges.pop();
  edges[0].source_evidence[0].excerpt = "Test-only unsupported quotation";
  edges.push({
    ...structuredClone(edges.find((e) => e.source === "REQ-001")),
    source: "REQ-003",
  });
  const expected = new Map(ground_truth.relationships.map((e) => [key(e), e]));
  const predicted = new Map(edges.map((e) => [key(e), e]));
  const comparison = {
    edges: [...new Set([...expected.keys(), ...predicted.keys()])].map((k) => ({
      key: k.split("|"),
      status: !predicted.has(k)
        ? "missing"
        : !expected.has(k)
          ? "false_positive"
          : k === key(edges[0])
            ? "correct_bad_evidence"
            : "correct",
      model_edge: predicted.get(k) || null,
      ground_truth_edge: expected.get(k) || null,
      exists_in_ground_truth: expected.has(k),
    })),
  };
  const runs = config.models.slice(0, 3).map((m, idx) => {
    const results = allTasks.map((task) => ({
      id: `task-${idx}-${task}`,
      task,
      difficulty: task === "one_hop" ? "L2_ONE_HOP" : "L1_DIRECT",
      error: null,
      raw_response: { id: "browser-test-only", model: m.model },
      tokens: { input: 100, output: 50 },
      cost_usd: null,
      prompt: "Test-only prompt",
      prompt_hash: "test-hash",
      parsed_output:
        task === "entity_extraction"
          ? ground_truth.entities
          : task === "relationship_extraction"
            ? { nodes, edges }
            : {
                scenarios: ground_truth.change_scenarios
                  .filter(
                    (s) =>
                      s.difficulty ===
                      (task === "one_hop" ? "L2_ONE_HOP" : "L1_DIRECT"),
                  )
                  .map((s) => ({
                    scenario_id: s.id,
                    impacts: s.affected_requirements.map((req) => ({
                      requirement_id: req,
                      explanation: s.expected_reason,
                      source_evidence: s.source_evidence,
                    })),
                  })),
              },
      metrics: { scenarios: [] },
    }));
    return {
      id: `browser-test-${idx}`,
      status: "completed",
      created_at: "2026-09-27T12:00:00Z",
      metadata: {
        ...m,
        tasks: allTasks,
        repetition: 1,
        experiment: "first_pass",
        input_mode: "controlled_text",
        origin: "provider_api",
        comparison_hash: "test-cohort",
      },
      snapshot: { dataset },
      results,
    };
  });
  const summary = config.models.slice(0, 3).flatMap((m, index) =>
    allTasks.map((task) => ({
      ...m,
      task,
      n: 3,
      difficulty: task === "one_hop" ? "L2_ONE_HOP" : "L1_DIRECT",
      experiment: "first_pass",
      input_mode: "controlled_text",
      comparison_hash: "test-cohort",
      settings_hash: `test-settings-${index}`,
      feedback_hash: "empty",
      metrics: Object.fromEntries(
        [
          "entity_precision",
          "entity_recall",
          "entity_f1",
          "relationship_precision",
          "relationship_recall",
          "relationship_f1",
          "impact_precision",
          "impact_recall",
          "impact_f1",
          "unsupported_fact_rate",
          "unsupported_relationship_rate",
          "critical_impact_miss_rate",
        ].map((k) => [
          k,
          stats(k.includes("rate") ? index * 0.1 : 0.9 - index * 0.1),
        ]),
      ),
      consistency: index ? 1 / 3 : 1,
      latency_seconds: stats(2 + index),
      known_input_tokens: 300,
      known_output_tokens: 150,
      token_usage_complete: true,
      average_cost_per_task_usd: null,
    })),
  );
  return {
    runs,
    summary,
    graph: {
      model: { nodes, edges },
      ground_truth: { nodes, edges: ground_truth.relationships },
      comparison,
    },
  };
}

export async function interceptApi(
  page,
  {
    populated = false,
    keyed = false,
    confirmed = false,
    allKeyed = false,
    creditFailure = false,
  } = {},
) {
  const records = testRecords();
  const feedback = [];
  const writes = [];
  let executions = [];
  const bench = {
    dataset: structuredClone(dataset),
    edit_hash: "browser-edit-hash",
    prompts: Object.fromEntries(
      ["common", ...allTasks].map((key) => [
        key,
        fs.readFileSync(`${root}prompts/${key}.txt`, "utf8"),
      ]),
    ),
    review: {
      items: {},
      accepted: 0,
      rejected: 0,
      pending: 58,
      total: 58,
      dataset_hash: "browser-dataset-hash",
    },
    history: { revisions: [], reviews: [] },
  };
  const updateReview = () => {
    const r = Object.values(bench.review.items);
    bench.review.accepted = r.filter((r) => r.verdict === "accepted").length;
    bench.review.rejected = r.filter((r) => r.verdict === "rejected").length;
    bench.review.pending = 58 - r.length;
  };
  const connections = config.models.map((m, i) => ({
    provider: m.provider,
    model: m.model,
    env_name: {
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      gemini: "GOOGLE_API_KEY",
    }[m.provider],
    key_present: allKeyed || (keyed && m.provider === "openai"),
    ready: confirmed && (allKeyed || (keyed && i === 0)),
    api_responded: confirmed && (allKeyed || (keyed && i === 0)),
    generation_confirmed: confirmed && (allKeyed || (keyed && i === 0)),
    status:
      confirmed && (allKeyed || (keyed && i === 0))
        ? "ready"
        : allKeyed || (keyed && m.provider === "openai")
          ? "unverified"
          : "missing_api_key",
    diagnostic: {
      title:
        allKeyed || (keyed && m.provider === "openai")
          ? "Falta verificar a conexão"
          : "Falta a chave",
      action: "Preencha o .env e verifique a conexão.",
    },
  }));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api", "");
    let response;
    if (request.method() !== "GET")
      writes.push({ path, body: request.postDataJSON() });
    if (path === "/config")
      response = {
        ...config,
        key_available: {
          openai: allKeyed || keyed,
          anthropic: allKeyed,
          gemini: allKeyed,
        },
        connections,
      };
    else if (path === "/connections/verify") {
      const selected = request.postDataJSON().models.map((i) => connections[i]);
      const blocked = selected.some((c) => !c.key_present);
      let calls = 0;
      if (!blocked)
        selected.forEach((c) => {
          if (c.ready && !request.postDataJSON().force) return;
          calls++;
          Object.assign(c, {
            ready: !creditFailure,
            api_responded: true,
            generation_confirmed: !creditFailure,
            checked_at: "2026-09-27T12:00:00Z",
            status: creditFailure ? "billing_error" : "ready",
            diagnostic: creditFailure
              ? {
                  title: "Saldo ou faturamento bloqueado",
                  action:
                    "Recarregue os créditos ou habilite o faturamento no painel do provedor.",
                  help_url:
                    "https://platform.openai.com/settings/organization/billing/overview",
                }
              : null,
          });
        });
      response = {
        checks: selected,
        blocked,
        api_calls: calls,
        message: blocked
          ? "Faltam chaves no .env. Nenhuma chamada foi enviada."
          : "Verificação concluída.",
      };
    } else if (path === "/documents") response = bench.dataset;
    else if (path === "/benchmark") response = bench;
    else if (path === "/benchmark/preview") {
      const query = new URL(request.url()).searchParams;
      const task = query.get("task"),
        level = query.get("difficulty");
      const documents = structuredClone(bench.dataset.documents);
      if (level === "L2_ONE_HOP") {
        delete documents.PROJECT["PROJECT-05"];
        delete documents.PROJECT["PROJECT-06"];
      }
      const input = {
        documents,
        system_config: bench.dataset.system_config,
        scope: bench.dataset.scope,
        sources: bench.dataset.sources.map((s) =>
          Object.fromEntries(
            Object.entries(s).filter(
              ([k]) => k !== "parameters" || s.document_id.startsWith("ALT-"),
            ),
          ),
        ),
        scenarios: ["entity_extraction", "relationship_extraction"].includes(
          task,
        )
          ? []
          : bench.dataset.ground_truth.change_scenarios
              .filter((s) => s.difficulty === level)
              .map((s) =>
                Object.fromEntries(
                  [
                    "id",
                    "change_type",
                    "difficulty",
                    "split",
                    "description",
                    "changed_entity",
                  ].map((k) => [k, s[k]]),
                ),
              ),
        confirmed_feedback: [],
      };
      const instructions = {
        common: bench.prompts.common,
        task: bench.prompts[task],
      };
      response = {
        task,
        difficulty: level,
        input_mode: query.get("input_mode"),
        instructions,
        input,
        output_schema: {},
        prompt_hash: "browser-preview-hash",
        prompt:
          instructions.common +
          "\n" +
          instructions.task +
          "\nINPUT\n" +
          JSON.stringify(input),
      };
    } else if (path === "/benchmark/review") {
      response = {
        ...request.postDataJSON(),
        created_at: "2026-09-27T12:00:00Z",
      };
      bench.review.items[response.item_key] = response;
      bench.history.reviews.push(response);
      updateReview();
    } else if (path === "/benchmark/edit") {
      const edit = request.postDataJSON();
      if (edit.kind === "relationship")
        Object.assign(
          bench.dataset.ground_truth.relationships.find(
            (e) => key(e) === edit.item_id,
          ),
          edit.value,
        );
      if (edit.kind === "document") {
        const [id, loc] = edit.item_id.split(":");
        bench.dataset.documents[id][loc] = edit.value;
      }
      if (edit.kind === "prompt") bench.prompts[edit.item_id] = edit.value;
      if (edit.kind === "configuration")
        bench.dataset.system_config[edit.item_id] = edit.value;
      bench.dataset.manifest.dataset_version = `1.1.0+local.${bench.history.revisions.length + 1}`;
      bench.review.items = {};
      updateReview();
      response = {
        id: bench.history.revisions.length + 1,
        kind: edit.kind,
        item_id: edit.item_id,
        note: edit.note,
        created_at: "2026-09-27T12:00:00Z",
        dataset_version: bench.dataset.manifest.dataset_version,
      };
      bench.history.revisions.push(response);
    } else if (path === "/runs" && request.method() === "POST") {
      executions = [
        {
          id: "test-failed-attempt",
          model: config.models[0].model,
          provider: "openai",
          status: "failed",
          created_at: "2026-09-27T12:00:00Z",
          repetition: 1,
          failure: {
            category: "invalid_key",
            diagnostic: {
              title: "Chave inválida ou revogada",
              action: "Confira a chave no .env.",
            },
          },
        },
      ];
      response = { run_ids: ["test-failed-attempt"] };
    } else if (path === "/runs")
      response = populated
        ? records.runs.map((r) => ({
            id: r.id,
            status: r.status,
            created_at: r.created_at,
            ...r.metadata,
          }))
        : [];
    else if (path === "/summary") response = populated ? records.summary : [];
    else if (path === "/executions") response = executions;
    else if (path === "/feedback" && request.method() === "POST") {
      const data = {
        ...request.postDataJSON(),
        id: `feedback-${feedback.length}`,
      };
      feedback.push(data);
      response = data;
    } else if (path === "/feedback") response = feedback;
    else if (path.startsWith("/feedback/")) {
      const f = feedback.find((f) => path.endsWith(f.id));
      Object.assign(f, request.postDataJSON());
      response = f;
    } else if (path === "/reviews")
      response = { id: "browser-review", ...request.postDataJSON() };
    else if (path.startsWith("/runs/")) {
      const run = records.runs.find((r) => r.id === path.split("/")[2]);
      response = path.endsWith("/graph")
        ? { ...records.graph, run_id: run.id, model_name: run.metadata.model }
        : path.endsWith("/reviews")
          ? []
          : run;
    }
    if (response === undefined) {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Unmocked test route" }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
  return { writes, feedback };
}
