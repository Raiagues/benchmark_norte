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

test("inspector separates literal input, model output and reference into readable views with explicit red summary", async ({
  page,
}) => {
  const state = completedState(),
    detail = relationshipDetail(state.calls[0]);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await routes(page, state, detail);
  await page.goto("/#live/ui-live-run");
  const lane = page.getByTestId("model-lane");
  await expect(lane.locator("header .state-pill")).toHaveClass(/bad/);
  await expect(lane.locator(".model-answer-errors")).toContainText(
    "1 respostas com erros",
  );
  await lane.locator(".model-answer-errors").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".inspector-story-grid > button")).toHaveCount(3);
  await expect(dialog.locator(".story-verdict")).toHaveClass(/bad/);
  await expect(dialog.locator(".story-verdict")).toContainText(
    "Item esperado não identificado",
  );
  await dialog.getByRole("button", { name: "Entrada", exact: true }).click();
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
  await dialog.getByRole("button", { name: "Resposta", exact: true }).click();
  await expect(dialog.locator(".inspector-table").first()).toContainText(
    "Model-only explanation",
  );
  await expect(dialog.locator(".inspector-caption")).toContainText(
    "produzida pelo modelo",
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
  await dialog.getByRole("button", { name: "Resposta", exact: true }).click();
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
  await expect(dialog.locator(".story-verdict")).toContainText("Sem avaliação");
  await expect(dialog.locator(".inspector-story-grid")).toContainText(
    "Entrada prevista",
  );
  await dialog.getByRole("button", { name: "Entrada", exact: true }).click();
  await expect(dialog.locator(".inspector-caption")).toContainText(
    "envio não confirmado",
  );
  await dialog.getByRole("button", { name: "Resposta", exact: true }).click();
  await expect(dialog).toContainText(
    "Nenhuma resposta disponível nesta execução.",
  );
  await expect(dialog.locator(".inspector-table")).toHaveCount(0);
  await page
    .getByLabel("Categoria de teste", { exact: true })
    .selectOption("entity_extraction|L1_DIRECT");
  await expect(
    page.getByLabel("Repetição do resultado", { exact: true }),
  ).toHaveValue("3");
  await expect(dialog.locator(".story-verdict")).toContainText("Sem avaliação");
  expect(errors).toEqual([]);
});
