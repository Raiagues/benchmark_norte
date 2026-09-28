import React, { useState } from "react";
import { L } from "./i18n";
import PdfViewer from "./PdfViewer";
import { Tabs } from "./ScreenUI";
import {
  taskLabel,
  taskPurpose,
  issueLabel,
  metricLabel,
  percent,
  number,
  money,
} from "./liveLabels";

const documentName = (id) =>
  ({
    FAN: L("Ventilador", "Fan"),
    SENSOR: L("Sensor", "Sensor"),
    DRIVER: L("Chave de alimentação", "Power switch"),
    "ALT-FAN": L("Ventilador substituto", "Replacement fan"),
    "ALT-DRIVER": L("Chave substituta", "Replacement switch"),
    PROJECT: L("Arquitetura e testes", "Architecture and tests"),
    REQUIREMENTS: L("Requisitos do projeto", "Project requirements"),
  })[id] || id;
const typeName = (type) =>
  ({
    Component: L("Componente", "Component"),
    Requirement: L("Requisito", "Requirement"),
    Parameter: L("Parâmetro", "Parameter"),
    Configuration: L("Configuração", "Configuration"),
    Verification: L("Verificação", "Verification"),
    Document: L("Documento", "Document"),
  })[type] || type;
const relationName = (type) =>
  ({
    has_parameter: L("tem parâmetro", "has parameter"),
    constrains: L("estabelece limite para", "constrains"),
    depends_on: L("depende de", "depends on"),
    verified_by: L("é verificado por", "is verified by"),
  })[type] || type;
const qualifier = (q) =>
  ({
    rated: L("Nominal", "Rated"),
    range: L("Faixa", "Range"),
    maximum: L("Máximo", "Maximum"),
    minimum: L("Mínimo", "Minimum"),
    configured: L("Configurado", "Configured"),
    threshold: L("Limiar", "Threshold"),
  })[q] || q;
const values = (p) =>
  `${(p.values || []).map(number).join(" – ")} ${p.unit || ""}`;
const wasSent = (d) =>
  Boolean(
    d.result ||
      d.attempt ||
      d.request_started_at ||
      d.received_attempt ||
      d.response_checkpoint,
  );
const countOutput = (o) =>
  o?.scenarios
    ? `${o.scenarios.length} ${L("cenários respondidos", "answered scenarios")}`
    : o?.edges
      ? `${o.nodes.length} ${L("itens", "items")} · ${o.edges.length} ${L("relações", "relationships")}`
      : o
        ? `${o.nodes?.length || 0} ${L("itens", "items")} · ${o.parameters?.length || 0} ${L("valores", "values")}`
        : L("Sem resposta avaliada", "No evaluated response");
