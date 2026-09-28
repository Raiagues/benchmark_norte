// All HTTP fixtures stay in the browser; no provider or application database writes.
import { test, expect } from "@playwright/test";
import { interceptApi, dataset } from "./fixtures.js";
import { liveFixture } from "./live-fixtures.js";

function completedState() {
  const state = liveFixture();
  const call = {
    ...state.calls[0],
    status: "COMPLETED_INCORRECT",
    stage: "COMPLETED",
    quality: "partial",
    has_result: true,
  };
  state.calls = [call];
  state.models = state.models.slice(0, 1);
  state.status = "COMPLETED";
  state.models[0].status = "Completed with answer errors";
  const ops = {
    ...state.operations,
    planned: 1,
    evaluated: 1,
    partial: 1,
    answer_errors: 1,
    interrupted: 0,
    processed: 1,
    progress: 1,
  };
  state.operations = ops;
  state.models[0].operations = ops;
  state.models[0].repetitions = [
    { ...ops, repetition: 1, execution_ids: [call.id] },
  ];
  return state;
}

async function routes(
  page,
  state,
  detail,
  preview = { eligible: 0, uncertain: 0, children: [] },
  onResume,
) {
  await interceptApi(page);
  await page.route("**/api/live**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/resume")) {
      if (route.request().method() === "POST") return onResume(route);
      return route.fulfill({ json: preview });
    }
    if (path.includes("/live-results/"))
      return route.fulfill({
        json:
          typeof detail === "function"
            ? detail(path.split("/").at(-1))
            : detail,
      });
    if (path.endsWith("/stream"))
      return route.fulfill({
        contentType: "text/event-stream",
        body: `event: snapshot\ndata: ${JSON.stringify(state)}\n\n`,
      });
    return route.fulfill({
      json: path.endsWith("/events")
        ? []
        : path === "/api/live"
          ? [state]
          : state,
    });
  });
}

function relationshipDetail(call) {
  const edge = {
    ...structuredClone(dataset.ground_truth.relationships[0]),
    reason: "Model-only explanation for this isolated UI test",
  };
  return {
    ...call,
    input_mode: "pdf_text",
    input_policy: "source_documents_v2",
    prompt_hash: "isolated-prompt-hash",
    input: {
      documents: {
        FAN: {
          "page-1": "Original PDF text for the isolated UI test",
          "page-2": "Second original page",
        },
        REQUIREMENTS: { "REQ-001": "Project requirement text" },
      },
      system_config: { fan_rail_V: 5 },
    },
    prompt:
      'Read the engineering documents.\nIdentify dependencies and cite evidence.\nRESPONSE SCHEMA\n{"isolated":true}',
    ground_truth: dataset.ground_truth,
    snapshot_metadata: {
      dataset_version: "isolated-test",
      dataset_hash: "isolated-dataset-hash",
    },
    failure_counts: { missing: 1 },
    result: {
      parsed_output: {
        nodes: dataset.ground_truth.entities.nodes,
        edges: [edge],
      },
      metrics: {
        relationship: {
          tp: 1,
          fp: 0,
          fn: 1,
          precision: 1,
          recall: 0.5,
          f1: 2 / 3,
        },
        schema_compliance_rate: 1,
      },
      tokens: { input: 20, output: 10 },
      latency_seconds: 0.5,
      cost_usd: null,
      raw_response: { isolated: "raw UI fixture" },
    },
  };
}

