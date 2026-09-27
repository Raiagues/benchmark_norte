import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./style.css";

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
  results: "Resultados",
  graphs: "Grafos",
  impact: "Alterações",
  documents: "Documentos",
  run: "Nova avaliação",
};
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
  correct: { label: "Correta", symbol: "✓", color: "#147463", dash: undefined },
  correct_bad_evidence: {
    label: "Evidência inválida",
    symbol: "!",
    color: "#986b17",
    dash: "9 3 2 3",
  },
  false_positive: {
    label: "Extra / incorreta",
    symbol: "+",
    color: "#bc454b",
    dash: "3 4",
  },
  missing: {
    label: "Não identificada",
    symbol: "−",
    color: "#65738d",
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
    : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const decimal = (v) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const usd = (v) => (v == null ? "Não disponível" : `$${v.toFixed(4)}`);
const date = (v) =>
  new Date(v).toLocaleString("pt-BR", {
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
      <h2>{title}</h2>
      <p>
        {children ||
          "Os resultados aparecem após uma avaliação real concluída pelas APIs."}
      </p>
      {action && (
        <button className="primary" onClick={() => go("run")}>
          Executar primeira avaliação <span>→</span>
        </button>
      )}
    </div>
  );
}
function SectionHeading({ title, children }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {children}
    </div>
  );
}
function Evidence({ items = [] }) {
  return items.length ? (
    <div className="evidence">
      {items.map((e, i) => (
        <blockquote key={i}>
          <small>
            {e.document_id} · {e.location}
          </small>
          <p>{e.excerpt}</p>
        </blockquote>
      ))}
    </div>
  ) : (
    <p className="muted">Sem evidência informada.</p>
  );
}

function App() {
  const [page, setPage] = useState(
    pages[location.hash.slice(1)] ? location.hash.slice(1) : "results",
  );
  const [config, setConfig] = useState(null),
    [ds, setDs] = useState(null),
    [runs, setRuns] = useState([]),
    [summary, setSummary] = useState([]),
    [executions, setExecutions] = useState([]),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  async function refresh() {
    try {
      const [r, s, e, c] = await Promise.all([
        api("/runs"),
        api("/summary"),
        api("/executions"),
        api("/config"),
      ]);
      setRuns(r);
      setSummary(s);
      setExecutions(e);
      setConfig(c);
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
    const navigate = () =>
      setPage(
        pages[location.hash.slice(1)] ? location.hash.slice(1) : "results",
      );
    window.addEventListener("hashchange", navigate);
    return () => {
      clearInterval(timer);
      window.removeEventListener("hashchange", navigate);
    };
  }, []);
  return (
    <>
      <header className="topbar">
        <a className="brand" href="#results">
          <span className="brand-icon">n</span>Norte
          <span className="brand-caption">/ benchmark</span>
        </a>
        <nav aria-label="Navegação principal">
          {Object.entries(pages)
            .filter(([key]) => key !== "run")
            .map(([key, name]) => (
              <a
                key={key}
                href={`#${key}`}
                aria-current={page === key ? "page" : undefined}
              >
                {name}
              </a>
            ))}
        </nav>
        <a className="button primary" href="#run">
          Nova avaliação <span>＋</span>
        </a>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">COMPREENSÃO DE ENGENHARIA</p>
            <h1>{pages[page]}</h1>
          </div>
          {config && (
            <span className="dataset-tag">
              Dataset {config.manifest.dataset_version}
            </span>
          )}
        </div>
        {error && (
          <div role="alert" className="notice error">
            {error}
            <button onClick={refresh}>Tentar novamente</button>
          </div>
        )}
        {!ready || !config || !ds ? (
          <p className="loading">Carregando…</p>
        ) : (
          <>
            {page === "results" && <Results runs={runs} summary={summary} />}
            {page === "graphs" && <Graphs runs={runs} />}
            {page === "impact" && <Impacts runs={runs} />}
            {page === "documents" && <Documents ds={ds} config={config} />}
            {page === "run" && (
              <RunPage
                config={config}
                runs={runs}
                executions={executions}
                refresh={refresh}
              />
            )}
          </>
        )}
        <footer>
          Norte · Avaliação local de modelos
          {config && (
            <span>
              Referência documental · {config.manifest.dataset_version}
            </span>
          )}
        </footer>
      </main>
    </>
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
  }, [selected?.id]);
  return { available, selected, run, error, setId };
}
function RunPicker({ selection }) {
  const { available, selected, setId } = selection;
  const models = [...new Set(available.map((r) => `${r.provider}|${r.model}`))];
  const chosen = selected ? `${selected.provider}|${selected.model}` : "";
  return (
    <div className="toolbar run-picker">
      <label>
        Modelo
        <select
          aria-label="Modelo"
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
              {providers[m.split("|")[0]]} · {m.split("|")[1]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Execução
        <select
          aria-label="Execução"
          value={selected?.id || ""}
          onChange={(e) => setId(e.target.value)}
        >
          {available
            .filter((r) => `${r.provider}|${r.model}` === chosen)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {date(r.created_at)} · repetição {r.repetition} ·{" "}
                {r.experiment === "first_pass"
                  ? "sem correções"
                  : "com correções"}{" "}
                · {r.input_mode === "pdf_text" ? "PDF" : "texto"} ·{" "}
                {r.id.slice(0, 6)}
              </option>
            ))}
        </select>
      </label>
      {selected && (
        <a
          className="text-link download"
          href={`/api/runs/${selected.id}/download`}
        >
          Baixar resposta completa ↓
        </a>
      )}
    </div>
  );
}

