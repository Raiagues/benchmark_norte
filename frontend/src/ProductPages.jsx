import React, { useEffect, useState } from "react";
import { L, t } from "./i18n";
import Icon from "./Icon";
import { Modal } from "./ScreenUI";
import { taskLabel, percent, number, money, stamp } from "./liveLabels";
export function Overview({ api, ds, config, runs, summary }) {
  const [mode, setMode] = useState(runs[0]?.input_mode || "controlled_text"),
    [task, setTask] = useState("relationship_extraction"),
    [preview, setPreview] = useState(null),
    [loading, setLoading] = useState(true),
    [output, setOutput] = useState(null),
    [promptOpen, setPromptOpen] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setPreview(null);
    setOutput(null);
    setError("");
    api(
      `/benchmark/preview?task=${task}&difficulty=${task === "one_hop" ? "L2_ONE_HOP" : "L1_DIRECT"}&input_mode=${mode}`,
    )
      .then(async (p) => {
        if (!mounted) return;
        setPreview(p);
        const relevant = runs.find(
          (r) =>
            r.tasks.includes(task) &&
            r.experiment === "first_pass" &&
            r.dataset_hash === p.dataset_hash &&
            r.input_mode === mode,
        );
        if (relevant) {
          const r = await api(`/runs/${relevant.id}`);
          const result = r.results.find(
            (x) =>
              x.task === task &&
              x.difficulty === p.difficulty &&
              x.prompt_hash === p.prompt_hash,
          );
          if (mounted && result) setOutput({ result, run: r });
        }
      })
      .catch((e) => mounted && setError(e.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [
    task,
    mode,
    config.dataset_hash,
    runs
      .map((r) => `${r.id}:${r.completed_calls}:${r.evaluated_calls}`)
      .join("|"),
  ]);
  const latestCohort = summary[0]?.comparison_hash,
    groups = summary.filter(
      (g) =>
        g.comparison_hash === latestCohort &&
        g.task === task &&
        g.difficulty === (task === "one_hop" ? "L2_ONE_HOP" : "L1_DIRECT") &&
        g.experiment === "first_pass" &&
        g.input_mode === mode,
    ),
    metric =
      task === "relationship_extraction"
        ? "relationship_f1"
        : task === "entity_extraction"
          ? "entity_f1"
          : "impact_recall";
  return (
    <div className="product-stack overview-product">
      <section className="project-hero">
        <div>
          <span className="eyebrow">
            {L("SISTEMA DE ENGENHARIA", "ENGINEERING SYSTEM")}
          </span>
          <h2>
            {L(
              "Ventilação controlada por temperatura",
              "Temperature-controlled ventilation",
            )}
          </h2>
          <p>
            {L(
              "O mesmo sistema. A mesma evidência. Respostas comparáveis.",
              "The same system. The same evidence. Comparable answers.",
            )}
          </p>
          <div className="detail-chips">
            <span>{ds.manifest.dataset_version}</span>
            <span>
              {ds.ground_truth.requirements.length}{" "}
              {L("requisitos", "requirements")}
            </span>
            <span>
              {ds.ground_truth.change_scenarios.length}{" "}
              {L("cenários", "scenarios")}
            </span>
            <span>
              {L(
                "Estudo documental · sem hardware verificado",
                "Document study · no verified hardware",
              )}
            </span>
          </div>
        </div>
        <a className="button primary" href="#run">
          <Icon name="run" />
          {L("Nova avaliação", "New evaluation")}
        </a>
      </section>
      <div className="system-components">
        {ds.sources
          .filter((s) => ["FAN", "SENSOR", "DRIVER"].includes(s.document_id))
          .map((s) => (
            <a className="component-tile" href="#sources" key={s.document_id}>
              <span className="component-icon">
                <Icon
                  size={35}
                  name={
                    s.document_id === "FAN"
                      ? "fan"
                      : s.document_id === "SENSOR"
                        ? "sensor"
                        : "switch"
                  }
                />
              </span>
              <div>
                <small>{s.manufacturer}</small>
                <strong>{s.part_number}</strong>
                <span>{L("Datasheet oficial", "Official datasheet")} ↗</span>
              </div>
            </a>
          ))}
      </div>
      <div className="section-title">
        <h2>{L("Como o benchmark funciona", "How the benchmark works")}</h2>
        <div className="inline-actions">
          <label>
            {L("Entrada", "Input")}
            <select
              aria-label={L("Entrada", "Input")}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="controlled_text">
                {L("Texto normalizado", "Normalized text")}
              </option>
              {config.pdf_ready && (
                <option value="pdf_text">
                  {L("Texto integral dos PDFs", "Full PDF text")}
                </option>
              )}
            </select>
          </label>
          <label>
            {L("Tarefa", "Task")}
            <select
              aria-label={L("Tarefa", "Task")}
              value={task}
              onChange={(e) => setTask(e.target.value)}
            >
              {config.tasks.map((k) => (
                <option key={k} value={k}>
                  {taskLabel(k)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="story-grid">
        <section className="product-panel story-panel">
          <span className="step-number">01</span>
          <Icon name="input" />
          <h3>{L("Entradas do modelo", "Model inputs")}</h3>
          <ul className="artifact-summary">
            <li>
              <Icon name="document" />
              {mode === "pdf_text"
                ? L("Datasheets → texto integral", "Datasheets → full text")
                : L(
                    "Datasheets → texto normalizado",
                    "Datasheets → normalized text",
                  )}
            </li>
            <li>
              <Icon name="reference" />
              {L("Requisitos do produto", "Product requirements")}
            </li>
            <li>
              <Icon name="config" />
              {L("Configuração e hipóteses", "Configuration and assumptions")}
            </li>
            {!["entity_extraction", "relationship_extraction"].includes(
              task,
            ) && (
              <li>
                <Icon name="change" />
                {preview?.input.scenarios.length ?? "—"}{" "}
                {L("cenários de mudança", "change scenarios")}
              </li>
            )}
          </ul>
          <a href="#inputs">{L("Explorar entradas", "Explore inputs")} →</a>
          <p className="inline-note">
            {L(
              "São evidências fornecidas ao modelo.",
              "These are evidence supplied to the model.",
            )}
          </p>
        </section>
        <section className="product-panel story-panel">
          <span className="step-number">02</span>
          <Icon name="model" />
          <h3>{L("Prompt e contexto", "Prompt and context")}</h3>
          <strong>{taskLabel(task)}</strong>
          <ol>
            <li>{L("Ler as evidências do sistema", "Read system evidence")}</li>
            <li>
              {L(
                "Usar os IDs e relações permitidos",
                "Use allowed IDs and relationships",
              )}
            </li>
            <li>
              {L(
                "Devolver JSON com evidências",
                "Return JSON with source evidence",
              )}
            </li>
          </ol>
          <button
            className="text-button"
            disabled={!preview}
            onClick={() => setPromptOpen(true)}
          >
            {L("Ler prompt exato", "Read exact prompt")} →
          </button>
          <small>
            {mode === "pdf_text"
              ? L("Texto integral dos PDFs", "Full PDF text")
              : L("Texto controlado", "Controlled text")}{" "}
            · {preview?.prompt_hash.slice(0, 12) || "—"}
          </small>
        </section>
        <section className="product-panel story-panel">
          <span className="step-number">03</span>
          <Icon name="output" />
          <h3>{L("Resposta e avaliação", "Output and evaluation")}</h3>
          {output ? (
            <>
              <span className="source-badge">
                {L("RESPOSTA REAL DE API", "REAL API RESPONSE")}
              </span>
              <strong>{output.run.metadata.model}</strong>
              <div className="output-counts">
                {task === "relationship_extraction" ? (
                  <>
                    <b>{output.result.parsed_output.edges.length}</b>
                    <span>
                      {L("relações extraídas", "extracted relationships")}
                    </span>
                  </>
                ) : task === "entity_extraction" ? (
                  <>
                    <b>{output.result.parsed_output.nodes.length}</b>
                    <span>
                      {L("entidades extraídas", "extracted entities")}
                    </span>
                  </>
                ) : (
                  <>
                    <b>{output.result.parsed_output.scenarios.length}</b>
                    <span>
                      {L("cenários respondidos", "answered scenarios")}
                    </span>
                  </>
                )}
              </div>
              <a
                href={
                  task === "relationship_extraction"
                    ? "#graphs"
                    : task === "entity_extraction"
                      ? "#results"
                      : "#impact"
                }
              >
                {L(
                  "Inspecionar resposta e comparação",
                  "Inspect output and comparison",
                )}{" "}
                →
              </a>
              <small>
                {output.run.id.slice(0, 8)} · {stamp(output.result.end_time)}
              </small>
            </>
          ) : (
            <div className="inline-empty">
              <strong>
                {loading
                  ? L(
                      "Conferindo entradas e resultados…",
                      "Checking inputs and results…",
                    )
                  : error
                    ? L("Não disponível", "Not available")
                    : L(
                        "Nenhuma execução real nesta tarefa e versão",
                        "No real execution for this task and version",
                      )}
              </strong>
              {!loading && !error && (
                <p>
                  {L(
                    "A saída aparecerá após uma resposta válida da API.",
                    "Output appears after a valid API response.",
                  )}
                </p>
              )}
            </div>
          )}
          <div className="evaluation-boundary">
            <Icon name="lock" />
            <span>
              {L(
                "Gabarito separado → comparação determinística",
                "Separate ground truth → deterministic comparison",
              )}
            </span>
          </div>
          <a href="#criteria">
            {L("Entender os critérios", "Understand evaluation criteria")} →
          </a>
        </section>
      </div>
      <section className="product-panel">
        <div className="panel-heading">
          <h2>
            {L(
              "Evidência acumulada por modelo",
              "Evidence accumulated by model",
            )}
          </h2>
          <a href="#results">{L("Comparar métricas", "Compare metrics")} →</a>
        </div>
        <p className="muted">
          {taskLabel(task)} · {task === "one_hop" ? "L2" : "L1"} ·{" "}
          {L(
            "Primeira passagem · versões compatíveis",
            "First pass · compatible versions",
          )}
        </p>
        <div className="overview-models">
          {config.models
            .filter(
              (m) =>
                m.featured ||
                groups.some(
                  (g) => g.provider === m.provider && g.model === m.model,
                ),
            )
            .map((m) => {
              const matches = groups.filter(
                (g) => g.provider === m.provider && g.model === m.model,
              );
              return (
                <article key={m.provider + m.model}>
                  <small>{m.provider}</small>
                  <h3>{m.model}</h3>
                  {matches.length ? (
                    matches.map((g) => (
                      <div
                        key={g.settings_hash + g.feedback_hash}
                        className="model-evidence"
                      >
                        <strong>{percent(g.metrics[metric]?.mean)}</strong>
                        <span>
                          {metric.replaceAll("_", " ")} · {L("média", "mean")} ·
                          n={g.n}
                        </span>
                        <small>
                          {g.depth} · {number(g.latency_seconds.mean)} s ·{" "}
                          {money(g.estimated_cost_usd)}
                        </small>
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      {L("Não testado neste grupo", "Not tested in this group")}
                    </p>
                  )}
                </article>
              );
            })}
        </div>
        <a href="#live" className="text-button">
          {L(
            "Acompanhar execução e histórico",
            "Monitor execution and history",
          )}{" "}
          →
        </a>
      </section>
      {error && <p role="alert">{error}</p>}
      {promptOpen && (
        <Modal
          title={L(
            "Mensagem exata enviada ao modelo",
            "Exact message sent to the model",
          )}
          onClose={() => setPromptOpen(false)}
        >
          <p>
            {L(
              "Prévia sem chamada de API · primeira passagem",
              "Preview without an API call · first pass",
            )}{" "}
            · SHA-256 {preview.prompt_hash}
          </p>
          <pre className="exact-text" lang="en">
            {preview.prompt}
          </pre>
        </Modal>
      )}
    </div>
  );
}
export function Learning({ api, runs }) {
  const [items, setItems] = useState([]),
    [paired, setPaired] = useState([]),
    [error, setError] = useState("");
  async function load() {
    try {
      setItems(await api("/feedback"));
      const assisted = await Promise.all(
        runs
          .filter((r) => r.experiment === "feedback_assisted")
          .map((r) => api(`/runs/${r.id}`)),
      );
      setPaired(assisted);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [runs.map((r) => r.id + ":" + r.completed_calls).join("|")]);
  return (
    <div className="product-stack">
      <div className="learning-flow">
        {[
          ["output", L("Primeira passagem", "First pass")],
          ["edit", L("Correção humana", "Human correction")],
          ["reference", L("Feedback confirmado", "Confirmed feedback")],
          ["change", L("Nova avaliação assistida", "Feedback-assisted run")],
        ].map(([icon, label], i) => (
          <div key={icon}>
            <span className="step-number">0{i + 1}</span>
            <Icon name={icon} />
            <strong>{label}</strong>
          </div>
        ))}
      </div>
      <section className="product-panel">
        <div className="panel-heading">
          <h2>{L("Correções de engenharia", "Engineering corrections")}</h2>
          <a href="#graphs" className="button">
            {L("Revisar uma relação", "Review a relationship")}
          </a>
        </div>
        {error && <p role="alert">{error}</p>}
        {items.length ? (
          <div className="feedback-list">
            {items.map((f) => (
              <article key={f.id}>
                <div className="panel-heading">
                  <strong>
                    {f.edge.source} → {f.edge.relationship} → {f.edge.target}
                  </strong>
                  <span className="source-badge">
                    {f.confirmed
                      ? L("Confirmado", "Confirmed")
                      : L("Aguardando confirmação", "Awaiting confirmation")}
                  </span>
                </div>
                <p>{f.correction}</p>
                <small>
                  {L("Origem", "Source")}: {f.run_id} · {stamp(f.created_at)}
                </small>
                <div className="inline-actions">
                  <span>{t(f.verdict)}</span>
                  <button
                    onClick={async () => {
                      try {
                        await api(`/feedback/${f.id}`, "PATCH", {
                          confirmed: !f.confirmed,
                        });
                        await load();
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    {f.confirmed
                      ? L("Retirar confirmação", "Withdraw confirmation")
                      : L("Confirmar correção", "Confirm correction")}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="product-empty">
            <Icon name="edit" size={32} />
            <h3>
              {L("Nenhuma correção registrada", "No corrections recorded")}
            </h3>
            <p>
              {L(
                "Abra uma relação no mapa, revise sua evidência e confirme a correção. O gabarito não é alterado automaticamente.",
                "Open a relationship in the map, review its evidence and confirm a correction. Ground truth never changes automatically.",
              )}
            </p>
          </div>
        )}
      </section>
      <section className="product-panel">
        <h2>
          {L(
            "O modelo incorporou a correção?",
            "Did the model incorporate the correction?",
          )}
        </h2>
        {paired.length ? (
          paired.map((r) => (
            <article key={r.id}>
              <h3>{r.metadata.model}</h3>
              <p>
                {L("Antes", "Before")}: {r.metadata.baseline_run_id} →{" "}
                {L("Depois", "After")}: {r.id}
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{L("Tarefa / nível", "Task / level")}</th>
                      <th>{L("Retenção", "Retention")}</th>
                      <th>{L("Erro repetido", "Repeated error")}</th>
                      <th>{L("Novo erro", "New error")}</th>
                      <th>{L("Variação de F1", "F1 change")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.results.map((x) => (
                      <tr key={x.id}>
                        <th>
                          {taskLabel(x.task)} · {x.difficulty.split("_")[0]}
                        </th>
                        <td>
                          {percent(
                            x.feedback_metrics?.correction_retention_rate,
                          )}
                        </td>
                        <td>
                          {percent(x.feedback_metrics?.repeated_error_rate)}
                        </td>
                        <td>{percent(x.feedback_metrics?.new_error_rate)}</td>
                        <td>
                          {percent(x.feedback_metrics?.performance_improvement)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details>
                <summary>
                  {L(
                    "Transferência para cenários relacionados",
                    "Transfer to related scenarios",
                  )}
                </summary>
                <pre className="exact-text">
                  {JSON.stringify(
                    r.results.map((x) => ({
                      task: x.task,
                      difficulty: x.difficulty,
                      transfer: x.feedback_transfer_metrics || null,
                    })),
                    null,
                    2,
                  )}
                </pre>
              </details>
            </article>
          ))
        ) : (
          <div className="product-empty">
            <h3>
              {L(
                "Nenhuma avaliação assistida ainda",
                "No feedback-assisted run yet",
              )}
            </h3>
            <p>
              {L(
                "Após confirmar uma correção, selecione sua execução de origem em Nova avaliação. A comparação exige a mesma versão, modelo e configuração. Cenários relacionados são medidos separadamente.",
                "After confirming a correction, select its source run in New evaluation. Comparison requires the same version, model and settings. Related scenarios are measured separately.",
              )}
            </p>
            <a href="#run">
              {L("Configurar experimento", "Configure experiment")} →
            </a>
          </div>
        )}
      </section>
    </div>
  );
}
export function Settings({ config, language, changeLanguage }) {
  return (
    <div className="product-stack settings-product">
      <section className="product-panel">
        <h2>{L("Projeto e benchmark", "Project and benchmark")}</h2>
        <dl className="property-grid">
          <div>
            <dt>{L("Sistema", "System")}</dt>
            <dd>
              {L(
                "Ventilação controlada por temperatura",
                "Temperature-controlled ventilation",
              )}
            </dd>
          </div>
          <div>
            <dt>Dataset</dt>
            <dd>{config.manifest.dataset_version}</dd>
          </div>
          <div>
            <dt>{L("Versão do gabarito", "Ground-truth version")}</dt>
            <dd>{config.manifest.ground_truth_version}</dd>
          </div>
          <div>
            <dt>{L("Idioma da interface", "Interface language")}</dt>
            <dd>
              <select
                aria-label={L("Idioma da interface", "Interface language")}
                value={language}
                onChange={(e) => changeLanguage(e.target.value)}
              >
                <option value="pt">Português</option>
                <option value="en">English</option>
              </select>
            </dd>
          </div>
        </dl>
        <p className="inline-note">
          {L(
            "Prompts, documentos e respostas permanecem no idioma original.",
            "Prompts, documents and responses remain in their original language.",
          )}
        </p>
      </section>
      <section className="product-panel">
        <div className="panel-heading">
          <h2>{L("Modelos e conexões", "Models and connections")}</h2>
          <a className="button" href="#run">
            {L("Selecionar e verificar", "Select and verify")}
          </a>
        </div>
        <div className="connection-list">
          {config.models
            .filter((m) => m.featured)
            .map((m) => {
              const c = config.connections.find(
                (c) => c.provider === m.provider && c.model === m.model,
              );
              return (
                <div key={m.model}>
                  <Icon name="model" />
                  <strong>{m.model}</strong>
                  <span>{m.reasoning_effort || m.thinking_level}</span>
                  <span className={`state-pill ${c?.ready ? "good" : "bad"}`}>
                    {c?.ready
                      ? L("Conectado", "Connected")
                      : L("Não confirmado", "Not confirmed")}
                  </span>
                </div>
              );
            })}
        </div>
      </section>
      <section className="product-panel">
        <h2>{L("Versões dos prompts", "Prompt versions")}</h2>
        <dl className="hash-list">
          {Object.entries(config.prompt_hashes).map(([key, value]) => (
            <div key={key}>
              <dt>{taskLabel(key)}</dt>
              <dd>
                <code>{value}</code>
              </dd>
            </div>
          ))}
        </dl>
        <a href="#context">
          {L("Inspecionar conteúdo e editar", "Inspect content and edit")} →
        </a>
      </section>
    </div>
  );
}