test("inspector separates literal input, model output and reference into readable views with explicit partial summary", async ({
  page,
}) => {
  const state = completedState(),
    detail = relationshipDetail(state.calls[0]);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await routes(page, state, detail);
  await page.goto("/#live/ui-live-run");
  const lane = page.getByTestId("model-lane");
  await expect(lane.locator("header .state-pill")).toHaveClass(/partial/);
  await expect(lane.locator(".model-answer-errors")).toContainText(
    "1 parciais · 0 incorretas",
  );
  await lane.locator(".model-answer-errors").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".result-workbench")).toBeVisible();
  await expect(dialog.locator(".evaluation-errors")).toHaveClass(/partial/);
  await expect(dialog.locator(".evaluation-errors")).toContainText(
    "Item esperado não identificado",
  );
  await dialog.getByRole("button", { name: "Entrada", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Texto enviado ao modelo", exact: true })
    .click();
  await expect(dialog.locator(".document-sheet")).toContainText(
    "Original PDF text for the isolated UI test",
  );
  await dialog.locator(".document-sheet select").selectOption("page-2");
  await expect(dialog.locator(".document-sheet")).toContainText(
    "Second original page",
  );
  await dialog.getByRole("button", { name: "Prompt", exact: true }).click();
  await expect(dialog.locator(".document-sheet")).toContainText(
    "Identify dependencies and cite evidence.",
  );
  await expect(dialog.locator(".document-sheet")).not.toContainText(
    'isolated":true',
  );
  await dialog
    .getByRole("button", { name: "Resposta e avaliação", exact: true })
    .click();
  await dialog.locator(".compact-results tbody tr button").first().click();
  await expect(dialog.locator(".result-expanded")).toContainText(
    "Model-only explanation",
  );
  await expect(dialog.locator(".inspector-caption")).toContainText(
    "RESPOSTA DO MODELO × GABARITO",
  );
  await dialog.getByRole("button", { name: "Gabarito", exact: true }).click();
  await expect(dialog.locator(".inspector-caption")).toContainText(
    "somente avaliação",
  );
  await expect(dialog).not.toContainText("Model-only explanation");
  await dialog.getByRole("button", { name: "Métricas", exact: true }).click();
  await expect(dialog.locator(".inspector-metric-grid")).toContainText("1 / 2");
  await expect(dialog.locator(".inspector-metric-grid")).toContainText("50%");
  await expect(dialog.locator(".inspector-rate-grid")).toContainText(
    "Estrutura válida",
  );
  await dialog
    .getByRole("button", { name: "Downloads técnicos", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "↓ Resposta original da API",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(dialog.locator("pre")).toHaveCount(0);
  await page.screenshot({
    path: "test-results/visual-inspector-downloads.png",
  });
  expect(errors).toEqual([]);
});

test("impact output is a model-owned requirement list and never substitutes missing responses with ground truth", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const state = completedState();
  state.calls[0].task = "change_impact";
  state.calls[0].scenario_ids = ["CHG-001", "CHG-008"];
  const detail = relationshipDetail(state.calls[0]);
  detail.result.parsed_output = {
    scenarios: [
      {
        scenario_id: "CHG-001",
        impacts: [
          {
            requirement_id: "REQ-001",
            dependency: {
              source: "REQ-001",
              relationship: "constrains",
              target: "P-FAN-CURRENT",
            },
            explanation: "Isolated model answer: review the current limit.",
            source_evidence: [],
          },
        ],
      },
      { scenario_id: "CHG-008", impacts: [] },
    ],
  };
  await routes(page, state, detail);
  await page.goto("/#live/ui-live-run");
  await page.locator(".model-answer-errors").click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Resposta e avaliação", exact: true })
    .click();
  await expect(dialog.locator(".model-impact-answer")).toHaveCount(1);
  await expect(dialog.locator(".model-impact-answer")).toContainText("REQ-001");
  await expect(dialog.locator(".model-impact-answer")).not.toContainText(
    "REQ-002",
  );
  await page
    .getByLabel("Cenário da resposta", { exact: true })
    .selectOption("CHG-008");
  await expect(dialog.locator(".model-no-impact")).toContainText(
    "nenhum requisito",
  );
  await expect(dialog.locator(".model-impact-answer")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("resume preview makes no mutation; confirmation shows preserved answers and preflight failure without starting anything", async ({
  page,
}) => {
  const state = liveFixture();
  let posts = 0;
  const preview = {
    eligible: 2,
    uncertain: 1,
    completed_preserved: 3,
    children: [],
    context_changed: true,
    dataset_version: "isolated-new-version",
    token: "a".repeat(64),
    models: [
      { provider: "openai", model: "gpt-6-astra", depth: "high", calls: 2 },
    ],
  };
  await routes(page, state, null, preview, async (route) => {
    posts++;
    expect(route.request().postDataJSON()).toEqual({
      confirmed: true,
      token: preview.token,
    });
    await route.fulfill({
      status: 400,
      json: { detail: "Chave ausente: provedor não confirmado" },
    });
  });
  await page.goto("/#live/ui-live-run");
  await page
    .getByRole("button", { name: "Retomar pendentes · 2", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(
    "3 respostas concluídas serão preservadas",
  );
  await expect(dialog).toContainText("1 chamadas têm envio anterior incerto");
  await expect(dialog).toContainText("sem as pistas antigas");
  expect(posts).toBe(0);
  await dialog
    .getByRole("button", { name: "Confirmar retomada", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Chave ausente");
  expect(posts).toBe(1);
  await expect(page).toHaveURL(/#live\/ui-live-run$/);
});

test("confirmed continuation opens its persisted run and completed work cannot be resumed", async ({
  page,
}) => {
  const state = liveFixture();
  let posts = 0;
  const preview = {
    eligible: 1,
    uncertain: 0,
    completed_preserved: 2,
    children: [],
    context_changed: false,
    dataset_version: "isolated-test",
    token: "b".repeat(64),
    models: [
      { provider: "openai", model: "gpt-6-astra", depth: "high", calls: 1 },
    ],
  };
  await routes(page, state, null, preview, async (route) => {
    posts++;
    state.id = "isolated-continuation";
    state.resumed_from = "ui-live-run";
    preview.eligible = 0;
    await route.fulfill({ status: 202, json: { batch_id: state.id } });
  });
  await page.goto("/#live/ui-live-run");
  await page
    .getByRole("button", { name: "Retomar pendentes · 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar retomada", exact: true })
    .click();
  await expect(page).toHaveURL(/#live\/isolated-continuation$/);
  await expect(
    page.getByRole("button", { name: "Retomar pendentes · 0", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId("model-lane")).toHaveCount(3);
  expect(posts).toBe(1);
});

test("sparse continuation selects only existing repetitions and shows no invented output for interrupted work", async ({
  page,
}) => {
  const state = liveFixture();
  state.models = state.models.slice(0, 1);
  const first = { ...state.calls[0], repetition: 2 };
  const second = {
    ...first,
    id: "isolated-sparse-call",
    repetition: 3,
    task: "entity_extraction",
  };
  state.calls = [first, second];
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await routes(page, state, (id) => ({
    ...relationshipDetail(state.calls.find((c) => c.id === id)),
    result: null,
    failure_counts: {},
  }));
  await page.goto("/#live/ui-live-run");
  await page.locator(".model-title-button").click();
  const dialog = page.getByRole("dialog");
  await expect(
    page.getByLabel("Repetição do resultado", { exact: true }),
  ).toHaveValue("2");
  await expect(dialog.locator(".inspector-empty")).toContainText(
    "Sem resposta avaliada",
  );
  await dialog.getByRole("button", { name: "Entrada", exact: true }).click();
  await expect(dialog.locator(".inspector-caption")).toContainText(
    "envio não confirmado",
  );
  await dialog
    .getByRole("button", { name: "Resposta e avaliação", exact: true })
    .click();
  await expect(dialog).toContainText("Sem resposta avaliada.");
  await expect(dialog.locator(".inspector-empty")).not.toContainText(
    "falha técnica",
  );
  await expect(dialog.locator(".inspector-table")).toHaveCount(0);
  await page
    .getByLabel("Categoria de teste", { exact: true })
    .selectOption("entity_extraction|L1_DIRECT");
  await expect(
    page.getByLabel("Repetição do resultado", { exact: true }),
  ).toHaveValue("3");
  await expect(dialog.locator(".inspector-empty")).toContainText(
    "Sem resposta avaliada",
  );
  expect(errors).toEqual([]);
});

test("resume can explicitly recheck saved billing failure without starting or repeating benchmarks", async ({
  page,
}) => {
  const state = liveFixture();
  const preview = {
    eligible: 6,
    uncertain: 1,
    completed_preserved: 18,
    children: [],
    dataset_version: "isolated-test",
    token: "c".repeat(64),
    models: [
      {
        provider: "anthropic",
        model: "claude-fable-5-1",
        depth: "high",
        calls: 6,
      },
    ],
  };
  let resumes = 0,
    verifications = 0;
  await routes(page, state, null, preview, async (route) => {
    resumes++;
    await route.fulfill({
      status: 409,
      json: { detail: "Isolated resume guard" },
    });
  });
  let check = {
    provider: "anthropic",
    model: "claude-fable-5-1",
    depth: "high",
    ready: false,
    status: "billing_error",
    checked_at: "2026-09-27T21:37:08Z",
    diagnostic: { detail: "Isolated saved credit failure" },
  };
  await page.route("**/api/connections/status", (route) =>
    route.fulfill({ json: [check] }),
  );
  await page.route("**/api/connections/verify", async (route) => {
    verifications++;
    expect(route.request().postDataJSON()).toEqual({
      models: [1],
      depths: { 1: "high" },
      force: false,
    });
    // A concurrent benchmark must block the check, and must never resume implicitly.
    if (verifications === 1)
      return route.fulfill({
        status: 409,
        json: {
          detail:
            "Aguarde a operação em andamento antes de verificar conexões.",
        },
      });
    check = {
      ...check,
      ready: true,
      status: "ready",
      checked_at: "2026-09-27T23:00:00Z",
    };
    await route.fulfill({
      json: { checks: [check], api_calls: 1, blocked: false },
    });
  });
  await page.goto("/#live/ui-live-run");
  await page
    .getByRole("button", { name: "Retomar pendentes · 6", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const panel = dialog.getByRole("region", { name: "Validação da conexão" });
  await expect(panel).toContainText("Isolated saved credit failure");
  await expect(panel).toContainText("Última resposta");
  expect(verifications).toBe(0);
  expect(resumes).toBe(0);
  await panel
    .getByRole("button", { name: "Verificar conexão novamente" })
    .click();
  await expect(panel.getByRole("alert")).toContainText("Aguarde a operação");
  expect(resumes).toBe(0);
  await panel
    .getByRole("button", { name: "Verificar conexão novamente" })
    .click();
  await expect(panel.getByRole("status")).toContainText("Conexão confirmada");
  await expect(panel).not.toContainText("Isolated saved credit failure");
  expect(verifications).toBe(2);
  expect(resumes).toBe(0);
  await dialog
    .getByRole("button", { name: "Confirmar retomada", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Isolated resume guard",
  );
  expect(resumes).toBe(1);
});

test("rejected output identifies both duplicate impacts without inventing evaluation or fixing the saved answer", async ({
  page,
}) => {
  const state = liveFixture({ failed: true });
  state.calls[0].task = "impact_explanation";
  state.calls[0].error = "invalid_structured_output";
  const detail = {
    ...relationshipDetail(state.calls[0]),
    result: null,
    failure_counts: {},
    call: {
      text: JSON.stringify({
        scenarios: [
          {
            scenario_id: "CHG-004",
            impacts: [
              {
                requirement_id: "REQ-002",
                dependency: {
                  source: "REQ-002",
                  relationship: "depends_on",
                  target: "P-FAN-SPEED",
                },
              },
              {
                requirement_id: "req_2",
                dependency: {
                  source: "REQ-002",
                  relationship: "verified_by",
                  target: "V-SPEED",
                },
              },
            ],
          },
        ],
      }),
    },
  };
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await routes(page, state, detail);
  await page.goto("/#live/ui-live-run");
  await page.locator(".model-title-button").click();
  const dialog = page.getByRole("dialog"),
    rejected = dialog.locator(".rejected-output");
  await expect(rejected).toContainText(
    "CHG-004 · REQ-002 · 2 entradas recebidas; esperado: 1",
  );
  await expect(rejected).toContainText("duplicate_impact");
  await expect(rejected.locator("tbody tr")).toHaveCount(2);
  await expect(rejected.locator("tbody tr").nth(0)).toContainText(
    "P-FAN-SPEED",
  );
  await expect(rejected.locator("tbody tr").nth(1)).toContainText("V-SPEED");
  await expect(rejected).toContainText("sem nota de qualidade");
  await expect(dialog.locator(".result-workbench")).toHaveCount(0);
  await expect(dialog.locator("pre")).toHaveCount(0);
  // Rejected content can also contain wrong field types. Keep the inspector usable.
  const malformed = JSON.parse(detail.call.text);
  malformed.scenarios[0].impacts[0].dependency.target = { invalid: "object" };
  detail.call.text = JSON.stringify(malformed);
  await page.reload();
  await page.locator(".model-title-button").click();
  await expect(
    page.getByRole("dialog").locator(".rejected-output tbody tr").first(),
  ).toContainText("—");
  expect(errors).toEqual([]);
});

test("compact output filters, evaluated item drilldown and diagram export use preserved response data", async ({
  page,
}) => {
  const state = completedState(),
    detail = relationshipDetail(state.calls[0]);
  const edge = detail.result.parsed_output.edges[0];
  detail.comparison = {
    edges: [
      {
        key: [edge.source, edge.relationship, edge.target],
        model_edge: edge,
        ground_truth_edge: edge,
        status: "correct_bad_evidence",
      },
    ],
  };
  detail.result.metrics.relationship.correct = [
    [edge.source, edge.relationship, edge.target],
  ];
  await routes(page, state, detail);
  await page.goto("/#live/ui-live-run");
  await page.locator(".model-title-button").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".answer-row-partial")).toHaveCount(1);
  await dialog
    .getByLabel("Filtrar avaliação", { exact: true })
    .selectOption("incorrect");
  await expect(dialog.locator(".compact-results")).toContainText("Nenhum item");
  await dialog
    .getByLabel("Filtrar avaliação", { exact: true })
    .selectOption("partial");
  await dialog
    .getByRole("button", { name: "Diagramas lado a lado", exact: true })
    .click();
  await expect(dialog.locator(".graph-canvas")).toHaveCount(2);
  const downloaded = page.waitForEvent("download");
  await dialog
    .getByRole("button", {
      name: "Baixar diagrama do modelo (SVG)",
      exact: true,
    })
    .click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toContain("-model.svg");
  const stream = await file.createReadStream();
  let svg = "";
  for await (const chunk of stream) svg += chunk;
  expect(svg).toContain(edge.target);
  expect(svg).toContain("#a16b00");
  await dialog.getByRole("button", { name: "Métricas", exact: true }).click();
  await dialog.locator(".inspector-metric-grid summary").first().click();
  await expect(
    dialog.locator(".inspector-metric-grid details").first(),
  ).toContainText("Itens corretos ÷ itens previstos");
  await dialog
    .getByRole("button", { name: "Inspecionar itens e evidências" })
    .first()
    .click();
  await expect(dialog.locator(".result-workbench")).toBeVisible();
});

test("manual disagreement persists separately and export includes only selected results", async ({
  page,
}) => {
  const state = completedState(),
    detail = relationshipDetail(state.calls[0]);
  let reviews = [];
  await routes(page, state, detail);
  await page.route("**/api/result-reviews**", async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.result_id).toBe(detail.id);
      reviews.push({
        ...body,
        id: "local-review",
        created_at: "2026-09-27T00:00:00Z",
      });
      return route.fulfill({ json: reviews.at(-1) });
    }
    return route.fulfill({ json: reviews });
  });
  await page.goto("/#live/ui-live-run");
  await page.locator(".model-title-button").click();
  let dialog = page.getByRole("dialog");
  await dialog.locator(".result-review summary").last().click();
  await dialog
    .getByLabel("Tipo de revisão", { exact: true })
    .selectOption("disagree");
  await dialog
    .getByLabel("Comentário ou sugestão", { exact: true })
    .fill("A relação precisa de revisão humana.");
  await dialog
    .getByRole("button", { name: "Salvar revisão", exact: true })
    .click();
  await expect(dialog.locator(".result-review blockquote")).toContainText(
    "A relação precisa",
  );
  await page.keyboard.press("Escape");
  await page.locator(".model-title-button").click();
  dialog = page.getByRole("dialog");
  await dialog.locator(".result-review summary").last().click();
  await expect(dialog.locator(".result-review blockquote")).toContainText(
    "A relação precisa",
  );
  await expect(dialog.locator(".detail-meta .state-pill")).toContainText(
    "Parcialmente correta",
  );
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Exportar resultados", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Abrir relatório (0)", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Selecionar todas as respostas", exact: true })
    .click();
  const popup = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Abrir relatório (1)", exact: true })
    .click();
  const report = await popup;
  await expect(
    report.getByRole("heading", { name: /Resultados selecionados/ }),
  ).toBeVisible();
  await expect(report.locator("section.result")).toHaveCount(1);
  await expect(report.locator("section.result")).toContainText(
    detail.prompt_hash,
  );
  expect(reviews).toHaveLength(1);
  await report.close();
});

test("new attempts require explicit selection and send only the selected execution", async ({
  page,
}) => {
  const state = completedState(),
    detail = relationshipDetail(state.calls[0]);
  await routes(page, state, detail);
  let posts = [];
  await page.route("**/api/live/*/retry", (route) => {
    if (route.request().method() === "POST") {
      posts.push(route.request().postDataJSON());
      return route.fulfill({
        status: 400,
        json: { detail: "Isolated preflight refusal" },
      });
    }
    return route.fulfill({
      json: {
        token: "a".repeat(64),
        dataset_version: "isolated",
        calls: state.calls,
      },
    });
  });
  await page.goto("/#live/ui-live-run");
  await page
    .getByRole("button", { name: "Selecionar novas tentativas", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", {
      name: "Confirmar novas chamadas",
      exact: true,
    }),
  ).toBeDisabled();
  expect(posts).toHaveLength(0);
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Confirmar novas chamadas", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Isolated preflight refusal",
  );
  expect(posts).toEqual([
    { confirmed: true, token: "a".repeat(64), selected: [state.calls[0].id] },
  ]);
});
