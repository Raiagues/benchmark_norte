import { Modal, Tabs, PagedItems, PagedText } from "./ScreenUI";
import React, { useEffect, useState } from "react";
import Icon from "./Icon";
import { L, t, locale } from "./i18n";

const taskNames = {
  entity_extraction: "Extração de dados",
  relationship_extraction: "Relações",
  change_impact: "Impactos",
  impact_explanation: "Explicações",
  one_hop: "Raciocínio de um passo",
};
const nodeNames = {
  FAN: "Ventilador",
  SENSOR: "Sensor de temperatura",
  DRIVER: "Chave de alimentação",
  "REQ-001": "Limite de corrente",
  "REQ-002": "Velocidade mínima",
  "REQ-003": "Temperatura de ativação",
  "REQ-004": "Alimentação do sensor",
  "REQ-005": "Capacidade da chave",
  "P-FAN-CURRENT": "Corrente do ventilador",
  "P-FAN-SPEED": "Velocidade do ventilador",
  "P-FAN-VOLTAGE": "Tensão do ventilador",
  "P-SENSOR-SUPPLY": "Faixa de tensão do sensor",
  "P-DRIVER-CURRENT": "Corrente da chave",
  "P-DRIVER-VOLTAGE": "Tensão da chave",
  "CFG-THRESHOLD": "Limiar configurado",
  "CFG-SENSOR-SUPPLY": "Tensão configurada",
  "V-SPEED": "Teste de velocidade",
};
const relNames = {
  has_parameter: "Tem parâmetro",
  constrains: "Limita",
  depends_on: "Depende de",
  verified_by: "Verificado por",
};
const kinds = {
  node: ["Entidades", "Entities", "model"],
  parameter: ["Valores esperados", "Expected values", "config"],
  relationship: ["Relações esperadas", "Expected relationships", "graph"],
  scenario: ["Impactos esperados", "Expected impacts", "change"],
  requirement: ["Requisitos críticos", "Critical requirements", "reference"],
};
const pretty = (value) =>
  Array.isArray(value) ? value.join(" – ") : String(value);
