// Browser fixtures only. Requests are intercepted and never populate SQLite.
import { test, expect } from "@playwright/test";
import { interceptApi, testRecords } from "./fixtures.js";

function studyRows({ separate = false } = {}) {
  const { summary, runs } = testRecords();
  return summary.map((row) => {
    const index = runs.findIndex((r) => r.metadata.model === row.model);
    const unrelated = separate && index === 2;
    return {
      ...row,
      study_id: unrelated ? "independent-study" : "original-study",
      study_created_at: unrelated ? "2026-09-20" : "2026-09-27",
      study_batch_ids: unrelated
        ? ["independent-study"]
        : ["original-study", "continuation"],
      comparison_hash: index ? "b43c00-test-only" : "d4408d-test-only",
      run_ids: [runs[index].id],
      incomplete_batch_ids: unrelated
        ? []
        : [index ? "continuation" : "original-study"],
    };
  });
}

test("invalidated Astra version is excluded from comparison selectors and charts while newer Astra stays visible", async ({
  page,
}) => {
  await interceptApi(page, { populated: true });
  const { runs } = testRecords();
  const old = runs.find((r) => r.metadata.provider === "openai");
  const summaries = studyRows().map((r) =>
    r.provider === "openai"
      ? {
          ...r,
          comparison_hash: "678f30-test-only",
          run_ids: ["new-astra-run"],
        }
      : r,
  );
  const catalog = runs.map((r) => ({
    id: r.id,
    ...r.metadata,
    batch_id: "original-study",
    comparison_eligible: r.id !== old.id,
    comparison_hash: r.id === old.id ? "d4408d-test-only" : "b43c00-test-only",
  }));
  catalog.push({
    ...catalog.find((r) => r.id === old.id),
    id: "new-astra-run",
    comparison_eligible: true,
    comparison_hash: "678f30-test-only",
  });
  await page.route("**/api/runs", (route) => route.fulfill({ json: catalog }));
  await page.route("**/api/runs/new-astra-run", (route) =>
    route.fulfill({ json: { ...old, id: "new-astra-run" } }),
  );
  await page.route("**/api/summary?by_study=true", (route) =>
    route.fulfill({ json: summaries }),
  );
  await page.goto("/#results");
  await expect(page.locator(".comparison-exclusion-notice")).toContainText(
    "gpt-6-astra · d4408d",
  );
  await expect(page.locator(".model-filters")).not.toContainText("d4408d");
  await expect(page.locator(".metric-chart")).not.toContainText(["d4408d"]);
  await expect(page.locator(".model-filters input")).toHaveCount(3);
  await page.getByRole("button", { name: "Respostas", exact: true }).click();
  const options = page.locator(".run-picker select").first().locator("option");
  await expect(options).toHaveCount(3);
  expect(
    await options.evaluateAll((nodes) => nodes.map((n) => n.value)),
  ).not.toContain(old.id);
  await page.reload();
  await expect(page.locator(".model-filters input")).toHaveCount(3);
});

test("original and continuation appear as one study with every model after refresh", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { writes } = await interceptApi(page, { populated: true });
  await page.route("**/api/summary?by_study=true", (route) =>
    route.fulfill({ json: studyRows() }),
  );
  await page.goto("/#results");
  const study = page.getByLabel("Estudo", { exact: true });
  await expect(study.locator("option")).toHaveCount(1);
  await expect(study).toHaveValue("original-study");
  await expect(
    page.getByLabel("Avaliação comparável", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".metric-chart").first().locator(".chart-row"),
  ).toHaveCount(3);
  await expect(page.locator(".model-filters input")).toHaveCount(3);
  await expect(page.getByLabel("Etapas do estudo")).toContainText(
    "Execução original e continuações reunidas",
  );
  await expect(page.getByLabel("Etapas do estudo")).toContainText(
    "d4408d + b43c00",
  );
  await expect(
    page.getByRole("link", { name: /Ver contagens e interrupções/ }),
  ).toHaveAttribute("href", "#live/original-study");
  await page.reload();
  await expect(study.locator("option")).toHaveCount(1);
  await expect(
    page.locator(".metric-chart").first().locator(".chart-row"),
  ).toHaveCount(3);
  await page.getByRole("button", { name: "Respostas", exact: true }).click();
  await expect(
    page.locator(".run-picker select").first().locator("option"),
  ).toHaveCount(3);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("unrelated study stays separate even when it shares a protocol", async ({
  page,
}) => {
  await interceptApi(page, { populated: true });
  await page.route("**/api/summary?by_study=true", (route) =>
    route.fulfill({ json: studyRows({ separate: true }) }),
  );
  await page.goto("/#results");
  const study = page.getByLabel("Estudo", { exact: true });
  await expect(study.locator("option")).toHaveCount(2);
  await expect(
    page.locator(".metric-chart").first().locator(".chart-row"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Respostas", exact: true }).click();
  await expect(
    page.locator(".run-picker select").first().locator("option"),
  ).toHaveCount(2);
  await study.selectOption("independent-study");
  await expect(
    page.locator(".run-picker select").first().locator("option"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Gráficos", exact: true }).click();
  await expect(
    page.locator(".metric-chart").first().locator(".chart-row"),
  ).toHaveCount(1);
});
