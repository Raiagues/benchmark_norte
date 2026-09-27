import { test, expect } from "@playwright/test";
import { interceptApi } from "./fixtures.js";

test("benchmark home explains input, model, output and withheld reference without scores", async ({
  page,
}) => {
  const { writes } = await interceptApi(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "O benchmark", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".pipeline-step")).toHaveCount(4);
  await expect(
    page.getByText("0 avaliações concluídas", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".metric-chart")).toHaveCount(0);
  await expect(page.locator("pre")).toHaveCount(0);
  await expect(
    page.getByText("O gabarito fica do lado da avaliação.", { exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.screenshot({
    path: "test-results/benchmark-home.png",
    fullPage: true,
  });
});

test("input documents, requirements, instructions and output contract are clearly distinct", async ({
  page,
}) => {
  await interceptApi(page);
  await page.goto("/#inputs");
  await expect(
    page.getByRole("heading", { name: "Ventilador", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".fact-grid")).toContainText(
    "Corrente nominal (A)",
  );
  await expect(page.locator("pre")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Requisitos do projeto", exact: true })
    .click();
  await expect(page.locator(".input-passage")).toHaveCount(5);
  await expect(page.locator(".input-content .role-tag")).toContainText(
    "Entrada do modelo",
  );
  await page
    .getByRole("tab", { name: "Instruções do modelo", exact: true })
    .click();
  await expect(page.locator(".prompt-card")).toHaveCount(2);
  await expect(page.locator(".prompt-card").first()).toContainText(
    "Return one strict JSON object",
  );
  await page
    .getByRole("tab", { name: "O que deve devolver", exact: true })
    .click();
  await expect(
    page.getByText("Ainda não existe resposta de modelo.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".output-contract")).toContainText(
    "source_evidence",
  );
  await page
    .getByRole("tab", { name: "Mensagem completa", exact: true })
    .click();
  const raw = await page.locator(".exact-request pre").innerText();
  expect(raw).toContain('"confirmed_feedback":[]');
  expect(raw).not.toContain('"affected_requirements"');
  expect(raw).not.toContain('"expected_reason"');
  await page.getByLabel("Tarefa da prévia").selectOption("one_hop");
  await expect(page.locator(".exact-request pre")).not.toContainText(
    "PROJECT-06",
  );
  await page.screenshot({
    path: "test-results/input-preview.png",
    fullPage: true,
  });
});

test("human reference decisions and edits have explicit actions, version history and no model result", async ({
  page,
}) => {
  const { writes } = await interceptApi(page);
  await page.goto("/#reference");
  await expect(page.locator(".reference-card")).toHaveCount(11);
  await expect(page.locator("pre")).toHaveCount(0);
  const card = page.locator(".reference-card").first();
  await card.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(card).toContainText("✓ Confirmado");
  await card.getByRole("button", { name: "Recusar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "O que precisa ser corrigido?" })
    .fill("Test-only human review.");
  await page
    .getByRole("button", { name: "Registrar recusa", exact: true })
    .click();
  await expect(card).toContainText("× Recusado");
  await expect(
    page.getByText("Há itens recusados.", { exact: false }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Razão esperada", exact: true })
    .fill("Human explanation for isolated UI test.");
  await page
    .getByRole("textbox", {
      name: "Motivo da alteração (fica no histórico)",
      exact: true,
    })
    .fill("Clarify reference.");
  await page
    .getByRole("button", { name: "Salvar nova versão", exact: true })
    .click();
  await expect(card).toContainText("Human explanation for isolated UI test.");
  await expect(card).toContainText("○ Aguarda revisão");
  await expect(page.locator(".revision-history")).toContainText(
    "1.1.0+local.1",
  );
  expect(writes.map((w) => w.path)).toEqual([
    "/benchmark/review",
    "/benchmark/review",
    "/benchmark/edit",
  ]);
  await page.getByRole("link", { name: "Resultados", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nenhum resultado ainda" }),
  ).toBeVisible();
});

test("language switch covers navigation, benchmark, connections and persists while inputs stay identical", async ({
  page,
}) => {
  await interceptApi(page);
  await page.goto("/#inputs");
  const passage = await page
    .locator(".input-passage .source-text")
    .first()
    .innerText();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Inputs and outputs",
  );
  await expect(page.locator(".input-passage .source-text").first()).toHaveText(
    passage,
  );
  await page
    .getByRole("link", { name: "Evaluation criteria", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A valid response can still be wrong." }),
  ).toBeVisible();
  await expect(page.locator(".criteria-metrics")).toContainText(
    "Unsupported claims",
  );
  await page
    .getByRole("link", { name: "Reviewable reference", exact: true })
    .click();
  await expect(
    page
      .locator(".reference-card")
      .first()
      .getByRole("button", { name: "Confirm", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "New evaluation", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "1. Choose models" }),
  ).toBeVisible();
  await expect(page.getByText("Key missing", { exact: true })).toHaveCount(3);
  await page
    .getByRole("button", { name: "Start evaluation", exact: false })
    .click();
  await expect(page.getByRole("alert")).toContainText("Evaluation blocked");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "New evaluation",
  );
  await page.getByRole("button", { name: "Português", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Nova avaliação",
  );
});

test("populated graphs, metric charts and scenario controls translate without changing saved content", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await interceptApi(page, { populated: true });
  await page.goto("/#results");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Precision", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Graphs", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Reference", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Model answer", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Changes", exact: true }).click();
  await page
    .getByLabel("Change type", { exact: true })
    .selectOption("no_impact");
  await expect(page.locator(".scenario")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("new pages and review dialog remain readable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await interceptApi(page);
  for (const p of ["documents", "inputs", "reference", "criteria"]) {
    await page.goto("/#" + p);
    await expect(page.locator(".benchmark-workbench")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/#reference");
  await page
    .locator(".reference-card")
    .first()
    .getByRole("button", { name: "Editar", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: "test-results/reference-mobile.png",
    fullPage: true,
  });
});
