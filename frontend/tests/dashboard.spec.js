import { test, expect } from "@playwright/test";
import { interceptApi } from "./fixtures.js";

test("fresh app is empty; no placeholder scores, graphs, or runnable demo", async ({
  page,
}) => {
  const { writes } = await interceptApi(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Nenhum resultado ainda" }),
  ).toBeVisible();
  await expect(page.locator(".metric-chart")).toHaveCount(0);
  await expect(page.getByText(/synthetic|mock|demo/i)).toHaveCount(0);
  await page.getByRole("link", { name: "Grafos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nenhum grafo de modelo ainda" }),
  ).toBeVisible();
  await expect(page.locator(".react-flow")).toHaveCount(0);
  await page.getByRole("link", { name: "Alterações", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nenhuma análise de alteração ainda" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Nova avaliação/ }).click();
  await expect(
    page.getByRole("button", { name: "Iniciar avaliação" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Iniciar avaliação" }).click();
  await expect(page.getByRole("alert")).toContainText("Avaliação bloqueada");
  await expect(page.getByText("Falta a chave", { exact: true })).toHaveCount(3);
  expect(writes).toHaveLength(0);
  await page.goto("/#results");
  await page.screenshot({
    path: "test-results/empty-state.png",
    fullPage: true,
  });
});

test("failed API attempt appears only in activity, never as a benchmark result", async ({
  page,
}) => {
  const { writes } = await interceptApi(page, { keyed: true, confirmed: true });
  await page.goto("/#run");
  await page.getByRole("button", { name: "Limpar seleção" }).click();
  await page.getByRole("checkbox", { name: /GPT-6 Astra/ }).check();
  await page.getByRole("button", { name: "Iniciar avaliação" }).click();
  await expect(
    page.getByText("Falhou · nenhum resultado publicado"),
  ).toBeVisible();
  expect(writes[0].body.models).toEqual([0]);
  expect(writes[0].body).not.toHaveProperty("demo");
  await page.getByRole("link", { name: "Resultados", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nenhum resultado ainda" }),
  ).toBeVisible();
  await expect(page.locator(".metric-chart")).toHaveCount(0);
});

test("side by side graphs, model selector, evidence and explicit corrections", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { feedback, writes } = await interceptApi(page, { populated: true });
  await page.goto("/#graphs");
  await expect(
    page.getByRole("heading", { name: "Referência", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Resposta do modelo", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".react-flow")).toHaveCount(2);
  const a = await page
    .getByLabel("Grafo: Referência", { exact: true })
    .boundingBox();
  const b = await page
    .getByLabel("Grafo: Resposta do modelo", { exact: true })
    .boundingBox();
  expect(b.x).toBeGreaterThan(a.x + a.width);
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  await page
    .getByLabel("Modelo", { exact: true })
    .selectOption("anthropic|claude-fable-5-1");
  await expect(page.locator(".graph-card-heading")).toContainText([
    "Referência",
    "claude-fable-5-1",
  ]);
  await page.getByLabel("Foco", { exact: true }).selectOption("REQ-002");
  await page.getByLabel("Foco", { exact: true }).selectOption("all");
  await page.getByLabel("Foco", { exact: true }).selectOption("requirements");
  await page.getByRole("button", { name: "Só modelo", exact: true }).click();
  await expect(page.locator(".react-flow")).toHaveCount(1);
  await page.getByRole("button", { name: "Diferenças", exact: true }).click();
  await expect(page.locator(".graph-legend")).toContainText("Não identificada");
  await page.getByRole("button", { name: "Lado a lado", exact: true }).click();
  await page.screenshot({
    path: "test-results/paired-graphs.png",
    fullPage: true,
  });
  await page.getByText("Ver relações em lista", { exact: true }).click();
  await page
    .locator(".relationship-list button")
    .filter({ hasText: "Não identificada" })
    .click();
  await expect(page.getByLabel("Detalhes da seleção")).toContainText(
    "O modelo não identificou esta relação",
  );
  await expect(page.getByLabel("Detalhes da seleção")).toContainText(
    "Existe na referência",
  );
  await page.getByText("Registrar correção", { exact: true }).click();
  await page
    .getByLabel("Correção", { exact: true })
    .fill("Test-only correction stored in browser interception.");
  await page.getByLabel("Confirmo esta correção").check();
  await page
    .getByRole("button", { name: "Salvar correção", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Correção salva");
  expect(feedback[0].confirmed).toBe(true);
  expect(feedback[0].verdict).toBe("Missing relationship");
  await page.getByLabel("Fechar detalhes").click();
  await page
    .locator(".graph-card")
    .first()
    .locator(".react-flow__node")
    .first()
    .click();
  await expect(page.getByLabel("Detalhes da seleção")).toContainText(
    "Fonte da referência",
  );
  expect(writes.every((w) => w.path === "/feedback")).toBe(true);
  expect(errors).toEqual([]);
});

test("metric charts compare real-record shapes, keep levels apart, and expose raw outputs", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await interceptApi(page, { populated: true });
  await page.goto("/#results");
  await expect(page.locator(".metric-chart")).toHaveCount(6);
  await expect(
    page.getByRole("heading", { name: "Precisão", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recall", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "F1", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".metric-chart").first().locator(".chart-row"),
  ).toHaveCount(3);
  await page
    .getByRole("checkbox", { name: "gpt-6-astra", exact: true })
    .uncheck();
  await expect(
    page.locator(".metric-chart").first().locator(".chart-row"),
  ).toHaveCount(2);
  await page
    .getByRole("checkbox", { name: "gpt-6-astra", exact: true })
    .check();
  await page
    .getByLabel("Dificuldade", { exact: true })
    .selectOption("L2_ONE_HOP");
  await expect(page.getByLabel("Tarefa", { exact: true })).toHaveValue(
    "one_hop",
  );
  await expect(page.locator(".overview-panel")).not.toContainText(
    "Extração F1",
  );
  await page
    .getByLabel("Dificuldade", { exact: true })
    .selectOption("L1_DIRECT");
  await page.screenshot({
    path: "test-results/metric-charts.png",
    fullPage: true,
  });
  await page
    .getByText("Resposta original, métricas e informações da execução", {
      exact: true,
    })
    .click();
  await expect(page.locator(".run-details pre").first()).toContainText(
    "browser-test-only",
  );
  await expect(
    page.getByRole("link", { name: "Baixar resposta completa" }),
  ).toHaveAttribute("href", /download$/);
  await page.getByRole("link", { name: "Alterações", exact: true }).click();
  await expect(page.locator(".scenario")).toHaveCount(9);
  await page.getByLabel("Tipo de alteração").selectOption("no_impact");
  await expect(page.locator(".scenario")).toHaveCount(2);
  await expect(page.locator(".scenario").first()).toContainText("Nenhum");
  await page.getByRole("link", { name: "Documentos", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Datasheet oficial" }),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Requisitos", exact: true }).click();
  await expect(
    page.getByText("Não são medições de hardware", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile layout stays readable without horizontal page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await interceptApi(page, { populated: true });
  for (const path of ["results", "graphs", "impact", "documents", "run"]) {
    await page.goto(`/#${path}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Carregando…", { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "test-results/mobile-run.png",
    fullPage: true,
  });
});

test("all-model selection blocks missing keys without benchmark calls", async ({
  page,
}) => {
  const { writes } = await interceptApi(page, { keyed: true, confirmed: true });
  await page.goto("/#run");
  await page.getByRole("button", { name: "Todos os modelos" }).click();
  await expect(page.locator(".model-option input:checked")).toHaveCount(6);
  await page.getByRole("button", { name: "Iniciar avaliação" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Nenhuma chamada de benchmark",
  );
  expect(writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Verificar conexões selecionadas" })
    .click();
  await expect(page.getByRole("status")).toContainText("Faltam chaves");
  expect(writes.map((w) => w.path)).toEqual(["/connections/verify"]);
  await page.screenshot({
    path: "test-results/missing-connections.png",
    fullPage: true,
  });
});

test("manual check confirms connections without results; start does not repeat it", async ({
  page,
}) => {
  const { writes } = await interceptApi(page, { allKeyed: true });
  await page.goto("/#run");
  await expect(page.locator(".model-option input:checked")).toHaveCount(3);
  await page.getByRole("button", { name: "Iniciar avaliação" }).click();
  expect(writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Verificar conexões selecionadas" })
    .click();
  await expect(
    page.getByText("✓ Pronto para avaliar", { exact: true }),
  ).toHaveCount(3);
  await page.getByRole("link", { name: "Resultados", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nenhum resultado ainda" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Nova avaliação/ }).click();
  await expect(
    page.getByText("✓ Pronto para avaliar", { exact: true }),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Iniciar avaliação" }).click();
  await expect(
    page.getByText("Falhou · nenhum resultado publicado"),
  ).toBeVisible();
  expect(writes.map((w) => w.path)).toEqual(["/connections/verify", "/runs"]);
  expect(writes[1].body.models).toEqual([0, 1, 2]);
});

test("credit error distinguishes a responding API from confirmed generation", async ({
  page,
}) => {
  const { writes } = await interceptApi(page, {
    keyed: true,
    creditFailure: true,
  });
  await page.goto("/#run");
  await page.getByRole("button", { name: "Limpar seleção" }).click();
  await page.getByRole("checkbox", { name: /GPT-6 Astra/ }).check();
  await page
    .getByRole("button", { name: "Verificar conexões selecionadas" })
    .click();
  await expect(
    page.getByText("Saldo ou faturamento bloqueado", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("✓ API respondeu", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("○ Geração confirmada", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Abrir painel do provedor" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Iniciar avaliação" }).click();
  expect(writes.map((w) => w.path)).toEqual(["/connections/verify"]);
  await page.screenshot({
    path: "test-results/credit-error.png",
    fullPage: true,
  });
});
