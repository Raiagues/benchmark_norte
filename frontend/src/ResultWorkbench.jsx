import React, { useState } from "react";
import { L } from "./i18n";
import { taskLabel, taskPurpose, percent } from "./liveLabels";
import { Tabs } from "./ScreenUI";
import { Evidence, OutputView } from "./InspectionViews";
import ScenarioResults from "./ScenarioResults";
import ResultReview from "./ResultReview";
import RejectedOutput from "./RejectedOutput";
import {
  relationName,
  relationMeaning,
  statusClass,
  statusText,
  itemName,
} from "./resultPresentation";

const key = (e) => [e.source, e.relationship, e.target].join("|");
const value = (p) =>
  p
    ? `${(p.values || []).join(" – ")} ${p.unit || ""} · ${p.qualifier || ""}`
    : "—";
const edgeStatus = (s) =>
  s === "correct"
    ? "correct"
    : s === "correct_bad_evidence"
      ? "partial"
      : s
        ? "incorrect"
        : "unknown";
export default function ResultWorkbench({
  detail: d,
  scenario,
  onScenario,
  renderGraph,
  onPrompt,
}) {
  const o = d.result?.parsed_output,
    m = d.result?.metrics || {};
  const [type, setType] = useState(o?.edges ? "relations" : "values"),
    [view, setView] = useState("table"),
    [query, setQuery] = useState(""),
    [relation, setRelation] = useState(""),
    [status, setStatus] = useState(""),
    [nodeType, setNodeType] = useState(""),
    [expanded, setExpanded] = useState("");
  if (!o) return <RejectedOutput detail={d} />;
  const comparisons =
    d.comparison?.edges ||
    (o.edges || []).map((e) => ({
      key: [e.source, e.relationship, e.target],
      model_edge: e,
    }));
  let rows = [];
  if (type === "relations")
    rows = comparisons.map((e) => ({
      id: e.key.join("|"),
      source: e.key[0],
      relation: e.key[1],
      target: e.key[2],
      output: e.model_edge,
      expected: e.ground_truth_edge,
      status: edgeStatus(e.status),
      rawStatus: e.status,
    }));
  if (type === "items") {
    const expected = d.ground_truth?.entities?.nodes || [],
      actual = o.nodes || [],
      ids = [...new Set([...actual, ...expected].map((n) => n.id))];
    rows = ids.map((id) => {
      const a = actual.find((n) => n.id === id),
        g = expected.find((n) => n.id === id),
        f = m.entity;
      return {
        id,
        source: id,
        target: a?.name || g?.name,
        nodeType: a?.type || g?.type,
        output: a,
        expected: g,
        status: !f
          ? "unknown"
          : (f.correct || []).includes(id)
            ? "correct"
            : (f.missing || []).includes(id) ||
                (f.false_positives || []).includes(id)
              ? "incorrect"
              : "unknown",
      };
    });
  }
  if (type === "values") {
    const expected = d.ground_truth?.entities?.parameters || [],
      actual = o.parameters || [];
    rows = [...new Set([...actual, ...expected].map((p) => p.id))].map((id) => {
      const a = actual.find((p) => p.id === id),
        g = expected.find((p) => p.id === id),
        f = m.fact_details?.find((p) => p.id === id);
      return {
        id,
        source: id,
        output: a,
        expected: g,
        checks: f,
        status: f
          ? f.supported
            ? "correct"
            : [
                  f.value_correct,
                  f.unit_correct,
                  f.qualifier_correct,
                  f.evidence_correct,
                ].some(Boolean)
              ? "partial"
              : "incorrect"
          : m.parameter && (m.parameter.missing || []).includes(id)
            ? "incorrect"
            : "unknown",
      };
    });
  }
  const filtered = rows.filter(
    (r) =>
      (!status || r.status === status) &&
      (!relation || r.relation === relation) &&
      (!nodeType || r.nodeType === nodeType) &&
      [r.source, r.relation, r.target, r.output?.name, r.expected?.name]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="result-workbench">
      <div className="inspector-caption">
        <strong>
          {L("RESPOSTA DO MODELO × GABARITO", "MODEL OUTPUT × REFERENCE")}
        </strong>
        <span>{taskLabel(d.task)}</span>
      </div>
      <details className="output-origin">
        <summary>
          {L(
            "Como esta resposta foi produzida · ver prompt",
            "How this response was produced · view prompt",
          )}
        </summary>
        <p className="task-purpose">
          {taskPurpose(d.task)}{" "}
          {d.input_mode === "pdf_text"
            ? L(
                "Origem: resposta desta chamada ao modelo. A extração do texto do PDF ocorreu antes da chamada; os itens abaixo foram produzidos pelo modelo.",
                "Origin: this model call’s response. PDF text extraction occurred before the call; the items below were produced by the model.",
              )
            : L(
                "Origem: resposta desta chamada ao modelo, a partir do texto normalizado do protocolo histórico. Esta execução não usou extração integral de PDF.",
                "Origin: this model call’s response, based on the historical protocol’s normalized text. This execution did not use full PDF text extraction.",
              )}{" "}
          <button onClick={onPrompt}>
            {L("Ver prompt", "View prompt")} · {d.prompt_hash?.slice(0, 10)}
          </button>
        </p>
      </details>
      {o.scenarios ? (
        d.inspection?.length ? (
          <ScenarioResults
            detail={d}
            scenario={scenario}
            onScenario={onScenario}
          />
        ) : (
          <OutputView detail={d} scenario={scenario} onScenario={onScenario} />
        )
      ) : (
        <>
          <Tabs
            value={type}
            onChange={(v) => {
              setType(v);
              setExpanded("");
              setStatus("");
              setRelation("");
              setNodeType("");
            }}
            items={[
              ...(o.edges
                ? [["relations", L("Relações", "Relationships")]]
                : []),
              ["items", L("Itens identificados", "Identified items")],
              ...(o.parameters
                ? [["values", L("Valores extraídos", "Extracted values")]]
                : []),
            ]}
          />
          <div className="result-filters">
            <input
              aria-label={L("Buscar na resposta", "Search output")}
              placeholder={L(
                "Buscar ID, nome ou relação…",
                "Search ID, name or relationship…",
              )}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {type === "relations" && (
              <select
                aria-label={L("Tipo de relação", "Relationship type")}
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
              >
                <option value="">
                  {L("Todas as relações", "All relationships")}
                </option>
                {[...new Set(rows.map((r) => r.relation))].map((k) => (
                  <option key={k} value={k}>
                    {relationName(k)}
                  </option>
                ))}
              </select>
            )}
            {type === "items" && (
              <select
                aria-label={L("Tipo de item", "Item type")}
                value={nodeType}
                onChange={(e) => setNodeType(e.target.value)}
              >
                <option value="">{L("Todos os tipos", "All types")}</option>
                {[...new Set(rows.map((r) => r.nodeType))].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            )}
            <select
              aria-label={L("Filtrar avaliação", "Filter evaluation")}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">
                {L("Todos os resultados", "All outcomes")}
              </option>
              {["correct", "partial", "incorrect", "unknown"].map((k) => (
                <option key={k} value={k}>
                  {statusText(k)}
                </option>
              ))}
            </select>
            <span>
              {filtered.length} / {rows.length}
            </span>
          </div>
          {type === "relations" && d.comparison && (
            <Tabs
              value={view}
              onChange={setView}
              items={[
                ["table", L("Tabela", "Table")],
                [
                  "diagram",
                  L("Diagramas lado a lado", "Side-by-side diagrams"),
                ],
              ]}
            />
          )}
          {type === "relations" && view === "diagram" && d.comparison ? (
            renderGraph?.({
              ...d,
              comparison: {
                ...d.comparison,
                edges: comparisons.filter((e) =>
                  filtered.some((r) => r.id === e.key.join("|")),
                ),
              },
            })
          ) : (
            <div className="table-scroll">
              <table className="compact-results inspector-table">
                <thead>
                  <tr>
                    <th>{L("Item / origem", "Item / source")}</th>
                    {type === "relations" && (
                      <>
                        <th>{L("Relação", "Relationship")}</th>
                        <th>{L("Destino", "Target")}</th>
                      </>
                    )}
                    <th>{L("Modelo", "Model")}</th>
                    <th>{L("Esperado", "Expected")}</th>
                    {type === "items" && <th>{L("Tipo", "Type")}</th>}
                    <th>{L("Avaliação", "Evaluation")}</th>
                    <th>{L("Fase / origem", "Phase / origin")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <React.Fragment key={r.id}>
                      <tr
                        className={`answer-row-${r.status === "correct" ? "good" : r.status === "partial" ? "partial" : r.status === "incorrect" ? "bad" : "unknown"}`}
                      >
                        <th>
                          <button
                            aria-expanded={expanded === r.id}
                            onClick={() =>
                              setExpanded(expanded === r.id ? "" : r.id)
                            }
                          >
                            {expanded === r.id ? "▾" : "▸"} {r.source}
                          </button>
                        </th>
                        {type === "relations" && (
                          <>
                            <td>{relationName(r.relation)}</td>
                            <td title={itemName(d, r.target)}>{r.target}</td>
                          </>
                        )}
                        <td title={type === "items" ? r.output?.name : ""}>
                          {type === "relations"
                            ? r.output
                              ? L("Declarada", "Declared")
                              : L("Ausente", "Missing")
                            : type === "values"
                              ? value(r.output)
                              : r.output?.name || "—"}
                        </td>
                        <td title={type === "items" ? r.expected?.name : ""}>
                          {type === "relations"
                            ? r.expected
                              ? L("Esperada", "Expected")
                              : L("Não prevista", "Not expected")
                            : type === "values"
                              ? value(r.expected)
                              : r.expected?.name || "—"}
                        </td>
                        {type === "items" && <td>{r.nodeType}</td>}
                        <td className={statusClass(r.status)}>
                          {statusText(r.status)}
                        </td>
                        <td>{taskLabel(d.task)}</td>
                      </tr>
                      {expanded === r.id && (
                        <tr>
                          <td
                            colSpan={
                              type === "relations"
                                ? 8
                                : type === "items"
                                  ? 7
                                  : 6
                            }
                          >
                            <div className="result-expanded">
                              <h4>{itemName(d, r.source)}</h4>
                              {type === "relations" && (
                                <>
                                  <p>{relationMeaning(r.relation)}</p>
                                  <div className="expected-pair">
                                    <article>
                                      <h4>
                                        {L(
                                          "Resposta do modelo",
                                          "Model output",
                                        )}
                                      </h4>
                                      {r.output ? (
                                        <>
                                          <p>
                                            {key(r.output)
                                              .split("|")
                                              .join(" → ")}
                                          </p>
                                          <p>{r.output.reason}</p>
                                          <p>
                                            {L(
                                              "Declaração do modelo",
                                              "Model declaration",
                                            )}
                                            :{" "}
                                            {r.output.relationship_origin ||
                                              r.output.origin ||
                                              L(
                                                "Explícita/inferida não declarada nesta resposta",
                                                "Explicit/inferred not stated in this response",
                                              )}
                                          </p>
                                          <Evidence
                                            items={r.output.source_evidence}
                                          />
                                          {r.output.confidence != null && (
                                            <small>
                                              {L(
                                                "Confiança autodeclarada",
                                                "Self-reported confidence",
                                              )}
                                              : {percent(r.output.confidence)}
                                            </small>
                                          )}
                                        </>
                                      ) : (
                                        <p>
                                          {L(
                                            "O modelo não declarou esta relação.",
                                            "The model did not declare this relationship.",
                                          )}
                                        </p>
                                      )}
                                    </article>
                                    <article>
                                      <h4>
                                        {L(
                                          "Gabarito usado na avaliação",
                                          "Reference used for evaluation",
                                        )}
                                      </h4>
                                      {r.expected ? (
                                        <>
                                          <p>{r.expected.reason}</p>
                                          <Evidence
                                            items={r.expected.source_evidence}
                                          />
                                        </>
                                      ) : (
                                        <p>
                                          {L(
                                            "A relação não está no gabarito preservado. Uma revisão humana pode contestar a classificação.",
                                            "This relationship is absent from the preserved reference. A human review can dispute the classification.",
                                          )}
                                        </p>
                                      )}
                                    </article>
                                  </div>
                                  {r.rawStatus === "correct_bad_evidence" && (
                                    <p className="answer-warn">
                                      {L(
                                        "A relação coincide, mas a citação não passou na verificação de conteúdo/localização.",
                                        "The relationship matches, but its citation failed the content/location check.",
                                      )}
                                    </p>
                                  )}
                                </>
                              )}
                              {type === "items" && (
                                <div className="expected-pair">
                                  {[
                                    [L("Modelo", "Model"), r.output],
                                    [L("Esperado", "Expected"), r.expected],
                                  ].map(([label, n]) => (
                                    <article key={label}>
                                      <h4>{label}</h4>
                                      <p>{n?.name || "—"}</p>
                                      <p>
                                        {n?.source} · {n?.source_reference}
                                      </p>
                                    </article>
                                  ))}
                                </div>
                              )}
                              {type === "values" && (
                                <>
                                  <div className="expected-pair">
                                    <article>
                                      <h4>{L("Modelo", "Model")}</h4>
                                      <p>{value(r.output)}</p>
                                      <Evidence
                                        items={r.output?.source_evidence}
                                      />
                                    </article>
                                    <article>
                                      <h4>{L("Esperado", "Expected")}</h4>
                                      <p>{value(r.expected)}</p>
                                      <Evidence
                                        items={r.expected?.source_evidence}
                                      />
                                    </article>
                                  </div>
                                  {r.checks && (
                                    <ul>
                                      {[
                                        "value_correct",
                                        "unit_correct",
                                        "qualifier_correct",
                                        "evidence_correct",
                                      ].map((k) => (
                                        <li
                                          className={
                                            r.checks[k]
                                              ? "answer-good"
                                              : "answer-bad"
                                          }
                                          key={k}
                                        >
                                          {r.checks[k] ? "✓" : "×"}{" "}
                                          {
                                            {
                                              value_correct: L(
                                                "Valor",
                                                "Value",
                                              ),
                                              unit_correct: L(
                                                "Unidade",
                                                "Unit",
                                              ),
                                              qualifier_correct: L(
                                                "Qualificador",
                                                "Qualifier",
                                              ),
                                              evidence_correct: L(
                                                "Citação",
                                                "Citation",
                                              ),
                                            }[k]
                                          }
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </>
                              )}
                              <button onClick={onPrompt}>
                                {L(
                                  "Abrir prompt desta execução",
                                  "Open this execution’s prompt",
                                )}
                              </button>
                              <ResultReview detail={d} target={r.id} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={8}>
                        {L(
                          "Nenhum item corresponde aos filtros.",
                          "No items match these filters.",
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <ResultReview detail={d} />
    </section>
  );
}
