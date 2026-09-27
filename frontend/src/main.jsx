import RunPage from "./RunPage";
import LiveExecution, { RunHistory } from "./LiveExecution";
import InputExplorer from "./InputExplorer";
import ImpactPage from "./ImpactPage";
import { Overview, Learning, Settings } from "./ProductPages";
import {
  Tabs,
  PagedItems,
  Modal,
  PagedText,
  MetricGrid,
  DetailButton,
} from "./ScreenUI";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  useReactFlow,
  MarkerType,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./style.css";
import "./workbench.css";
import "./norte.css";
import "./product.css";
import Benchmark from "./Benchmark";
import Icon from "./Icon";
import { t as tr, L, getLanguage, setLanguage, locale } from "./i18n";

const providers = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
};
const tasks = {
  entity_extraction: "Extração de dados",
  relationship_extraction: "Relações",
  change_impact: "Impactos",
  impact_explanation: "Explicações",
  one_hop: "Raciocínio de um passo",
};
const pages = {
  documents: "Visão geral",
  inputs: "Entradas do benchmark",
  context: "Prompt e contexto",
  reference: "Gabarito revisável",
  criteria: "Critérios de avaliação",
  sources: "Fontes e proveniência",
  graphs: "Mapa de relações",
  impact: "Análise de impacto",
  results: "Comparação de modelos",
  learning: "Aprendizado",
  live: "Execução ao vivo",
  history: "Histórico",
  run: "Nova avaliação",
  settings: "Configurações",
};
const pageIcons = {
  documents: "overview",
  inputs: "input",
  context: "model",
  reference: "reference",
  criteria: "chart",
  sources: "document",
  graphs: "graph",
  impact: "change",
  results: "chart",
  learning: "edit",
  live: "run",
  history: "history",
  run: "run",
  settings: "config",
};
const currentPage = () =>
  pages[location.hash.slice(1).split("/")[0]]
    ? location.hash.slice(1).split("/")[0]
    : "documents";

const depthLabel = (value) =>
  ({
    none: L("sem raciocínio", "no reasoning"),
    low: L("baixa", "low"),
    medium: L("média", "medium"),
    high: L("alta", "high"),
    xhigh: L("muito alta", "extra high"),
    max: L("máxima", "maximum"),
  })[value] || value;
const displayModel = (r) =>
  r.model + (r.depth ? ` · ${depthLabel(r.depth)}` : "");

const levels = {
  L1_DIRECT: "L1 · Relações explícitas",
  L2_ONE_HOP: "L2 · Um passo de raciocínio",
};
const relations = {
  has_parameter: "Tem parâmetro",
  constrains: "Limita",
  depends_on: "Depende de",
  verified_by: "Verificado por",
};
const statuses = {
  correct: { label: "Correta", symbol: "✓", color: "#33d4a0", dash: undefined },
  correct_bad_evidence: {
    label: "Evidência inválida",
    symbol: "!",
    color: "#e5b95f",
    dash: "9 3 2 3",
  },
  false_positive: {
    label: "Extra / incorreta",
    symbol: "+",
    color: "#e5767f",
    dash: "3 4",
  },
  missing: {
    label: "Não identificada",
    symbol: "−",
    color: "#9fb9dc",
    dash: "9 5",
  },
};
const nodeLabels = {
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
const pct = (v) =>
  v == null
    ? "—"
    : `${(v * 100).toLocaleString(locale(), { maximumFractionDigits: 1 })}%`;
const decimal = (v) =>
  v == null ? "—" : v.toLocaleString(locale(), { maximumFractionDigits: 2 });
const usd = (v) => (v == null ? "Não disponível" : `$${v.toFixed(4)}`);
const date = (v) =>
  new Date(v).toLocaleString(locale(), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const normalize = (v) =>
  v
    .trim()
    .toUpperCase()
    .replace(/[ _]+/g, "-")
    .replace(/^(REQ|CHG)-(\d+)$/, (_, a, b) => `${a}-${b.padStart(3, "0")}`);
const edgeKey = (e) =>
  [normalize(e.source), e.relationship, normalize(e.target)].join("|");
const modelKey = (r) => `${r.provider}|${r.model}|${r.settings_hash || ""}`;
const cohortKey = (r) =>
  [r.comparison_hash, r.experiment, r.input_mode, r.feedback_hash].join("|");

async function api(path, method = "GET", body) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Norte-Client": "local-ui",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Não foi possível concluir a solicitação.",
    );
  return data;
}
function go(page) {
  window.location.hash = page;
}
function Json({ value }) {
  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}
function Empty({ title = "Nenhum resultado ainda", children, action = true }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">
        ↗
      </div>
      <h2>{tr(title)}</h2>
      <p>
        {tr(
          children ||
            "Os resultados aparecem após uma avaliação real concluída pelas APIs.",
        )}
      </p>
      {action && (
        <button className="primary" onClick={() => go("run")}>
          {tr("Executar primeira avaliação ")}
          <span>→</span>
        </button>
      )}
    </div>
  );
}
function SectionHeading({ title, children }) {
  return (
    <div className="section-heading">
      <h2>{tr(title)}</h2>
      {tr(children)}
    </div>
  );
}
function Evidence({ items = [] }) {
  return items.length ? (
    <div className="evidence">
      {items.map((e, i) => (
        <blockquote key={i}>
          <small>
            {tr(e.document_id)} · {tr(e.location)}
          </small>
          <p>{e.excerpt}</p>
        </blockquote>
      ))}
    </div>
  ) : (
    <p className="muted">{tr("Sem evidência informada.")}</p>
  );
}

