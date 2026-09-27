import React, { useEffect, useState } from "react";
import { L, t } from "./i18n";
import { Modal, Tabs } from "./ScreenUI";
import ModelResults from "./ModelResults";
import ScenarioResults from "./ScenarioResults";
import ResumeControl from "./ResumeControl";
import {
  InputView,
  PromptView,
  OutputView,
  TruthView,
  MetricsView,
  InspectionStory,
  TechnicalView,
} from "./InspectionViews";
import {
  issueLabel,
  taskPurpose,
  taskLabel,
  statusLabel,
  stageLabel,
  eventLabel,
  metricLabel,
  percent,
  number,
  stamp,
  elapsed,
  money,
  tone,
} from "./liveLabels";

export function State({ value }) {
  return (
    <span className={`state-pill ${tone(value)}`}>{statusLabel(value)}</span>
  );
}
function Stat({ label, value, detail, bad = false }) {
  return (
    <div
      className={`live-stat ${bad ? "answer-error-stat" : ""}`}
      title={detail}
    >
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}
const answerErrors = (ops) =>
  ops.answer_errors ?? (ops.partial || 0) + (ops.incorrect || 0);
const runStatus = (run) =>
  run.status === "COMPLETED" && answerErrors(run.operations)
    ? "COMPLETED_WITH_ANSWER_ERRORS"
    : run.status;
function Metric({ name, value, onClick }) {
  return (
    <button
      className="quality-stat"
      onClick={onClick}
      title={
        value
          ? `${value.numerator} / ${value.denominator} · n=${value.executions}`
          : L("Dados insuficientes", "Not enough data")
      }
    >
      <span>{metricLabel(name)}</span>
      <strong>{percent(value?.value)}</strong>
      <small>
        {value
          ? `${value.numerator} / ${value.denominator} · n=${value.executions}`
          : L("Dados insuficientes", "Not enough data")}
      </small>
    </button>
  );
}
const activeStates = ["QUEUED", "RUNNING", "STOPPING"];
const groupKey = (c) => `${c.provider}|${c.model}|${c.depth || ""}`;
const taskKey = (c) => `${c.task}|${c.difficulty}`;
function useClock(enabled) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
export function RunHistory({ api, onOpen }) {
  const [items, setItems] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    const refresh = () =>
      api("/live")
        .then((rows) => {
          if (current) {
            setItems(rows);
            setError("");
          }
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <section className="product-panel history-panel">
      <div className="panel-heading">
        <h2>{L("Histórico de avaliações", "Run history")}</h2>
        <a href="#run" className="button primary">
          {L("Nova avaliação", "New evaluation")}
        </a>
      </div>
      {error && <p role="alert">{error}</p>}
      {items?.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  L("Avaliação", "Run"),
                  L("Modelos", "Models"),
                  L("Estado", "Status"),
                  L("Planejadas", "Planned"),
                  L("Avaliadas", "Evaluated"),
                  L("Erros na resposta", "Answer errors"),
                  L("Erros técnicos", "Technical errors"),
                  L("Interrompidas", "Interrupted"),
                  L("Início / duração", "Start / duration"),
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => onOpen(r.id)}
                    >
                      {r.id.slice(0, 8)}
                    </button>
                  </td>
                  <td>{r.models.map((m) => m.model).join(" · ")}</td>
                  <td>
                    <State value={runStatus(r)} />
                  </td>
                  <td>{r.operations.planned}</td>
                  <td>
                    {r.operations.evaluated}
                    <small>n={r.operations.evaluated}</small>
                  </td>
                  <td
                    className={answerErrors(r.operations) ? "answer-bad" : ""}
                  >
                    {answerErrors(r.operations)}
                  </td>
                  <td>{r.operations.technical_errors}</td>
                  <td>{r.operations.interrupted}</td>
                  <td>
                    {stamp(r.started_at)}
                    <small>
                      {r.finished_at
                        ? elapsed(r.started_at, r.finished_at)
                        : activeStates.includes(r.status)
                          ? L("Em andamento", "In progress")
                          : L("Fim não registrado", "End not recorded")}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        items && <EmptyLive />
      )}
    </section>
  );
}
function EmptyLive() {
  return (
    <div className="product-empty">
      <h2>
        {L(
          "Nenhuma avaliação em andamento",
          "No benchmark is currently running",
        )}
      </h2>
      <p>
        {L(
          "Inicie uma avaliação para acompanhar as respostas reais.",
          "Start an evaluation to monitor real responses.",
        )}
      </p>
      <a className="button primary" href="#run">
        {L("Nova avaliação", "New evaluation")}
      </a>
    </div>
  );
}
export default function LiveExecution({ api, renderGraph }) {
  const [run, setRun] = useState(null),
    [id, setId] = useState(location.hash.split("/")[1] || ""),
    [events, setEvents] = useState([]),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(false),
    [stop, setStop] = useState(false),
    [stopping, setStopping] = useState(false),
    [browser, setBrowser] = useState(null),
    [metric, setMetric] = useState(null),
    [matrixView, setMatrixView] = useState("task"),
    [selectedTask, setSelectedTask] = useState(
      "relationship_extraction|L1_DIRECT",
    ),
    [eventFilters, setEventFilters] = useState({
      model: "",
      provider: "",
      task: "",
      scenario: "",
      status: "",
      errors: false,
    });
  const now = useClock(!!run && activeStates.includes(run.status));
  useEffect(() => {
    const nav = () => setId(location.hash.split("/")[1] || "");
    window.addEventListener("hashchange", nav);
    return () => window.removeEventListener("hashchange", nav);
  }, []);
  useEffect(() => {
    if (id) return;
    api("/live")
      .then((items) => {
        if (items.length) {
          const latest =
            items.find((r) => activeStates.includes(r.status)) || items[0];
          location.hash = `live/${latest.id}`;
        }
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    if (!id) return;
    let mounted = true;
    setRun(null);
    setEvents([]);
    setError("");
    let eventVersion = -1;
    const loadEvents = (v) => {
      if (v <= eventVersion) return;
      eventVersion = v;
      api(`/live/${id}/events`)
        .then((e) => mounted && v === eventVersion && setEvents(e))
        .catch((e) => mounted && setError(e.message));
    };
    api(`/live/${id}`)
      .then((data) => {
        if (mounted) {
          setRun((old) =>
            old?.id === data.id && old.last_event_id > data.last_event_id
              ? old
              : data,
          );
          loadEvents(data.last_event_id);
        }
      })
      .catch((e) => mounted && setError(e.message));
    const stream = new EventSource(`/api/live/${id}/stream`);
    stream.addEventListener("snapshot", (e) => {
      if (!mounted) return;
      const data = JSON.parse(e.data);
      setRun((old) =>
        old?.id === data.id && old.last_event_id > data.last_event_id
          ? old
          : data,
      );
      setConnected(true);
      loadEvents(data.last_event_id);
      if (!activeStates.includes(data.status)) {
        stream.close();
        setConnected(false);
      }
    });
    stream.onerror = () => mounted && setConnected(false);
    return () => {
      mounted = false;
      stream.close();
    };
  }, [id]);
  function inspect(cid, scenario = "") {
    const call = run.calls.find((c) => c.id === cid);
    if (call) {
      setMetric(null);
      setBrowser({
        key: groupKey(call),
        task: taskKey(call),
        rep: call.repetition,
        scenario,
      });
    }
  }
  if (!id)
    return (
      <div className="product-stack">
        <EmptyLive />
        {error && <p role="alert">{error}</p>}
        <RunHistory
          api={api}
          onOpen={(rid) => (location.hash = `live/${rid}`)}
        />
      </div>
    );
  if (!run)
    return (
      <p role={error ? "alert" : undefined}>
        {error || L("Carregando avaliação…", "Loading run…")}
      </p>
    );
  const ops = run.operations,
    repetitionCounts = run.models.map((m) => m.repetitions.length),
    current = run.calls.filter((c) => c.status === "RUNNING"),
    choices = [...new Set(run.calls.map(taskKey))],
    selected = choices.includes(selectedTask) ? selectedTask : choices[0];
  const completed = run.calls
    .filter((c) => c.has_result)
    .sort((a, b) => (b.finished_at || "").localeCompare(a.finished_at || ""));
  const selectedQuality = (m) => m.quality.find((q) => taskKey(q) === selected);
  const primary = selected?.startsWith("entity")
    ? ["entity_precision", "entity_recall", "entity_f1"]
    : selected?.startsWith("relationship")
      ? ["relationship_precision", "relationship_recall", "relationship_f1"]
      : ["impact_precision", "impact_recall", "critical_impact_miss_rate"];
  const allCallsById = Object.fromEntries(run.calls.map((c) => [c.id, c]));
  const filteredEvents = events.filter((e) => {
    const c = allCallsById[e.call_id];
    return (
      (!eventFilters.model || (c && groupKey(c) === eventFilters.model)) &&
      (!eventFilters.provider || c?.provider === eventFilters.provider) &&
      (!eventFilters.task || c?.task === eventFilters.task) &&
      (!eventFilters.scenario ||
        c?.scenario_ids.includes(eventFilters.scenario)) &&
      (!eventFilters.status || e.type === eventFilters.status) &&
      (!eventFilters.errors || e.type.includes("FAILED") || e.data.error)
    );
  });
  return (
    <div className="product-stack live-page">
      <section className="product-panel run-overview">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">
              {L("AVALIAÇÃO", "BENCHMARK RUN")} · {run.id.slice(0, 8)}
            </span>
            <h2>
              <State value={runStatus(run)} />
            </h2>
          </div>
          <div className="inline-actions">
            <a href="#history" className="button">
              {L("Histórico", "History")}
            </a>
            {activeStates.includes(run.status) ? (
              <button
                className="danger-button"
                disabled={run.stop_requested}
                onClick={() => setStop(true)}
              >
                {run.stop_requested
                  ? L("Encerrando…", "Stopping…")
                  : L("Interromper avaliação", "Stop benchmark")}
              </button>
            ) : (
              <a className="button primary" href="#results">
                {L("Ver resultados", "View results")}
              </a>
            )}
          </div>
        </div>
        {run.resumed_from && (
          <a className="continuation-link" href={`#live/${run.resumed_from}`}>
            {L(
              "Continuação · abrir histórico original",
              "Continuation · open original history",
            )}{" "}
            →
          </a>
        )}
        {!activeStates.includes(run.status) && (
          <ResumeControl key={run.id} api={api} run={run} />
        )}
        <div className="run-context">
          <span>
            {run.models.length} {L("modelos", "models")}
          </span>
          <span>{run.levels.map((l) => l.split("_")[0]).join(" + ")}</span>
          <span>{run.tasks.map(taskLabel).join(" · ")}</span>
          <span>
            {run.scenario_ids.length} {L("cenários", "scenarios")}
          </span>
          <span>
            {Math.min(...repetitionCounts) === Math.max(...repetitionCounts)
              ? Math.max(...repetitionCounts)
              : `${Math.min(...repetitionCounts)}–${Math.max(...repetitionCounts)}`}{" "}
            {L("repetições / modelo", "repetitions / model")}
          </span>
        </div>
        <div className="progress-heading">
          <strong>{percent(ops.progress)}</strong>
          <span>
            {ops.processed} / {ops.planned}{" "}
            {L("execuções processadas", "executions processed")}
          </span>
          <span>
            {activeStates.includes(run.status)
              ? elapsed(run.started_at, now)
              : run.finished_at
                ? elapsed(run.started_at, run.finished_at)
                : L("Duração final desconhecida", "Final duration unknown")}
          </span>
        </div>
        <progress
          value={ops.processed}
          max={ops.planned || 1}
          aria-label={L("Progresso real", "Actual progress")}
        />
        <div className="ops-strip">
          <Stat label={L("Avaliadas", "Evaluated")} value={ops.evaluated} />
          <Stat
            label={L("Respostas com erros", "Answers with errors")}
            value={answerErrors(ops)}
            bad={answerErrors(ops) > 0}
          />

          <Stat
            label={L("Erros técnicos", "Technical errors")}
            value={ops.technical_errors}
            bad={ops.technical_errors > 0}
          />
          <Stat
            label={L("Interrompidas", "Interrupted")}
            value={ops.interrupted}
          />
          <Stat label={L("Restantes", "Remaining")} value={ops.remaining} />
          <Stat
            label={L("Respostas de API", "API responses")}
            value={ops.api_responses}
          />
          <Stat
            label={L("Custo acumulado", "Accumulated cost")}
            value={money(ops.cost_usd)}
          />
        </div>
        <details className="quiet-details">
          <summary>
            {L("Como contar o progresso", "How progress is counted")}
          </summary>
          <p>
            {L(
              "Progresso = (respostas avaliadas + erros técnicos) / chamadas planejadas. Interrompidas aparecem separadamente e não viram respostas. Cada tarefa/nível envia uma chamada contendo seus cenários; retentativas são contadas em chamadas de API.",
              "Progress = (evaluated responses + technical errors) / planned calls. Interrupted work is counted separately and never becomes a result. Each task/level sends one request containing its scenarios; API-call counts include retries.",
            )}
          </p>
          <p>
            {L("Criada", "Created")}: {stamp(run.created_at)} ·{" "}
            {L("Iniciada", "Started")}: {stamp(run.started_at)} · ID: {run.id}
          </p>
          <p>
            {L("Tokens informados", "Reported tokens")}:{" "}
            {number(ops.input_tokens.reported)} in /{" "}
            {number(ops.output_tokens.reported)} out · {ops.api_calls}{" "}
            {L("tentativas de API encerradas", "finished API attempts")}
          </p>
        </details>
        {run.recovery && (
          <details className="quiet-details recovery-note">
            <summary>
              {L(
                "Interrupção anterior · histórico preservado",
                "Previous interruption · history preserved",
              )}
            </summary>
            <p>
              {L(
                "O processo anterior terminou sem registrar a conclusão. O histórico original foi mantido; as tarefas sem resultado salvo foram marcadas como interrompidas. O uso da solicitação que estava em andamento é desconhecido.",
                "The previous process ended without recording completion. Original history is preserved; tasks without saved results are marked interrupted. Usage of the in-flight request is unknown.",
              )}
            </p>
          </details>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
      </section>
      <div className="section-title">
        <h2>{L("Modelos nesta avaliação", "Models in this run")}</h2>
        <label>
          {L("Qualidade por tarefa / nível", "Quality by task / level")}
          <select
            aria-label={L(
              "Qualidade por tarefa / nível",
              "Quality by task / level",
            )}
            value={selected}
            onChange={(e) => setSelectedTask(e.target.value)}
          >
            {choices.map((k) => (
              <option value={k} key={k}>
                {taskLabel(k.split("|")[0])} · {k.split("|")[1].split("_")[0]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="live-model-grid">
        {run.models.map((m) => {
          const o = m.operations,
            active = current.find((c) => groupKey(c) === groupKey(m)),
            quality = selectedQuality(m),
            repsDone = m.repetitions.filter(
              (r) => r.evaluated === r.planned,
            ).length;
          return (
            <article
              className="product-panel model-lane"
              key={groupKey(m)}
              data-testid="model-lane"
            >
              <header>
                <span className="provider-wordmark">
                  {m.provider === "gemini"
                    ? "Google Gemini"
                    : m.provider === "anthropic"
                      ? "Anthropic"
                      : "OpenAI"}
                </span>
                <State value={m.status} />
              </header>
              <h3>
                <button
                  className="model-title-button"
                  onClick={() =>
                    setBrowser({ key: groupKey(m), task: selected })
                  }
                >
                  {m.model} <span aria-hidden="true">↗</span>
                </button>
              </h3>
              <small>
                {m.depth} ·{" "}
                {L(
                  "Conexão confirmada antes do início",
                  "Connection confirmed before start",
                )}
              </small>
              <div className="lane-current">
                <span className="status-dot" data-active={!!active} />
                <div>
                  <strong>
                    {active ? stageLabel(active.stage) : statusLabel(m.status)}
                  </strong>
                  <small>
                    {active
                      ? `${taskLabel(active.task)} · ${active.difficulty.split("_")[0]} · ${L("Rep.", "Rep.")} ${active.repetition}`
                      : m.last_error ||
                        L(
                          "Nenhuma solicitação em andamento",
                          "No request in progress",
                        )}
                  </small>
                  {active && (
                    <small>
                      {active.scenario_ids.length
                        ? `${active.scenario_ids.join(", ")} (${L("mesma chamada", "same request")})`
                        : L("Documentos do sistema", "System documents")}
                    </small>
                  )}
                </div>
              </div>
              <div className="rep-heading">
                <span>
                  {L("Repetições avaliadas", "Evaluated repetitions")}
                </span>
                <strong>
                  {repsDone} / {m.repetitions.length}
                </strong>
              </div>
              <div className="repetition-dots">
                {m.repetitions.map((r) => (
                  <button
                    key={r.repetition}
                    onClick={() =>
                      setBrowser({
                        key: groupKey(m),
                        rep: r.repetition,
                        task: selected,
                      })
                    }
                    title={`${r.evaluated}/${r.planned} ${L("avaliadas", "evaluated")}`}
                    className={
                      r.running
                        ? "running"
                        : r.interrupted
                          ? "interrupted"
                          : r.technical_errors || r.partial || r.incorrect
                            ? "error"
                            : !r.remaining
                              ? "complete"
                              : ""
                    }
                  >
                    {r.running
                      ? "◉"
                      : r.interrupted
                        ? "■"
                        : r.technical_errors || r.partial || r.incorrect
                          ? "!"
                          : !r.remaining
                            ? "✓"
                            : "○"}{" "}
                    {L("Rep.", "Rep.")} {r.repetition}
                    <small>
                      {r.evaluated}/{r.planned}
                    </small>
                  </button>
                ))}
              </div>
              {answerErrors(o) > 0 && (
                <button
                  className="model-answer-errors"
                  onClick={() => {
                    const first = run.calls.find(
                      (c) =>
                        groupKey(c) === groupKey(m) &&
                        c.status === "COMPLETED_INCORRECT",
                    );
                    if (first) inspect(first.id);
                  }}
                >
                  <strong>
                    ! {answerErrors(o)}{" "}
                    {L("respostas com erros", "answers with errors")}
                  </strong>
                  <span>
                    {L(
                      "Inclui respostas parcialmente corretas · ver motivos",
                      "Includes partially correct answers · inspect reasons",
                    )}{" "}
                    →
                  </span>
                </button>
              )}
              <div className="lane-counts">
                <Stat label={L("Corretas", "Correct")} value={o.correct} />
                <Stat
                  label={L("Parciais · com erros", "Partial · with errors")}
                  value={o.partial}
                  bad={o.partial > 0}
                />
                <Stat
                  label={L("Incorretas", "Incorrect")}
                  value={o.incorrect}
                  bad={o.incorrect > 0}
                />
                <Stat
                  label={L("Erros técnicos", "Technical errors")}
                  value={o.technical_errors}
                  bad={o.technical_errors > 0}
                />
                <Stat
                  label={L("Interrompidas", "Interrupted")}
                  value={o.interrupted}
                />
                <Stat label={L("Restantes", "Remaining")} value={o.remaining} />
              </div>
              <div className="lane-quality">
                {primary.map((name) => (
                  <Metric
                    key={name}
                    name={name}
                    value={quality?.metrics[name]}
                    onClick={() =>
                      quality?.metrics[name] &&
                      setMetric({ name, ...quality.metrics[name] })
                    }
                  />
                ))}
              </div>
              <footer>
                <span>
                  {L("Latência média", "Average latency")}:{" "}
                  {number(o.average_latency)} s
                </span>
                <span>
                  {number(o.input_tokens.reported)} in ·{" "}
                  {number(o.output_tokens.reported)} out
                </span>
                <span>{money(o.cost_usd)}</span>
              </footer>
              {(() => {
                const latest = completed.find(
                  (c) => groupKey(c) === groupKey(m),
                );
                return latest ? (
                  <button
                    className="latest-model-result"
                    onClick={() => inspect(latest.id)}
                  >
                    <small>
                      {L("Última resposta", "Latest response")} ·{" "}
                      {taskLabel(latest.task)} · Rep. {latest.repetition}
                    </small>
                    <State value={latest.status} />
                    {Object.entries(latest.failure_counts || {}).map(
                      ([k, n]) => (
                        <small className="answer-bad" key={k}>
                          {n} × {issueLabel(k)}
                        </small>
                      ),
                    )}
                  </button>
                ) : (
                  <p className="muted">
                    {L(
                      "Nenhuma resposta avaliada ainda.",
                      "No evaluated response yet.",
                    )}
                  </p>
                );
              })()}
              <details className="quiet-details">
                <summary>{L("Uso por tarefa", "Usage by task")}</summary>
                {m.usage_by_task?.map((u) => (
                  <p key={u.task + u.difficulty}>
                    {taskLabel(u.task)} · {u.difficulty.split("_")[0]}
                    <br />
                    {number(u.input_tokens.reported)} in /{" "}
                    {number(u.output_tokens.reported)} out · {money(u.cost_usd)}
                  </p>
                ))}
              </details>
              <button
                className="text-button"
                onClick={() => setBrowser({ key: groupKey(m), task: selected })}
              >
                {o.evaluated} / {o.planned}{" "}
                {L(
                  "avaliadas · ver execuções",
                  "evaluated · inspect executions",
                )}{" "}
                →
              </button>
            </article>
          );
        })}
      </div>
      <section className="product-panel">
        <div className="panel-heading">
          <h2>{L("Em execução agora", "Currently running")}</h2>
          {activeStates.includes(run.status) && (
            <span className="connection-caption">
              {connected
                ? L("● Atualizações conectadas", "● Updates connected")
                : L("Reconectando…", "Reconnecting…")}
            </span>
          )}
        </div>
        {current.length ? (
          current.map((c) => (
            <div key={c.id}>
              <button
                className="active-execution"
                key={c.id}
                onClick={() => inspect(c.id)}
              >
                <strong>{c.model}</strong>
                <span>
                  {taskLabel(c.task)} · {c.difficulty.split("_")[0]} · Rep.{" "}
                  {c.repetition}
                </span>
                <span>
                  {c.scenario_ids.length
                    ? c.scenario_ids.join(", ")
                    : L("Sistema completo", "Whole system")}
                </span>
                <span>{stageLabel(c.stage)}</span>
                <b>{elapsed(c.request_started_at || c.started_at, now)}</b>
              </button>
              <ol
                className="observable-pipeline"
                aria-label={L("Etapas observadas", "Observed stages")}
              >
                {[
                  ["INPUT_PREPARED", L("Entrada", "Input")],
                  ["REQUEST_PREPARED", L("Solicitação", "Request")],
                  ["API_REQUEST_SENT", L("Envio", "Sent")],
                  ["API_RESPONSE_RECEIVED", L("Recebimento", "Received")],
                  ["OUTPUT_PARSED", L("Validação", "Validated")],
                  ["EVALUATION_COMPLETED", L("Avaliação", "Evaluated")],
                  ["EXECUTION_COMPLETED", L("Gravação", "Saved")],
                ].map(([kind, label], i) => {
                  const observed = events.some(
                    (e) => e.call_id === c.id && e.type === kind,
                  );
                  return (
                    <li key={kind} data-observed={observed}>
                      <span>{observed ? "✓" : i + 1}</span>
                      {label}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))
        ) : (
          <p className="muted">
            {L(
              "Nenhuma solicitação em andamento.",
              "No request currently in progress.",
            )}
          </p>
        )}
        {run.stop_requested && current.length > 0 && (
          <p className="inline-note">
            {L(
              "A solicitação em andamento pode terminar. Sua resposta será preservada; as próximas não serão iniciadas.",
              "The in-flight request may finish. Its response will be preserved; no further requests will start.",
            )}
          </p>
        )}
      </section>
      {run.calls.some((c) => c.error) && (
        <section className="product-panel runtime-errors">
          <h2>{L("Erros de execução", "Execution errors")}</h2>
          {run.calls
            .filter((c) => c.error)
            .map((c) => (
              <button
                className="runtime-error-row"
                key={c.id}
                onClick={() => inspect(c.id)}
              >
                <strong>{c.model}</strong>
                <span>
                  {taskLabel(c.task)} · Rep. {c.repetition} ·{" "}
                  {c.scenario_ids.join(", ")}
                </span>
                <b>{t(c.diagnostic?.title) || c.error}</b>
                <small>
                  {L(
                    "Ver causa, etapa e ação recomendada",
                    "See cause, stage and recommended action",
                  )}{" "}
                  →
                </small>
              </button>
            ))}
        </section>
      )}
      <section className="product-panel">
        <div className="panel-heading">
          <h2>{L("Qualidade acumulada", "Cumulative quality")}</h2>
          <small>
            {L(
              "Somente respostas avaliadas · níveis separados",
              "Evaluated responses only · levels kept separate",
            )}
          </small>
        </div>
        <div className="table-scroll">
          <table className="live-comparison">
            <thead>
              <tr>
                <th>{L("Modelo", "Model")}</th>
                <th>n</th>
                {[
                  ...new Set(
                    run.models.flatMap((m) =>
                      Object.keys(selectedQuality(m)?.metrics || {}),
                    ),
                  ),
                ].map((k) => (
                  <th key={k}>{metricLabel(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {run.models.map((m) => (
                <tr key={groupKey(m)}>
                  <th>{m.model}</th>
                  <td>
                    {selectedQuality(m)?.metrics[primary[0]]?.executions || 0}
                  </td>
                  {[
                    ...new Set(
                      run.models.flatMap((m) =>
                        Object.keys(selectedQuality(m)?.metrics || {}),
                      ),
                    ),
                  ].map((k) => (
                    <td key={k}>
                      <button
                        className="text-button"
                        onClick={() =>
                          selectedQuality(m)?.metrics[k] &&
                          setMetric({
                            name: k,
                            ...selectedQuality(m).metrics[k],
                          })
                        }
                      >
                        {percent(selectedQuality(m)?.metrics[k]?.value)}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MetricEvolution
          models={run.models}
          selected={selected}
          metric={primary[1]}
        />
        <details className="quiet-details">
          <summary>
            {L(
              "Confiabilidade operacional, tokens e custos",
              "Operational reliability, tokens and costs",
            )}
          </summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    L("Modelo", "Model"),
                    L("Iniciadas", "Started"),
                    L("Conclusão", "Completion"),
                    L("Falha técnica", "Technical failure"),
                    L("Mediana", "Median"),
                    L("JSON / estrutura válidos", "Valid JSON / schema"),
                    L("Tokens informados", "Reported tokens"),
                    L("Custo", "Cost"),
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {run.models.map((m) => (
                  <tr key={groupKey(m)}>
                    <th>{m.model}</th>
                    <td>
                      {m.operations.started}/{m.operations.planned}
                    </td>
                    <td>
                      {percent(m.operations.completion_rate)}
                      <small>
                        {m.operations.evaluated}/{m.operations.planned}
                      </small>
                    </td>
                    <td>
                      {percent(m.operations.technical_failure_rate)}
                      <small>
                        {m.operations.technical_errors}/{m.operations.started}
                      </small>
                    </td>
                    <td>{number(m.operations.median_latency)} s</td>
                    <td>
                      {m.operations.schema.numerator}/
                      {m.operations.schema.denominator}
                    </td>
                    <td>
                      {number(m.operations.input_tokens.reported)} in /{" "}
                      {number(m.operations.output_tokens.reported)} out
                      <small>
                        {m.operations.input_tokens.reporting_calls}/
                        {m.operations.input_tokens.total_calls}{" "}
                        {L(
                          "chamadas com uso informado",
                          "calls reported usage",
                        )}
                      </small>
                    </td>
                    <td>{money(m.operations.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="product-panel">
        <div className="panel-heading">
          <h2>{L("Matriz de execuções", "Execution matrix")}</h2>
          <label>
            {L("Linhas", "Rows")}
            <select
              aria-label={L("Linhas", "Rows")}
              value={matrixView}
              onChange={(e) => setMatrixView(e.target.value)}
            >
              <option value="task">{L("Tarefas", "Tasks")}</option>
              <option value="scenario">
                {L("Cenários + tarefas", "Scenarios + tasks")}
              </option>
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table className="execution-matrix">
            <thead>
              <tr>
                <th>{L("Cenário / tarefa", "Scenario / task")}</th>
                {run.models.map((m) => (
                  <th key={groupKey(m)}>{m.model}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {choices.flatMap((k) => {
                const calls = run.calls.filter((c) => taskKey(c) === k),
                  scenarios =
                    matrixView === "scenario" && calls[0]?.scenario_ids.length
                      ? calls[0].scenario_ids
                      : [""];
                return scenarios.map((sid) => (
                  <tr key={k + sid}>
                    <th>
                      {sid || L("Sistema", "System")}
                      <small>
                        {taskLabel(k.split("|")[0])} ·{" "}
                        {k.split("|")[1].split("_")[0]}
                        {sid
                          ? L(" · chamada em lote", " · batched request")
                          : ""}
                      </small>
                    </th>
                    {run.models.map((m) => {
                      const cell = calls.filter(
                          (c) => groupKey(c) === groupKey(m),
                        ),
                        done = cell.filter((c) => c.has_result).length,
                        err = cell.filter(
                          (c) => c.status === "TECHNICAL_ERROR",
                        ).length,
                        int = cell.filter(
                          (c) => c.status === "INTERRUPTED",
                        ).length,
                        wrong = cell.filter((c) =>
                          sid
                            ? c.scenario_outcomes?.[sid]?.correct === false
                            : c.status === "COMPLETED_INCORRECT",
                        ).length;
                      return (
                        <td key={groupKey(m)}>
                          <button
                            className={`matrix-cell ${wrong || err ? "has-errors" : ""}`}
                            onClick={() =>
                              cell[0] && inspect(cell[0].id, sid || "")
                            }
                          >
                            <strong>
                              {done} / {cell.length}
                            </strong>
                            <span>
                              {cell.some((c) => c.status === "RUNNING")
                                ? `◉ ${L("Em execução", "Running")} `
                                : ""}
                              {err
                                ? `${err} ${L("erro técnico", "technical error")} `
                                : ""}
                              {int
                                ? `${int} ${L("interrompida", "interrupted")} `
                                : ""}
                              {wrong
                                ? `${wrong} ${L("com erros na resposta", "with answer errors")}`
                                : ""}
                              {!done &&
                              !err &&
                              !int &&
                              !cell.some((c) => c.status === "RUNNING")
                                ? L("Na fila", "Queued")
                                : ""}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </section>
      <details className="product-panel event-panel">
        <summary>
          {L("Registro de eventos", "Event log")} · {events.length}
        </summary>
        <div className="filter-row">
          {[
            [
              "model",
              L("Modelo", "Model"),
              run.models.map((m) => [groupKey(m), m.model]),
            ],
            [
              "provider",
              L("Provedor", "Provider"),
              [...new Set(run.models.map((m) => m.provider))].map((p) => [
                p,
                p,
              ]),
            ],
            [
              "task",
              L("Tarefa", "Task"),
              run.tasks.map((t) => [t, taskLabel(t)]),
            ],
            [
              "scenario",
              L("Cenário", "Scenario"),
              run.scenario_ids.map((s) => [s, s]),
            ],
            [
              "status",
              L("Evento", "Event"),
              [...new Set(events.map((e) => e.type))].map((t) => [
                t,
                eventLabel(t),
              ]),
            ],
          ].map(([key, label, options]) => (
            <label key={key}>
              {label}
              <select
                value={eventFilters[key]}
                onChange={(e) =>
                  setEventFilters({ ...eventFilters, [key]: e.target.value })
                }
              >
                <option value="">{L("Todos", "All")}</option>
                {options.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="check">
            <input
              type="checkbox"
              checked={eventFilters.errors}
              onChange={(e) =>
                setEventFilters({ ...eventFilters, errors: e.target.checked })
              }
            />
            {L("Só erros", "Errors only")}
          </label>
        </div>
        {!events.length && (
          <p className="muted">
            {run.legacy
              ? L(
                  "Esta avaliação é anterior ao registro de eventos. Nenhum evento histórico foi reconstruído.",
                  "This run predates the event journal. No historical events have been reconstructed.",
                )
              : L(
                  "Carregando eventos registrados…",
                  "Loading recorded events…",
                )}
          </p>
        )}
        <ol className="event-list">
          {filteredEvents.map((e) => {
            const c = allCallsById[e.call_id];
            return (
              <li key={e.id}>
                <time>{stamp(e.created_at)}</time>
                <div>
                  <strong>{eventLabel(e.type)}</strong>
                  {c && (
                    <small>
                      {c.provider} · {c.model} · {taskLabel(c.task)} · Rep.{" "}
                      {c.repetition} · {c.scenario_ids.join(", ")}
                    </small>
                  )}
                  {e.data.error && (
                    <button
                      className="text-button"
                      onClick={() => inspect(c.id)}
                    >
                      {e.data.error} · {L("Ver diagnóstico", "View diagnostic")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </details>
      {stop && (
        <Modal
          title={L("Interromper avaliação?", "Stop benchmark?")}
          onClose={() => !stopping && setStop(false)}
        >
          <p>
            {L(
              "Resultados, respostas de API e avaliações concluídos serão preservados. Testes na fila não serão iniciados. Uma solicitação em andamento poderá terminar e sua resposta será salva.",
              "Completed results, API responses and evaluations will be preserved. Queued tests will not start. An in-flight request may finish and its response will be saved.",
            )}
          </p>
          <div className="inline-actions">
            <button onClick={() => setStop(false)} disabled={stopping}>
              {L("Continuar avaliação", "Keep running")}
            </button>
            <button
              className="danger-button"
              disabled={stopping}
              onClick={async () => {
                setStopping(true);
                try {
                  const stopped = await api(`/live/${id}/stop`, "POST", {
                    confirmed: true,
                  });
                  setRun((old) =>
                    old?.last_event_id > stopped.last_event_id ? old : stopped,
                  );
                  setStop(false);
                } catch (e) {
                  setError(e.message);
                } finally {
                  setStopping(false);
                }
              }}
            >
              {L("Confirmar interrupção", "Confirm stop")}
            </button>
          </div>
        </Modal>
      )}
      {metric && (
        <Modal title={metricLabel(metric.name)} onClose={() => setMetric(null)}>
          <div className="metric-proof">
            <strong>{percent(metric.value)}</strong>
            <p>
              {metric.numerator} / {metric.denominator}
            </p>
            <code>{metric.formula}</code>
            <p>
              {metric.executions}{" "}
              {L(
                "respostas avaliadas. Erros técnicos e interrupções são excluídos.",
                "evaluated responses. Technical errors and interruptions are excluded.",
              )}
            </p>
          </div>
          <div className="proof-links">
            {metric.execution_ids.map((cid) => (
              <button key={cid} onClick={() => inspect(cid)}>
                {cid.slice(0, 8)} →
              </button>
            ))}
          </div>
        </Modal>
      )}
      {browser && (
        <ModelResults
          key={JSON.stringify(browser)}
          calls={run.calls.filter((c) => groupKey(c) === browser.key)}
          selection={browser}
          api={api}
          onClose={() => setBrowser(null)}
          renderDetail={(detail, scenario, onScenario) => (
            <ExecutionDetail
              key={detail.id}
              detail={detail}
              embedded
              scenario={scenario}
              onScenario={onScenario}
              renderGraph={renderGraph}
            />
          )}
        />
      )}
    </div>
  );
}
function MetricEvolution({ models, selected, metric }) {
  const series = models.map((m) => ({
    name: m.model,
    points:
      m.quality
        .find((q) => taskKey(q) === selected)
        ?.history.filter((p) => p.metrics[metric]?.value != null) || [],
  }));
  const max = Math.max(0, ...series.map((s) => s.points.length));
  if (!max)
    return (
      <p className="muted">
        {L(
          "A evolução aparecerá após a primeira resposta avaliada.",
          "Evolution appears after the first evaluated response.",
        )}
      </p>
    );
  const colors = [
    "#62aaff",
    "#33d4a0",
    "#e5b95f",
    "#ca9bf4",
    "#e5767f",
    "#91c6ff",
  ];
  return (
    <div className="evolution">
      <h3>
        {metricLabel(metric)} ·{" "}
        {L("evolução por resposta avaliada", "evolution by evaluated response")}
      </h3>
      <svg
        viewBox="0 0 760 155"
        role="img"
        aria-label={L("Evolução real das métricas", "Actual metric evolution")}
      >
        <text x="0" y="18">
          100%
        </text>
        <text x="15" y="120">
          0%
        </text>
        <path d="M50 12V120H744" className="chart-axis" />
        {series.map((s, i) => (
          <g key={s.name}>
            <polyline
              fill="none"
              stroke={colors[i % colors.length]}
              strokeWidth="2"
              points={s.points
                .map(
                  (p) =>
                    `${50 + ((p.completed - 1) * 680) / Math.max(max - 1, 1)},${120 - p.metrics[metric].value * 108}`,
                )
                .join(" ")}
            />
            {s.points.map((p) => (
              <circle
                key={p.completed}
                cx={50 + ((p.completed - 1) * 680) / Math.max(max - 1, 1)}
                cy={120 - p.metrics[metric].value * 108}
                r="4"
                fill={colors[i % colors.length]}
              >
                <title>
                  {s.name} · n={p.completed} ·{" "}
                  {percent(p.metrics[metric].value)}
                </title>
              </circle>
            ))}
          </g>
        ))}
        <text x="50" y="145">
          1
        </text>
        {max > 1 && (
          <text x="730" y="145">
            {max}
          </text>
        )}
      </svg>
      <div className="chart-legend">
        {series.map((s, i) => (
          <span key={s.name}>
            <i style={{ background: colors[i % colors.length] }} />
            {s.name} · n={s.points.length}
          </span>
        ))}
      </div>
    </div>
  );
}
export function ExecutionDetail({
  detail: d,
  onClose,
  renderGraph,
  embedded = false,
  scenario = "",
  onScenario = () => {},
}) {
  const [tab, setTab] = useState("story");
  const result = d.result;
  const output = result?.parsed_output;
  const Wrapper = embedded ? React.Fragment : Modal;
  return (
    <Wrapper
      {...(embedded
        ? {}
        : {
            title: `${d.model} · ${taskLabel(d.task)} · Rep. ${d.repetition}`,
            onClose,
          })}
    >
      <div className="execution-detail">
        <div className="detail-meta">
          <State value={d.status} />
          {!["COMPLETED_CORRECT", "COMPLETED_INCORRECT"].includes(d.status) && (
            <span>{stageLabel(d.stage)}</span>
          )}
          <span>
            {d.difficulty.split("_")[0]} ·{" "}
            {d.input_mode === "pdf_text"
              ? L("PDFs → texto integral", "PDFs → full text")
              : L(
                  "Texto normalizado · histórico",
                  "Normalized text · historical",
                )}
          </span>
          <span>
            {number(result?.latency_seconds || d.call?.latency_seconds)} s
          </span>
        </div>
        {tab !== "story" && (
          <p className="task-purpose">{taskPurpose(d.task)}</p>
        )}
        {tab !== "story" && Object.keys(d.failure_counts || {}).length > 0 && (
          <aside className="evaluation-errors">
            <strong>
              {L("O que falhou nesta resposta", "What failed in this answer")}
            </strong>
            <ul>
              {Object.entries(d.failure_counts).map(([k, n]) => (
                <li key={k}>
                  {n} × {issueLabel(k)}
                </li>
              ))}
            </ul>
            {result?.metrics.impact?.recall === 1 && (
              <p>
                {L(
                  "Recall 100%: todos os requisitos afetados foram encontrados. As verificações acima ainda falharam.",
                  "100% recall: all affected requirements were found. The checks above still failed.",
                )}
              </p>
            )}
          </aside>
        )}
        {d.input_policy === "legacy_explicit_context" && (
          <details className="legacy-context">
            <summary>
              {L(
                "Contexto histórico · protocolo anterior",
                "Historical context · previous protocol",
              )}
            </summary>
            <p>
              {L(
                "Este protocolo incluía um inventário de respostas e pistas explícitas em L1. A execução original foi preservada. Novas avaliações usam documentos sem essas pistas; os protocolos não são equivalentes.",
                "This protocol included an answer inventory and explicit hints in L1. The original execution is preserved. New evaluations use documents without those hints; these protocols are not equivalent.",
              )}
            </p>
          </details>
        )}
        {d.error && (
          <div className="notice error">
            <strong>{d.error}</strong>
            <small>
              {L("Etapa", "Stage")}: {stageLabel(d.failed_stage || d.stage)}
            </small>
            <p>
              {t(d.diagnostic?.title) ||
                L(
                  "Esta execução não pôde ser avaliada.",
                  "This execution could not be evaluated.",
                )}
            </p>
            <p>
              {t(d.diagnostic?.action) ||
                d.diagnostic?.next_step ||
                L(
                  "Verifique a conexão e tente uma nova avaliação. Resultados anteriores permanecem disponíveis.",
                  "Check the connection before a new run. Earlier results remain available.",
                )}
            </p>
          </div>
        )}
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            ["story", L("Visão da execução", "Execution overview")],
            ["input", L("Entrada", "Input")],
            ["prompt", L("Prompt", "Prompt")],
            ["output", L("Resposta", "Output")],
            ["comparison", L("Comparação", "Comparison")],
            ["truth", L("Gabarito", "Ground truth")],
            ["metrics", L("Métricas", "Metrics")],
            ["raw", L("Downloads técnicos", "Technical downloads")],
          ]}
        />
        {tab === "story" && <InspectionStory detail={d} onTab={setTab} />}
        {tab === "input" && <InputView detail={d} />}
        {tab === "prompt" && <PromptView detail={d} />}
        {tab === "output" && (
          <OutputView detail={d} scenario={scenario} onScenario={onScenario} />
        )}
        {tab === "truth" && (
          <TruthView detail={d} scenario={scenario} onScenario={onScenario} />
        )}
        {tab === "metrics" && <MetricsView detail={d} />}
        {tab === "raw" && <TechnicalView detail={d} />}
        {tab === "comparison" &&
          (!result ? (
            <p>
              {L(
                "Nenhuma resposta avaliada para comparar.",
                "No evaluated response to compare.",
              )}
            </p>
          ) : d.comparison ? (
            <>
              {renderGraph?.(d)}
              <RelationshipRows comparison={d.comparison} />
            </>
          ) : output?.scenarios ? (
            <ScenarioResults
              detail={d}
              scenario={scenario}
              onScenario={onScenario}
            />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>{L("Valor", "Value")}</th>
                    <th>{L("Unidade", "Unit")}</th>
                    <th>{L("Evidência", "Evidence")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.metrics.fact_details?.map((f) => (
                    <tr key={f.id}>
                      <th>{f.id}</th>
                      <td>{f.value_correct ? "✓" : "×"}</td>
                      <td>{f.unit_correct ? "✓" : "×"}</td>
                      <td>{f.evidence_correct ? "✓" : "×"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        <small className="detail-provenance">
          Run {d.run_id} · {L("Resposta", "Response")} {d.id} · Dataset{" "}
          {d.snapshot_metadata.dataset_hash.slice(0, 12)}
        </small>
      </div>
    </Wrapper>
  );
}
export function RelationshipRows({ comparison }) {
  return (
    <div className="table-scroll">
      <table className="relationship-table">
        <thead>
          <tr>
            {[
              L("Origem", "Source"),
              L("Relação", "Relationship"),
              L("Destino", "Target"),
              L("Avaliação", "Evaluation"),
              L("Evidência", "Evidence"),
            ].map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {comparison.edges.map((e) => (
            <tr
              key={e.key.join("|")}
              className={
                e.status === "correct" ? "answer-row-good" : "answer-row-bad"
              }
            >
              <th>{e.key[0]}</th>
              <td>{e.key[1]}</td>
              <td>{e.key[2]}</td>
              <td>
                {
                  {
                    correct: L(
                      "✓ Correta e sustentada",
                      "✓ Correct and supported",
                    ),
                    correct_bad_evidence: L(
                      "! Evidência inválida",
                      "! Invalid evidence",
                    ),
                    missing: L("− Não identificada", "− Missing"),
                    false_positive: L(
                      "+ Relação incorreta",
                      "+ Incorrect relationship",
                    ),
                  }[e.status]
                }
              </td>
              <td>
                <details>
                  <summary>{L("Ver evidência", "View evidence")}</summary>
                  <p>{e.model_edge?.reason || e.ground_truth_edge?.reason}</p>
                  {(e.model_edge || e.ground_truth_edge)?.source_evidence.map(
                    (s, i) => (
                      <blockquote key={i}>
                        <small>
                          {s.document_id} · {s.location}
                        </small>
                        {s.excerpt}
                      </blockquote>
                    ),
                  )}
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
