import { test, expect } from "@playwright/test";
import { interceptApi, dataset } from "./fixtures.js";
import { liveFixture } from "./live-fixtures.js";

async function liveRoutes(page, initial) {
  let state = structuredClone(initial),
    stops = 0;
  await page.route("**/api/live**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/stop")) {
      stops++;
      state.status = "INTERRUPTED_BY_USER";
      state.stop_requested = true;
      state.calls.forEach((c) => {
        c.status = "INTERRUPTED";
        c.stage = "INTERRUPTED";
      });
      state.operations.interrupted = state.calls.length;
      state.operations.remaining = 0;
      state.operations.running = 0;
      state.operations.queued = 0;
      state.last_event_id++;
      state.models.forEach((m) => {
        m.status = "Interrupted";
        m.operations.interrupted = 3;
        m.operations.remaining = 0;
      });
    }
    if (path.endsWith("/stream"))
      return route.fulfill({
        contentType: "text/event-stream",
        body: `id: ${state.last_event_id}\nevent: snapshot\ndata: ${JSON.stringify(state)}\n\n`,
      });
    return route.fulfill({
      json: path.endsWith("/events")
        ? []
        : path === "/api/live"
          ? [state]
          : state,
    });
  });
  return { state: () => state, stops: () => stops };
}