function App() {
  const [language, setLanguageState] = useState(getLanguage);
  function changeLanguage(value) {
    setLanguage(value);
    setLanguageState(value);
  }
  useEffect(() => {
    document.documentElement.lang = locale();
  }, [language]);
  const [page, setPage] = useState(currentPage());
  const [config, setConfig] = useState(null),
    [ds, setDs] = useState(null),
    [runs, setRuns] = useState([]),
    [summary, setSummary] = useState([]),
    [executions, setExecutions] = useState([]),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  async function refresh() {
    try {
      const [r, s, e, c, d] = await Promise.all([
        api("/runs"),
        api("/summary"),
        api("/executions"),
        api("/config"),
        api("/documents"),
      ]);
      setRuns(r);
      setSummary(s);
      setExecutions(e);
      setConfig(c);
      setDs(d);
      setError("");
      setReady(true);
    } catch {
      setError(
        "Não foi possível acessar o servidor. Verifique se o backend está rodando.",
      );
    }
  }
  useEffect(() => {
    Promise.all([api("/config"), api("/documents")])
      .then(([c, d]) => {
        setConfig(c);
        setDs(d);
      })
      .catch(() => setError("Não foi possível carregar os documentos."));
    refresh();
    const timer = setInterval(refresh, 4000);
    const navigate = () => setPage(currentPage());
    window.addEventListener("hashchange", navigate);
    return () => {
      clearInterval(timer);
      window.removeEventListener("hashchange", navigate);
    };
  }, []);
  return (
    <>
      <aside className="sidebar">
        <a className="brand" href="#documents">
          <span className="brand-mark" aria-hidden="true" />
          {tr("Norte")}
          <span className="brand-caption">{tr("/ benchmark")}</span>
        </a>
        <p className="nav-group-label">
          {L("ENTENDER O TESTE", "UNDERSTAND THE TEST")}
        </p>
        <nav aria-label={tr("Navegação principal")}>
          {Object.entries(pages)
            .filter(([key]) =>
              [
                "documents",
                "inputs",
                "context",
                "reference",
                "criteria",
                "sources",
              ].includes(key),
            )
            .map(([key, label]) => (
              <a
                key={key}
                href={`#${key}`}
                aria-current={page === key ? "page" : undefined}
              >
                <Icon name={pageIcons[key]} />
                <span>{tr(label)}</span>
              </a>
            ))}
        </nav>
        <p className="nav-group-label">
          {L("COMPARAR MODELOS", "COMPARE MODELS")}
        </p>
        <nav aria-label={L("Resultados das avaliações", "Evaluation results")}>
          {Object.entries(pages)
            .filter(([key]) =>
              [
                "live",
                "history",
                "graphs",
                "impact",
                "results",
                "learning",
                "settings",
              ].includes(key),
            )
            .map(([key, label]) => (
              <a
                key={key}
                href={`#${key}`}
                aria-current={page === key ? "page" : undefined}
              >
                <Icon name={pageIcons[key]} />
                <span>{tr(label)}</span>
              </a>
            ))}
        </nav>
        <a className="button primary sidebar-run" href="#run">
          <Icon name="run" size={17} />
          {L("Nova avaliação", "New evaluation")}
        </a>
      </aside>
      <div className="workspace">
        <header className="workspace-topbar">
          <span>NORTE / BENCHMARK</span>
          <div
            className="language-switch"
            aria-label={L("Idioma da interface", "Interface language")}
          >
            <button
              type="button"
              aria-pressed={language === "pt"}
              onClick={() => changeLanguage("pt")}
            >
              {tr("Português")}
            </button>
            <button
              type="button"
              aria-pressed={language === "en"}
              onClick={() => changeLanguage("en")}
            >
              {tr("English")}
            </button>
          </div>
        </header>
        <main className={`page-${page}`}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{tr("COMPREENSÃO DE ENGENHARIA")}</p>
              <h1>{tr(pages[page])}</h1>
            </div>
            {config && (
              <span className="dataset-tag">
                {L("Benchmark atual ", "Current benchmark ")}
                {tr(config.manifest.dataset_version)}
              </span>
            )}
          </div>
          {error && (
            <div role="alert" className="notice error">
              {tr(error)}
              <button onClick={refresh}>{tr("Tentar novamente")}</button>
            </div>
          )}
          {!ready || !config || !ds ? (
            <p className="loading">{tr("Carregando…")}</p>
          ) : (
            <>
              {page === "results" && <Results runs={runs} summary={summary} />}
              {page === "graphs" && <Graphs runs={runs} />}
              {page === "impact" && <Impacts runs={runs} />}
              {page === "documents" && (
                <Overview
                  api={api}
                  ds={ds}
                  config={config}
                  runs={runs}
                  summary={summary}
                />
              )}
              {page === "inputs" && (
                <InputExplorer api={api} ds={ds} runs={runs} />
              )}
              {page === "sources" && (
                <InputExplorer api={api} ds={ds} runs={runs} sourcePage />
              )}
              {page === "live" && (
                <LiveExecution
                  api={api}
                  renderGraph={(detail) => <LiveGraph detail={detail} />}
                />
              )}
              {page === "history" && (
                <RunHistory api={api} onOpen={(id) => go(`live/${id}`)} />
              )}
              {page === "learning" && <Learning api={api} runs={runs} />}
              {page === "settings" && (
                <Settings
                  config={config}
                  language={language}
                  changeLanguage={changeLanguage}
                />
              )}
              {["context", "reference", "criteria"].includes(page) && (
                <Benchmark
                  datasetHash={config.dataset_hash}
                  page={page === "context" ? "inputs" : page}
                  api={api}
                  runs={runs}
                  refresh={refresh}
                />
              )}
              {page === "run" && (
                <RunPage
                  api={api}
                  config={config}
                  ds={ds}
                  runs={runs}
                  executions={executions}
                  refresh={refresh}
                />
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

function LiveGraph({ detail }) {
  const [view, setView] = useState("side"),
    [item, setItem] = useState(null);
  const graph = {
    model: detail.result.parsed_output,
    ground_truth: {
      nodes: detail.ground_truth.entities.nodes,
      edges: detail.ground_truth.relationships,
    },
    comparison: detail.comparison,
  };
  return (
    <div className="live-graphs">
      <Tabs
        value={view}
        onChange={setView}
        items={[
          ["side", L("Lado a lado", "Side by side")],
          ["model", L("Modelo", "Model")],
          ["reference", L("Gabarito", "Ground truth")],
          ["diff", L("Comparação", "Comparison")],
        ]}
      />
      <div
        className={view === "side" ? "live-graph-pair" : "live-graph-single"}
      >
        {(view === "side" ? ["reference", "model"] : [view]).map((kind) => (
          <GraphCanvas
            key={kind}
            title={
              kind === "reference"
                ? L("Gabarito", "Ground truth")
                : kind === "model"
                  ? detail.model
                  : L("Comparação", "Comparison")
            }
            kind={kind}
            graph={graph}
            focus={null}
            setItem={setItem}
          />
        ))}
      </div>
      {item && (
        <GraphInspector
          key={item.node?.id || item.edge?.key.join("|")}
          item={item}
          run={{
            id: detail.run_id,
            metadata: { model: detail.model },
            snapshot: { dataset: { documents: detail.input.documents } },
          }}
          onClose={() => setItem(null)}
        />
      )}
    </div>
  );
}

function useRun(runs, eligible = () => true) {
  const available = runs.filter(eligible);
  const [id, setId] = useState(""),
    [run, setRun] = useState(null),
    [error, setError] = useState("");
  const selected = available.find((r) => r.id === id) || available[0];
  useEffect(() => {
    let active = true;
    setRun(null);
    setError("");
    if (selected)
      api(`/runs/${selected.id}`)
        .then((r) => {
          if (active) setRun(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [selected?.id, selected?.completed_calls, selected?.evaluated_calls]);
  return { available, selected, run, error, setId };
}
function RunPicker({ selection }) {
  const { available, selected, setId } = selection;
  const models = [...new Set(available.map((r) => `${r.provider}|${r.model}`))];
  const chosen = selected ? `${selected.provider}|${selected.model}` : "";
  return (
    <div className="toolbar run-picker">
      <label>
        {tr("Modelo")}
        <select
          aria-label={tr("Modelo")}
          value={chosen}
          onChange={(e) =>
            setId(
              available.find(
                (r) => `${r.provider}|${r.model}` === e.target.value,
              ).id,
            )
          }
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {tr(providers[m.split("|")[0]])} · {tr(m.split("|")[1])}
            </option>
          ))}
        </select>
      </label>
      <label>
        {tr("Execução")}
        <select
          aria-label={tr("Execução")}
          value={selected?.id || ""}
          onChange={(e) => setId(e.target.value)}
        >
          {available
            .filter((r) => `${r.provider}|${r.model}` === chosen)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {tr(date(r.created_at))}
                {tr(" · repetição ")}
                {tr(r.repetition)} ·{r.depth ? `${depthLabel(r.depth)} · ` : ""}
                {tr(" ")}
                {tr(
                  r.experiment === "first_pass"
                    ? "sem correções"
                    : "com correções",
                )}
                {tr(" ")}· {tr(r.input_mode === "pdf_text" ? "PDF" : "texto")} ·
                {tr(" ")}
                {tr(r.id.slice(0, 6))}
              </option>
            ))}
        </select>
      </label>
      {selected?.dataset_version && (
        <span className="muted run-version">
          {L("Dataset desta execução", "Dataset for this run")} ·{" "}
          {selected.dataset_version}
        </span>
      )}
      {selected && (
        <a
          className="text-link download"
          href={`/api/runs/${selected.id}/download`}
        >
          {tr("Baixar resposta completa ↓")}
        </a>
      )}
    </div>
  );
}

function Results({ runs, summary }) {
  const [view, setView] = useState("charts");
  const [cohort, setCohort] = useState(""),
    [level, setLevel] = useState("L1_DIRECT"),
    [task, setTask] = useState("relationship_extraction"),
    [hidden, setHidden] = useState([]);
  const selection = useRun(runs);
  if (!runs.length) return <Empty />;
  if (!summary.length)
    return <p className="loading">{tr("Carregando métricas…")}</p>;
  const cohorts = [
    ...new Map(summary.map((row) => [cohortKey(row), row])).values(),
  ];
  const chosen = cohorts.find((row) => cohortKey(row) === cohort) || cohorts[0];
  const same = summary.filter((row) => cohortKey(row) === cohortKey(chosen));
  const allModels = [
    ...new Map(same.map((row) => [modelKey(row), row])).values(),
  ];
  const rows = same.filter(
    (row) => row.difficulty === level && !hidden.includes(modelKey(row)),
  );
  const options = [
    ...new Set(
      same.filter((row) => row.difficulty === level).map((row) => row.task),
    ),
  ];
  const activeTask = options.includes(task) ? task : options[0];
  const series = rows.filter((row) => row.task === activeTask);
  const family =
    activeTask === "entity_extraction"
      ? "entity"
      : activeTask === "relationship_extraction"
        ? "relationship"
        : "impact";
  const unsupported =
    activeTask === "entity_extraction"
      ? "unsupported_fact_rate"
      : activeTask === "relationship_extraction"
        ? "unsupported_relationship_rate"
        : "critical_impact_miss_rate";
  const metric = (m, t, key) =>
    rows.find((r) => modelKey(r) === modelKey(m) && r.task === t)?.metrics[key]
      ?.mean;
  return (
    <div className="results-screen">
      <Tabs
        value={view}
        onChange={setView}
        items={[
          ["charts", L("Gráficos", "Charts")],
          ["overview", L("Resumo", "Overview")],
          ["usage", L("Uso e custo", "Usage and cost")],
          ["raw", L("Respostas", "Responses")],
        ]}
      />
      <div className="toolbar comparison-controls">
        {cohorts.length > 1 && (
          <label>
            {tr("Avaliação comparável")}
            <select
              aria-label={tr("Avaliação comparável")}
              value={cohortKey(chosen)}
              onChange={(e) => {
                setCohort(e.target.value);
                setHidden([]);
              }}
            >
              {cohorts.map((c, i) => (
                <option key={cohortKey(c)} value={cohortKey(c)}>
                  {tr(i + 1)}.{tr(" ")}
                  {tr(c.input_mode === "controlled_text" ? "Texto" : "PDF")} ·
                  {tr(" ")}
                  {tr(
                    c.experiment === "first_pass"
                      ? "Sem correções"
                      : "Com correções",
                  )}
                  {tr(" ")}
                  {tr("· versão ")}
                  {tr(c.comparison_hash.slice(0, 6))}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {tr("Dificuldade")}
          <select
            aria-label={tr("Dificuldade")}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            {Object.entries(levels).map(([v, label]) => (
              <option key={v} value={v}>
                {tr(label)}
              </option>
            ))}
          </select>
        </label>
        <span className="muted control-note">
          {tr(chosen?.input_mode === "pdf_text" ? "PDF" : "Texto controlado")} ·
          {tr(" ")}
          {tr(
            chosen?.experiment === "first_pass"
              ? "Sem correções prévias"
              : "Com correções confirmadas",
          )}
        </span>
      </div>
      {series.some((r) => r.incomplete_batch_ids?.length) && (
        <div className="partial-result-note">
          <span>
            {L(
              "Inclui avaliação parcial. Qualidade calculada apenas sobre respostas avaliadas; o tamanho da amostra aparece em cada modelo.",
              "Includes a partial run. Quality uses only evaluated responses; sample sizes are shown for each model.",
            )}
          </span>
          <a
            href={`#live/${series.find((r) => r.incomplete_batch_ids?.length).incomplete_batch_ids[0]}`}
          >
            {L("Ver contagens e interrupções", "See counts and interruptions")}{" "}
            →
          </a>
        </div>
      )}
      <div className="model-filters" aria-label={tr("Modelos comparados")}>
        {allModels.map((m) => (
          <label key={modelKey(m)} className={`filter-chip ${m.provider}`}>
            <input
              type="checkbox"
              checked={!hidden.includes(modelKey(m))}
              onChange={(e) =>
                setHidden(
                  e.target.checked
                    ? hidden.filter((x) => x !== modelKey(m))
                    : [...hidden, modelKey(m)],
                )
              }
            />
            <span className="provider-dot" />
            {tr(displayModel(m))}
          </label>
        ))}
      </div>
      {rows.length ? (
        <>
          {view === "overview" && (
            <section className="panel overview-panel">
              <SectionHeading title={tr("Visão geral")}>
                <span className="muted">
                  {tr("Médias das execuções concluídas")}
                </span>
              </SectionHeading>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{tr("Modelo")}</th>
                      {level === "L1_DIRECT" && (
                        <>
                          <th>{tr("Extração F1 ↑")}</th>
                          <th>{tr("Relações F1 ↑")}</th>
                        </>
                      )}
                      <th>{tr("Recall de impacto ↑")}</th>
                      <th>{tr("Falhas críticas ↓")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allModels
                      .filter((m) => !hidden.includes(modelKey(m)))
                      .map((m) => {
                        const impact =
                          level === "L1_DIRECT" ? "change_impact" : "one_hop";
                        return (
                          <tr key={modelKey(m)}>
                            <td>
                              <strong>{tr(displayModel(m))}</strong>
                              <small>{tr(providers[m.provider])}</small>
                            </td>
                            {level === "L1_DIRECT" && (
                              <>
                                <td>
                                  {tr(
                                    pct(
                                      metric(
                                        m,
                                        "entity_extraction",
                                        "entity_f1",
                                      ),
                                    ),
                                  )}
                                </td>
                                <td>
                                  {tr(
                                    pct(
                                      metric(
                                        m,
                                        "relationship_extraction",
                                        "relationship_f1",
                                      ),
                                    ),
                                  )}
                                </td>
                              </>
                            )}
                            <td>
                              {tr(pct(metric(m, impact, "impact_recall")))}
                            </td>
                            <td>
                              {tr(
                                pct(
                                  metric(
                                    m,
                                    impact,
                                    "critical_impact_miss_rate",
                                  ),
                                ),
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {view === "charts" && (
            <section className="comparison-section">
              <SectionHeading title={tr("Comparar métricas")}>
                <label className="inline-label">
                  {tr("Tarefa")}
                  <select
                    aria-label={tr("Tarefa")}
                    value={activeTask}
                    onChange={(e) => setTask(e.target.value)}
                  >
                    {options.map((t) => (
                      <option key={t} value={t}>
                        {tr(tasks[t])}
                      </option>
                    ))}
                  </select>
                </label>
              </SectionHeading>
              <MetricGrid>
                <MetricChart
                  title={tr("Precisão")}
                  hint="Acertos entre as previsões · maior é melhor"
                  rows={series}
                  metric={`${family}_precision`}
                />
                <MetricChart
                  title={tr("Recall")}
                  hint="Dependências encontradas · maior é melhor"
                  rows={series}
                  metric={`${family}_recall`}
                />
                <MetricChart
                  title={tr("F1")}
                  hint="Equilíbrio entre precisão e recall · maior é melhor"
                  rows={series}
                  metric={`${family}_f1`}
                />
                <MetricChart
                  title={
                    family === "impact"
                      ? "Impactos críticos perdidos"
                      : "Afirmações sem suporte"
                  }
                  hint="Menor é melhor"
                  rows={series}
                  metric={unsupported}
                />
                <MetricChart
                  title={tr("Consistência")}
                  hint="Respostas iguais entre repetições · maior é melhor"
                  rows={series}
                  field="consistency"
                />
                <MetricChart
                  title={tr("Tempo por chamada")}
                  hint="Média em segundos · menor é melhor"
                  rows={series}
                  field="latency_seconds"
                  seconds
                />
              </MetricGrid>
              <p className="chart-caption">
                {tr(
                  "Barras: média. Traços: mínimo e máximo. — = sem medição disponível.",
                )}
              </p>
            </section>
          )}
          {view === "usage" && (
            <section className="panel usage-panel">
              <SectionHeading title={tr("Uso da API")} />
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{tr("Modelo")}</th>
                      <th>{tr("Repetições")}</th>
                      <th>{tr("Tokens de entrada / saída")}</th>
                      <th>{tr("Custo por tarefa")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((r) => (
                      <tr key={modelKey(r)}>
                        <td>{tr(displayModel(r))}</td>
                        <td>{tr(r.n)}</td>
                        <td>
                          {tr(
                            r.token_usage_complete
                              ? `${decimal(r.known_input_tokens)} / ${decimal(r.known_output_tokens)}`
                              : "Não disponível",
                          )}
                        </td>
                        <td>{tr(usd(r.average_cost_per_task_usd))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DetailButton label={tr("Estatísticas completas")}>
                <PagedText
                  text={JSON.stringify(
                    series.map(
                      ({
                        model,
                        depth,
                        n,
                        metrics,
                        consistency,
                        latency_seconds,
                      }) => ({
                        model,
                        depth,
                        n,
                        metrics,
                        consistency,
                        latency_seconds,
                      }),
                    ),
                    null,
                    2,
                  )}
                />
              </DetailButton>
            </section>
          )}
        </>
      ) : (
        <div className="empty-inline">
          {tr("Não há medições para esta seleção.")}
        </div>
      )}
      {view === "raw" && (
        <section className="panel raw-panel">
          <SectionHeading title={tr("Inspecionar uma execução")} />
          <RunPicker selection={selection} />
          {selection.error && <p role="alert">{tr(selection.error)}</p>}
          {selection.run && (
            <RunInspector key={selection.run.id} run={selection.run} />
          )}
        </section>
      )}
    </div>
  );
}

function MetricChart({ title, hint, rows, metric, field, seconds = false }) {
  const values = rows.map((r) => {
    const raw = metric ? r.metrics[metric] : r[field];
    const stats = typeof raw === "number" ? { mean: raw } : raw || {};
    return {
      ...stats,
      model: displayModel(r),
      provider: r.provider,
      n: r.n,
      key: modelKey(r),
    };
  });
  const max = seconds
    ? Math.max(...values.map((v) => v.max ?? v.mean ?? 0), 1)
    : 1;
  const format = (v) =>
    seconds ? (v == null ? "—" : `${decimal(v)} s`) : pct(v);
  return (
    <article className="metric-chart">
      <h3>{tr(title)}</h3>
      <p>{tr(hint)}</p>
      <div className="chart-bars">
        {values.map((v) => (
          <div className={`chart-row ${v.provider}`} key={v.key}>
            <div className="chart-row-label">
              <span title={v.model}>{tr(v.model)}</span>
              <strong>{tr(format(v.mean))}</strong>
            </div>
            <div
              className="bar-track"
              role="img"
              aria-label={`${v.model}: ${title} ${format(v.mean)}${v.mean == null ? "" : `; ${v.n} repetição(ões)`}`}
            >
              {v.mean != null && (
                <>
                  <div
                    className="bar-fill"
                    style={{ width: `${(v.mean / max) * 100}%` }}
                  />
                  {v.n > 1 && v.min != null && (
                    <span
                      className="bar-range"
                      style={{
                        left: `${(v.min / max) * 100}%`,
                        width: `${((v.max - v.min) / max) * 100}%`,
                      }}
                      title={`Mínimo ${format(v.min)} · máximo ${format(v.max)} · desvio padrão ${format(v.stddev)}`}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function RunInspector({ run }) {
  const [index, setIndex] = useState(0),
    [tab, setTab] = useState("raw_response");
  const result = run.results[index];
  const costs = run.results.map((r) => r.cost_usd);
  const total = costs.every((c) => c != null)
    ? costs.reduce((a, b) => a + b, 0)
    : null;
  return (
    <div className="run-details">
      <div className="toolbar">
        <label>
          {tr("Tarefa da resposta")}
          <select
            aria-label={tr("Tarefa da resposta")}
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {run.results.map((r, i) => (
              <option key={r.id} value={i}>
                {tr(tasks[r.task])} · {tr(levels[r.difficulty])}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Conteúdo")}
          <select
            aria-label={tr("Conteúdo")}
            value={tab}
            onChange={(e) => setTab(e.target.value)}
          >
            {Object.entries({
              trace: "Versões e rastreabilidade",
              raw_response: "Resposta original da API",
              parsed_output: "Dados extraídos",
              metrics: "Métricas",
              prompt: "Entrada enviada ao modelo",
              feedback_metrics: "Efeito das correções",
              feedback_transfer_metrics: "Generalização das correções",
            }).map(([k, v]) => (
              <option key={k} value={k}>
                {tr(v)}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          {tr("Custo desta execução: ")}
          {tr(usd(total))}
        </span>
      </div>
      {result && (
        <PagedText
          text={
            tab === "prompt"
              ? result.prompt
              : JSON.stringify(
                  tab === "trace"
                    ? {
                        run_id: run.id,
                        metadata: run.metadata,
                        prompt_hash: result.prompt_hash,
                        dataset_hash: result.dataset_hash,
                      }
                    : (result[tab] ?? L("Não disponível", "Unavailable")),
                  null,
                  2,
                )
          }
        />
      )}
    </div>
  );
}

function Graphs({ runs }) {
  const selection = useRun(runs, (r) =>
    (r.available_tasks || r.tasks).includes("relationship_extraction"),
  );
  const [graph, setGraph] = useState(null),
    [error, setError] = useState(""),
    [view, setView] = useState("side"),
    [focus, setFocus] = useState("requirements"),
    [item, setItem] = useState(null),
    [listOpen, setListOpen] = useState(false);
  useEffect(() => {
    let active = true;
    setGraph(null);
    setItem(null);
    setError("");
    if (selection.selected)
      api(`/runs/${selection.selected.id}/graph`)
        .then((g) => {
          if (active) setGraph(g);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [selection.selected?.id, selection.selected?.completed_calls]);
  if (!selection.available.length)
    return (
      <Empty title={tr("Nenhum grafo de modelo ainda")}>
        {tr(
          "Execute a tarefa de relações para comparar a resposta do modelo com a referência.",
        )}
      </Empty>
    );
  const chosen = focus === "all" ? null : focus;
  const requirementIds = new Set(
    [...(graph?.ground_truth.nodes || []), ...(graph?.model.nodes || [])]
      .filter((n) => n.type === "Requirement")
      .map((n) => normalize(n.id)),
  );
  const relevant =
    graph?.comparison.edges.filter((d) => {
      const e = d.model_edge || d.ground_truth_edge;
      return (
        !chosen ||
        (chosen === "requirements"
          ? [normalize(e.source), normalize(e.target)].some((id) =>
              requirementIds.has(id),
            )
          : [normalize(e.source), normalize(e.target)].includes(chosen))
      );
    }) || [];
  const counts = Object.fromEntries(
    Object.keys(statuses).map((s) => [
      s,
      relevant.filter((e) => e.status === s).length,
    ]),
  );
  return (
    <div className="graphs-screen">
      <RunPicker selection={selection} />
      {(error || selection.error) && (
        <p role="alert">{tr(error || selection.error)}</p>
      )}
      {graph && (
        <>
          <div className="graph-summary-strip">
            <div>
              <span>
                {L(
                  "Nós / relações extraídos",
                  "Extracted nodes / relationships",
                )}
              </span>
              <strong>
                {graph.model.nodes.length} / {graph.model.edges.length}
              </strong>
            </div>
            <div>
              <span>
                {L("Precisão / recall / F1", "Precision / recall / F1")}
              </span>
              <strong>
                {pct(graph.comparison.relationship?.precision)} /{" "}
                {pct(graph.comparison.relationship?.recall)} /{" "}
                {pct(graph.comparison.relationship_f1)}
              </strong>
            </div>
            <div>
              <span>
                {L("Relações sem suporte", "Unsupported relationships")}
              </span>
              <strong>
                {
                  graph.comparison.edges.filter(
                    (e) => e.model_edge && e.status !== "correct",
                  ).length
                }{" "}
                / {graph.model.edges.length}
              </strong>
            </div>
            <div>
              <span>{L("Execução / nível", "Execution / level")}</span>
              <strong>{selection.selected.id.slice(0, 8)} · L1</strong>
              <small>
                {selection.selected.incomplete
                  ? L("Avaliação parcial", "Partial run")
                  : L("Resposta avaliada", "Evaluated response")}
              </small>
            </div>
          </div>
          <div className="graph-tools">
            <div className="segmented" aria-label={tr("Visualização do grafo")}>
              {[
                ["side", "Lado a lado"],
                ["model", "Só modelo"],
                ["reference", "Só referência"],
                ["diff", "Diferenças"],
              ].map(([v, text]) => (
                <button
                  key={v}
                  className={view === v ? "active" : ""}
                  aria-pressed={view === v}
                  onClick={() => {
                    setView(v);
                    setItem(null);
                  }}
                >
                  {tr(text)}
                </button>
              ))}
            </div>
            <label className="inline-label">
              {tr("Foco")}
              <select
                aria-label={tr("Foco")}
                value={focus}
                onChange={(e) => {
                  setFocus(e.target.value);
                  setItem(null);
                }}
              >
                <option value="requirements">
                  {tr("Relações de requisitos")}
                </option>
                <option value="all">{tr("Todos os elementos")}</option>
                {graph.ground_truth.nodes
                  .filter((n) => n.type === "Requirement")
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {tr(n.id)} · {tr(nodeLabels[n.id] || n.name)}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="graph-legend">
            {Object.entries(statuses).map(([key, s]) => (
              <span key={key} className={key}>
                <b aria-hidden="true">{tr(s.symbol)}</b>
                {tr(s.label)} <strong>{tr(counts[key])}</strong>
              </span>
            ))}
          </div>
          <div className={`graph-layout ${view === "side" ? "paired" : ""}`}>
            {(view === "side" || view === "reference") && (
              <GraphCanvas
                title={tr("Referência")}
                subtitle="Relações esperadas no benchmark"
                kind="reference"
                graph={graph}
                focus={chosen}
                setItem={setItem}
              />
            )}
            {(view === "side" || view === "model") && (
              <GraphCanvas
                title={tr("Resposta do modelo")}
                subtitle={graph.model_name}
                kind="model"
                graph={graph}
                focus={chosen}
                setItem={setItem}
              />
            )}
            {view === "diff" && (
              <GraphCanvas
                title={tr("Diferenças")}
                subtitle="Relações corretas, extras e ausentes"
                kind="diff"
                graph={graph}
                focus={chosen}
                setItem={setItem}
              />
            )}
          </div>
          <p className="chart-caption">
            {tr(
              "Clique em uma ligação para ver a explicação e a evidência. Clique em um elemento para ver sua fonte.",
            )}
          </p>
          {item && selection.run && (
            <Modal
              title={L("Detalhes do grafo", "Graph details")}
              onClose={() => setItem(null)}
            >
              <GraphInspector
                key={`${item.kind}-${item.node?.id || item.edge?.key.join("-")}-${selection.run.id}`}
                item={item}
                run={selection.run}
                onClose={() => setItem(null)}
              />
            </Modal>
          )}
          <button
            className="graph-list-button"
            onClick={() => setListOpen(true)}
          >
            {tr("Ver relações em lista")}
          </button>
          {listOpen && (
            <Modal
              title={tr("Ver relações em lista")}
              onClose={() => setListOpen(false)}
            >
              <div className="relationship-list">
                {relevant.map((d) => {
                  const e = d.model_edge || d.ground_truth_edge;
                  return (
                    <button
                      key={d.key.join("|")}
                      onClick={() => {
                        setListOpen(false);
                        setItem({ kind: "comparison", edge: d });
                      }}
                    >
                      <span className={`status-mark ${d.status}`}>
                        {tr(statuses[d.status].symbol)}
                      </span>
                      <span>
                        {tr(e.source)}
                        {tr(" ")}
                        <small>
                          {tr(relations[e.relationship] || e.relationship)}
                        </small>
                        {tr(" ")}
                        {tr(e.target)}
                      </span>
                      <span className="muted">
                        {tr(statuses[d.status].label)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Modal>
          )}
        </>
      )}
    </div>
  );
}

function GraphCanvas({ title, subtitle, kind, graph, focus, setItem }) {
  const all = [
    ...new Map(
      [...graph.ground_truth.nodes, ...graph.model.nodes].map((n) => [
        normalize(n.id),
        n,
      ]),
    ).values(),
  ];
  const canonical = [
    ...new Map(
      [...graph.model.nodes, ...graph.ground_truth.nodes].map((n) => [
        normalize(n.id),
        n,
      ]),
    ).values(),
  ];
  const sourceOrder = [
    "REQ-001",
    "REQ-002",
    "REQ-003",
    "REQ-004",
    "REQ-005",
    "FAN",
    "SENSOR",
    "DRIVER",
  ];
  const targetOrder = [
    "P-FAN-CURRENT",
    "P-FAN-SPEED",
    "V-SPEED",
    "CFG-THRESHOLD",
    "CFG-SENSOR-SUPPLY",
    "P-SENSOR-SUPPLY",
    "P-DRIVER-CURRENT",
    "P-FAN-VOLTAGE",
    "P-DRIVER-VOLTAGE",
  ];
  let nodes =
    kind === "model"
      ? graph.model.nodes
      : kind === "reference"
        ? graph.ground_truth.nodes
        : all;
  let details = graph.comparison.edges.filter((d) =>
    kind === "model"
      ? !!d.model_edge
      : kind === "reference"
        ? !!d.ground_truth_edge
        : true,
  );
  const focusIds = new Set(
    focus === "requirements"
      ? canonical
          .filter((n) => n.type === "Requirement")
          .map((n) => normalize(n.id))
      : [focus],
  );
  const connected = new Set(focusIds);
  if (focus) {
    graph.comparison.edges.forEach((d) => {
      const e = d.model_edge || d.ground_truth_edge;
      if (
        [normalize(e.source), normalize(e.target)].some((id) =>
          focusIds.has(id),
        )
      ) {
        connected.add(normalize(e.source));
        connected.add(normalize(e.target));
      }
    });
    details = details.filter((d) => {
      const e =
        kind === "reference"
          ? d.ground_truth_edge
          : d.model_edge || d.ground_truth_edge;
      return [normalize(e.source), normalize(e.target)].some((id) =>
        focusIds.has(id),
      );
    });
    nodes = nodes.filter((n) => connected.has(normalize(n.id)));
  }
  const positioned = canonical.filter(
    (n) => !focus || connected.has(normalize(n.id)),
  );
  const left = positioned
    .filter((n) => ["Requirement", "Component"].includes(n.type))
    .sort(
      (a, b) =>
        sourceOrder.indexOf(normalize(a.id)) -
        sourceOrder.indexOf(normalize(b.id)),
    );
  const right = positioned
    .filter((n) => !["Requirement", "Component"].includes(n.type))
    .sort(
      (a, b) =>
        targetOrder.indexOf(normalize(a.id)) -
        targetOrder.indexOf(normalize(b.id)),
    );
  const flowNodes = nodes.map((n) => {
    const isLeft = ["Requirement", "Component"].includes(n.type);
    const index = (isLeft ? left : right).findIndex(
      (x) => normalize(x.id) === normalize(n.id),
    );
    const targets = graph.ground_truth.edges
      .filter((e) => normalize(e.source) === normalize(n.id))
      .map((e) =>
        right.findIndex((n) => normalize(n.id) === normalize(e.target)),
      )
      .filter((i) => i >= 0);
    const y =
      focus === "requirements" && isLeft && targets.length
        ? targets.reduce((sum, i) => sum + i * 83, 0) / targets.length
        : index * 83;
    return {
      id: normalize(n.id),
      position: { x: isLeft ? 0 : 310, y },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      data: {
        original: n,
        label: (
          <>
            <small>{tr(n.id)}</small>
            <strong>{tr(nodeLabels[normalize(n.id)] || n.name)}</strong>
          </>
        ),
      },
      className: `graph-node ${n.type.toLowerCase()}`,
      style: { width: 216 },
    };
  });
  const ids = new Set(flowNodes.map((n) => n.id));
  const flowEdges = details
    .map((d) => {
      const e =
        kind === "reference"
          ? d.ground_truth_edge
          : d.model_edge || d.ground_truth_edge;
      const s = statuses[d.status];
      return {
        id: d.key.join("|"),
        source: normalize(e.source),
        target: normalize(e.target),
        type: "default",
        label: `${s.symbol} ${tr(relations[e.relationship] || e.relationship)}`,
        data: { detail: d },
        markerEnd: { type: MarkerType.ArrowClosed, color: s.color },
        style: { stroke: s.color, strokeWidth: 1.8, strokeDasharray: s.dash },
        labelStyle: { fontSize: 10, fill: "#334155" },
        labelBgStyle: { fill: "#fff", fillOpacity: 0.95 },
        labelBgPadding: [4, 3],
        interactionWidth: 22,
        pathOptions: { curvature: 0.18 },
      };
    })
    .filter((e) => ids.has(e.source) && ids.has(e.target));
  return (
    <section
      className="graph-card"
      aria-label={`${L("Grafo", "Graph")}: ${tr(title)}`}
    >
      <div className="graph-card-heading">
        <div>
          <h2>{tr(title)}</h2>
          <p>{tr(subtitle)}</p>
        </div>
        <span className="count-badge">
          {tr(flowEdges.length)}
          {tr(" relações")}
        </span>
      </div>
      {flowNodes.length ? (
        <div
          className={`graph-canvas ${focus === "requirements" ? "requirements" : focus ? "focused" : ""}`}
        >
          <ReactFlow
            key={`${graph.run_id}-${kind}-${focus || "all"}`}
            nodes={flowNodes}
            edges={flowEdges}
            fitView
            fitViewOptions={{ padding: 0.12, maxZoom: 1.1 }}
            minZoom={0.3}
            maxZoom={1.8}
            nodesDraggable={false}
            nodesConnectable={false}
            onNodeClick={(_, n) => setItem({ kind, node: n.data.original })}
            onEdgeClick={(_, e) => setItem({ kind, edge: e.data.detail })}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} color="#29445c" />
            <LocalizedGraphControls />
          </ReactFlow>
        </div>
      ) : (
        <div className="empty-inline">
          {tr("O modelo não retornou elementos para esta seleção.")}
        </div>
      )}
    </section>
  );
}

function LocalizedGraphControls() {
  const flow = useReactFlow();
  return (
    <Controls
      showZoom={false}
      showFitView={false}
      showInteractive={false}
      aria-label={L("Controles do grafo", "Graph controls")}
    >
      <ControlButton
        onClick={() => flow.zoomIn()}
        title={L("Aproximar", "Zoom in")}
        aria-label={L("Aproximar", "Zoom in")}
      >
        +
      </ControlButton>
      <ControlButton
        onClick={() => flow.zoomOut()}
        title={L("Afastar", "Zoom out")}
        aria-label={L("Afastar", "Zoom out")}
      >
        −
      </ControlButton>
      <ControlButton
        onClick={() => flow.fitView({ padding: 0.15 })}
        title={L("Enquadrar grafo", "Fit graph")}
        aria-label={L("Enquadrar grafo", "Fit graph")}
      >
        ⛶
      </ControlButton>
    </Controls>
  );
}

function GraphInspector({ item, run, onClose }) {
  const [verdict, setVerdict] = useState(
    item.edge?.status === "missing"
      ? "Missing relationship"
      : item.edge?.status === "false_positive"
        ? "Incorrect"
        : "Correct",
  );
  const [correction, setCorrection] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [message, setMessage] = useState(""),
    [feedback, setFeedback] = useState([]);
  const ds = run.snapshot.dataset;
  const loadFeedback = () =>
    api("/feedback")
      .then((list) => setFeedback(list.filter((f) => f.run_id === run.id)))
      .catch((e) => setMessage(e.message));
  useEffect(() => {
    loadFeedback();
  }, [run.id]);
  async function save(e) {
    e.preventDefault();
    const edge = item.edge.model_edge || item.edge.ground_truth_edge;
    try {
      await api("/feedback", "POST", {
        run_id: run.id,
        edge: {
          source: edge.source,
          target: edge.target,
          relationship: edge.relationship,
        },
        verdict,
        correction,
        confirmed,
      });
      setMessage("Correção salva.");
      setCorrection("");
      loadFeedback();
    } catch (err) {
      setMessage(err.message);
    }
  }
  return (
    <section className="panel inspector" aria-label={tr("Detalhes da seleção")}>
      <SectionHeading
        title={
          item.node
            ? nodeLabels[normalize(item.node.id)] || item.node.name
            : `${(item.edge.model_edge || item.edge.ground_truth_edge).source} → ${(item.edge.model_edge || item.edge.ground_truth_edge).target}`
        }
      >
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={tr("Fechar detalhes")}
        >
          {tr("×")}
        </button>
      </SectionHeading>
      {item.node ? (
        <>
          <p>
            <strong>{tr(item.node.name)}</strong> · {tr(item.node.id)}
          </p>
          <p className="muted">
            {tr(
              item.kind === "reference"
                ? "Fonte da referência"
                : "Fonte informada pelo modelo",
            )}
            : {tr(item.node.source)} · {tr(item.node.source_reference)}
          </p>
          <blockquote>
            {tr(
              ds.documents[normalize(item.node.source)]?.[
                item.node.source_reference
              ] || "Localização não encontrada nos documentos enviados.",
            )}
          </blockquote>
        </>
      ) : (
        <>
          <div className={`status-label ${item.edge.status}`}>
            {tr(statuses[item.edge.status].symbol)}
            {tr(" ")}
            {tr(statuses[item.edge.status].label)}
          </div>
          <dl className="edge-facts">
            <div>
              <dt>{tr("Relação")}</dt>
              <dd>
                {tr(
                  relations[
                    (item.edge.model_edge || item.edge.ground_truth_edge)
                      .relationship
                  ],
                )}
              </dd>
            </div>
            <div>
              <dt>{tr("Existe na referência")}</dt>
              <dd>{tr(item.edge.exists_in_ground_truth ? "Sim" : "Não")}</dd>
            </div>
            <div>
              <dt>{tr("Confiança do modelo")}</dt>
              <dd>{tr(pct(item.edge.model_edge?.confidence))}</dd>
            </div>
          </dl>
          <div className="evidence-columns">
            <div>
              <h3>{tr("Explicação do modelo")}</h3>
              <p>
                {item.edge.model_edge?.reason ||
                  "O modelo não identificou esta relação."}
              </p>
              <Evidence items={item.edge.model_edge?.source_evidence} />
            </div>
            <div>
              <h3>{tr("Referência")}</h3>
              <p>
                {item.edge.ground_truth_edge?.reason ||
                  "Esta relação não faz parte da referência."}
              </p>
              <Evidence items={item.edge.ground_truth_edge?.source_evidence} />
            </div>
          </div>
          <details>
            <summary>{tr("Registrar correção")}</summary>
            <form onSubmit={save}>
              <div className="toolbar">
                <label>
                  {tr("Avaliação")}
                  <select
                    aria-label={tr("Avaliação")}
                    value={verdict}
                    onChange={(e) => setVerdict(e.target.value)}
                  >
                    <option value="Correct">{tr("Correta")}</option>
                    <option value="Incorrect">{tr("Incorreta")}</option>
                    <option value="Missing relationship">
                      {tr("Relação ausente")}
                    </option>
                  </select>
                </label>
              </div>
              <label>
                {tr("Correção")}
                <textarea
                  required
                  maxLength={1000}
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {tr(
                  "Confirmo esta correção para uso em avaliações assistidas.",
                )}
              </label>
              <button className="primary" type="submit">
                {tr("Salvar correção")}
              </button>
            </form>
          </details>
        </>
      )}
      <small className="muted">
        {tr(run.metadata.model)}
        {tr(" · execução ")}
        {tr(run.id)}
      </small>
      {message && <p role="status">{tr(message)}</p>}
      {!!feedback.length && (
        <details>
          <summary>
            {tr("Correções desta execução (")}
            {tr(feedback.length)})
          </summary>
          {feedback.map((f) => (
            <div className="feedback-row" key={f.id}>
              <span>
                {tr(f.edge.source)} → {tr(f.edge.target)}
                <small>{f.correction}</small>
              </span>
              <button
                onClick={async () => {
                  try {
                    await api(`/feedback/${f.id}`, "PATCH", {
                      confirmed: !f.confirmed,
                    });
                    loadFeedback();
                  } catch (e) {
                    setMessage(e.message);
                  }
                }}
              >
                {tr(f.confirmed ? "Retirar confirmação" : "Confirmar")}
              </button>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

function Impacts({ runs }) {
  const selection = useRun(runs, (r) =>
    (r.available_tasks || r.tasks).some((t) =>
      ["change_impact", "one_hop", "impact_explanation"].includes(t),
    ),
  );
  if (!selection.available.length)
    return (
      <Empty title={tr("Nenhuma análise de alteração ainda")}>
        {tr(
          "Execute a tarefa de impactos para comparar os requisitos afetados.",
        )}
      </Empty>
    );
  return (
    <ImpactPage
      selection={selection}
      picker={<RunPicker selection={selection} />}
      renderReview={(run, result, scenario) => (
        <ExplanationReview
          key={scenario.id + result.id}
          run={run}
          result={result}
          scenario={scenario}
        />
      )}
    />
  );
}
function ExplanationReview({ run, result, scenario }) {
  const [requirement, setRequirement] = useState(
      scenario.affected_requirements[0] || "REQ-001",
    ),
    [comment, setComment] = useState(""),
    [verdict, setVerdict] = useState("Needs review"),
    [message, setMessage] = useState("");
  async function save(e) {
    e.preventDefault();
    try {
      await api("/reviews", "POST", {
        run_id: run.id,
        result_id: result.id,
        scenario_id: scenario.id,
        requirement_id: requirement,
        verdict,
        comment,
      });
      setMessage("Revisão salva.");
      setComment("");
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <details>
      <summary>{tr("Revisar explicação")}</summary>
      <form onSubmit={save}>
        <div className="toolbar">
          <label>
            {tr("Requisito")}
            <select
              aria-label={tr("Requisito")}
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
            >
              {run.snapshot.dataset.ground_truth.requirements.map((r) => (
                <option key={r.id}>{tr(r.id)}</option>
              ))}
            </select>
          </label>
          <label>
            {tr("Parecer")}
            <select
              aria-label={tr("Parecer")}
              value={verdict}
              onChange={(e) => setVerdict(e.target.value)}
            >
              <option value="Needs review">{tr("Precisa de revisão")}</option>
              <option value="Supported explanation">
                {tr("Explicação sustentada")}
              </option>
              <option value="Unsupported explanation">
                {tr("Explicação sem suporte")}
              </option>
            </select>
          </label>
        </div>
        <label>
          {tr("Comentário")}
          <textarea
            required
            value={comment}
            maxLength={2000}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        <button type="submit">{tr("Salvar revisão")}</button>
        {message && <p role="status">{tr(message)}</p>}
      </form>
    </details>
  );
}

createRoot(document.getElementById("root")).render(<App />);