function Empty({ text }) {
  return (
    <p className="inspector-empty">
      {text ||
        L(
          "Nenhuma resposta disponível nesta execução.",
          "No response available in this execution.",
        )}
    </p>
  );
}
export function Evidence({ items = [] }) {
  return items.length ? (
    <details className="inspector-evidence">
      <summary>
        {items.length} {L("evidências", "evidence references")}
      </summary>
      {items.map((e, i) => (
        <blockquote key={i}>
          <strong>
            {e.document_id} · {e.location}
          </strong>
          <p lang="en">{e.excerpt}</p>
        </blockquote>
      ))}
    </details>
  ) : (
    <span className="muted">{L("Sem citação", "No citation")}</span>
  );
}
function Facts({ items = [] }) {
  return items.length ? (
    <div className="table-scroll">
      <table className="inspector-table">
        <thead>
          <tr>
            <th>{L("Parâmetro", "Parameter")}</th>
            <th>{L("Valor declarado", "Declared value")}</th>
            <th>{L("Tipo", "Kind")}</th>
            <th>{L("Fonte", "Source")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => (
            <tr key={p.id + i}>
              <th>{p.id}</th>
              <td>{values(p)}</td>
              <td>{qualifier(p.qualifier)}</td>
              <td>
                <Evidence items={p.source_evidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : null;
}
function Nodes({ items = [] }) {
  return items.length ? (
    <div className="table-scroll">
      <table className="inspector-table">
        <thead>
          <tr>
            <th>{L("Item identificado", "Identified item")}</th>
            <th>{L("Tipo", "Type")}</th>
            <th>{L("Fonte", "Source")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((n) => (
            <tr key={n.id}>
              <th>
                {n.id}
                <small>{n.name}</small>
              </th>
              <td>{typeName(n.type)}</td>
              <td>
                {n.source} · {n.source_reference}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : null;
}
export function Edges({ items = [] }) {
  return items.length ? (
    <div className="table-scroll">
      <table className="inspector-table">
        <thead>
          <tr>
            <th>{L("Relação declarada", "Declared relationship")}</th>
            <th>{L("Justificativa", "Explanation")}</th>
            <th>{L("Evidência", "Evidence")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((e, i) => (
            <tr key={i}>
              <td>
                <div className="dependency-path">
                  <b>{e.source}</b>
                  <span>→ {relationName(e.relationship)} →</span>
                  <b>{e.target}</b>
                </div>
                {e.confidence != null && (
                  <small>
                    {L("Confiança declarada", "Reported confidence")}:{" "}
                    {percent(e.confidence)}
                  </small>
                )}
              </td>
              <td>{e.reason}</td>
              <td>
                <Evidence items={e.source_evidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      text={L("Nenhuma relação declarada.", "No relationships declared.")}
    />
  );
}

export function InputView({ detail: d }) {
  const docs = d.input?.documents || {},
    keys = Object.keys(docs);
  const [chosen, setChosen] = useState(keys[0]),
    [location, setLocation] = useState(""),
    [documentView, setDocumentView] = useState("pdf");
  const id = keys.includes(chosen) ? chosen : keys[0],
    entries = Object.entries(docs[id] || {}),
    passage = entries.find(([k]) => k === location) || entries[0];
  return (
    <div className="inspector-input">
      <div className="inspector-caption">
        <strong>
          {wasSent(d)
            ? L("ENTRADA · enviada ao modelo", "INPUT · sent to the model")
            : L(
                "ENTRADA PREVISTA · envio não confirmado",
                "PLANNED INPUT · dispatch not confirmed",
              )}
        </strong>
        <span>
          {L(
            "Conteúdo preservado desta execução",
            "Preserved content of this execution",
          )}
        </span>
      </div>
      <div className="document-reader">
        <nav
          aria-label={L(
            "Documentos desta execução",
            "Documents in this execution",
          )}
        >
          {keys.map((k) => (
            <button
              key={k}
              aria-pressed={id === k}
              onClick={() => {
                setChosen(k);
                setLocation("");
              }}
            >
              <span>▤</span>
              <div>
                <strong>{documentName(k)}</strong>
                <small>
                  {k} · {Object.keys(docs[k]).length}{" "}
                  {Object.keys(docs[k])[0]?.startsWith("page-")
                    ? L("páginas", "pages")
                    : L("trechos", "passages")}
                </small>
              </div>
            </button>
          ))}
        </nav>
        <article className="document-sheet">
          {id && (
            <Tabs
              value={documentView}
              onChange={setDocumentView}
              items={[
                ["pdf", L("Documento original", "Original document")],
                [
                  "text",
                  L("Texto enviado ao modelo", "Text sent to the model"),
                ],
              ]}
            />
          )}
          {documentView === "pdf" ? (
            d.pdf_hashes?.[id] ? (
              <>
                <p className="muted">
                  {L(
                    "PDF local conferido com o hash preservado nesta execução. O provedor recebeu o texto integral extraído das páginas.",
                    "Local PDF verified against this execution’s saved hash. The provider received the full extracted page text.",
                  )}
                </p>
                <PdfViewer
                  source={{
                    document_id: id,
                    available: true,
                    expected_hash: d.pdf_hashes[id],
                    part_number: documentName(id),
                  }}
                />
              </>
            ) : (
              <div className="inspector-empty">
                <h3>
                  {L(
                    "Original PDF não preservado para este documento",
                    "Original PDF not preserved for this document",
                  )}
                </h3>
                <p>
                  {["PROJECT", "REQUIREMENTS"].includes(id)
                    ? L(
                        "Este documento do projeto é textual. Não é uma extração de datasheet.",
                        "This project document is text. It is not a datasheet extraction.",
                      )
                    : L(
                        "Esta execução não guardou o hash do PDF. Não substituímos seu original por um arquivo atual.",
                        "This execution did not save a PDF hash. We do not substitute a current file for its original.",
                      )}
                </p>
                <button onClick={() => setDocumentView("text")}>
                  {L("Ler conteúdo preservado", "Read preserved content")}
                </button>
              </div>
            )
          ) : (
            <>
              <header>
                <h3>{documentName(id)}</h3>
                {entries.length > 1 && (
                  <select
                    aria-label={L("Página ou trecho", "Page or passage")}
                    value={passage?.[0]}
                    onChange={(e) => setLocation(e.target.value)}
                  >
                    {entries.map(([key]) => (
                      <option key={key}>{key}</option>
                    ))}
                  </select>
                )}
              </header>
              <p className="document-source-label">
                {id} · {passage?.[0]}
              </p>
              <div className="source-prose" lang="en">
                {passage?.[1] ||
                  L("Documento indisponível", "Document unavailable")}
              </div>
            </>
          )}
        </article>
      </div>
      <section>
        <h3>
          {L(
            "Configuração do projeto enviada",
            "Submitted project configuration",
          )}
        </h3>
        <p className="provenance-note">
          {L(
            "Origem: configuração definida pelo projeto/benchmark. Estes valores não foram extraídos dos PDFs nem gerados pelo modelo. O campo de origem abaixo é o que foi preservado no pedido.",
            "Origin: configuration defined by the project/benchmark. These values were not extracted from PDFs or generated by the model. The origin field below is preserved from the request.",
          )}
        </p>
        <dl className="inspector-properties">
          {Object.entries(d.input?.system_config || {}).map(([k, v]) => (
            <div key={k}>
              <dt>
                {{
                  document_id: L("Documento", "Document"),
                  kind: L("Origem", "Origin"),
                  fan_voltage_V: L("Alimentação do ventilador", "Fan supply"),
                  sensor_voltage_V: L("Alimentação do sensor", "Sensor supply"),
                  activation_threshold_degC: L(
                    "Temperatura de ativação",
                    "Activation temperature",
                  ),
                  controller_concept: L(
                    "Controlador conceitual",
                    "Conceptual controller",
                  ),
                  hardware_verified: L(
                    "Hardware verificado",
                    "Hardware verified",
                  ),
                  control: L("Controle", "Control"),
                }[k] || k}
              </dt>
              <dd>
                {v === "benchmark_assumption"
                  ? L("Hipótese do benchmark", "Benchmark assumption")
                  : v === "on_off"
                    ? L("Liga / desliga", "On / off")
                    : typeof v === "boolean"
                      ? v
                        ? L("Sim", "Yes")
                        : L("Não", "No")
                      : String(v)}
                {k.endsWith("_V") ? " V" : k.endsWith("degC") ? " °C" : ""}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      {!!d.input?.scenarios?.length && (
        <section>
          <h3>{L("Mudanças enviadas", "Submitted changes")}</h3>
          {d.input.scenarios.map((s) => (
            <details className="inspector-change" key={s.id}>
              <summary>
                {s.id} · {s.changed_entity}
              </summary>
              <p lang="en">{s.description}</p>
            </details>
          ))}
        </section>
      )}
      {!!d.input?.confirmed_feedback?.length && (
        <section>
          <h3>
            {L("Correções humanas enviadas", "Submitted human corrections")}
          </h3>
          {d.input.confirmed_feedback.map((f, i) => (
            <p key={i}>
              {f.edge.source} → {relationName(f.edge.relationship)} →{" "}
              {f.edge.target}: {f.verdict} · {f.correction}
            </p>
          ))}
        </section>
      )}
      {d.input_policy === "legacy_explicit_context" && (
        <p className="inline-note">
          {L(
            "O contexto antigo também incluía um inventário e pistas. O pedido completo permanece no download técnico.",
            "The old context also included an inventory and hints. The complete request remains available as a technical download.",
          )}
        </p>
      )}
    </div>
  );
}
export function PromptView({ detail: d }) {
  const instructions = d.prompt?.split("\nRESPONSE SCHEMA\n")[0] || "";
  return (
    <section>
      <div className="inspector-caption">
        <strong>
          {wasSent(d)
            ? L(
                "INSTRUÇÃO · enviada ao modelo",
                "INSTRUCTION · sent to the model",
              )
            : L(
                "INSTRUÇÃO PREVISTA · envio não confirmado",
                "PLANNED INSTRUCTION · dispatch not confirmed",
              )}
        </strong>
        <span>{taskLabel(d.task)}</span>
      </div>
      <p>{taskPurpose(d.task)}</p>
      <article className="document-sheet">
        <h3>{L("Texto exato da instrução", "Exact instruction text")}</h3>
        {instructions
          .split("\n")
          .filter(Boolean)
          .map((s, i) => (
            <p className="instruction-paragraph" lang="en" key={i}>
              {s}
            </p>
          ))}
      </article>
      <p className="muted">
        {L(
          "A resposta deve conter itens, relações ou impactos e suas evidências. O contrato JSON completo fica no download técnico.",
          "The response must contain items, relationships or impacts and supporting evidence. The complete JSON contract is available in the technical download.",
        )}
      </p>
      <small>Hash: {d.prompt_hash}</small>
    </section>
  );
}
export function OutputView({ detail: d, scenario, onScenario }) {
  const o = d.result?.parsed_output;
  if (!o) return <Empty />;
  const cases = o.scenarios || [],
    selected = cases.find((s) => s.scenario_id === scenario) || cases[0];
  return (
    <section>
      <div className="inspector-caption">
        <strong>
          {L(
            "RESPOSTA · produzida pelo modelo",
            "OUTPUT · produced by the model",
          )}
        </strong>
        <span>{countOutput(o)}</span>
      </div>
      {selected ? (
        <>
          <label className="scenario-selector">
            {L("Cenário da resposta", "Output scenario")}
            <select
              aria-label={L("Cenário da resposta", "Output scenario")}
              value={selected.scenario_id}
              onChange={(e) => onScenario(e.target.value)}
            >
              {cases.map((s) => (
                <option key={s.scenario_id}>{s.scenario_id}</option>
              ))}
            </select>
          </label>
          <p>
            {
              d.input?.scenarios?.find((s) => s.id === selected.scenario_id)
                ?.description
            }
          </p>
          <h3>
            {selected.impacts.length}{" "}
            {L(
              "requisitos apontados para revisão",
              "requirements flagged for review",
            )}
          </h3>
          {selected.impacts.length ? (
            selected.impacts.map((i) => (
              <article className="model-impact-answer" key={i.requirement_id}>
                <h4>{i.requirement_id}</h4>
                <div className="dependency-path">
                  <b>{i.dependency?.source}</b>
                  <span>→ {relationName(i.dependency?.relationship)} →</span>
                  <b>{i.dependency?.target}</b>
                </div>
                <p lang="en">{i.explanation}</p>
                <Evidence items={i.source_evidence} />
                {!!i.technical_claims?.length && (
                  <Facts items={i.technical_claims} />
                )}
              </article>
            ))
          ) : (
            <p className="model-no-impact">
              {L(
                "O modelo respondeu que nenhum requisito precisa de revisão neste cenário.",
                "The model answered that no requirement needs review in this scenario.",
              )}
            </p>
          )}
        </>
      ) : (
        <>
          {o.parameters && <Facts items={o.parameters} />}{" "}
          {o.edges && <Edges items={o.edges} />}
          <details
            className="inspector-change"
            open={!o.parameters && !o.edges}
          >
            <summary>
              {o.nodes?.length || 0}{" "}
              {L("itens identificados", "identified items")}
            </summary>
            <Nodes items={o.nodes} />
          </details>
        </>
      )}
    </section>
  );
}
export function TruthView({ detail: d, scenario, onScenario }) {
  const gt = d.ground_truth;
  if (!gt) return <Empty />;
  const cases = gt.change_scenarios.filter((s) =>
      d.scenario_ids.includes(s.id),
    ),
    selected = cases.find((s) => s.id === scenario) || cases[0];
  return (
    <section>
      <div className="inspector-caption reference">
        <strong>
          {L("REFERÊNCIA · somente avaliação", "REFERENCE · evaluation only")}
        </strong>
        <span>{L("Não é uma resposta do modelo", "Not a model response")}</span>
      </div>
      {d.task === "relationship_extraction" ? (
        <Edges items={gt.relationships} />
      ) : d.task === "entity_extraction" ? (
        <>
          <Facts items={gt.entities.parameters} />
          <Nodes items={gt.entities.nodes} />
        </>
      ) : selected ? (
        <>
          <label className="scenario-selector">
            {L("Cenário de referência", "Reference scenario")}
            <select
              value={selected.id}
              onChange={(e) => onScenario(e.target.value)}
            >
              {cases.map((s) => (
                <option key={s.id}>{s.id}</option>
              ))}
            </select>
          </label>
          <p>{selected.description}</p>
          <div className="table-scroll">
            <table className="inspector-table">
              <thead>
                <tr>
                  <th>{L("Requisito", "Requirement")}</th>
                  <th>{L("Impacto esperado", "Expected impact")}</th>
                </tr>
              </thead>
              <tbody>
                {gt.requirements.map((r) => (
                  <tr key={r.id}>
                    <th>
                      {r.id}
                      <small>{r.text}</small>
                    </th>
                    <td>
                      {selected.affected_requirements.includes(r.id)
                        ? L("Precisa de revisão", "Needs review")
                        : L("Sem impacto", "No impact")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{selected.expected_reason}</p>
        </>
      ) : (
        <Empty />
      )}
    </section>
  );
}
export function MetricsView({ detail: d, onInspect }) {
  const m = d.result?.metrics;
  if (!m)
    return (
      <Empty
        text={L(
          "Sem métricas: esta execução não foi avaliada.",
          "No metrics: this execution was not evaluated.",
        )}
      />
    );
  return (
    <section>
      <div className="inspector-caption">
        <strong>
          {L(
            "AVALIAÇÃO · calculada pelo benchmark",
            "EVALUATION · calculated by the benchmark",
          )}
        </strong>
        <span>{L("1 resposta avaliada", "1 evaluated response")}</span>
      </div>
      <div className="inspector-metric-grid">
        {["entity", "parameter", "relationship", "impact"]
          .filter((k) => m[k])
          .map((k) => {
            const f = m[k];
            return (
              <article key={k}>
                <h3>
                  {
                    {
                      entity: L("Itens", "Entities"),
                      parameter: L("Parâmetros", "Parameters"),
                      relationship: L("Relações", "Relationships"),
                      impact: L("Impactos", "Impacts"),
                    }[k]
                  }
                </h3>
                <dl>
                  {["precision", "recall", "f1"].map((n) => (
                    <div key={n}>
                      <dt>
                        <details>
                          <summary>{metricLabel(`${k}_${n}`)}</summary>
                          <p>
                            {n === "precision"
                              ? L(
                                  "Itens corretos ÷ itens previstos.",
                                  "Correct items ÷ predicted items.",
                                )
                              : n === "recall"
                                ? L(
                                    "Itens corretos ÷ itens esperados.",
                                    "Correct items ÷ expected items.",
                                  )
                                : L(
                                    "2 × acertos ÷ (2 × acertos + extras + ausentes).",
                                    "2 × correct ÷ (2 × correct + extra + missing).",
                                  )}
                          </p>
                          <p>
                            {L(
                              "Amostra: esta resposta avaliada. Interrupções e falhas técnicas são excluídas.",
                              "Sample: this evaluated response. Interruptions and technical failures are excluded.",
                            )}
                          </p>
                          {["correct", "false_positives", "missing"].map(
                            (group) => (
                              <div
                                key={group}
                                className={
                                  group === "correct"
                                    ? "answer-good"
                                    : "answer-bad"
                                }
                              >
                                <b>
                                  {
                                    {
                                      correct: L("Corretos", "Correct"),
                                      false_positives: L("Extras", "Extra"),
                                      missing: L("Ausentes", "Missing"),
                                    }[group]
                                  }
                                </b>
                                <ul>
                                  {(f[group] || []).map((id, i) => (
                                    <li key={i}>
                                      <button onClick={onInspect}>
                                        {Array.isArray(id)
                                          ? id.join(" → ")
                                          : id}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ),
                          )}
                          <button onClick={onInspect}>
                            {L(
                              "Inspecionar itens e evidências",
                              "Inspect items and evidence",
                            )}
                          </button>
                        </details>
                      </dt>
                      <dd
                        className={
                          f[n] === 1
                            ? "answer-good"
                            : f[n] > 0
                              ? "answer-warn"
                              : "answer-bad"
                        }
                      >
                        {percent(f[n])}
                        <small>
                          {n === "precision"
                            ? `${f.tp} / ${f.tp + f.fp}`
                            : n === "recall"
                              ? `${f.tp} / ${f.tp + f.fn}`
                              : `${2 * f.tp} / ${2 * f.tp + f.fp + f.fn}`}
                        </small>
                      </dd>
                    </div>
                  ))}
                </dl>
                <p>
                  <span className="answer-good">
                    {f.tp} {L("corretos", "correct")}
                  </span>{" "}
                  ·{" "}
                  <span className={f.fp || f.fn ? "answer-bad" : ""}>
                    {f.fp} {L("extras", "extra")} · {f.fn}{" "}
                    {L("ausentes", "missing")}
                  </span>
                </p>
                {f.tp + f.fp === 0 && (
                  <small>
                    {L(
                      "Sem previsões: a convenção do avaliador define a precisão.",
                      "No predictions: precision follows the evaluator convention.",
                    )}
                  </small>
                )}
              </article>
            );
          })}
      </div>
      <div className="inspector-rate-grid">
        {[
          "value_accuracy",
          "unit_accuracy",
          "source_attribution_accuracy",
          "unsupported_fact_rate",
          "unsupported_relationship_rate",
          "critical_impact_miss_rate",
          "explanation_rule_pass_rate",
          "schema_compliance_rate",
        ]
          .filter((k) => m[k] != null)
          .map((k) => (
            <details key={k}>
              <summary>
                {metricLabel(k)}{" "}
                <strong
                  className={
                    (
                      k.startsWith("unsupported_") ||
                      k === "critical_impact_miss_rate"
                        ? m[k] === 0
                        : m[k] === 1
                    )
                      ? "answer-good"
                      : "answer-warn"
                  }
                >
                  {percent(m[k])}
                </strong>
              </summary>
              <p>
                {d.metric_explanations?.[k]
                  ? `${d.metric_explanations[k].numerator} / ${d.metric_explanations[k].denominator}`
                  : L(
                      "Contagem detalhada indisponível nesta execução.",
                      "Detailed count unavailable in this execution.",
                    )}
              </p>
              <p>
                {L(
                  "Base: uma resposta avaliada. Interrupções e falhas técnicas são excluídas.",
                  "Based on one evaluated response. Interruptions and technical errors are excluded.",
                )}
              </p>
              <button onClick={onInspect}>
                {L("Abrir verificações dos itens", "Open item checks")}
              </button>
            </details>
          ))}
      </div>
      <dl className="inspector-properties">
        {[
          [L("Latência", "Latency"), `${number(d.result.latency_seconds)} s`],
          [
            L("Tokens de entrada", "Input tokens"),
            number(d.result.tokens?.input),
          ],
          [
            L("Tokens de saída", "Output tokens"),
            number(d.result.tokens?.output),
          ],
          [L("Custo", "Cost"), money(d.result.cost_usd)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
export function InspectionStory({ detail: d, onTab }) {
  const o = d.result?.parsed_output,
    failures = Object.entries(d.failure_counts || {}),
    bad = d.status === "COMPLETED_INCORRECT",
    correct = d.status === "COMPLETED_CORRECT";
  return (
    <div className="inspection-story">
      <div className="inspector-story-grid">
        <button onClick={() => onTab("input")}>
          <span className="step-number">01</span>
          <h3>
            {wasSent(d)
              ? L("O que entrou", "What went in")
              : L("Entrada prevista", "Planned input")}
          </h3>
          <ul>
            {Object.keys(d.input?.documents || {}).map((k) => (
              <li key={k}>▤ {documentName(k)}</li>
            ))}
          </ul>
          {!!d.input?.scenarios?.length && (
            <p>
              {d.input.scenarios.length}{" "}
              {L("mudanças propostas", "proposed changes")}
            </p>
          )}
          <span>
            {wasSent(d)
              ? L("Abrir documentos enviados", "Open submitted documents")
              : L("Ver documentos previstos", "View planned documents")}{" "}
            →
          </span>
        </button>
        <button onClick={() => onTab("output")}>
          <span className="step-number">02</span>
          <h3>{L("O que o modelo respondeu", "What the model returned")}</h3>
          <strong>{countOutput(o)}</strong>
          {o?.scenarios && (
            <ul>
              {o.scenarios.map((s) => (
                <li key={s.scenario_id}>
                  <b>{s.scenario_id}</b>
                  <span>
                    {s.impacts.map((i) => i.requirement_id).join(", ") ||
                      L("Nenhum impacto previsto", "No predicted impact")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {o?.edges && (
            <p>
              {L(
                "Relações direcionadas, justificativas e citações.",
                "Directed relationships, explanations and citations.",
              )}
            </p>
          )}
          {o?.parameters && (
            <p>
              {L(
                "Valores, unidades e fontes extraídos pelo modelo.",
                "Values, units and sources extracted by the model.",
              )}
            </p>
          )}
          <span>{L("Ler a resposta", "Read the response")} →</span>
        </button>
        <button
          className={
            bad
              ? "story-verdict bad"
              : correct
                ? "story-verdict good"
                : "story-verdict"
          }
          onClick={() => onTab("comparison")}
        >
          <span className="step-number">03</span>
          <h3>
            {L("O que a avaliação concluiu", "What the evaluation found")}
          </h3>
          <strong>
            {bad
              ? L("Resposta com erros", "Answer has errors")
              : correct
                ? L("Resposta correta pelas regras", "Correct under the rules")
                : L("Sem avaliação", "Not evaluated")}
          </strong>
          {failures.length > 0 && (
            <ul>
              {failures.map(([k, n]) => (
                <li key={k}>
                  × {n} {issueLabel(k)}
                </li>
              ))}
            </ul>
          )}
          <span>
            {L("Conferir requisito por requisito", "Check each evaluated item")}{" "}
            →
          </span>
        </button>
      </div>
      <div className="inspector-task-strip">
        <strong>{taskLabel(d.task)}</strong>
        <span>{taskPurpose(d.task)}</span>
        <button onClick={() => onTab("prompt")}>
          {L("Ver instrução", "Read instruction")} →
        </button>
      </div>
    </div>
  );
}
function download(name, value) {
  const text =
      typeof value === "string" ? value : JSON.stringify(value, null, 2),
    url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function TechnicalView({ detail: d }) {
  return (
    <section>
      <h3>
        {L("Arquivos originais desta execução", "Original execution files")}
      </h3>
      <p>
        {L(
          "Downloads para auditoria. A leitura visual está nas outras abas.",
          "Audit downloads. Use the other tabs for visual inspection.",
        )}
      </p>
      <div className="technical-downloads">
        {[
          [L("Pedido completo", "Complete request"), "request.txt", d.prompt],
          [
            L("Resposta original da API", "Raw API response"),
            "api.json",
            d.result?.raw_response ||
              d.call?.raw_response ||
              d.response_checkpoint,
          ],
          [
            L("Saída estruturada", "Structured output"),
            "output.json",
            d.result?.parsed_output,
          ],
          [
            L("Métricas completas", "Complete metrics"),
            "metrics.json",
            d.result?.metrics,
          ],
        ].map(([label, file, value]) => (
          <button
            key={file}
            disabled={value == null}
            onClick={() => download(`${d.id}-${file}`, value)}
          >
            ↓ {label}
          </button>
        ))}
      </div>
      <dl className="inspector-properties">
        {[
          [L("Provedor", "Provider"), d.provider],
          [L("Modelo", "Model"), d.model],
          [L("Execução", "Execution"), d.id],
          [
            L("Versão do dataset", "Dataset version"),
            d.snapshot_metadata?.dataset_version,
          ],
          [L("Hash do prompt", "Prompt hash"), d.prompt_hash],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