const edgeKey = (e) => [e.source, e.relationship, e.target].join("|");
const name = (id) => t(nodeNames[id] || id);
const date = (v) => new Date(v).toLocaleString(locale());
function Tag({ kind = "input", children }) {
  return (
    <span className={`role-tag ${kind}`}>
      <Icon
        name={
          kind === "reference" ? "lock" : kind === "output" ? "output" : "input"
        }
        size={13}
      />
      {children ||
        (kind === "reference"
          ? L("Gabarito · reservado", "Reference · withheld")
          : kind === "output"
            ? L("Saída do modelo", "Model output")
            : L("Entrada do modelo", "Model input"))}
    </span>
  );
}
function SourceText({ children, summary }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="source-text" lang="en" data-source-content>
      {!summary && <p>{children}</p>}
      {(summary || String(children).length > 230) && (
        <button onClick={() => setOpen(true)}>
          {summary || L("Ler completo", "Read full text")} ↗
        </button>
      )}
      {open && (
        <Modal
          title={L("Conteúdo original", "Original content")}
          onClose={() => setOpen(false)}
        >
          <PagedText text={String(children)} />
        </Modal>
      )}
    </div>
  );
}
function Fields({ entries }) {
  return (
    <dl className="fact-grid">
      {entries.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function Pipeline({ runs }) {
  const steps = [
    [
      "input",
      L("O que entra", "What goes in"),
      L(
        "Documentos, requisitos e uma alteração proposta.",
        "Documents, requirements and a proposed change.",
      ),
      "inputs",
    ],
    [
      "model",
      L("O que o modelo faz", "What the model does"),
      L(
        "Segue um prompt: instruções escritas para a tarefa.",
        "Follows a prompt: written instructions for the task.",
      ),
      "inputs",
    ],
    [
      "output",
      L("O que ele devolve", "What it returns"),
      L(
        "Dados, relações e impactos com evidências.",
        "Data, relationships and impacts with evidence.",
      ),
      "inputs",
    ],
    [
      "reference",
      L("Como avaliamos", "How we evaluate"),
      L(
        "Código compara a resposta com o gabarito revisável.",
        "Code compares the answer with a reviewable reference.",
      ),
      "criteria",
    ],
  ];
  return (
    <section
      className="pipeline"
      aria-label={L(
        "Entrada, modelo, saída e avaliação",
        "Input, model, output and evaluation",
      )}
    >
      {steps.map(([icon, title, desc, target], i) => (
        <a
          className={`pipeline-step step-${i}`}
          href={`#${target}`}
          key={icon}
          onClick={() => {
            if (target === "inputs")
              sessionStorage.setItem(
                "norte-input-tab",
                ["received", "instructions", "returns"][i],
              );
          }}
        >
          <span className="step-top">
            <span className="step-icon">
              <Icon name={icon} size={25} />
            </span>
            <span>0{i + 1}</span>
          </span>
          <h3>{title}</h3>
          <p>{desc}</p>
          <span className="step-caption">
            {i === 2
              ? `${runs.length} ${L("avaliações concluídas", "completed evaluations")}`
              : i === 3
                ? L("Sem outro modelo como juiz", "No model acting as judge")
                : i === 1
                  ? L("Mesmo pedido para todos", "Same request for every model")
                  : L("Conteúdo inspecionável", "Inspectable content")}
            <Icon name="arrow" size={15} />
          </span>
        </a>
      ))}
    </section>
  );
}
export default function Benchmark({ page, api, runs, refresh, datasetHash }) {
  const [bench, setBench] = useState(null),
    [error, setError] = useState(""),
    [modal, setModal] = useState(null),
    [category, setCategory] = useState("relationship"),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false),
    [showHistory, setShowHistory] = useState(false);
  const reload = async () => {
    const b = await api("/benchmark");
    setBench(b);
    return b;
  };
  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, [datasetHash]);
  if (!bench)
    return (
      <p role={error ? "alert" : undefined}>
        {error ? t(error) : L("Carregando o benchmark…", "Loading benchmark…")}
      </p>
    );
  const ds = bench.dataset,
    gt = ds.ground_truth;
  const refs = {
    node: gt.entities.nodes,
    parameter: gt.entities.parameters,
    relationship: gt.relationships,
    scenario: gt.change_scenarios,
    requirement: gt.requirements,
  };
  function edit(kind, item_id, value) {
    setModal({
      type: "edit",
      kind,
      item_id,
      value,
      expected_hash: bench.edit_hash,
    });
    setError("");
  }
  function inspect(value) {
    setModal({ type: "evidence", value });
  }
  async function review(kind, value, verdict, comment = "") {
    const item_key = `${kind}:${kind === "relationship" ? edgeKey(value) : value.id}`;
    if (verdict === "rejected" && !comment) {
      setModal({ type: "reject", kind, value });
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api("/benchmark/review", "POST", {
        item_key,
        verdict,
        comment,
        expected_hash: bench.review.dataset_hash,
      });
      await reload();
      setModal(null);
      setNotice(
        L(
          "Revisão salva. Nenhuma resposta de modelo foi criada.",
          "Review saved. No model response was created.",
        ),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  async function save(kind, item_id, value, note) {
    setSaving(true);
    setError("");
    try {
      await api("/benchmark/edit", "POST", {
        kind,
        item_id,
        value,
        note,
        expected_hash: modal?.expected_hash || bench.edit_hash,
      });
      await reload();
      await refresh();
      setModal(null);
      setNotice(
        L(
          "Nova versão salva. Revise o gabarito antes da próxima avaliação.",
          "New version saved. Review the reference before the next evaluation.",
        ),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  const progress = bench.review.total
    ? Math.round((bench.review.accepted / bench.review.total) * 100)
    : 0;
  return (
    <div className="benchmark-workbench">
      {notice && (
        <p className="notice success" role="status">
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label={L("Fechar aviso", "Dismiss notice")}
          >
            ×
          </button>
        </p>
      )}
      {error && !modal && (
        <p className="notice error" role="alert">
          {t(error)}
        </p>
      )}
      {page === "documents" && (
        <>
          <section className="benchmark-hero">
            <div>
              <span className="eyebrow">
                {L(
                  "UM SISTEMA PEQUENO. UMA COMPARAÇÃO CLARA.",
                  "A SMALL SYSTEM. A CLEAR COMPARISON.",
                )}
              </span>
              <h2>
                {L(
                  "O mesmo sistema. Diferentes modelos.",
                  "One system. Different models.",
                )}
              </h2>
              <p>
                {L(
                  "Qual modelo entende as relações de engenharia e identifica o que precisa ser revisto quando algo muda?",
                  "Which model understands engineering relationships and identifies what needs review when something changes?",
                )}
              </p>
              <a className="button primary" href="#inputs">
                {L("Explorar as entradas", "Explore the inputs")}
                <Icon name="arrow" size={17} />
              </a>
            </div>
            <div
              className="system-illustration"
              aria-label={L(
                "Sistema conceitual: sensor, controle e ventilador",
                "Conceptual system: sensor, control and fan",
              )}
            >
              <span className="system-label">
                {L("CONTROLE DE TEMPERATURA", "TEMPERATURE CONTROL")}
              </span>
              <div className="hardware-chain">
                <span>
                  <Icon name="sensor" size={47} />
                  <small>TMP117</small>
                </span>
                <i>→</i>
                <span>
                  <Icon name="switch" size={47} />
                  <small>TPS22919</small>
                </span>
                <i>→</i>
                <span>
                  <Icon name="fan" size={57} />
                  <small>NF-A4x10</small>
                </span>
              </div>
              <p>
                ESP32 · {L("controlador conceitual", "conceptual controller")}
              </p>
              <span className="outline-tag">
                {L(
                  "Estudo documental · sem hardware medido",
                  "Document study · no hardware measurements",
                )}
              </span>
            </div>
          </section>
          <Pipeline runs={runs} />
          <section className="boundary-note">
            <Icon name="lock" />
            <div>
              <strong>
                {L(
                  "O gabarito fica do lado da avaliação.",
                  "The reference stays on the evaluation side.",
                )}
              </strong>
              <p>
                {L(
                  "Os arquivos com respostas esperadas não são incluídos no pedido ao modelo. Em L1, os documentos descrevem relações explícitas para extrair; L2 remove essas pistas.",
                  "Files containing expected answers are not included in the model request. In L1, documents describe explicit relationships to extract; L2 removes those hints.",
                )}
              </p>
            </div>
            <a href="#reference">
              {L("Revisar gabarito", "Review reference")} →
            </a>
          </section>
          <section className="benchmark-inventory">
            {[
              [3, L("componentes reais", "real components"), "fan", "input"],
              [
                gt.requirements.length,
                L("requisitos de projeto", "project requirements"),
                "document",
                "input",
              ],
              [
                gt.change_scenarios.length,
                L("alterações propostas", "proposed changes"),
                "change",
                "input",
              ],
              [
                gt.relationships.length,
                L("relações no gabarito", "reference relationships"),
                "graph",
                "reference",
              ],
            ].map(([n, label, icon, role]) => (
              <a
                href={role === "reference" ? "#reference" : "#inputs"}
                key={label}
              >
                <Icon name={icon} />
                <strong>{n}</strong>
                <span>{label}</span>
                <Tag kind={role} />
              </a>
            ))}
          </section>
        </>
      )}
      {page === "inputs" && (
        <Inputs bench={bench} api={api} edit={edit} runs={runs} />
      )}
      {page === "criteria" && <Criteria />}
      {page === "reference" && (
        <>
          <section className="reference-hero">
            <div>
              <Tag kind="reference" />
              <h2>{L("Revisão do gabarito", "Reference review")}</h2>
              <p>
                {L(
                  "Referência provisória, independente das respostas avaliadas. Confirme, recuse ou edite cada item.",
                  "Provisional reference, independent of evaluated answers. Confirm, reject or edit each item.",
                )}
              </p>
              <div className="review-totals">
                <span>
                  <i className="dot approved" />
                  {bench.review.accepted} {L("confirmados", "confirmed")}
                </span>
                <span>
                  <i className="dot pending" />
                  {bench.review.pending} {L("pendentes", "pending")}
                </span>
                <span>
                  <i className="dot rejected" />
                  {bench.review.rejected} {L("recusados", "rejected")}
                </span>
              </div>
            </div>
            <div
              className="review-ring"
              style={{ "--progress": `${progress}%` }}
            >
              <div>
                <strong>{progress}%</strong>
                <span>{L("revisão humana", "human review")}</span>
              </div>
            </div>
          </section>
          {bench.review.rejected > 0 && (
            <p className="notice error">
              {L(
                "Há itens recusados. Novas avaliações ficam bloqueadas até a referência ser corrigida ou confirmada.",
                "There are rejected items. New evaluations are blocked until the reference is corrected or confirmed.",
              )}
            </p>
          )}
          <nav
            className="reference-tabs"
            aria-label={L("Partes do gabarito", "Reference sections")}
          >
            {Object.entries(kinds).map(([key, [pt, en, icon]]) => (
              <button
                className={category === key ? "active" : ""}
                key={key}
                onClick={() => setCategory(key)}
              >
                <Icon name={icon} />
                <span>{L(pt, en)}</span>
                <b>{refs[key].length}</b>
              </button>
            ))}
          </nav>
          <p className="context-caption">
            {category === "requirement"
              ? L(
                  "O texto do requisito é enviado ao modelo. A classificação de criticidade abaixo pertence à avaliação.",
                  "Requirement text is sent to the model. The criticality classification below belongs to evaluation.",
                )
              : category === "scenario"
                ? L(
                    "A descrição da alteração é entrada. Os impactos e a razão esperados abaixo são o gabarito reservado.",
                    "The change description is input. Expected impacts and reasons below are the withheld reference.",
                  )
                : L(
                    "Estes são valores esperados para comparar com a saída. Não são resultados gerados por um modelo.",
                    "These are expected values for comparison with the output. They are not model-generated results.",
                  )}
          </p>
          <div className={`reference-cards reference-${category}`}>
            <PagedItems items={refs[category]} resetKey={category}>
              {(value) => {
                const id =
                  category === "relationship" ? edgeKey(value) : value.id;
                const state = bench.review.items[`${category}:${id}`];
                return (
                  <article className="reference-card" key={id}>
                    <div className="reference-card-heading">
                      <span
                        className={`review-status ${state?.verdict || "pending"}`}
                      >
                        {state?.verdict === "accepted"
                          ? L("✓ Confirmado", "✓ Confirmed")
                          : state?.verdict === "rejected"
                            ? L("× Recusado", "× Rejected")
                            : L("○ Aguarda revisão", "○ Awaiting review")}
                      </span>
                      <code>
                        {category === "relationship"
                          ? L("Relação direcionada", "Directed relationship")
                          : id}
                      </code>
                    </div>
                    {category === "relationship" ? (
                      <>
                        <div className="relationship-triplet">
                          <span>
                            <small>{value.source}</small>
                            <strong>{name(value.source)}</strong>
                          </span>
                          <span className="relationship-verb">
                            {t(relNames[value.relationship])}
                            <Icon name="arrow" />
                          </span>
                          <span>
                            <small>{value.target}</small>
                            <strong>{name(value.target)}</strong>
                          </span>
                        </div>
                        <SourceText>{value.reason}</SourceText>
                      </>
                    ) : category === "parameter" ? (
                      <>
                        <h3>{name(value.id)}</h3>
                        <div className="expected-value">
                          {pretty(value.values)} <span>{value.unit}</span>
                        </div>
                        <span className="subtle-label">
                          {L("Valor esperado", "Expected value")} ·{" "}
                          {value.qualifier}
                        </span>
                      </>
                    ) : category === "scenario" ? (
                      <>
                        <h3>{t(value.title)}</h3>
                        <div className="scenario-input-label">
                          <Tag />
                          {value.difficulty}
                        </div>
                        <SourceText
                          summary={L(
                            "Ver descrição da alteração",
                            "View change description",
                          )}
                        >
                          {value.description}
                        </SourceText>
                        <div className="expected-impacts">
                          <strong>
                            {L("Precisam de revisão", "Need review")}
                          </strong>
                          <div>
                            {value.affected_requirements.length ? (
                              value.affected_requirements.map((id) => (
                                <span className="requirement-pill" key={id}>
                                  {id}
                                  {value.critical_requirements.includes(id) &&
                                    " !"}
                                </span>
                              ))
                            ) : (
                              <span>
                                {L("Nenhum requisito", "No requirements")}
                              </span>
                            )}
                          </div>
                          <strong>
                            {L("Permanecem sem impacto", "Remain unaffected")}
                          </strong>
                          <div>
                            {value.unaffected_requirements.map((id) => (
                              <span
                                className="requirement-pill unaffected"
                                key={id}
                              >
                                {id}
                              </span>
                            ))}
                          </div>
                        </div>
                        <SourceText
                          summary={L(
                            "Por que esses requisitos?",
                            "Why these requirements?",
                          )}
                        >
                          {value.expected_reason}
                        </SourceText>
                      </>
                    ) : category === "node" ? (
                      <>
                        <h3>{name(value.id)}</h3>
                        <SourceText>{value.name}</SourceText>
                        <Fields
                          entries={[
                            [L("Tipo esperado", "Expected type"), value.type],
                            [
                              L("Origem esperada", "Expected source"),
                              `${value.source} · ${value.source_reference}`,
                            ],
                          ]}
                        />
                      </>
                    ) : (
                      <>
                        <h3>{name(value.id)}</h3>
                        <SourceText>{value.text}</SourceText>
                        <span
                          className={
                            value.critical ? "critical-tag" : "outline-tag"
                          }
                        >
                          {value.critical
                            ? L(
                                "Perder este impacto conta como falha crítica",
                                "Missing this impact counts as a critical miss",
                              )
                            : L(
                                "Não classificado como crítico",
                                "Not classified as critical",
                              )}
                        </span>
                      </>
                    )}
                    {state?.comment && (
                      <p className="review-comment">
                        {L("Nota da revisão:", "Review note:")} {state.comment}
                      </p>
                    )}
                    <div className="reference-actions">
                      <button
                        disabled={saving}
                        onClick={() => review(category, value, "accepted")}
                      >
                        <Icon name="check" size={16} />
                        {L("Confirmar", "Confirm")}
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => review(category, value, "rejected")}
                      >
                        <Icon name="close" size={16} />
                        {L("Recusar", "Reject")}
                      </button>
                      <button
                        disabled={saving}
                        onClick={() => edit(category, id, value)}
                      >
                        <Icon name="edit" size={16} />
                        {L("Editar", "Edit")}
                      </button>
                      {value.source_evidence && (
                        <button onClick={() => inspect(value.source_evidence)}>
                          {L("Evidências", "Evidence")} ↗
                        </button>
                      )}
                    </div>
                  </article>
                );
              }}
            </PagedItems>
          </div>
          <button
            className="history-button"
            onClick={() => setShowHistory(true)}
          >
            <Icon name="history" size={15} />
            {L("Histórico de alterações", "Edit history")}
          </button>
          {showHistory && (
            <Modal
              title={L("Histórico de alterações", "Edit history")}
              onClose={() => setShowHistory(false)}
            >
              <section className="revision-history">
                <div className="bench-section-heading">
                  <h2>
                    <Icon name="history" />
                    {L("Histórico de alterações", "Edit history")}
                  </h2>
                  <span>{ds.manifest.dataset_version}</span>
                </div>
                <p>
                  {L(
                    "Edições são salvas localmente como novas versões. Resultados anteriores mantêm seus próprios documentos e gabarito.",
                    "Edits are stored locally as new versions. Previous results retain their own documents and reference.",
                  )}
                </p>
                {bench.history.revisions.length ? (
                  <ol>
                    {bench.history.revisions.map((r) => (
                      <li key={r.id}>
                        <strong>{r.dataset_version}</strong>
                        <span>
                          {r.item_id} · {date(r.created_at)}
                        </span>
                        <p>{r.note}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="muted">
                    {L(
                      "Nenhuma edição local. Versão original do repositório.",
                      "No local edits. Original repository version.",
                    )}
                  </p>
                )}
              </section>
            </Modal>
          )}
        </>
      )}
      {modal && (
        <Modal
          title={
            modal.type === "edit"
              ? L("Editar e criar nova versão", "Edit and create a new version")
              : modal.type === "reject"
                ? L("Recusar item do gabarito", "Reject reference item")
                : L("Evidências esperadas", "Expected evidence")
          }
          onClose={() => setModal(null)}
        >
          {error && (
            <p role="alert" className="notice error">
              {t(error)}
            </p>
          )}
          {modal.type === "edit" ? (
            <Editor
              data={modal}
              ds={ds}
              saving={saving}
              onSave={save}
              onClose={() => setModal(null)}
            />
          ) : modal.type === "reject" ? (
            <RejectForm
              saving={saving}
              onSave={(comment) =>
                review(modal.kind, modal.value, "rejected", comment)
              }
            />
          ) : (
            modal.value.map((e, i) => (
              <blockquote className="evidence-quote" key={i}>
                <span>
                  {e.document_id} · {e.location}
                </span>
                <SourceText>{e.excerpt}</SourceText>
              </blockquote>
            ))
          )}
        </Modal>
      )}
    </div>
  );
}

function Inputs({ bench, api, edit, runs }) {
  const [task, setTask] = useState("relationship_extraction"),
    [level, setLevel] = useState("L1_DIRECT"),
    [mode, setMode] = useState("controlled_text"),
    [doc, setDoc] = useState("FAN"),
    [tab, setTab] = useState(() => {
      const v = sessionStorage.getItem("norte-input-tab") || "received";
      sessionStorage.removeItem("norte-input-tab");
      return v;
    }),
    [preview, setPreview] = useState(null),
    [error, setError] = useState(""),
    [info, setInfo] = useState(null),
    [promptPart, setPromptPart] = useState("common");
  const effectiveLevel =
    task === "one_hop"
      ? "L2_ONE_HOP"
      : task === "impact_explanation"
        ? level
        : "L1_DIRECT";
  useEffect(() => {
    let live = true;
    setPreview(null);
    setError("");
    api(
      `/benchmark/preview?task=${task}&difficulty=${effectiveLevel}&input_mode=${mode}`,
    )
      .then((p) => {
        if (live) setPreview(p);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [task, effectiveLevel, mode, bench.edit_hash]);
  const docs = {
    FAN: [L("Ventilador", "Fan"), "fan"],
    SENSOR: [L("Sensor de temperatura", "Temperature sensor"), "sensor"],
    DRIVER: [L("Chave de alimentação", "Power switch"), "switch"],
    REQUIREMENTS: [
      L("Requisitos do projeto", "Project requirements"),
      "document",
    ],
    PROJECT: [
      L("Condições e verificações", "Conditions and verification"),
      "reference",
    ],
    CONFIG: [L("Configuração", "Configuration"), "config"],
    CHANGES: [L("Alterações propostas", "Proposed changes"), "change"],
    SCOPE: [L("Vocabulário e fontes", "Vocabulary and sources"), "graph"],
  };
  const source = bench.dataset.sources.find((s) => s.document_id === doc);
  function download(text, filename) {
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="inputs-screen">
      <div className="preview-controls">
        <label>
          {L("Tarefa", "Task")}
          <select
            aria-label={L("Tarefa da prévia", "Preview task")}
            value={task}
            onChange={(e) => setTask(e.target.value)}
          >
            {Object.entries(taskNames).map(([id, label]) => (
              <option key={id} value={id}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
        {task === "impact_explanation" && (
          <label>
            {L("Nível", "Level")}
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="L1_DIRECT">L1</option>
              <option value="L2_ONE_HOP">L2</option>
            </select>
          </label>
        )}
        <label>
          {L("Documentos", "Documents")}
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="controlled_text">
              {L("Texto controlado", "Controlled text")}
            </option>
            <option value="pdf_text">{L("Texto dos PDFs", "PDF text")}</option>
          </select>
        </label>
        <span className="preview-free">
          {effectiveLevel === "L1_DIRECT" ? "L1" : "L2"} ·{" "}
          {L("Prévia sem chamada de API", "Preview without an API call")}
        </span>
      </div>
      <Tabs
        label={L("Fluxo de informações", "Information flow")}
        value={tab}
        onChange={setTab}
        items={[
          ["received", L("O que recebe", "What it receives")],
          ["instructions", L("Instruções do modelo", "Model instructions")],
          ["returns", L("O que deve devolver", "What it must return")],
          ["exact", L("Mensagem completa", "Complete message")],
        ]}
      />
      {error && (
        <p role="alert" className="notice error">
          {t(error)}
        </p>
      )}
      {preview && (
        <div className="inputs-stage">
          {tab === "received" && (
            <div className="input-explorer">
              <nav aria-label={L("Documentos de entrada", "Input documents")}>
                {Object.entries(docs).map(([id, [label, icon]]) => (
                  <button
                    key={id}
                    onClick={() => setDoc(id)}
                    className={doc === id ? "active" : ""}
                  >
                    <Icon name={icon} size={18} />
                    {label}
                  </button>
                ))}
              </nav>
              <section className="input-content">
                <header className="input-content-heading">
                  <div>
                    <h2>{docs[doc][0]}</h2>
                    <small>
                      {source
                        ? `${source.manufacturer} · ${source.part_number}`
                        : doc}
                    </small>
                  </div>
                  <Tag />
                  {source && (
                    <button onClick={() => setInfo("source")}>
                      {L("Fonte", "Source")} ↗
                    </button>
                  )}
                </header>
                <p className="input-description">
                  {doc === "REQUIREMENTS"
                    ? L(
                        "Regras do projeto enviadas ao modelo. As respostas esperadas ficam no gabarito.",
                        "Project rules sent to the model. Expected answers stay in the reference.",
                      )
                    : doc === "CONFIG"
                      ? L(
                          "Premissas do sistema; não são especificações do fabricante.",
                          "System assumptions; not manufacturer specifications.",
                        )
                      : doc === "CHANGES"
                        ? L(
                            "O modelo recebe a alteração; os impactos esperados ficam reservados.",
                            "The model receives the change; expected impacts are withheld.",
                          )
                        : doc === "PROJECT" && effectiveLevel === "L2_ONE_HOP"
                          ? L(
                              "L2 não recebe PROJECT-05 e PROJECT-06.",
                              "L2 does not receive PROJECT-05 and PROJECT-06.",
                            )
                          : L(
                              "Conteúdo exato enviado ao modelo · original em inglês",
                              "Exact content sent to the model · English original",
                            )}
                </p>
                {preview.input.documents[doc] && (
                  <PagedItems
                    resetKey={`${doc}:${task}:${effectiveLevel}:${mode}`}
                    items={Object.entries(preview.input.documents[doc])}
                  >
                    {([loc, text]) => (
                      <article className="input-passage" key={loc}>
                        <header>
                          <code>{loc}</code>
                          {mode === "controlled_text" && (
                            <button
                              onClick={() =>
                                edit("document", `${doc}:${loc}`, text)
                              }
                              aria-label={`${L("Editar", "Edit")} ${loc}`}
                            >
                              <Icon name="edit" size={14} />
                              {L("Editar entrada", "Edit input")}
                            </button>
                          )}
                        </header>
                        <SourceText>{text}</SourceText>
                      </article>
                    )}
                  </PagedItems>
                )}
                {doc === "CONFIG" && (
                  <PagedItems
                    resetKey="config"
                    items={Object.entries(preview.input.system_config)}
                    size={3}
                  >
                    {([key, value]) => (
                      <article className="config-entry" key={key}>
                        <span>
                          {t(
                            {
                              fan_voltage_V: "Tensão do ventilador (V)",
                              sensor_voltage_V: "Tensão do sensor (V)",
                              activation_threshold_degC:
                                "Temperatura de ativação (°C)",
                              controller_concept: "Controlador conceitual",
                              control: "Tipo de controle",
                              hardware_verified: "Hardware verificado",
                              kind: "Origem",
                              document_id: "Documento",
                            }[key] || key,
                          )}
                        </span>
                        <strong>
                          {typeof value === "boolean"
                            ? value
                              ? L("Sim", "Yes")
                              : L("Não", "No")
                            : value === "benchmark_assumption"
                              ? L(
                                  "Premissa do benchmark",
                                  "Benchmark assumption",
                                )
                              : value === "on_off"
                                ? L("Liga / desliga", "On / off")
                                : value}
                        </strong>
                        {typeof value === "number" && (
                          <button
                            onClick={() => edit("configuration", key, value)}
                          >
                            {L("Editar", "Edit")}
                          </button>
                        )}
                      </article>
                    )}
                  </PagedItems>
                )}
                {doc === "CHANGES" &&
                  (preview.input.scenarios.length ? (
                    <PagedItems resetKey={task} items={preview.input.scenarios}>
                      {(s) => (
                        <article className="input-passage" key={s.id}>
                          <header>
                            <code>
                              {s.id} · {s.difficulty}
                            </code>
                            <button
                              onClick={() =>
                                edit("scenario_input", s.id, s.description)
                              }
                            >
                              {L("Editar alteração", "Edit change")}
                            </button>
                          </header>
                          <small>
                            {s.change_type} · {s.split} · {s.changed_entity}
                          </small>
                          <SourceText>{s.description}</SourceText>
                        </article>
                      )}
                    </PagedItems>
                  ) : (
                    <p className="quiet-empty">
                      {L(
                        "Esta tarefa não recebe cenários. Selecione Impactos para vê-los.",
                        "This task receives no scenarios. Select Impacts to view them.",
                      )}
                    </p>
                  ))}
                {doc === "SCOPE" && (
                  <div className="scope-actions">
                    <button onClick={() => setInfo("scope")}>
                      {L(
                        "Ver vocabulário permitido",
                        "View allowed vocabulary",
                      )}
                    </button>
                    <button onClick={() => setInfo("sources")}>
                      {L("Registro das fontes", "Source registry")}
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}
          {tab === "instructions" && (
            <section className="instructions-screen">
              <div className="compact-heading">
                <Tabs
                  value={promptPart}
                  onChange={setPromptPart}
                  items={[
                    ["common", L("Regras comuns", "Common rules")],
                    ["task", L("Instruções da tarefa", "Task instructions")],
                  ]}
                />
                <button
                  onClick={() =>
                    edit(
                      "prompt",
                      promptPart === "common" ? "common" : task,
                      preview.instructions[promptPart],
                    )
                  }
                >
                  {L("Editar instruções", "Edit instructions")}
                </button>
              </div>
              <p className="input-description">
                {L(
                  "Regras + tarefa + formato de resposta + entradas. Sem correções anteriores na primeira passagem.",
                  "Rules + task + response format + inputs. No previous corrections in first-pass runs.",
                )}
              </p>
              <PagedText
                text={preview.instructions[promptPart]}
                label={L("Prompt original", "Original prompt")}
              />
            </section>
          )}
          {tab === "returns" && (
            <section className="returns-screen">
              <header>
                <Tag kind="output" />
                <h2>
                  {L(
                    "O modelo devolve dados estruturados.",
                    "The model returns structured data.",
                  )}
                </h2>
              </header>
              <div className="output-contract">
                {task === "entity_extraction" ? (
                  <>
                    <Contract
                      icon="model"
                      title={L("Entidades", "Entities")}
                      fields={[
                        "id",
                        "type",
                        "name",
                        "source",
                        "source_reference",
                      ]}
                      text={L(
                        "Componentes, requisitos e parâmetros identificados.",
                        "Identified components, requirements and parameters.",
                      )}
                    />
                    <Contract
                      icon="input"
                      title={L("Valores e evidências", "Values and evidence")}
                      fields={[
                        "values",
                        "unit",
                        "qualifier",
                        "source_evidence",
                      ]}
                      text={L(
                        "Valores numéricos e trechos que os sustentam.",
                        "Numerical values and supporting passages.",
                      )}
                    />
                  </>
                ) : task === "relationship_extraction" ? (
                  <>
                    <Contract
                      icon="graph"
                      title={L("Nós e relações", "Nodes and relationships")}
                      fields={[
                        "nodes",
                        "edges",
                        "source",
                        "relationship",
                        "target",
                      ]}
                      text={L(
                        "O site desenha o grafo a partir desta resposta.",
                        "The site renders the graph from this answer.",
                      )}
                    />
                    <Contract
                      icon="reference"
                      title={L("Justificativa", "Reasoning")}
                      fields={[
                        "reason",
                        "source_evidence",
                        "confidence",
                        "inferred_or_explicit",
                      ]}
                      text={L(
                        "Evidência e confiança declarada pelo modelo. Confiança não é nota.",
                        "Evidence and model-reported confidence. Confidence is not a score.",
                      )}
                    />
                  </>
                ) : (
                  <>
                    <Contract
                      icon="change"
                      title={L("Requisitos afetados", "Affected requirements")}
                      fields={[
                        "scenario_id",
                        "impacts",
                        "requirement_id",
                        "changed_entity",
                      ]}
                      text={L(
                        "Uma lista por cenário, inclusive vazia se não houver impacto.",
                        "A list per scenario, empty when no requirements are affected.",
                      )}
                    />
                    <Contract
                      icon="reference"
                      title={L(
                        "Explicação verificável",
                        "Checkable explanation",
                      )}
                      fields={[
                        "dependency",
                        "explanation",
                        "source_evidence",
                        "technical_claims",
                      ]}
                      text={L(
                        "Qual dependência exige revisão e por quê.",
                        "Which dependency requires review and why.",
                      )}
                    />
                  </>
                )}
              </div>
              <div className="actual-output-link">
                <strong>
                  {runs.length
                    ? L(
                        "Respostas reais em Resultados.",
                        "Real responses are in Results.",
                      )
                    : L(
                        "Ainda não existe resposta de modelo.",
                        "There is no model response yet.",
                      )}
                </strong>
                <a href={runs.length ? "#results" : "#run"}>
                  {runs.length
                    ? L("Ver respostas", "View responses")
                    : L("Preparar avaliação", "Prepare evaluation")}{" "}
                  →
                </a>
              </div>
            </section>
          )}
          {tab === "exact" && (
            <section className="exact-request">
              <header>
                <div>
                  <h2>{L("Texto exato do pedido", "Exact request text")}</h2>
                  <small>{preview.prompt_hash.slice(0, 16)}</small>
                </div>
                <button
                  onClick={() => download(preview.prompt, `${task}-prompt.txt`)}
                >
                  {L("Baixar mensagem", "Download message")} ↓
                </button>
              </header>
              <PagedText text={preview.prompt} />
            </section>
          )}
        </div>
      )}
      {info && (
        <Modal
          title={
            info === "source"
              ? L("Fonte oficial", "Official source")
              : L("Entrada original", "Original input")
          }
          onClose={() => setInfo(null)}
        >
          {info === "source" ? (
            <div className="source-info">
              <div className="component-heading">
                <Icon name={docs[doc][1]} size={48} />
                <div>
                  <h3>{source.part_number}</h3>
                  <p>{source.manufacturer}</p>
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={source.official_datasheet_url}
                  >
                    {L("Datasheet oficial", "Official datasheet")} ↗
                  </a>
                </div>
              </div>
              <p>
                {L(
                  "Fatos registrados da fonte, anteriores à resposta do modelo.",
                  "Source facts recorded before the model responds.",
                )}
              </p>
              <Fields
                entries={Object.entries(source.parameters).map(([k, v]) => [
                  k,
                  pretty(v),
                ])}
              />
              <small>
                {source.sections.join(" · ")} · {source.date_accessed}
              </small>
            </div>
          ) : (
            <PagedText
              text={JSON.stringify(
                info === "scope" ? preview.input.scope : preview.input.sources,
                null,
                2,
              )}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function Contract({ icon, title, fields, text }) {
  return (
    <article>
      <Icon name={icon} size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
      <div className="chip-list">
        {fields.map((f) => (
          <code key={f}>{f}</code>
        ))}
      </div>
    </article>
  );
}
function Criteria() {
  const [view, setView] = useState("metrics");
  const metrics = [
    [
      "Precisão",
      "Precision",
      "TP / (TP + FP)",
      L(
        "Das relações ou impactos que o modelo indicou, quantos estão corretos?",
        "Of the relationships or impacts predicted, how many are correct?",
      ),
      "up",
    ],
    [
      "Recall",
      "Recall",
      "TP / (TP + FN)",
      L(
        "Do que deveria encontrar, quanto ele encontrou?",
        "Of what it should have found, how much did it find?",
      ),
      "up",
    ],
    [
      "F1",
      "F1",
      "2 × precisão × recall / (precisão + recall)",
      L(
        "Equilíbrio entre precisão e recall, calculado separadamente por tarefa.",
        "Balance of precision and recall, calculated separately for each task.",
      ),
      "up",
    ],
    [
      "Falhas críticas",
      "Critical misses",
      L(
        "impactos críticos perdidos / impactos críticos esperados",
        "missed critical impacts / expected critical impacts",
      ),
      L(
        "Mede dependências importantes que passaram despercebidas.",
        "Measures important dependencies that went undetected.",
      ),
      "down",
    ],
    [
      "Afirmações sem suporte",
      "Unsupported claims",
      L(
        "afirmações sem suporte / afirmações produzidas",
        "unsupported claims / submitted claims",
      ),
      L(
        "Inclui conclusão incorreta e conclusão correta com evidência inválida.",
        "Includes incorrect conclusions and correct conclusions with invalid evidence.",
      ),
      "down",
    ],
    [
      "Consistência",
      "Consistency",
      L(
        "pares de respostas iguais / pares de repetições",
        "matching answer pairs / repetition pairs",
      ),
      L(
        "Decisões iguais entre repetições. Repetir o mesmo erro também pode ser consistente.",
        "Matching decisions across repetitions. Repeating the same error can also be consistent.",
      ),
      "up",
    ],
  ];
  return (
    <div className="criteria-screen">
      <Tabs
        value={view}
        onChange={setView}
        items={[
          ["metrics", L("Métricas", "Metrics")],
          ["publication", L("Publicação", "Publication")],
          ["evidence", L("Acertos e erros", "Correct and incorrect")],
          ["details", L("Regras adicionais", "Additional rules")],
        ]}
      />
      <div className="criteria-body">
        {view === "publication" && (
          <>
            <div className="bench-section-heading">
              <h2>
                {L(
                  "1. Condições para publicar um resultado",
                  "1. Conditions for publishing a result",
                )}
              </h2>
            </div>
            <div className="publication-gates">
              {[
                [
                  L("API concluiu", "API completed"),
                  L(
                    "Todas as chamadas da repetição terminaram sem erro, recusa ou truncamento.",
                    "Every call in the repetition finished without error, refusal or truncation.",
                  ),
                ],
                [
                  L("Formato válido", "Valid format"),
                  L(
                    "JSON válido, campos corretos, IDs únicos e relações sem nós inexistentes.",
                    "Valid JSON, correct fields, unique IDs and no dangling relationships.",
                  ),
                ],
                [
                  L("Cenários completos", "Complete scenarios"),
                  L(
                    "A resposta cobre todos os cenários pedidos, incluindo os casos sem impacto.",
                    "The answer covers every requested scenario, including no-impact controls.",
                  ),
                ],
              ].map(([title, desc], i) => (
                <article key={title}>
                  <span className="gate-number">0{i + 1}</span>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                  <span className="subtle-label">
                    {L(
                      "Condição exigida · não é uma medição",
                      "Required condition · not a measurement",
                    )}
                  </span>
                </article>
              ))}
            </div>
            <p className="boundary-note">
              {L(
                "Se alguma condição falhar, a tentativa fica em Atividade e não entra em resultados. Se a resposta for válida mas tecnicamente errada, ela é publicada com a pontuação que obteve.",
                "If any condition fails, the attempt remains in Activity and does not become a result. A valid but technically wrong answer is published with its measured score.",
              )}
            </p>
          </>
        )}
        {view === "evidence" && (
          <>
            <div className="bench-section-heading">
              <h2>
                {L(
                  "2. O que conta como acerto ou erro",
                  "2. What counts as correct or incorrect",
                )}
              </h2>
            </div>
            <div className="judgment-grid">
              {[
                [
                  "correct",
                  "✓",
                  L("Correto e sustentado", "Correct and supported"),
                  L(
                    "A conclusão está no gabarito e a evidência corresponde à fonte relevante.",
                    "The conclusion matches the reference and cites the relevant source.",
                  ),
                ],
                [
                  "warning",
                  "!",
                  L("Correto, evidência inválida", "Correct, invalid evidence"),
                  L(
                    "Pode contar no F1 de relações, mas não no F1 sustentado por evidência.",
                    "May count in relationship F1, but not in evidence-supported F1.",
                  ),
                ],
                [
                  "wrong",
                  "+",
                  L("Extra ou incorreto · FP", "Extra or incorrect · FP"),
                  L(
                    "O modelo indicou algo que não pertence à resposta esperada.",
                    "The model predicted something outside the expected answer.",
                  ),
                ],
                [
                  "missing",
                  "−",
                  L("Não encontrado · FN", "Missing · FN"),
                  L(
                    "O gabarito exige uma relação ou impacto que o modelo não identificou.",
                    "The reference requires a relationship or impact the model missed.",
                  ),
                ],
              ].map(([kind, symbol, title, desc]) => (
                <article className={kind} key={kind}>
                  <b>{symbol}</b>
                  <h3>{title}</h3>
                  <p>{desc}</p>
                </article>
              ))}
            </div>
          </>
        )}
        {view === "metrics" && (
          <>
            <div className="bench-section-heading">
              <h2>
                {L("3. Como ler as métricas", "3. How to read the metrics")}
              </h2>
              <span>
                TP = {L("acertos", "true positives")} · FP ={" "}
                {L("extras", "false positives")} · FN ={" "}
                {L("faltantes", "false negatives")}
              </span>
            </div>
            <div className="criteria-metrics">
              {metrics.map(([pt, en, formula, desc, direction]) => (
                <article key={en}>
                  <div>
                    <Icon name="chart" />
                    <span
                      className={
                        direction === "up" ? "metric-up" : "metric-down"
                      }
                    >
                      {direction === "up"
                        ? L("↑ Maior é melhor", "↑ Higher is better")
                        : L("↓ Menor é melhor", "↓ Lower is better")}
                    </span>
                  </div>
                  <h3>{L(pt, en)}</h3>
                  <p>{desc}</p>
                  <code>
                    {formula === "2 × precisão × recall / (precisão + recall)"
                      ? L(
                          formula,
                          "2 × precision × recall / (precision + recall)",
                        )
                      : formula}
                  </code>
                </article>
              ))}
            </div>
            <div className="reading-percents">
              <strong>{L("100% de recall", "100% recall")}</strong>
              <span>
                ={" "}
                {L(
                  "todos os impactos esperados foram identificados. É a definição da métrica, não um resultado já obtido.",
                  "every expected impact was identified. This is the metric definition, not an achieved result.",
                )}
              </span>
            </div>
          </>
        )}
        {view === "details" && (
          <>
            <div className="criteria-notes">
              <article>
                <h3>{L("Valores e unidades", "Values and units")}</h3>
                <p>
                  {L(
                    "Avaliados separadamente. Não convertemos automaticamente 50 mA em 0,05 A. O prompt exige A, V, rpm e °C.",
                    "Scored separately. We do not automatically convert 50 mA into 0.05 A. The prompt requires A, V, rpm and °C.",
                  )}
                </p>
              </article>
              <article>
                <h3>{L("Evidência verificável", "Verifiable evidence")}</h3>
                <p>
                  {L(
                    "Documento e localização devem existir. O trecho citado precisa ocorrer na fonte e corresponder ao fato ou à relação relevante.",
                    "Document and location must exist. The quoted passage must occur in the source and match the relevant fact or relationship.",
                  )}
                </p>
              </article>
              <article>
                <h3>{L("Explicações", "Explanations")}</h3>
                <p>
                  {L(
                    "Verificamos elemento alterado, requisito, dependência e evidência. A qualidade completa do texto livre ainda exige revisão humana.",
                    "We check changed element, requirement, dependency and evidence. Full free-text quality still requires human review.",
                  )}
                </p>
              </article>
              <article>
                <h3>{L("Comparações justas", "Fair comparisons")}</h3>
                <p>
                  {L(
                    "L1 e L2, texto e PDF, versões e modos com ou sem feedback ficam separados. Média, dispersão e consistência usam somente execuções concluídas.",
                    "L1 and L2, text and PDF, versions and feedback modes stay separate. Means, dispersion and consistency use completed runs only.",
                  )}
                </p>
              </article>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function RejectForm({ saving, onSave }) {
  const [comment, setComment] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(comment);
      }}
    >
      <p>
        {L(
          "Recusar registra o problema e bloqueia novas avaliações nesta versão. Não apaga o item nem altera resultados anteriores.",
          "Rejecting records the issue and blocks new evaluations for this version. It does not delete the item or change previous results.",
        )}
      </p>
      <label>
        {L("O que precisa ser corrigido?", "What needs correction?")}
        <textarea
          autoFocus
          required
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
      <button className="primary" disabled={saving}>
        {saving
          ? L("Salvando…", "Saving…")
          : L("Registrar recusa", "Record rejection")}
      </button>
    </form>
  );
}
function Editor({ data, ds, saving, onSave, onClose }) {
  const [value, setValue] = useState(structuredClone(data.value)),
    [note, setNote] = useState("");
  const update = (key, v) => setValue((old) => ({ ...old, [key]: v }));
  const field = (key, label, multiline = false) => (
    <label key={key}>
      {label}
      {multiline ? (
        <textarea
          required
          value={value[key]}
          onChange={(e) => update(key, e.target.value)}
        />
      ) : (
        <input
          required
          value={value[key]}
          onChange={(e) => update(key, e.target.value)}
        />
      )}
    </label>
  );
  const evidence = value?.source_evidence;
  function setEvidence(index, key, v) {
    const items = structuredClone(evidence);
    items[index][key] = v;
    update("source_evidence", items);
  }
  const select = (key, label, options) => (
    <label key={key}>
      {label}
      <select value={value[key]} onChange={(e) => update(key, e.target.value)}>
        {options.map(([id, n]) => (
          <option key={id} value={id}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <form
      className="reference-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(data.kind, data.item_id, value, note);
      }}
    >
      <p className="edit-consequence">
        {["document", "configuration", "prompt", "scenario_input"].includes(
          data.kind,
        )
          ? L(
              "Esta edição altera a entrada de futuras avaliações. Ela não recalcula o gabarito. As revisões anteriores precisam ser refeitas para a nova versão.",
              "This edit changes future evaluation inputs. It does not recalculate the reference. Previous reviews must be repeated for the new version.",
            )
          : L(
              "Esta edição altera o gabarito de futuras avaliações. Resultados anteriores permanecem iguais. A nova versão precisará de revisão.",
              "This edit changes the reference for future evaluations. Previous results remain unchanged. The new version will need review.",
            )}
      </p>
      <code>{data.item_id}</code>
      {typeof value === "string" && data.kind !== "configuration" ? (
        <label>
          {data.kind === "prompt"
            ? L("Texto do prompt", "Prompt text")
            : L("Texto da entrada", "Input text")}
          <textarea
            className="large-editor"
            lang="en"
            required
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      ) : data.kind === "configuration" ? (
        <label>
          {L("Valor configurado", "Configured value")}
          <input
            type="number"
            required
            step="any"
            value={value}
            onChange={(e) =>
              setValue(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </label>
      ) : (
        <>
          {data.kind === "relationship" && (
            <>
              <div className="editor-columns">
                {select(
                  "source",
                  L("Origem", "Source"),
                  ds.scope.nodes.map((n) => [n.id, `${n.id} · ${name(n.id)}`]),
                )}
                {select(
                  "relationship",
                  L("Relação", "Relationship"),
                  ds.scope.relationship_types.map((id) => [
                    id,
                    t(relNames[id]),
                  ]),
                )}
                {select(
                  "target",
                  L("Destino", "Target"),
                  ds.scope.nodes.map((n) => [n.id, `${n.id} · ${name(n.id)}`]),
                )}
              </div>
              {field("reason", L("Razão esperada", "Expected reason"), true)}
              {select(
                "inferred_or_explicit",
                L("Tipo de evidência", "Evidence type"),
                [
                  ["explicit", L("Explícita", "Explicit")],
                  ["inferred", L("Inferida", "Inferred")],
                ],
              )}
            </>
          )}
          {data.kind === "parameter" && (
            <>
              <label>
                {L(
                  "Valores numéricos (um valor ou dois limites)",
                  "Numeric values (one value or two bounds)",
                )}
                <div className="number-fields">
                  {value.values.map((n, i) => (
                    <input
                      key={i}
                      type="number"
                      step="any"
                      required
                      aria-label={`${L("Valor", "Value")} ${i + 1}`}
                      value={n}
                      onChange={(e) =>
                        update(
                          "values",
                          value.values.map((v, j) =>
                            i === j
                              ? e.target.value === ""
                                ? ""
                                : Number(e.target.value)
                              : v,
                          ),
                        )
                      }
                    />
                  ))}
                </div>
              </label>
              {select(
                "unit",
                L("Unidade", "Unit"),
                ["A", "V", "rpm", "degC"].map((u) => [u, u]),
              )}
              {select(
                "qualifier",
                L("Condição", "Qualifier"),
                [
                  "rated",
                  "range",
                  "maximum",
                  "minimum",
                  "configured",
                  "threshold",
                ].map((q) => [q, q]),
              )}
            </>
          )}
          {data.kind === "node" && (
            <>
              {field("name", L("Nome esperado", "Expected name"))}
              {select(
                "source",
                L("Documento da fonte", "Source document"),
                Object.keys(ds.documents).map((id) => [id, id]),
              )}
              {field(
                "source_reference",
                L("Localização na fonte", "Source location"),
              )}
            </>
          )}
          {data.kind === "requirement" && (
            <>
              <SourceText>{value.text}</SourceText>
              <label className="check">
                <input
                  type="checkbox"
                  checked={value.critical}
                  onChange={(e) => update("critical", e.target.checked)}
                />
                {L(
                  "Perder um impacto deste requisito conta como falha crítica",
                  "Missing an impact on this requirement counts as a critical miss",
                )}
              </label>
            </>
          )}
          {data.kind === "scenario" && (
            <>
              <SourceText>{value.description}</SourceText>
              <fieldset>
                <legend>
                  {L("Requisitos afetados", "Affected requirements")}
                </legend>
                {ds.ground_truth.requirements.map((r) => (
                  <label className="check" key={r.id}>
                    <input
                      type="checkbox"
                      checked={value.affected_requirements.includes(r.id)}
                      onChange={(e) => {
                        const a = e.target.checked
                          ? [...value.affected_requirements, r.id]
                          : value.affected_requirements.filter(
                              (id) => id !== r.id,
                            );
                        setValue({
                          ...value,
                          affected_requirements: a,
                          unaffected_requirements: ds.ground_truth.requirements
                            .map((r) => r.id)
                            .filter((id) => !a.includes(id)),
                          critical_requirements: ds.ground_truth.requirements
                            .filter((r) => r.critical && a.includes(r.id))
                            .map((r) => r.id),
                          affected_relationships:
                            value.affected_relationships.filter((edge) =>
                              a.includes(edge.source),
                            ),
                        });
                      }}
                    />
                    {r.id} · {name(r.id)}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>
                  {L(
                    "Dependências que justificam os impactos",
                    "Dependencies supporting the impacts",
                  )}
                </legend>
                {ds.ground_truth.relationships
                  .filter((e) => value.affected_requirements.includes(e.source))
                  .map((edge) => (
                    <label className="check" key={edgeKey(edge)}>
                      <input
                        type="checkbox"
                        checked={value.affected_relationships.some(
                          (e) => edgeKey(e) === edgeKey(edge),
                        )}
                        onChange={(e) =>
                          update(
                            "affected_relationships",
                            e.target.checked
                              ? [
                                  ...value.affected_relationships,
                                  {
                                    source: edge.source,
                                    relationship: edge.relationship,
                                    target: edge.target,
                                  },
                                ]
                              : value.affected_relationships.filter(
                                  (v) => edgeKey(v) !== edgeKey(edge),
                                ),
                          )
                        }
                      />
                      {edge.source} → {edge.target}
                    </label>
                  ))}
              </fieldset>
              {field(
                "expected_reason",
                L("Razão esperada", "Expected reason"),
                true,
              )}
            </>
          )}
          {evidence && (
            <fieldset>
              <legend>
                {L(
                  "Evidência esperada · deve existir na fonte",
                  "Expected evidence · must exist in the source",
                )}
              </legend>
              {evidence.map((e, i) => (
                <div className="evidence-editor" key={i}>
                  <div className="editor-columns">
                    <label>
                      {L("Documento", "Document")}
                      <input
                        required
                        value={e.document_id}
                        onChange={(ev) =>
                          setEvidence(i, "document_id", ev.target.value)
                        }
                      />
                    </label>
                    <label>
                      {L("Localização", "Location")}
                      <input
                        required
                        value={e.location}
                        onChange={(ev) =>
                          setEvidence(i, "location", ev.target.value)
                        }
                      />
                    </label>
                  </div>
                  <label>
                    {L("Trecho literal", "Verbatim excerpt")}
                    <textarea
                      required
                      value={e.excerpt}
                      onChange={(ev) =>
                        setEvidence(i, "excerpt", ev.target.value)
                      }
                    />
                  </label>
                </div>
              ))}
            </fieldset>
          )}
        </>
      )}
      <label>
        {L(
          "Motivo da alteração (fica no histórico)",
          "Reason for change (saved in history)",
        )}
        <textarea
          required
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="editor-actions">
        <button type="button" onClick={onClose}>
          {L("Cancelar", "Cancel")}
        </button>
        <button className="primary" disabled={saving}>
          {saving
            ? L("Salvando…", "Saving…")
            : L("Salvar nova versão", "Save new version")}
        </button>
      </div>
    </form>
  );
}
