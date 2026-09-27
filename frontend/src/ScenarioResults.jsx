import React, { useState } from "react";
import { L } from "./i18n";
import { issueLabel } from "./liveLabels";
const dependency = (e) =>
  e ? `${e.source} → ${e.relationship} → ${e.target}` : "—";
const impact = (yes) =>
  yes ? L("Precisa de revisão", "Needs review") : L("Sem impacto", "No impact");
export default function ScenarioResults({ detail, scenario, onScenario }) {
  const cases = detail.inspection || [];
  const selected = cases.find((s) => s.id === scenario) || cases[0];
  const [expanded, setExpanded] = useState("");
  if (!selected)
    return (
      <p>
        {L(
          "Detalhes de avaliação indisponíveis.",
          "Evaluation details unavailable.",
        )}
      </p>
    );
  return (
    <section className="scenario-browser">
      <label className="scenario-selector">
        {L("Cenário de mudança", "Change scenario")}
        <select
          aria-label={L("Cenário de mudança", "Change scenario")}
          value={selected.id}
          onChange={(e) => {
            onScenario(e.target.value);
            setExpanded("");
          }}
        >
          {cases.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} ·{" "}
              {s.incorrect
                ? `${s.incorrect} ${L("com erro", "with errors")}`
                : L("Respostas corretas", "Correct answers")}
            </option>
          ))}
        </select>
      </label>
      <div className="scenario-banner">
        <div>
          <span className="eyebrow">
            {L("MUDANÇA PROPOSTA", "PROPOSED CHANGE")} · {selected.id}
          </span>
          <p lang="en">{selected.description}</p>
        </div>
        <div className="scenario-totals">
          <span className="answer-good">
            ✓ {selected.correct} {L("corretas", "correct")}
          </span>
          <span className={selected.incorrect ? "answer-bad" : "muted"}>
            × {selected.incorrect} {L("com erro", "with errors")}
          </span>
        </div>
      </div>
      <p className="table-explanation">
        {L(
          "Cada linha é um requisito do projeto, avaliado neste cenário. O resultado mede a resposta do modelo; não aprova hardware.",
          "Each row is a project requirement evaluated for this scenario. The result grades the model answer; it does not certify hardware.",
        )}
      </p>
      <div className="table-scroll">
        <table className="requirement-results">
          <thead>
            <tr>
              {[
                L("Requisito do projeto", "Project requirement"),
                L("Esperado", "Expected"),
                L("Modelo", "Model"),
                L("Resultado da resposta", "Answer result"),
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selected.rows.map((row) => (
              <React.Fragment key={row.requirement_id}>
                <tr
                  className={
                    row.status === "correct"
                      ? "answer-row-good"
                      : "answer-row-bad"
                  }
                >
                  <th>
                    <button
                      className="requirement-expand"
                      aria-expanded={expanded === row.requirement_id}
                      onClick={() =>
                        setExpanded(
                          expanded === row.requirement_id
                            ? ""
                            : row.requirement_id,
                        )
                      }
                    >
                      <span>
                        {expanded === row.requirement_id ? "▾" : "▸"}{" "}
                        {row.requirement_id}
                      </span>
                      <small>
                        {row.requirement_text ||
                          L(
                            "ID fora dos requisitos do projeto",
                            "ID outside the project requirements",
                          )}
                      </small>
                    </button>
                  </th>
                  <td>{impact(row.expected_affected)}</td>
                  <td>{impact(row.predicted_affected)}</td>
                  <td>
                    <strong
                      className={
                        row.status === "correct" ? "answer-good" : "answer-bad"
                      }
                    >
                      {row.status === "correct"
                        ? L("✓ Resposta correta", "✓ Correct answer")
                        : L("× Resposta com erro", "× Answer has errors")}
                    </strong>
                    {row.issues.map((k) => (
                      <small className="answer-bad" key={k}>
                        {issueLabel(k)}
                      </small>
                    ))}
                  </td>
                </tr>
                {expanded === row.requirement_id && (
                  <tr>
                    <td colSpan="4">
                      <RequirementDetail
                        row={row}
                        changed={selected.changed_entity}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RequirementDetail({ row, changed }) {
  const answer = row.answer;
  return (
    <div className="requirement-verdict-detail">
      <h4>
        {row.requirement_id} ·{" "}
        {L("Por que recebeu esse resultado", "Why it received this result")}
      </h4>
      <p>{row.requirement_text}</p>
      <ul className="rule-verdicts">
        <li className={row.decision_correct ? "answer-good" : "answer-bad"}>
          {row.decision_correct ? "✓" : "×"}{" "}
          {L("Identificação do impacto", "Impact identification")}:{" "}
          {impact(row.expected_affected)} / {L("modelo", "model")}:{" "}
          {impact(row.predicted_affected)}
        </li>
        {row.checks && (
          <>
            <li
              className={
                row.checks.correct_changed_element
                  ? "answer-good"
                  : "answer-bad"
              }
            >
              {row.checks.correct_changed_element ? "✓" : "×"}{" "}
              {L("Elemento alterado", "Changed element")}: {changed} /{" "}
              {L("modelo", "model")}: {answer.changed_entity}
            </li>
            <li
              className={
                row.checks.correct_dependency ? "answer-good" : "answer-bad"
              }
            >
              {row.checks.correct_dependency ? "✓" : "×"}{" "}
              {L("Dependência", "Dependency")}
              <div>
                {L("Modelo", "Model")}:{" "}
                <code>{dependency(answer.dependency)}</code>
              </div>
              <div>
                {L("Aceitas pelo gabarito", "Accepted by the reference")}:{" "}
                {row.expected_dependencies.map(dependency).join("; ") || "—"}
              </div>
            </li>
            <li
              className={
                row.checks.valid_evidence ? "answer-good" : "answer-bad"
              }
            >
              {row.checks.valid_evidence ? "✓" : "×"}{" "}
              {L(
                "Citações verificadas pela regra",
                "Citations checked by the rule",
              )}
            </li>
          </>
        )}
      </ul>
      {!!row.claims.length && (
        <>
          <h4>{L("Alegações numéricas", "Numerical claims")}</h4>
          <table className="claim-results">
            <thead>
              <tr>
                <th>{L("Modelo", "Model")}</th>
                <th>{L("Referência do avaliador", "Evaluator reference")}</th>
                <th>{L("Verificação", "Check")}</th>
              </tr>
            </thead>
            <tbody>
              {row.claims.map((c, i) => (
                <tr key={i}>
                  <td>
                    {c.submitted.id}
                    <br />
                    {c.submitted.values.join(" – ")} {c.submitted.unit} ·{" "}
                    {c.submitted.qualifier}
                  </td>
                  <td>
                    {c.expected
                      ? `${c.expected.values.join(" – ")} ${c.expected.unit} · ${c.expected.qualifier}`
                      : L(
                          "Fora do escopo do gabarito",
                          "Outside the reference scope",
                        )}
                  </td>
                  <td
                    className={
                      c.checks.supported ? "answer-good" : "answer-bad"
                    }
                  >
                    {c.checks.supported
                      ? L("✓ Sustentada", "✓ Supported")
                      : !c.checks.matched
                        ? L(
                            "× Não pontuada: ID não previsto. Isso não prova que o fato é falso.",
                            "× Not credited: unknown ID. This does not prove the fact false.",
                          )
                        : [
                            !c.checks.value_correct &&
                              L("Valor diferente", "Value mismatch"),
                            !c.checks.unit_correct &&
                              L("Unidade diferente", "Unit mismatch"),
                            !c.checks.qualifier_correct &&
                              L("Qualificador diferente", "Qualifier mismatch"),
                            !c.checks.evidence_correct &&
                              L("Citação rejeitada", "Citation rejected"),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {answer && (
        <>
          <h4>
            {L("Explicação original do modelo", "Original model explanation")}
          </h4>
          <p lang="en">{answer.explanation}</p>
          <details>
            <summary>{L("Evidências citadas", "Cited evidence")}</summary>
            {answer.source_evidence.map((e, i) => (
              <blockquote key={i}>
                <small>
                  {e.document_id} · {e.location}
                </small>
                <p lang="en">{e.excerpt}</p>
              </blockquote>
            ))}
          </details>
        </>
      )}
    </div>
  );
}