function Results({ runs, summary }) {
  const [cohort, setCohort] = useState(""),
    [level, setLevel] = useState("L1_DIRECT"),
    [task, setTask] = useState("relationship_extraction"),
    [hidden, setHidden] = useState([]);
  const selection = useRun(runs);
  if (!runs.length) return <Empty />;
  if (!summary.length) return <p className="loading">Carregando métricas…</p>;
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
    <>
      <div className="toolbar comparison-controls">
        {cohorts.length > 1 && (
          <label>
            Avaliação comparável
            <select
              aria-label="Avaliação comparável"
              value={cohortKey(chosen)}
              onChange={(e) => {
                setCohort(e.target.value);
                setHidden([]);
              }}
            >
              {cohorts.map((c, i) => (
                <option key={cohortKey(c)} value={cohortKey(c)}>
                  {i + 1}.{" "}
                  {c.input_mode === "controlled_text" ? "Texto" : "PDF"} ·{" "}
                  {c.experiment === "first_pass"
                    ? "Sem correções"
                    : "Com correções"}{" "}
                  · versão {c.comparison_hash.slice(0, 6)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Dificuldade
          <select
            aria-label="Dificuldade"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            {Object.entries(levels).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <span className="muted control-note">
          {chosen?.input_mode === "pdf_text" ? "PDF" : "Texto controlado"} ·{" "}
          {chosen?.experiment === "first_pass"
            ? "Sem correções prévias"
            : "Com correções confirmadas"}
        </span>
      </div>
      <div className="model-filters" aria-label="Modelos comparados">
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
            {m.model}
          </label>
        ))}
      </div>
      {rows.length ? (
        <>
          <section className="panel overview-panel">
            <SectionHeading title="Visão geral">
              <span className="muted">Médias das execuções concluídas</span>
            </SectionHeading>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Modelo</th>
                    {level === "L1_DIRECT" && (
                      <>
                        <th>Extração F1 ↑</th>
                        <th>Relações F1 ↑</th>
                      </>
                    )}
                    <th>Recall de impacto ↑</th>
                    <th>Falhas críticas ↓</th>
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
                            <strong>{m.model}</strong>
                            <small>{providers[m.provider]}</small>
                          </td>
                          {level === "L1_DIRECT" && (
                            <>
                              <td>
                                {pct(
                                  metric(m, "entity_extraction", "entity_f1"),
                                )}
                              </td>
                              <td>
                                {pct(
                                  metric(
                                    m,
                                    "relationship_extraction",
                                    "relationship_f1",
                                  ),
                                )}
                              </td>
                            </>
                          )}
                          <td>{pct(metric(m, impact, "impact_recall"))}</td>
                          <td>
                            {pct(
                              metric(m, impact, "critical_impact_miss_rate"),
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="comparison-section">
            <SectionHeading title="Comparar métricas">
              <label className="inline-label">
                Tarefa
                <select
                  aria-label="Tarefa"
                  value={activeTask}
                  onChange={(e) => setTask(e.target.value)}
                >
                  {options.map((t) => (
                    <option key={t} value={t}>
                      {tasks[t]}
                    </option>
                  ))}
                </select>
              </label>
            </SectionHeading>
            <div className="chart-grid">
              <MetricChart
                title="Precisão"
                hint="Acertos entre as previsões · maior é melhor"
                rows={series}
                metric={`${family}_precision`}
              />
              <MetricChart
                title="Recall"
                hint="Dependências encontradas · maior é melhor"
                rows={series}
                metric={`${family}_recall`}
              />
              <MetricChart
                title="F1"
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
                title="Consistência"
                hint="Respostas iguais entre repetições · maior é melhor"
                rows={series}
                field="consistency"
              />
              <MetricChart
                title="Tempo por chamada"
                hint="Média em segundos · menor é melhor"
                rows={series}
                field="latency_seconds"
                seconds
              />
            </div>
            <p className="chart-caption">
              Barras: média. Traços: mínimo e máximo. — = sem medição
              disponível.
            </p>
          </section>
          <section className="panel">
            <SectionHeading title="Uso da API" />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Modelo</th>
                    <th>Repetições</th>
                    <th>Tokens de entrada / saída</th>
                    <th>Custo por tarefa</th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((r) => (
                    <tr key={modelKey(r)}>
                      <td>{r.model}</td>
                      <td>{r.n}</td>
                      <td>
                        {r.token_usage_complete
                          ? `${decimal(r.known_input_tokens)} / ${decimal(r.known_output_tokens)}`
                          : "Não disponível"}
                      </td>
                      <td>{usd(r.average_cost_per_task_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details>
              <summary>Estatísticas completas</summary>
              <Json
                value={series.map(
                  ({ model, n, metrics, consistency, latency_seconds }) => ({
                    model,
                    n,
                    metrics,
                    consistency,
                    latency_seconds,
                  }),
                )}
              />
            </details>
          </section>
        </>
      ) : (
        <div className="empty-inline">Não há medições para esta seleção.</div>
      )}
      <section className="panel">
        <SectionHeading title="Inspecionar uma execução" />
        <RunPicker selection={selection} />
        {selection.error && <p role="alert">{selection.error}</p>}
        {selection.run && (
          <RunInspector key={selection.run.id} run={selection.run} />
        )}
      </section>
    </>
  );
}

function MetricChart({ title, hint, rows, metric, field, seconds = false }) {
  const values = rows.map((r) => {
    const raw = metric ? r.metrics[metric] : r[field];
    const stats = typeof raw === "number" ? { mean: raw } : raw || {};
    return {
      ...stats,
      model: r.model,
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
      <h3>{title}</h3>
      <p>{hint}</p>
      <div className="chart-bars">
        {values.map((v) => (
          <div className={`chart-row ${v.provider}`} key={v.key}>
            <div className="chart-row-label">
              <span>{v.model}</span>
              <strong>{format(v.mean)}</strong>
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
    <details className="run-details">
      <summary>Resposta original, métricas e informações da execução</summary>
      <div className="toolbar">
        <label>
          Tarefa da resposta
          <select
            aria-label="Tarefa da resposta"
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
          >
            {run.results.map((r, i) => (
              <option key={r.id} value={i}>
                {tasks[r.task]} · {levels[r.difficulty]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Conteúdo
          <select
            aria-label="Conteúdo"
            value={tab}
            onChange={(e) => setTab(e.target.value)}
          >
            {Object.entries({
              raw_response: "Resposta original da API",
              parsed_output: "Dados extraídos",
              metrics: "Métricas",
              prompt: "Entrada enviada ao modelo",
              feedback_metrics: "Efeito das correções",
              feedback_transfer_metrics: "Generalização das correções",
            }).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">Custo desta execução: {usd(total)}</span>
      </div>
      {result &&
        (tab === "prompt" ? (
          <pre>{result.prompt}</pre>
        ) : (
          <Json value={result[tab] ?? "Não disponível para esta tarefa"} />
        ))}
      <details>
        <summary>Versões e rastreabilidade</summary>
        <Json
          value={{
            run_id: run.id,
            metadata: run.metadata,
            prompt_hash: result?.prompt_hash,
            dataset_hash: result?.dataset_hash,
          }}
        />
      </details>
    </details>
  );
}

function Graphs({ runs }) {
  const selection = useRun(runs, (r) =>
    r.tasks.includes("relationship_extraction"),
  );
  const [graph, setGraph] = useState(null),
    [error, setError] = useState(""),
    [view, setView] = useState("side"),
    [focus, setFocus] = useState("requirements"),
    [item, setItem] = useState(null);
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
  }, [selection.selected?.id]);
  if (!selection.available.length)
    return (
      <Empty title="Nenhum grafo de modelo ainda">
        Execute a tarefa de relações para comparar a resposta do modelo com a
        referência.
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
    <>
      <RunPicker selection={selection} />
      {(error || selection.error) && (
        <p role="alert">{error || selection.error}</p>
      )}
      {graph && (
        <>
          <div className="graph-tools">
            <div className="segmented" aria-label="Visualização do grafo">
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
                  {text}
                </button>
              ))}
            </div>
            <label className="inline-label">
              Foco
              <select
                aria-label="Foco"
                value={focus}
                onChange={(e) => {
                  setFocus(e.target.value);
                  setItem(null);
                }}
              >
                <option value="requirements">Relações de requisitos</option>
                <option value="all">Todos os elementos</option>
                {graph.ground_truth.nodes
                  .filter((n) => n.type === "Requirement")
                  .map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.id} · {nodeLabels[n.id] || n.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="graph-legend">
            {Object.entries(statuses).map(([key, s]) => (
              <span key={key} className={key}>
                <b aria-hidden="true">{s.symbol}</b>
                {s.label} <strong>{counts[key]}</strong>
              </span>
            ))}
          </div>
          <div className={`graph-layout ${view === "side" ? "paired" : ""}`}>
            {(view === "side" || view === "reference") && (
              <GraphCanvas
                title="Referência"
                subtitle="Relações esperadas no benchmark"
                kind="reference"
                graph={graph}
                focus={chosen}
                setItem={setItem}
              />
            )}
            {(view === "side" || view === "model") && (
              <GraphCanvas
                title="Resposta do modelo"
                subtitle={graph.model_name}
                kind="model"
                graph={graph}
                focus={chosen}
                setItem={setItem}
              />
            )}
            {view === "diff" && (
              <GraphCanvas
                title="Diferenças"
                subtitle="Relações corretas, extras e ausentes"
                kind="diff"
                graph={graph}
                focus={chosen}
                setItem={setItem}
              />
            )}
          </div>
          <p className="chart-caption">
            Clique em uma ligação para ver a explicação e a evidência. Clique em
            um elemento para ver sua fonte.
          </p>
          {item && selection.run && (
            <GraphInspector
              key={`${item.kind}-${item.node?.id || item.edge?.key.join("-")}-${selection.run.id}`}
              item={item}
              run={selection.run}
              onClose={() => setItem(null)}
            />
          )}
          <details className="panel">
            <summary>Ver relações em lista</summary>
            <div className="relationship-list">
              {relevant.map((d) => {
                const e = d.model_edge || d.ground_truth_edge;
                return (
                  <button
                    key={d.key.join("|")}
                    onClick={() => setItem({ kind: "comparison", edge: d })}
                  >
                    <span className={`status-mark ${d.status}`}>
                      {statuses[d.status].symbol}
                    </span>
                    <span>
                      {e.source}{" "}
                      <small>
                        {relations[e.relationship] || e.relationship}
                      </small>{" "}
                      {e.target}
                    </span>
                    <span className="muted">{statuses[d.status].label}</span>
                  </button>
                );
              })}
            </div>
          </details>
        </>
      )}
    </>
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
            <small>{n.id}</small>
            <strong>{nodeLabels[normalize(n.id)] || n.name}</strong>
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
        label: `${s.symbol} ${relations[e.relationship] || e.relationship}`,
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
    <section className="graph-card" aria-label={`Grafo: ${title}`}>
      <div className="graph-card-heading">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <span className="count-badge">{flowEdges.length} relações</span>
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
            <Background gap={24} size={1} color="#e3e8ed" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      ) : (
        <div className="empty-inline">
          O modelo não retornou elementos para esta seleção.
        </div>
      )}
    </section>
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
    <section className="panel inspector" aria-label="Detalhes da seleção">
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
          aria-label="Fechar detalhes"
        >
          ×
        </button>
      </SectionHeading>
      {item.node ? (
        <>
          <p>
            <strong>{item.node.name}</strong> · {item.node.id}
          </p>
          <p className="muted">
            {item.kind === "reference"
              ? "Fonte da referência"
              : "Fonte informada pelo modelo"}
            : {item.node.source} · {item.node.source_reference}
          </p>
          <blockquote>
            {ds.documents[normalize(item.node.source)]?.[
              item.node.source_reference
            ] || "Localização não encontrada nos documentos enviados."}
          </blockquote>
        </>
      ) : (
        <>
          <div className={`status-label ${item.edge.status}`}>
            {statuses[item.edge.status].symbol}{" "}
            {statuses[item.edge.status].label}
          </div>
          <dl className="edge-facts">
            <div>
              <dt>Relação</dt>
              <dd>
                {
                  relations[
                    (item.edge.model_edge || item.edge.ground_truth_edge)
                      .relationship
                  ]
                }
              </dd>
            </div>
            <div>
              <dt>Existe na referência</dt>
              <dd>{item.edge.exists_in_ground_truth ? "Sim" : "Não"}</dd>
            </div>
            <div>
              <dt>Confiança do modelo</dt>
              <dd>{pct(item.edge.model_edge?.confidence)}</dd>
            </div>
          </dl>
          <div className="evidence-columns">
            <div>
              <h3>Explicação do modelo</h3>
              <p>
                {item.edge.model_edge?.reason ||
                  "O modelo não identificou esta relação."}
              </p>
              <Evidence items={item.edge.model_edge?.source_evidence} />
            </div>
            <div>
              <h3>Referência</h3>
              <p>
                {item.edge.ground_truth_edge?.reason ||
                  "Esta relação não faz parte da referência."}
              </p>
              <Evidence items={item.edge.ground_truth_edge?.source_evidence} />
            </div>
          </div>
          <details>
            <summary>Registrar correção</summary>
            <form onSubmit={save}>
              <div className="toolbar">
                <label>
                  Avaliação
                  <select
                    aria-label="Avaliação"
                    value={verdict}
                    onChange={(e) => setVerdict(e.target.value)}
                  >
                    <option value="Correct">Correta</option>
                    <option value="Incorrect">Incorreta</option>
                    <option value="Missing relationship">
                      Relação ausente
                    </option>
                  </select>
                </label>
              </div>
              <label>
                Correção
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
                Confirmo esta correção para uso em avaliações assistidas.
              </label>
              <button className="primary" type="submit">
                Salvar correção
              </button>
            </form>
          </details>
        </>
      )}
      <small className="muted">
        {run.metadata.model} · execução {run.id}
      </small>
      {message && <p role="status">{message}</p>}
      {!!feedback.length && (
        <details>
          <summary>Correções desta execução ({feedback.length})</summary>
          {feedback.map((f) => (
            <div className="feedback-row" key={f.id}>
              <span>
                {f.edge.source} → {f.edge.target}
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
                {f.confirmed ? "Retirar confirmação" : "Confirmar"}
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
    r.tasks.some((t) =>
      ["change_impact", "one_hop", "impact_explanation"].includes(t),
    ),
  );
  const [level, setLevel] = useState("L1_DIRECT"),
    [type, setType] = useState("all"),
    [task, setTask] = useState("change_impact");
  if (!selection.available.length)
    return (
      <Empty title="Nenhuma análise de alteração ainda">
        Execute a tarefa de impactos para comparar os requisitos afetados.
      </Empty>
    );
  const run = selection.run;
  const results =
    run?.results.filter(
      (r) => r.difficulty === level && r.parsed_output?.scenarios,
    ) || [];
  const result = results.find((r) => r.task === task) || results[0];
  const cases =
    run?.snapshot.dataset.ground_truth.change_scenarios.filter(
      (s) => s.difficulty === level,
    ) || [];
  const typeNames = {
    component: "Componente",
    requirement: "Requisito",
    configuration: "Configuração",
    document: "Documento",
    no_impact: "Sem impacto",
    parameter: "Parâmetro",
  };
  return (
    <>
      <RunPicker selection={selection} />
      <div className="toolbar">
        <label>
          Dificuldade
          <select
            aria-label="Dificuldade"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            {Object.entries(levels).map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo de alteração
          <select
            aria-label="Tipo de alteração"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">Todos</option>
            {[...new Set(cases.map((s) => s.change_type))].map((t) => (
              <option key={t} value={t}>
                {typeNames[t] || t.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        {results.length > 1 && (
          <label>
            Tarefa
            <select
              aria-label="Tarefa"
              value={result?.task}
              onChange={(e) => setTask(e.target.value)}
            >
              {results.map((r) => (
                <option key={r.id} value={r.task}>
                  {tasks[r.task]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {selection.error && <p role="alert">{selection.error}</p>}
      {run && !result ? (
        <div className="empty-inline">
          Esta execução não incluiu a tarefa neste nível.
        </div>
      ) : (
        result && (
          <section className="panel scenario-panel">
            <div className="scenario-header">
              <span>Alteração</span>
              <span>Esperado</span>
              <span>Modelo</span>
              <span>Comparação</span>
            </div>
            {cases
              .filter((s) => type === "all" || s.change_type === type)
              .map((s) => {
                const answer = result.parsed_output.scenarios.find(
                  (a) => normalize(a.scenario_id) === s.id,
                );
                const check = result.metrics.scenarios?.find(
                  (x) => x.scenario_id === s.id,
                );
                const pred = (answer?.impacts || []).map((i) =>
                  normalize(i.requirement_id),
                );
                const correct = pred.filter((id) =>
                  s.affected_requirements.includes(id),
                );
                const missed = s.affected_requirements.filter(
                  (id) => !pred.includes(id),
                );
                const extra = pred.filter(
                  (id) => !s.affected_requirements.includes(id),
                );
                return (
                  <details className="scenario" key={s.id}>
                    <summary>
                      <span>
                        <strong>{s.id}</strong>
                        <small>{s.title || s.description}</small>
                      </span>
                      <span className="requirement-list">
                        {s.affected_requirements.join(", ") || "Nenhum"}
                      </span>
                      <span className="requirement-list">
                        {pred.join(", ") || "Nenhum"}
                      </span>
                      <span className="impact-counts">
                        <span className="correct">
                          ✓ {correct.length} acertos
                        </span>
                        {missed.length > 0 && (
                          <span className="missing">
                            − {missed.length} ausentes
                          </span>
                        )}
                        {extra.length > 0 && (
                          <span className="false_positive">
                            + {extra.length} extras
                          </span>
                        )}
                      </span>
                    </summary>
                    <div className="scenario-body">
                      <p className="muted">{s.description}</p>
                      <div className="evidence-columns">
                        <div>
                          <h3>Por que precisa de revisão</h3>
                          <p>{s.expected_reason}</p>
                          {missed.length > 0 && (
                            <p className="false_positive">
                              Não identificados: {missed.join(", ")}
                            </p>
                          )}
                          {extra.length > 0 && (
                            <p>Previsões extras: {extra.join(", ")}</p>
                          )}
                        </div>
                        <div>
                          <h3>Explicação do modelo</h3>
                          {answer?.impacts.length ? (
                            answer.impacts.map((i, ix) => (
                              <div key={ix}>
                                <strong>{i.requirement_id}</strong>
                                <p>{i.explanation}</p>
                                <Evidence items={i.source_evidence} />
                              </div>
                            ))
                          ) : (
                            <p>Nenhum requisito apontado como afetado.</p>
                          )}
                        </div>
                      </div>
                      <details>
                        <summary>Verificação da explicação</summary>
                        <Json value={check?.explanation_checks || []} />
                      </details>
                      <ExplanationReview
                        run={run}
                        result={result}
                        scenario={s}
                      />
                    </div>
                  </details>
                );
              })}
          </section>
        )
      )}
      {result?.feedback_metrics && (
        <section className="panel">
          <SectionHeading title="Efeito das correções" />
          <dl className="edge-facts">
            {[
              ["correction_retention_rate", "Correções mantidas"],
              ["repeated_error_rate", "Erros repetidos"],
              ["new_error_rate", "Erros novos"],
              ["performance_improvement", "Variação do F1"],
            ].map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{pct(result.feedback_metrics[key])}</dd>
              </div>
            ))}
          </dl>
          <details>
            <summary>Separar casos conhecidos e casos de transferência</summary>
            <Json value={result.feedback_transfer_metrics} />
          </details>
        </section>
      )}
    </>
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
      <summary>Revisar explicação</summary>
      <form onSubmit={save}>
        <div className="toolbar">
          <label>
            Requisito
            <select
              aria-label="Requisito"
              value={requirement}
              onChange={(e) => setRequirement(e.target.value)}
            >
              {run.snapshot.dataset.ground_truth.requirements.map((r) => (
                <option key={r.id}>{r.id}</option>
              ))}
            </select>
          </label>
          <label>
            Parecer
            <select
              aria-label="Parecer"
              value={verdict}
              onChange={(e) => setVerdict(e.target.value)}
            >
              <option value="Needs review">Precisa de revisão</option>
              <option value="Supported explanation">
                Explicação sustentada
              </option>
              <option value="Unsupported explanation">
                Explicação sem suporte
              </option>
            </select>
          </label>
        </div>
        <label>
          Comentário
          <textarea
            required
            value={comment}
            maxLength={2000}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        <button type="submit">Salvar revisão</button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}

function RunPage({ config, runs, executions, refresh }) {
  const [models, setModels] = useState(
      config.models.flatMap((m, i) => (m.featured ? [i] : [])),
    ),
    [selectedTasks, setSelectedTasks] = useState(config.tasks),
    [repetitions, setRepetitions] = useState(config.defaults.repetitions),
    [mode, setMode] = useState("controlled_text"),
    [experiment, setExperiment] = useState("first_pass"),
    [baseline, setBaseline] = useState(""),
    [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(false),
    [message, setMessage] = useState(""),
    [checkMessage, setCheckMessage] = useState("");
  const toggle = (list, value) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  const active = executions.some((e) =>
    ["pending", "running"].includes(e.status),
  );
  const locked = busy || checking || active;
  const checks = models.map((i) => ({
    ...config.connections[i],
    index: i,
    label: config.models[i].label || config.models[i].model,
  }));
  const pending = checks.filter((c) => !c.ready);
  const calls =
    selectedTasks.reduce(
      (sum, t) => sum + (t === "impact_explanation" ? 2 : 1),
      0,
    ) *
    repetitions *
    models.length;
  async function verify(indices = models, force = false) {
    setChecking(true);
    setCheckMessage("");
    setMessage("");
    try {
      const r = await api("/connections/verify", "POST", {
        models: indices,
        force,
      });
      const failed = r.checks.filter((c) => !c.ready);
      setCheckMessage(
        failed.length
          ? r.blocked
            ? r.message
            : "Verificação concluída com pendências. Veja abaixo como resolver."
          : "Conexões confirmadas. Você já pode iniciar a avaliação.",
      );
      await refresh();
    } catch (e) {
      setCheckMessage(e.message);
    } finally {
      setChecking(false);
    }
  }
  async function start(e) {
    e.preventDefault();
    setMessage("");
    if (pending.length) {
      setMessage(
        "Avaliação bloqueada: resolva as pendências de conexão abaixo. Nenhuma chamada de benchmark foi enviada.",
      );
      await refresh();
      return;
    }
    setBusy(true);
    try {
      await api("/runs", "POST", {
        models,
        tasks: selectedTasks,
        repetitions: Number(repetitions),
        input_mode: mode,
        experiment,
        baseline_run_id: baseline || null,
      });
      await refresh();
    } catch (e) {
      setMessage(e.message);
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  function chooseBaseline(id) {
    setBaseline(id);
    const b = runs.find((r) => r.id === id);
    if (b) {
      setModels(
        config.models.flatMap((m, i) =>
          m.provider === b.provider && m.model === b.model ? [i] : [],
        ),
      );
      setSelectedTasks(b.tasks);
      setMode(b.input_mode);
    }
  }
  return (
    <>
      <form className="panel run-form" onSubmit={start}>
        <SectionHeading title="1. Escolha os modelos" />
        <div className="model-selection-actions">
          <button
            type="button"
            disabled={locked || experiment === "feedback_assisted"}
            onClick={() =>
              setModels(
                config.models.flatMap((m, i) => (m.featured ? [i] : [])),
              )
            }
          >
            Destaques
          </button>
          <button
            type="button"
            disabled={locked || experiment === "feedback_assisted"}
            onClick={() => setModels(config.models.map((_, i) => i))}
          >
            Todos os modelos
          </button>
          <button
            type="button"
            disabled={locked || experiment === "feedback_assisted"}
            onClick={() => setModels([])}
          >
            Limpar seleção
          </button>
          <span className="muted">
            {models.length} selecionado{models.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="model-catalog">
          {Object.entries(providers).map(([provider, name]) => (
            <div className="provider-group" key={provider}>
              <h3>
                <span className={`provider-logo ${provider}`}>{name[0]}</span>
                {name}
              </h3>
              {config.models.map(
                (m, i) =>
                  m.provider === provider && (
                    <label
                      key={i}
                      className={`model-option ${m.featured ? "featured" : ""} ${models.includes(i) ? "selected" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={models.includes(i)}
                        disabled={locked || experiment === "feedback_assisted"}
                        onChange={() => setModels(toggle(models, i))}
                      />
                      <span>
                        <strong>{m.label || m.model}</strong>
                        <small>
                          {m.featured ? "Destaque · raciocínio" : "Alternativa"}
                        </small>
                      </span>
                    </label>
                  ),
              )}
            </div>
          ))}
        </div>
        <p className="setup-note">
          Destaques seguem a proposta dos fabricantes; a comparação real virá
          das suas avaliações.
        </p>
        <section
          className="connection-section"
          aria-label="Checklist de conexões"
        >
          <div className="connection-heading">
            <SectionHeading title="2. Confira as conexões" />
            <button type="button" disabled={locked} onClick={refresh}>
              Atualizar status
            </button>
          </div>
          <p className="muted">
            Preencha as chaves no <code>.env</code>. A mesma chave permite
            escolher os modelos do seu provedor.
          </p>
          <div className="connection-list">
            {checks.map((c) => (
              <div
                key={c.index}
                className={`connection-row ${c.ready ? "connection-ready" : "connection-pending"}`}
              >
                <div className="connection-name">
                  <strong>{c.label}</strong>
                  <span>
                    {c.ready ? "✓ Pronto para avaliar" : c.diagnostic?.title}
                  </span>
                </div>
                <ul className="connection-checks">
                  <li
                    className={c.key_present ? "check-done" : "check-pending"}
                  >
                    {c.key_present ? "✓" : "○"} Chave no .env{" "}
                    <code>{c.env_name}</code>
                  </li>
                  <li
                    className={c.api_responded ? "check-done" : "check-pending"}
                  >
                    {c.api_responded ? "✓" : "○"} API respondeu
                  </li>
                  <li
                    className={
                      c.generation_confirmed ? "check-done" : "check-pending"
                    }
                  >
                    {c.generation_confirmed ? "✓" : "○"} Geração confirmada
                  </li>
                </ul>
                {!c.ready && (
                  <p className="connection-action">{c.diagnostic?.action}</p>
                )}
                {c.diagnostic?.detail && (
                  <details className="connection-detail">
                    <summary>Detalhe da API</summary>
                    <p>{c.diagnostic.detail}</p>
                    {c.diagnostic.http_status && (
                      <small>
                        HTTP {c.diagnostic.http_status} ·{" "}
                        {c.diagnostic.provider_code}
                      </small>
                    )}
                  </details>
                )}
                <div className="connection-tools">
                  {c.checked_at && (
                    <small>Verificado em {date(c.checked_at)}</small>
                  )}
                  {c.key_present && (
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => verify([c.index], true)}
                    >
                      {c.ready ? "Verificar novamente" : "Verificar conexão"}
                      <span className="sr-only"> {c.label}</span>
                    </button>
                  )}
                  {!c.ready &&
                    c.diagnostic?.help_url &&
                    c.status !== "missing_api_key" &&
                    c.status !== "unverified" && (
                      <a
                        href={c.diagnostic.help_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir painel do provedor ↗
                      </a>
                    )}
                </div>
              </div>
            ))}
          </div>
          {!checks.length && (
            <p className="muted">Selecione pelo menos um modelo.</p>
          )}
          <div className="connection-verify">
            <button
              type="button"
              disabled={locked || !models.length}
              onClick={() => verify()}
            >
              {checking
                ? "Verificando conexões…"
                : "Verificar conexões selecionadas"}
            </button>
            <small>
              Envio curto à API, com possível cobrança. A confirmação fica
              salva; iniciar uma avaliação não repete este teste.
            </small>
          </div>
          {checkMessage && (
            <p
              role="status"
              className={`notice ${pending.length ? "warning" : "success"}`}
            >
              {checkMessage}
            </p>
          )}
        </section>
        <SectionHeading title="3. Inicie a avaliação" />
        <div className="run-settings">
          <label>
            Repetições por modelo
            <input
              type="number"
              required
              min="1"
              max="10"
              disabled={locked}
              value={repetitions}
              onChange={(e) => setRepetitions(e.target.value)}
            />
          </label>
          <p>Cada modelo recebe os mesmos documentos e tarefas.</p>
        </div>
        <details className="advanced-settings">
          <summary>Ajustar tarefas e modo de avaliação</summary>
          <div className="task-choices">
            {config.tasks.map((t) => (
              <label className="check" key={t}>
                <input
                  type="checkbox"
                  checked={selectedTasks.includes(t)}
                  onChange={() => setSelectedTasks(toggle(selectedTasks, t))}
                />
                {tasks[t]}
              </label>
            ))}
          </div>
          <div className="toolbar">
            <label>
              Documentos
              <select
                aria-label="Documentos"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="controlled_text">Texto controlado</option>
                <option value="pdf_text" disabled={!config.pdf_ready}>
                  Texto dos PDFs{" "}
                  {config.pdf_ready ? "" : "(arquivos locais necessários)"}
                </option>
              </select>
            </label>
            <label>
              Modo
              <select
                aria-label="Modo"
                value={experiment}
                onChange={(e) => setExperiment(e.target.value)}
              >
                <option value="first_pass">Sem correções prévias</option>
                <option value="feedback_assisted">
                  Com correções confirmadas
                </option>
              </select>
            </label>
            {experiment === "feedback_assisted" && (
              <label>
                Execução de referência
                <select
                  aria-label="Execução de referência"
                  required
                  value={baseline}
                  onChange={(e) => chooseBaseline(e.target.value)}
                >
                  <option value="">Selecione uma execução</option>
                  {runs
                    .filter((r) => r.experiment === "first_pass")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.model} · {date(r.created_at)} · {r.id.slice(0, 6)}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
        </details>

        <div className="run-submit">
          <span>
            <strong>{calls} chamadas de benchmark</strong>
            <small>
              Sujeitas à cobrança dos provedores. Retentativas podem aumentar
              esse total.
            </small>
          </span>
          <button
            className="primary"
            disabled={
              locked ||
              !models.length ||
              !selectedTasks.length ||
              (experiment === "feedback_assisted" && !baseline)
            }
            type="submit"
          >
            {busy
              ? "Iniciando…"
              : active
                ? "Avaliação em andamento"
                : "Iniciar avaliação →"}
          </button>
        </div>
        {!!pending.length && (
          <p className="setup-note">
            Faltam {pending.length} confirmações. Todas as conexões selecionadas
            precisam estar prontas antes de qualquer chamada de benchmark.
          </p>
        )}
        {message && (
          <p role="alert" className="notice error">
            {message}
          </p>
        )}
      </form>
      {!!executions.length && (
        <section className="panel execution-panel">
          <SectionHeading title="Atividade" />
          {executions.slice(0, 12).map((e) => (
            <div className="execution-row" key={e.id}>
              <div>
                <strong>{e.model}</strong>
                <small>
                  {date(e.created_at)} · repetição {e.repetition}
                </small>
              </div>
              <div className="execution-status">
                {["pending", "running"].includes(e.status) ? (
                  <>
                    <span>
                      {e.status === "pending"
                        ? "Aguardando"
                        : `${e.completed_calls} de ${e.total_calls} tarefas concluídas`}
                    </span>
                    <progress value={e.completed_calls} max={e.total_calls} />
                  </>
                ) : e.status === "completed" ? (
                  <span className="correct">✓ Avaliação concluída</span>
                ) : (
                  <>
                    <span className="false_positive">
                      {e.status === "interrupted" ? "Interrompida" : "Falhou"} ·
                      nenhum resultado publicado
                    </span>
                    <strong>
                      {e.failure?.diagnostic?.title ||
                        (e.status === "interrupted"
                          ? "O servidor foi reiniciado."
                          : "Não foi possível concluir a avaliação.")}
                    </strong>
                    <small>{e.failure?.diagnostic?.action}</small>
                    {e.failure?.diagnostic?.detail && (
                      <details>
                        <summary>Detalhe da API</summary>
                        <p>{e.failure.diagnostic.detail}</p>
                      </details>
                    )}
                  </>
                )}
              </div>
              {e.status === "completed" && (
                <a className="text-link" href="#results">
                  Ver resultados →
                </a>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function Documents({ ds, config }) {
  const [tab, setTab] = useState("components");
  const docNames = {
    FAN: "Ventilador",
    SENSOR: "Sensor de temperatura",
    DRIVER: "Chave de alimentação",
    REQUIREMENTS: "Requisitos do projeto",
    PROJECT: "Escopo e verificações",
  };
  return (
    <>
      <div className="segmented document-tabs">
        {[
          ["components", "Componentes"],
          ["requirements", "Requisitos"],
          ["input", "Entrada dos modelos"],
          ["reference", "Referência de avaliação"],
        ].map(([id, text]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={tab === id ? "active" : ""}
          >
            {text}
          </button>
        ))}
      </div>
      {tab === "components" && (
        <>
          <div className="component-cards">
            {ds.sources
              .filter((s) =>
                ["FAN", "SENSOR", "DRIVER"].includes(s.document_id),
              )
              .map((s) => (
                <article className="panel component-card" key={s.document_id}>
                  <p className="eyebrow">{docNames[s.document_id]}</p>
                  <h2>{s.part_number}</h2>
                  <p className="muted">{s.manufacturer}</p>
                  <a
                    className="text-link"
                    href={s.official_datasheet_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Datasheet oficial ↗
                  </a>
                  <details>
                    <summary>Especificações e fonte</summary>
                    <Json
                      value={{
                        parameters: s.parameters,
                        sections: s.sections,
                        date_accessed: s.date_accessed,
                      }}
                    />
                  </details>
                </article>
              ))}
          </div>
          <details className="panel">
            <summary>Fontes dos componentes alternativos</summary>
            {ds.sources
              .filter((s) => s.document_id.startsWith("ALT-"))
              .map((s) => (
                <p key={s.document_id}>
                  {s.manufacturer} · {s.part_number} ·{" "}
                  <a
                    href={s.official_datasheet_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Datasheet oficial ↗
                  </a>
                </p>
              ))}
          </details>
        </>
      )}
      {tab === "requirements" && (
        <section className="panel">
          <SectionHeading title="Requisitos do projeto" />
          <p className="muted">
            Critérios definidos para este benchmark. Não são medições de
            hardware nem especificações dos fabricantes.
          </p>
          {ds.ground_truth.requirements.map((r) => (
            <details key={r.id}>
              <summary>
                <span className="requirement-code">{r.id}</span>
                {nodeLabels[r.id]}
                {r.critical && <span className="critical-tag">Crítico</span>}
              </summary>
              <p>{r.text}</p>
            </details>
          ))}
        </section>
      )}
      {tab === "input" && (
        <section className="panel">
          <SectionHeading title="Documentos enviados aos modelos" />
          <p className="muted">
            O texto técnico permanece igual para todos os provedores.
          </p>
          {Object.entries(ds.documents).map(([id, lines]) => (
            <details key={id}>
              <summary>{docNames[id] || id}</summary>
              {Object.entries(lines).map(([loc, text]) => (
                <blockquote key={loc}>
                  <small>{loc}</small>
                  <p>{text}</p>
                </blockquote>
              ))}
            </details>
          ))}
          <details>
            <summary>Configuração do sistema</summary>
            <Json value={ds.system_config} />
          </details>
        </section>
      )}
      {tab === "reference" && (
        <section className="panel">
          <SectionHeading title="Referência de avaliação" />
          <p>
            Os rótulos de referência ainda precisam de revisão humana
            independente.
          </p>
          <details>
            <summary>Relações esperadas</summary>
            <Json value={ds.ground_truth.relationships} />
          </details>
          <details>
            <summary>Cenários de teste e impactos esperados</summary>
            <p className="muted">
              Alterações propostas para testar raciocínio. Não descrevem
              mudanças executadas ou resultados medidos.
            </p>
            <Json value={ds.ground_truth.change_scenarios} />
          </details>
          <details>
            <summary>Entidades e parâmetros</summary>
            <Json value={ds.ground_truth.entities} />
          </details>
          <details>
            <summary>Versões dos documentos e prompts</summary>
            <Json
              value={{
                manifest: config.manifest,
                prompt_hashes: config.prompt_hashes,
              }}
            />
          </details>
        </section>
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
