import React, { useState } from "react";
import { L } from "./i18n";
import { issueLabel } from "./liveLabels";
import ResultReview from "./ResultReview";
import {
  relationName,
  relationMeaning,
  itemName,
  rowStatus,
  statusText,
  statusClass,
} from "./resultPresentation";
const impact = (yes) =>
  yes ? L("Precisa de revisão", "Needs review") : L("Sem impacto", "No impact");
export default function ScenarioResults({ detail, scenario, onScenario }) {
  const cases = detail.inspection || [];
  const selected = cases.find((s) => s.id === scenario) || cases[0];
  const [expanded, setExpanded] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("");
  if (!selected)
    return (
      <p>
        {L(
          "Detalhes de avaliação indisponíveis.",
          "Evaluation details unavailable.",
        )}
      </p>
    );
  const counts = selected.rows.reduce(
    (a, r) => {
      a[rowStatus(r)]++;
      return a;
    },
    { correct: 0, partial: 0, incorrect: 0 },
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
          {Object.entries(counts).map(([k, n]) => (
            <span key={k} className={statusClass(k)}>
              {n} {statusText(k)}
            </span>
          ))}
        </div>
      </div>
      <div className="result-filters">
        <input
          aria-label={L("Buscar requisito", "Search requirement")}
          placeholder={L("Buscar requisito…", "Search requirement…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label={L("Filtrar resultado", "Filter result")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">{L("Todos os resultados", "All outcomes")}</option>
          {Object.keys(counts).map((k) => (
            <option key={k} value={k}>
              {statusText(k)}
            </option>
          ))}
        </select>
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
            {selected.rows
              .filter(
                (r) =>
                  (!filter || rowStatus(r) === filter) &&
                  `${r.requirement_id} ${r.requirement_text}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((row) => (
                <React.Fragment key={row.requirement_id}>
                  <tr
                    className={`answer-row-${rowStatus(row) === "correct" ? "good" : rowStatus(row) === "partial" ? "partial" : "bad"}`}
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
                        <small title={row.requirement_text}>
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
                      <strong className={statusClass(rowStatus(row))}>
                        {statusText(rowStatus(row))}
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
                          detail={detail}
                          row={row}
                          changed={selected.changed_entity}
                        />
                        <ResultReview
                          detail={detail}
                          target={`${selected.id}/${row.requirement_id}`}
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

function RequirementDetail({ row, changed, detail }) {
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
              <table className="field-comparison">
                <thead>
                  <tr>
                    <th>{L("Campo", "Field")}</th>
                    <th>{L("Resposta do modelo", "Model output")}</th>
                    <th>
                      {L("Esperado pelo avaliador", "Expected by evaluator")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {["source", "relationship", "target"].map((k) => (
                    <tr
                      key={k}
                      className={
                        row.expected_dependencies.some(
                          (e) => e[k] === answer.dependency?.[k],
                        )
                          ? "answer-good"
                          : "answer-bad"
                      }
                    >
                      <th>
                        {
                          {
                            source: L("Origem", "Source"),
                            relationship: L(
                              "Tipo da relação",
                              "Relationship type",
                            ),
                            target: L("Destino", "Target"),
                          }[k]
                        }
                      </th>
                      <td>
                        {k === "relationship"
                          ? relationName(answer.dependency?.[k])
                          : itemName(detail, answer.dependency?.[k])}
                      </td>
                      <td>
                        {row.expected_dependencies
                          .map((e) =>
                            k === "relationship"
                              ? relationName(e[k])
                              : itemName(detail, e[k]),
                          )
                          .join(" / ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p>
                {L("O modelo declarou:", "The model declared:")}{" "}
                {relationMeaning(answer.dependency?.relationship)}
              </p>
              {!row.checks.correct_dependency && (
                <p>
                  {L("O gabarito exige:", "The reference requires:")}{" "}
                  {[
                    ...new Set(
                      row.expected_dependencies.map((e) =>
                        relationMeaning(e.relationship),
                      ),
                    ),
                  ].join(" / ")}
                </p>
              )}
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
              {!row.checks.valid_evidence &&
                row.dependency_in_reference === false && (
                  <p>
                    {L(
                      "A relação declarada não existe no gabarito. Por isso, o avaliador não conseguiu associar suas citações à relação esperada; essa falha de evidência decorre da divergência da relação.",
                      "The declared relationship is absent from the reference. The evaluator therefore could not associate its citations with the expected relationship; this evidence failure follows from the relationship mismatch.",
                    )}
                  </p>
                )}
              {!!row.expected_evidence_locations?.length && (
                <p>
                  {L(
                    "Fontes aceitas para a relação esperada",
                    "Accepted sources for the expected relationship",
                  )}
                  : {row.expected_evidence_locations.join("; ")}.{" "}
                  {L(
                    "A regra também exige uma citação do cenário de mudança.",
                    "The rule also requires a citation of the change scenario.",
                  )}
                </p>
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
