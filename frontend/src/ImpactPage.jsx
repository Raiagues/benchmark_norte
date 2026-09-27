import React, { useState } from "react";
import { L, t } from "./i18n";
import Icon from "./Icon";
import { Modal } from "./ScreenUI";
import { taskLabel } from "./liveLabels";
const norm = (s) =>
  s
    .trim()
    .toUpperCase()
    .replace(/[ _]+/g, "-")
    .replace(/^(REQ|CHG)-(\d+)$/, (_, a, b) => `${a}-${b.padStart(3, "0")}`);
export default function ImpactPage({ selection, picker, renderReview }) {
  const [level, setLevel] = useState("L1_DIRECT"),
    [task, setTask] = useState("change_impact"),
    [type, setType] = useState("all"),
    [scenarioId, setScenario] = useState(""),
    [prompt, setPrompt] = useState(false);
  const run = selection.run,
    results =
      run?.results.filter(
        (r) => r.difficulty === level && r.parsed_output?.scenarios,
      ) || [],
    result = results.find((r) => r.task === task) || results[0];
  const all =
      run?.snapshot.dataset.ground_truth.change_scenarios.filter(
        (s) => s.difficulty === level,
      ) || [],
    cases = all.filter((s) => type === "all" || s.change_type === type),
    scenario = cases.find((s) => s.id === scenarioId) || cases[0],
    answer = result?.parsed_output.scenarios.find(
      (s) => norm(s.scenario_id) === scenario?.id,
    );
  const expected = scenario?.affected_requirements || [],
    predicted = answer?.impacts.map((i) => norm(i.requirement_id)) || [],
    correct = predicted.filter((r) => expected.includes(r)),
    extra = predicted.filter((r) => !expected.includes(r)),
    missing = expected.filter((r) => !predicted.includes(r)),
    check = result?.metrics.scenarios?.find(
      (s) => s.scenario_id === scenario?.id,
    ),
    critical =
      scenario?.critical_requirements.filter((r) => !predicted.includes(r)) ||
      [];
  return (
    <div className="product-stack impact-product">
      {picker}
      {selection.error && <p role="alert">{selection.error}</p>}
      {run?.metadata.incomplete && (
        <p className="inline-note">
          {L(
            "Avaliação parcial: somente respostas recebidas e avaliadas aparecem aqui.",
            "Partial run: only received, evaluated responses appear here.",
          )}
        </p>
      )}
      <div className="product-panel filter-row">
        <label>
          {L("Dificuldade", "Difficulty")}
          <select
            aria-label={L("Dificuldade", "Difficulty")}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="L1_DIRECT">L1 · {L("Direto", "Direct")}</option>
            <option value="L2_ONE_HOP">L2 · {L("Um passo", "One hop")}</option>
          </select>
        </label>
        <label>
          {L("Tipo de alteração", "Change type")}
          <select
            aria-label={L("Tipo de alteração", "Change type")}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">{L("Todos", "All")}</option>
            {[...new Set(all.map((s) => s.change_type))].map((v) => (
              <option key={v} value={v}>
                {v === "no_impact" ? L("Sem impacto", "No impact") : v}
              </option>
            ))}
          </select>
        </label>
        <label>
          {L("Tarefa", "Task")}
          <select
            aria-label={L("Tarefa", "Task")}
            value={result?.task || task}
            onChange={(e) => setTask(e.target.value)}
          >
            {results.map((r) => (
              <option key={r.id} value={r.task}>
                {taskLabel(r.task)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!result ? (
        <div className="product-empty">
          <h2>
            {L(
              "Nenhuma resposta avaliada neste nível",
              "No evaluated response at this level",
            )}
          </h2>
        </div>
      ) : !scenario ? (
        <p>
          {L(
            "Nenhum cenário corresponde aos filtros.",
            "No scenario matches these filters.",
          )}
        </p>
      ) : (
        <>
          <div className="scenario-selector">
            {cases.map((s) => (
              <button
                key={s.id}
                aria-pressed={s.id === scenario.id}
                onClick={() => setScenario(s.id)}
                title={s.title}
              >
                {s.id}
              </button>
            ))}
          </div>
          <div className="impact-story">
            <section className="product-panel">
              <span className="source-badge assumption">
                {L("MUDANÇA PROPOSTA · ENTRADA", "PROPOSED CHANGE · INPUT")}
              </span>
              <h2>{scenario.id}</h2>
              <h3>{t(scenario.title)}</h3>
              <p lang="en">{scenario.description}</p>
              <div className="detail-chips">
                <span>{scenario.changed_entity}</span>
                <span>{scenario.difficulty.split("_")[0]}</span>
              </div>
              <details className="quiet-details">
                <summary>
                  {L("Referência esperada", "Expected reference")}
                </summary>
                <p>{scenario.expected_reason}</p>
              </details>
            </section>
            <section className="product-panel">
              <span className="source-badge">
                {L("TAREFA DO MODELO", "MODEL TASK")}
              </span>
              <h2>{taskLabel(result.task)}</h2>
              <div className="impact-prompt-steps">
                <div>
                  <Icon name="input" />
                  <span>
                    {L(
                      "Ler a configuração atual e a mudança",
                      "Read the current configuration and change",
                    )}
                  </span>
                </div>
                <div>
                  <Icon name="graph" />
                  <span>
                    {L(
                      "Identificar dependências afetadas",
                      "Identify affected dependencies",
                    )}
                  </span>
                </div>
                <div>
                  <Icon name="output" />
                  <span>
                    {L(
                      "Indicar requisitos e evidências",
                      "Return requirements and evidence",
                    )}
                  </span>
                </div>
              </div>
              <p className="inline-note">
                {L(
                  "São instruções observáveis do benchmark. Não representam raciocínio interno do modelo.",
                  "These are observable benchmark instructions, not the model’s private reasoning.",
                )}
              </p>
              <button className="text-button" onClick={() => setPrompt(true)}>
                {L(
                  "Prompt exato desta execução",
                  "Exact prompt from this execution",
                )}{" "}
                →
              </button>
              <small className="hash-line">
                {result.prompt_hash?.slice(0, 12)}
              </small>
            </section>
            <section className="product-panel">
              <span className="source-badge manufacturer">
                {L("RESPOSTA REAL DE API", "REAL API RESPONSE")}
              </span>
              <h2>{run.metadata.model}</h2>
              <div className="impact-map">
                <div className="changed-node">
                  <Icon name="change" />
                  {scenario.changed_entity}
                </div>
                <span className="map-arrow">↓</span>
                <small>
                  {L(
                    "Requisitos apontados pelo modelo",
                    "Requirements identified by the model",
                  )}
                </small>
                <div className="impact-node-list">
                  {predicted.length ? (
                    predicted.map((r) => (
                      <span
                        key={r}
                        className={
                          expected.includes(r) ? "correct" : "false_positive"
                        }
                      >
                        {expected.includes(r) ? "✓" : "+"} {r}
                      </span>
                    ))
                  ) : (
                    <p>{L("Nenhum impacto apontado", "No impact predicted")}</p>
                  )}
                </div>
                <small>
                  {L("Gabarito de avaliação", "Evaluation ground truth")}
                </small>
                <div className="impact-node-list">
                  {expected.length ? (
                    expected.map((r) => (
                      <span
                        key={r}
                        className={missing.includes(r) ? "missing" : "correct"}
                      >
                        {missing.includes(r) ? "−" : "✓"} {r}
                      </span>
                    ))
                  ) : (
                    <p>{L("Nenhum impacto esperado", "No impact expected")}</p>
                  )}
                </div>
              </div>
            </section>
          </div>
          <section className="product-panel">
            <div className="case-outcomes">
              {[
                [
                  L("Impactos corretos", "Correct impacts"),
                  correct.length,
                  "correct",
                ],
                [
                  L("Falsos positivos", "False positives"),
                  extra.length,
                  "false_positive",
                ],
                [
                  L("Impactos ausentes", "Missing impacts"),
                  missing.length,
                  "missing",
                ],
                [
                  L("Impactos críticos perdidos", "Critical misses"),
                  critical.length,
                  "false_positive",
                ],
              ].map(([label, n, cls]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong className={cls}>{n}</strong>
                </div>
              ))}
            </div>
            <div className="evidence-result-list">
              {answer?.impacts.length ? (
                answer.impacts.map((i) => {
                  const c = check?.explanation_checks.find(
                    (x) => x.requirement_id === norm(i.requirement_id),
                  );
                  return (
                    <article key={i.requirement_id}>
                      <h3>{i.requirement_id}</h3>
                      <p lang="en">{i.explanation}</p>
                      {i.dependency && (
                        <div className="dependency-line">
                          <strong>{i.dependency.source}</strong>
                          <span>{i.dependency.relationship}</span>
                          <strong>{i.dependency.target}</strong>
                        </div>
                      )}
                      {c && (
                        <span className="source-badge">
                          {c.passes_rules
                            ? L(
                                "✓ Atende às regras de evidência",
                                "✓ Passes evidence rules",
                              )
                            : L(
                                "! Revisar evidência ou dependência",
                                "! Review evidence or dependency",
                              )}
                        </span>
                      )}
                      <details>
                        <summary>
                          {L("Evidências fornecidas", "Provided evidence")} ·{" "}
                          {i.source_evidence.length}
                        </summary>
                        {i.source_evidence.map((e, n) => (
                          <blockquote key={n}>
                            <small>
                              {e.document_id} · {e.location}
                            </small>
                            <p>{e.excerpt}</p>
                          </blockquote>
                        ))}
                      </details>
                    </article>
                  );
                })
              ) : (
                <p className="muted">
                  {L(
                    "O modelo não indicou requisitos afetados neste cenário.",
                    "The model did not identify affected requirements in this scenario.",
                  )}
                </p>
              )}
            </div>
            {renderReview(run, result, scenario)}
          </section>
        </>
      )}
      {prompt && (
        <Modal
          title={L(
            "Prompt e entrada preservados",
            "Preserved prompt and input",
          )}
          onClose={() => setPrompt(false)}
        >
          <pre className="exact-text">{result.prompt}</pre>
        </Modal>
      )}
    </div>
  );
}