test("live view groups repetitions into one card per model, exposes every model, and never fabricates quality", async ({
  page,
}) => {
  await interceptApi(page);
  const fixture = liveFixture({ running: true });
  await liveRoutes(page, fixture);
  await page.goto("/#live/ui-live-run");
  await expect(page.getByTestId("model-lane")).toHaveCount(3);
  for (const m of fixture.models)
    await expect(
      page
        .getByTestId("model-lane")
        .getByRole("heading", { name: m.model, exact: true }),
    ).toBeVisible();
  await expect(page.locator(".repetition-dots button")).toHaveCount(9);
  await expect(page.locator(".live-page .pager")).toHaveCount(0);
  await expect(page.locator("progress")).toHaveAttribute("value", "0");
  await page.waitForTimeout(1200);
  await expect(page.locator("progress")).toHaveAttribute("value", "0");
  await expect(page.locator(".quality-stat strong").first()).toHaveText("—");
  await expect(
    page.getByText("Nenhuma resposta avaliada ainda.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("model-lane")).toHaveCount(3);
  await expect(page.locator(".active-execution")).toHaveCount(1);
  await expect(
    page.locator('.observable-pipeline [data-observed="true"]'),
  ).toHaveCount(0);
  await page.screenshot({ path: "test-results/live-three-models.png" });
});

test("launch inputs explain actual documents and withheld reference without calling providers", async ({
  page,
}) => {
  const { writes } = await interceptApi(page);
  await page.goto("/#run");
  await page
    .getByRole("button", { name: "Entradas e instruções", exact: true })
    .click();
  await expect(page.locator(".launch-artifacts a")).toHaveCount(6);
  await expect(page.locator(".launch-inputs")).toContainText("NF-A4x10 5V");
  await expect(page.locator(".launch-inputs")).toContainText(
    "sem respostas do gabarito",
  );
  await page
    .getByRole("link", { name: "Configuração e hipóteses", exact: true })
    .click();
  await expect(page.locator(".config-cards article")).toHaveCount(6);
  expect(writes).toHaveLength(0);
});

test("stopping requires confirmation and keeps the persisted partial run visible after refresh", async ({
  page,
}) => {
  await interceptApi(page);
  const controls = await liveRoutes(page, liveFixture({ running: true }));
  await page.goto("/#live/ui-live-run");
  await page
    .getByRole("button", { name: "Interromper avaliação", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("serão preservados");
  expect(controls.stops()).toBe(0);
  await page
    .getByRole("button", { name: "Continuar avaliação", exact: true })
    .click();
  expect(controls.stops()).toBe(0);
  await page
    .getByRole("button", { name: "Interromper avaliação", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar interrupção", exact: true })
    .click();
  expect(controls.stops()).toBe(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".run-overview")).toContainText(
    "Interrompida pelo usuário",
  );
  await expect(page.locator("progress")).toHaveAttribute("value", "0");
  await expect(
    page
      .locator(".run-overview .live-stat")
      .filter({ hasText: "Interrompidas" }),
  ).toContainText("9");
});

test("input explorer distinguishes original PDFs, normalized text, project requirements, assumptions and ground truth", async ({
  page,
}) => {
  await interceptApi(page);
  await page.goto("/#inputs");
  await expect(
    page.getByText("PDF original não disponível localmente", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".document-workspace")).toContainText(
    "FONTE DO FABRICANTE",
  );
  await page
    .getByRole("button", { name: "Fatos normalizados", exact: true })
    .click();
  await expect(page.locator(".document-workspace")).toContainText(
    "Não é o PDF nem uma resposta do modelo",
  );
  await page.getByRole("button", { name: "Requisitos", exact: true }).click();
  await expect(page.locator(".requirements-explorer tbody tr")).toHaveCount(5);
  await page.getByLabel("Buscar requisito", { exact: true }).fill("REQ-004");
  await expect(page.locator(".requirements-explorer tbody tr")).toHaveCount(1);
  await expect(page.locator(".requirement-detail")).toContainText(
    "1.8 to 5.5 V",
  );
  await page.getByLabel("Buscar requisito", { exact: true }).fill("");
  await page.getByLabel("Componente", { exact: true }).selectOption("FAN");
  await expect(page.locator(".requirements-explorer tbody tr")).toHaveCount(2);
  await page.getByLabel("Componente", { exact: true }).selectOption("");
  await page
    .getByLabel("Categoria", { exact: true })
    .selectOption({ label: "Controle" });
  await expect(page.locator(".requirements-explorer tbody tr")).toHaveCount(1);
  await page
    .getByLabel("Buscar requisito", { exact: true })
    .fill("no matching requirement");
  await expect(
    page.getByText("Nenhum requisito corresponde aos filtros."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Configuração", exact: true }).click();
  await expect(page.locator(".config-cards article")).toHaveCount(6);
  await expect(page.locator(".config-cards")).toContainText(
    "Hipótese do benchmark",
  );
  await expect(
    page.getByText("São escolhas do projeto usadas como entrada.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cenários", exact: true }).click();
  await page
    .getByLabel("Tipo de mudança", { exact: true })
    .selectOption("no_impact");
  await expect(page.locator(".scenario-detail")).toContainText("CHG-008");
  await expect(page.locator(".scenario-detail")).toContainText(
    "Ainda não executado",
  );
  await expect(page.locator(".ground-truth-drawer summary")).toContainText(
    "não enviado ao modelo",
  );
});

// A tiny original PDF created solely inside the intercepted test response.
function isolatedPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const content = "BT /F1 16 Tf 20 100 Td (Isolated PDF fixture) Tj ET";
  objects.push(
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  );
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(text.length);
    text += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = text.length;
  text += `xref\n0 6\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    text += String(offset).padStart(10, "0") + " 00000 n \n";
  text += `trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(text);
}
test("in-app PDF renderer shows original pages with zoom, accessible text and source metadata", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await interceptApi(page);
  await page.route("**/api/sources", (r) =>
    r.fulfill({
      json: dataset.sources.map((s) => ({
        ...s,
        available: s.document_id === "FAN",
        pages: s.document_id === "FAN" ? 1 : null,
      })),
    }),
  );
  await page.route("**/api/sources/FAN/pdf", (r) =>
    r.fulfill({ contentType: "application/pdf", body: isolatedPdf() }),
  );
  await page.goto("/#inputs");
  await expect(page.locator(".pdf-toolbar")).toBeVisible();
  await expect(page.getByLabel("Página do PDF", { exact: true })).toHaveValue(
    "1",
  );
  await expect
    .poll(() => page.locator(".pdf-viewer canvas").evaluate((c) => c.width))
    .toBeGreaterThan(0);
  await page.getByLabel("Zoom", { exact: true }).selectOption("1.5");
  await page
    .getByText("Texto acessível desta página do PDF", { exact: true })
    .click();
  await expect(page.locator(".pdf-viewer")).toContainText(
    "Isolated PDF fixture",
  );
  await page.getByRole("button", { name: "Proveniência", exact: true }).click();
  await expect(page.locator(".provenance-view")).toContainText(
    "Arquivo local, fora do Git",
  );
  for (let i = 0; i < 3; i++) {
    await page
      .getByRole("button", { name: "PDF original", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Fatos normalizados", exact: true })
      .click();
  }
  await page.waitForTimeout(300);
  expect(errors).toEqual([]);
});

test("missing results and feedback never produce improvement charts; both languages preserve literal input", async ({
  page,
}) => {
  await interceptApi(page);
  await page.goto("/#learning");
  await expect(
    page.getByText("Nenhuma avaliação assistida ainda", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".evolution,.metric-chart")).toHaveCount(0);
  await page.goto("/#inputs/normalized");
  const content = await page.locator(".normalized-facts p").allTextContents();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Benchmark inputs",
  );
  expect(await page.locator(".normalized-facts p").allTextContents()).toEqual(
    content,
  );
  await page.goto("/#sources");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Sources and provenance",
  );
  await page.getByRole("button", { name: "Metadata", exact: true }).count();
  await page.goto("/#history");
  await expect(
    page.getByText("No benchmark is currently running", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("progress")).toHaveCount(0);
});
