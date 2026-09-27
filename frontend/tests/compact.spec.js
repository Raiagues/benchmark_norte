import { test, expect } from "@playwright/test";
import { interceptApi } from "./fixtures.js";

async function fits(page) {
  const issues = await page.evaluate(() => {
    const main = document.querySelector("main"),
      v = window.innerHeight;
    const out = [];
    if (main.scrollHeight > main.clientHeight + 2)
      out.push(`main overflow ${main.scrollHeight}/${main.clientHeight}`);
    if (
      document.documentElement.scrollWidth > innerWidth ||
      document.documentElement.scrollHeight > v
    )
      out.push("document overflow");
    for (const el of main.querySelectorAll("button,select,input,a")) {
      if (el.closest(".react-flow") || !el.getClientRects().length) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > v + 1 || r.right > innerWidth + 1 || r.top < 0)
        out.push(
          `${el.textContent?.slice(0, 50)} outside viewport: ${r.bottom}`,
        );
    }
    for (const card of main.querySelectorAll(".metric-chart")) {
      const bottom = card.getBoundingClientRect().bottom;
      for (const row of card.querySelectorAll(".chart-row"))
        if (row.getBoundingClientRect().bottom > bottom + 1)
          out.push("chart bar outside card");
    }
    return out;
  });
  expect(issues).toEqual([]);
}
for (const viewport of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
])
  test(`all primary pages fit ${viewport.width}x${viewport.height}, with usable pagination`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await interceptApi(page, { populated: true });
    for (const route of [
      "documents",
      "inputs",
      "reference",
      "criteria",
      "results",
      "graphs",
      "impact",
      "run",
    ]) {
      await page.goto("/#" + route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText("Carregando…", { exact: true })).toHaveCount(
        0,
      );
      await page.waitForTimeout(120);
      await fits(page);
    }
    await page
      .getByRole("button", { name: "Tarefas e opções", exact: true })
      .click();
    await fits(page);
    await page.goto("/#reference");
    await page.getByRole("button", { name: /Impactos esperados/ }).click();
    await expect(page.locator(".reference-card")).toHaveCount(1);
    await fits(page);
    const first = await page.locator(".reference-card").innerText();
    await page.getByRole("button", { name: "Próximo", exact: true }).click();
    expect(await page.locator(".reference-card").innerText()).not.toBe(first);
    await fits(page);
    await page.goto("/#criteria");
    for (const name of ["Publicação", "Acertos e erros", "Regras adicionais"]) {
      await page.getByRole("button", { name, exact: true }).click();
      await fits(page);
    }
    await page.goto("/#inputs");
    for (const name of [
      "Instruções do modelo",
      "O que deve devolver",
      "Mensagem completa",
    ]) {
      await page.getByRole("button", { name, exact: true }).click();
      await fits(page);
    }
  });

test("provider selection and depth persist; changing depth makes zero provider calls and requires reconfirmation", async ({
  page,
}) => {
  const { writes } = await interceptApi(page, {
    allKeyed: true,
    confirmed: true,
  });
  await page.goto("/#run");
  await expect(page.locator(".api-row")).toHaveCount(3);
  await expect(page.locator(".model-option")).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Anthropic", exact: true })
    .uncheck();
  await page
    .getByRole("checkbox", { name: "Google Gemini", exact: true })
    .uncheck();
  await page
    .getByLabel("Profundidade OpenAI", { exact: true })
    .selectOption("medium");
  await expect(
    page.getByRole("button", {
      name: "Status OpenAI: Não verificado",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Iniciar avaliação", exact: true })
    .click();
  expect(writes).toEqual([]);
  await page.reload();
  await expect(
    page.getByLabel("Profundidade OpenAI", { exact: true }),
  ).toHaveValue("medium");
  await expect(
    page.getByRole("checkbox", { name: "Anthropic", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Verificar conexões", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Status OpenAI: Conectado", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Iniciar avaliação", exact: true })
    .click();
  await expect(
    page.getByText("Falhou · nenhum resultado publicado"),
  ).toBeVisible();
  expect(writes.map((w) => w.path)).toEqual(["/connections/verify", "/runs"]);
  expect(writes[0].body.depths).toEqual({ 0: "medium" });
  expect(writes[1].body.depths).toEqual({ 0: "medium" });
});

test("connection details are quiet, keyboard accessible and never expose a key input", async ({
  page,
}) => {
  const { writes } = await interceptApi(page);
  await page.goto("/#run");
  await expect(page.getByText(/Preencha.*env/)).toHaveCount(0);
  await expect(page.getByText("API respondeu", { exact: false })).toHaveCount(
    0,
  );
  const status = page.getByRole("button", {
    name: "Status OpenAI: Sem chave",
    exact: true,
  });
  await status.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("OPENAI_API_KEY");
  await expect(page.getByRole("dialog")).toContainText("Geração confirmada");
  await expect(page.getByRole("dialog").locator("input")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(status).toBeFocused();
  expect(writes).toEqual([]);
});

test("long request reader keeps every character, without scrolling or hidden lines", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await interceptApi(page);
  await page.goto("/#inputs");
  await page
    .getByRole("button", { name: "Instruções do modelo", exact: true })
    .click();
  const preview = await page.evaluate(
    async () =>
      await (
        await fetch(
          "/api/benchmark/preview?task=relationship_extraction&difficulty=L1_DIRECT&input_mode=controlled_text",
        )
      ).json(),
  );
  const reader = page.locator(".instructions-screen .paged-text");
  await expect(reader.locator("pre")).toContainText(
    "Return one strict JSON object",
  );
  let contents = "";
  for (let i = 0; i < 100; i++) {
    await page.waitForTimeout(40);
    const pre = reader.locator("pre");
    contents += await pre.textContent();
    expect(
      await pre.evaluate((e) => e.scrollHeight <= e.clientHeight + 2),
    ).toBe(true);
    const next = reader.getByRole("button", { name: "Próximo", exact: true });
    if (await next.isDisabled()) break;
    await next.click();
  }
  expect(contents).toBe(preview.instructions.common);
});
