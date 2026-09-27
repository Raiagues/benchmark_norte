import React, { useEffect, useState } from "react";
import { L, t, locale } from "./i18n";
import Icon from "./Icon";
import { RunHistory } from "./LiveExecution";
import { Modal, Tabs, PagedItems, DetailButton, PagedText } from "./ScreenUI";
const providers = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
};
const taskNames = {
  entity_extraction: "Extração de dados",
  relationship_extraction: "Relações",
  change_impact: "Impactos",
  impact_explanation: "Explicações",
  one_hop: "Raciocínio de um passo",
};
const depth = (m) => m.thinking_level || m.reasoning_effort;
const date = (v) => new Date(v).toLocaleString(locale());
const depthName = (v) =>
  ({
    none: L("Sem raciocínio", "No reasoning"),
    low: L("Baixa", "Low"),
    medium: L("Média", "Medium"),
    high: L("Alta", "High"),
    xhigh: L("Muito alta", "Extra high"),
    max: L("Máxima", "Maximum"),
  })[v] || v;
function initial(config) {
  try {
    const saved = JSON.parse(localStorage.getItem("norte-model-selection"));
    if (
      saved?.catalog === config.models.map((m) => m.model).join("|") &&
      Array.isArray(saved.models) &&
      saved.models.every((i) => Number.isInteger(i) && config.models[i]) &&
      saved.depths &&
      typeof saved.depths === "object"
    )
      return saved;
  } catch {
    /* Invalid browser preferences do not affect the benchmark. */
  }
  return {
    models: config.models.flatMap((m, i) => (m.featured ? [i] : [])),
    depths: {},
  };
}
function tone(c) {
  return c?.ready
    ? "green"
    : ["billing_error", "spend_limit", "quota_exceeded", "rate_limit"].includes(
          c?.status,
        )
      ? "amber"
      : "red";
}
function statusLabel(c) {
  if (c?.ready) return L("Conectado", "Connected");
  return (
    {
      missing_api_key: L("Sem chave", "Missing key"),
      unverified: L("Não verificado", "Unverified"),
      billing_error: L("Cobrança bloqueada", "Billing blocked"),
      spend_limit: L("Limite de gastos", "Spend limit"),
      quota_exceeded: L("Sem cota", "Quota exhausted"),
      rate_limit: L("Limite temporário", "Rate limited"),
    }[c?.status] || L("Sem conexão", "Not connected")
  );
}
export default function RunPage({
  config,
  ds,
  runs,
  executions,
  refresh,
  api,
}) {
  const [selection, setSelection] = useState(() => initial(config));
  const { models, depths } = selection;
  const [tab, setTab] = useState("models"),
    [selectedTasks, setTasks] = useState(config.tasks),
    [repetitions, setRepetitions] = useState(config.defaults.repetitions),
    [mode] = useState("pdf_text"),
    [experiment, setExperiment] = useState("first_pass"),
    [baseline, setBaseline] = useState(""),
    [checking, setChecking] = useState(false),
    [busy, setBusy] = useState(false),
    [checks, setChecks] = useState([]),
    [detail, setDetail] = useState(null),
    [message, setMessage] = useState("");
  const active = executions.some((e) =>
      ["running", "pending"].includes(e.status),
    ),
    locked = active || checking || busy;
  const requestDepths = Object.fromEntries(
    models
      .map((i) => [String(i), depths[i] || depth(config.models[i])])
      .filter(([, v]) => v),
  );
  const selectionKey = JSON.stringify({ models, depths: requestDepths });
  const configKey = JSON.stringify(config.connections);
  useEffect(
    () =>
      localStorage.setItem(
        "norte-model-selection",
        JSON.stringify({
          ...selection,
          catalog: config.models.map((m) => m.model).join("|"),
        }),
      ),
    [selection],
  );
  useEffect(() => {
    let live = true;
    setChecks([]);
    if (models.length)
      api("/connections/status", "POST", JSON.parse(selectionKey))
        .then((c) => {
          if (live) setChecks(c);
        })
        .catch((e) => {
          if (live) setMessage(e.message);
        });
    return () => {
      live = false;
    };
  }, [selectionKey, configKey]);
  function checkFor(i) {
    const m = config.models[i],
      d = depths[i] || depth(m);
    const custom = checks.find(
      (c) => c.provider === m.provider && c.model === m.model && c.depth === d,
    );
    if (custom) return custom;
    const base = config.connections.find(
      (c) => c.provider === m.provider && c.model === m.model,
    );
    if (d === depth(m)) return base;
    return {
      ...base,
      ready: false,
      generation_confirmed: false,
      api_responded: false,
      checked_at: null,
      status: base?.key_present ? "unverified" : "missing_api_key",
      diagnostic: null,
    };
  }
  const pending = models.filter((i) => !checkFor(i)?.ready);
  const calls =
    selectedTasks.reduce(
      (n, x) => n + (x === "impact_explanation" ? 2 : 1),
      0,
    ) *
    Number(repetitions) *
    models.length;
  function selectProvider(provider, value) {
    const keep = models.filter((i) => config.models[i].provider !== provider);
    const add =
      value === "all"
        ? config.models.flatMap((m, i) => (m.provider === provider ? [i] : []))
        : value === ""
          ? []
          : [Number(value)];
    setSelection({
      ...selection,
      models: [...keep, ...add].sort((a, b) => a - b),
    });
    setMessage("");
  }
  async function verify(indices = models, force = false) {
    setChecking(true);
    setMessage("");
    try {
      const body = {
        models: indices,
        depths: Object.fromEntries(
          indices
            .map((i) => [String(i), depths[i] || depth(config.models[i])])
            .filter(([, v]) => v),
        ),
        force,
      };
      const r = await api("/connections/verify", "POST", body);
      setChecks((old) => [
        ...old.filter(
          (c) =>
            !r.checks.some(
              (x) => x.provider === c.provider && x.model === c.model,
            ),
        ),
        ...r.checks,
      ]);
      if (r.checks.some((c) => !c.ready))
        setMessage(
          L(
            "Conexões pendentes. Clique no status para resolver.",
            "Connections pending. Click a status for details.",
          ),
        );
      else setMessage(L("Conexões confirmadas.", "Connections confirmed."));
      await refresh();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setChecking(false);
    }
  }
  async function start(e) {
    e.preventDefault();
    setMessage("");
    if (!config.pdf_ready) {
      setMessage(
        L(
          "Faltam PDFs originais. Abra Fontes e proveniência e baixe os documentos ausentes.",
          "Original PDFs are missing. Open Sources and provenance to download the missing documents.",
        ),
      );
      return;
    }
    if (pending.length) {
      setMessage(
        L(
          "Há conexões pendentes. Nenhuma chamada foi enviada.",
          "Connections pending. No call was sent.",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      const started = await api("/runs", "POST", {
        models,
        depths: requestDepths,
        tasks: selectedTasks,
        repetitions: Number(repetitions),
        input_mode: mode,
        experiment,
        baseline_run_id: baseline || null,
      });
      window.location.hash = started.batch_id
        ? `live/${started.batch_id}`
        : "live";
      await refresh();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function chooseBaseline(id) {
    setBaseline(id);
    if (!id) return;
    const run = await api(`/runs/${id}`),
      m = run.snapshot.model_config;
    const i = config.models.findIndex(
      (c) => c.provider === m.provider && c.model === m.model,
    );
    if (i >= 0) {
      setSelection({ models: [i], depths: { [i]: depth(m) } });
      setTasks(run.metadata.tasks);
    }
  }
  const details = typeof detail === "number" ? checkFor(detail) : null;
  return (
    <form className="launch-screen" onSubmit={start}>
      <Tabs
        label={L("Configuração da avaliação", "Evaluation setup")}
        value={tab}
        onChange={setTab}
        items={[
          ["models", L("Modelos", "Models")],
          ["settings", L("Tarefas e opções", "Tasks and options")],
          ["inputs", L("Entradas e instruções", "Inputs and instructions")],
          ["activity", L("Atividade", "Activity")],
        ]}
      />
      <div className="launch-content">
        {tab === "models" && (
          <section className="provider-panel">
            <div className="compact-heading">
              <h2>
                {L(
                  "Quais APIs você quer comparar?",
                  "Which APIs do you want to compare?",
                )}
              </h2>
              <div className="small-actions">
                <button
                  type="button"
                  disabled={locked || experiment === "feedback_assisted"}
                  onClick={() =>
                    setSelection({
                      ...selection,
                      models: config.models.flatMap((m, i) =>
                        m.featured ? [i] : [],
                      ),
                    })
                  }
                >
                  {L("Padrões", "Defaults")}
                </button>
                <button
                  type="button"
                  disabled={locked || experiment === "feedback_assisted"}
                  onClick={() =>
                    setSelection({
                      ...selection,
                      models: config.models.map((_, i) => i),
                    })
                  }
                >
                  {L("Todos os modelos", "All models")}
                </button>
              </div>
            </div>
            <div className="provider-rows">
              {Object.entries(providers).map(([provider, label]) => {
                const options = config.models
                  .map((m, i) => ({ ...m, index: i }))
                  .filter((m) => m.provider === provider);
                const selected = models.filter(
                  (i) => config.models[i].provider === provider,
                );
                const chosen =
                  selected[0] ??
                  options.find((m) => m.featured)?.index ??
                  options[0].index;
                const all = selected.length > 1;
                const mixedDepth =
                  new Set(
                    selected.map((i) => depths[i] || depth(config.models[i])),
                  ).size > 1;
                const c = checkFor(
                  selected.find((i) => !checkFor(i)?.ready) ?? chosen,
                );
                return (
                  <div
                    className={`api-row ${selected.length ? "enabled" : ""}`}
                    key={provider}
                    data-provider={provider}
                  >
                    <label className="api-choice">
                      <input
                        type="checkbox"
                        aria-label={label}
                        checked={selected.length > 0}
                        disabled={locked || experiment === "feedback_assisted"}
                        onChange={(e) =>
                          selectProvider(
                            provider,
                            e.target.checked ? String(chosen) : "",
                          )
                        }
                      />
                      <span className="api-monogram">{label[0]}</span>
                      <strong>{label}</strong>
                    </label>
                    <label className="compact-field">
                      <span>{L("Modelo", "Model")}</span>
                      <select
                        aria-label={`${L("Modelo", "Model")} ${label}`}
                        className={
                          config.models[chosen].featured && !all
                            ? "featured-model"
                            : ""
                        }
                        disabled={
                          !selected.length ||
                          locked ||
                          experiment === "feedback_assisted"
                        }
                        value={all ? "all" : chosen}
                        onChange={(e) =>
                          selectProvider(provider, e.target.value)
                        }
                      >
                        {options.map((m) => (
                          <option value={m.index} key={m.index}>
                            {m.featured ? "★ " : ""}
                            {m.label || m.model}
                          </option>
                        ))}
                        {options.length > 1 && (
                          <option value="all">
                            {L(
                              "Todos deste provedor",
                              "All from this provider",
                            )}{" "}
                            ({options.length})
                          </option>
                        )}
                      </select>
                    </label>
                    <label className="compact-field">
                      <span>{L("Profundidade", "Depth")}</span>
                      <select
                        aria-label={`${L("Profundidade", "Depth")} ${label}`}
                        value={
                          mixedDepth
                            ? "mixed"
                            : depths[chosen] ||
                              depth(config.models[chosen]) ||
                              ""
                        }
                        disabled={
                          !selected.length ||
                          locked ||
                          experiment === "feedback_assisted"
                        }
                        onChange={(e) =>
                          setSelection({
                            ...selection,
                            depths: {
                              ...depths,
                              ...Object.fromEntries(
                                selected.map((i) => [i, e.target.value]),
                              ),
                            },
                          })
                        }
                      >
                        {mixedDepth && (
                          <option value="mixed" disabled>
                            {L("Variada", "Mixed")}
                          </option>
                        )}
                        {(
                          config.models[chosen].depth_options || [
                            depth(config.models[chosen]),
                          ]
                        )
                          .filter(
                            (v) =>
                              v &&
                              (!all ||
                                selected.every((i) =>
                                  (
                                    config.models[i].depth_options || []
                                  ).includes(v),
                                )),
                          )
                          .map((v) => (
                            <option key={v} value={v}>
                              {depthName(v)}
                              {v === depth(config.models[chosen])
                                ? L(" · padrão", " · default")
                                : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      className={`connection-indicator ${tone(c)}`}
                      type="button"
                      aria-label={`${L("Status", "Status")} ${label}: ${statusLabel(c)}`}
                      title={`${statusLabel(c)} · ${L("Clique para ver detalhes", "Click for details")}`}
                      onClick={() =>
                        setDetail(
                          selected.find((i) => !checkFor(i)?.ready) ?? chosen,
                        )
                      }
                    >
                      <i aria-hidden="true" />
                      {statusLabel(c)}
                      <span aria-hidden="true">ⓘ</span>
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="connection-footer">
              <button
                type="button"
                disabled={locked || !models.length}
                onClick={() => verify()}
                title={L(
                  "Chamada curta, pode consumir créditos. Não é repetida ao iniciar.",
                  "Short call, may use credits. Not repeated when starting.",
                )}
              >
                <Icon name="check" size={16} />
                {checking
                  ? L("Verificando…", "Checking…")
                  : L("Verificar conexões", "Verify connections")}
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={refresh}
                title={L(
                  "Relê o .env sem chamar as APIs",
                  "Reloads .env without calling providers",
                )}
              >
                {t("Atualizar status")}
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => setDetail("help")}
              >
                {L("Sobre a verificação", "About verification")} ⓘ
              </button>
            </div>
          </section>
        )}
        {tab === "settings" && (
          <section className="launch-options">
            <div>
              <h2>{L("Tarefas", "Tasks")}</h2>
              <div className="task-list">
                {config.tasks.map((task) => (
                  <label className="check" key={task}>
                    <input
                      type="checkbox"
                      disabled={locked || experiment === "feedback_assisted"}
                      checked={selectedTasks.includes(task)}
                      onChange={() =>
                        setTasks(
                          selectedTasks.includes(task)
                            ? selectedTasks.filter((x) => x !== task)
                            : [...selectedTasks, task],
                        )
                      }
                    />
                    {t(taskNames[task])}
                  </label>
                ))}
              </div>
            </div>
            <div className="options-fields">
              <label>
                {t("Documentos")}
                <strong className="fixed-document-mode">
                  {L(
                    "PDFs originais + documentos do projeto",
                    "Original PDFs + project documents",
                  )}
                </strong>
                {!config.pdf_ready && (
                  <a href="#sources" className="answer-bad">
                    {L(
                      "Faltam PDFs · abrir fontes",
                      "Missing PDFs · open sources",
                    )}
                  </a>
                )}
              </label>
              <label>
                {t("Modo")}
                <select
                  disabled={locked}
                  value={experiment}
                  onChange={(e) => setExperiment(e.target.value)}
                >
                  <option value="first_pass">
                    {t("Sem correções prévias")}
                  </option>
                  <option value="feedback_assisted">
                    {t("Com correções confirmadas")}
                  </option>
                </select>
              </label>
              {experiment === "feedback_assisted" && (
                <label>
                  {t("Execução de referência")}
                  <select
                    disabled={locked}
                    value={baseline}
                    onChange={(e) =>
                      chooseBaseline(e.target.value).catch((e) =>
                        setMessage(e.message),
                      )
                    }
                  >
                    <option value="">{t("Selecione uma execução")}</option>
                    {runs
                      .filter(
                        (r) =>
                          r.experiment === "first_pass" &&
                          r.status === "completed",
                      )
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.model} · {date(r.created_at)}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
          </section>
        )}
        {tab === "inputs" && (
          <div className="launch-inputs product-stack">
            <section className="product-panel">
              <div className="panel-heading">
                <h2>
                  {L(
                    "Documentos desta avaliação",
                    "Documents for this evaluation",
                  )}
                </h2>
                <span className="source-badge">
                  {mode === "pdf_text"
                    ? L("TEXTO DOS PDFs", "FULL PDF TEXT")
                    : L("TEXTO NORMALIZADO", "NORMALIZED TEXT")}
                </span>
              </div>
              <div className="launch-artifacts">
                {ds.sources
                  .filter((s) =>
                    ["FAN", "SENSOR", "DRIVER"].includes(s.document_id),
                  )
                  .map((s) => (
                    <a href="#inputs" key={s.document_id}>
                      <Icon name="document" />
                      <span>
                        {s.part_number}
                        <small>{s.manufacturer}</small>
                      </span>
                    </a>
                  ))}
                <a href="#inputs/requirements">
                  <Icon name="reference" />
                  <span>
                    {ds.ground_truth.requirements.length}{" "}
                    {L("requisitos do projeto", "project requirements")}
                  </span>
                </a>
                <a href="#inputs/configuration">
                  <Icon name="config" />
                  <span>
                    {L(
                      "Configuração e hipóteses",
                      "Configuration and assumptions",
                    )}
                  </span>
                </a>
                <a href="#inputs/scenarios">
                  <Icon name="change" />
                  <span>
                    {L(
                      "Cenários conforme a tarefa e o nível",
                      "Scenarios selected by task and level",
                    )}
                  </span>
                </a>
              </div>
            </section>
            <section className="product-panel">
              <h2>
                {L(
                  "Instruções e saída esperada",
                  "Instructions and expected output",
                )}
              </h2>
              <p>
                {L(
                  "Ler as evidências fornecidas, usar o vocabulário permitido e devolver JSON com citações. A avaliação compara a resposta com o gabarito separado.",
                  "Read the supplied evidence, use the allowed vocabulary and return JSON with citations. Evaluation compares that response with the separate ground truth.",
                )}
              </p>
              <div className="detail-chips">
                {selectedTasks.map((task) => (
                  <span key={task}>
                    {t(taskNames[task])} ·{" "}
                    {task === "one_hop"
                      ? "L2"
                      : task === "impact_explanation"
                        ? "L1 + L2"
                        : "L1"}
                  </span>
                ))}
              </div>
              <p className="muted">
                {experiment === "first_pass"
                  ? L(
                      "Primeira passagem: sem correções anteriores e sem respostas do gabarito no contexto.",
                      "First pass: no previous corrections or ground-truth answers in the context.",
                    )
                  : L(
                      "Modo assistido: inclui apenas as correções confirmadas da execução de referência selecionada.",
                      "Assisted mode: includes only confirmed corrections from the selected baseline run.",
                    )}
              </p>
              <div className="inline-actions">
                <a className="button" href="#context">
                  {L(
                    "Inspecionar prompts exatos e versões",
                    "Inspect exact prompts and versions",
                  )}{" "}
                  →
                </a>
                <a className="button" href="#criteria">
                  {L("Critérios de avaliação", "Evaluation criteria")}
                </a>
              </div>
            </section>
          </div>
        )}
        {tab === "activity" && (
          <RunHistory
            api={api}
            onOpen={(id) => (window.location.hash = `live/${id}`)}
          />
        )}
      </div>
      <div className="launch-bottom">
        {message && (
          <div role="status" className="compact-notice">
            <span>{t(message)}</span>
            {message.length > 150 && (
              <DetailButton label={L("Detalhes", "Details")}>
                <PagedText text={t(message)} />
              </DetailButton>
            )}
            <button
              type="button"
              onClick={() => setMessage("")}
              aria-label={L("Fechar aviso", "Dismiss notice")}
            >
              ×
            </button>
          </div>
        )}
        <div className="launch-actions">
          <label className="repeat-control">
            {L("Repetições", "Repetitions")}
            <input
              aria-label={L("Repetições por modelo", "Repetitions per model")}
              type="number"
              min="1"
              max="10"
              required
              value={repetitions}
              disabled={locked}
              onChange={(e) => setRepetitions(e.target.value)}
            />
          </label>
          <span className="run-estimate">
            {models.length} {L("modelos", "models")} · {calls}{" "}
            {L("chamadas", "calls")}
            <small>
              {L(
                "Cobrança conforme o provedor",
                "Provider usage charges apply",
              )}
            </small>
          </span>
          <button
            className="primary"
            type="submit"
            disabled={
              locked ||
              !models.length ||
              !selectedTasks.length ||
              (experiment === "feedback_assisted" && !baseline)
            }
          >
            {busy
              ? L("Iniciando…", "Starting…")
              : active
                ? L("Em andamento", "In progress")
                : L("Iniciar avaliação", "Start evaluation")}
            <Icon name="arrow" size={17} />
          </button>
        </div>
      </div>
      {detail !== null && (
        <Modal
          title={
            details
              ? `${providers[config.models[detail].provider]} · ${config.models[detail].label}`
              : L("Detalhes", "Details")
          }
          onClose={() => setDetail(null)}
        >
          {details ? (
            <div className="status-detail">
              <p className={`status-title ${tone(details)}`}>
                <i className="status-dot" />
                {statusLabel(details)}
              </p>
              <div className="status-stages">
                {[
                  [
                    details.key_present,
                    L("Chave configurada", "Key configured"),
                  ],
                  [details.api_responded, L("API respondeu", "API responded")],
                  [
                    details.generation_confirmed,
                    L("Geração confirmada", "Generation confirmed"),
                  ],
                ].map(([done, label]) => (
                  <span key={label} className={done ? "green" : "muted"}>
                    {done ? "✓" : "○"} {label}
                  </span>
                ))}
              </div>
              {!details.ready && (
                <>
                  <p>
                    {t(
                      details.diagnostic?.action ||
                        (details.key_present
                          ? "Clique em Verificar conexão antes de iniciar a avaliação."
                          : "Preencha a variável indicada no arquivo .env e clique em Atualizar status."),
                    )}
                  </p>
                  {!details.key_present && <code>{details.env_name}</code>}
                </>
              )}
              {details.diagnostic?.detail && (
                <p className="technical-detail">{details.diagnostic.detail}</p>
              )}
              {details.checked_at && (
                <small>
                  {L("Verificado em", "Checked at")} {date(details.checked_at)}
                </small>
              )}
              <p className="muted">
                {L(
                  "A confirmação vale para esta chave, modelo e profundidade. O teste curto pode consumir créditos.",
                  "Confirmation applies to this key, model and depth. The short check may use credits.",
                )}
              </p>
              <div className="dialog-actions">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => verify([detail], true)}
                >
                  {details.ready
                    ? t("Verificar novamente")
                    : t("Verificar conexão")}
                </button>
                {details.diagnostic?.help_url && (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={details.diagnostic.help_url}
                  >
                    {L("Painel do provedor ↗", "Provider dashboard ↗")}
                  </a>
                )}
              </div>
            </div>
          ) : detail === "help" ? (
            <div className="status-detail">
              <p>
                {L(
                  "Configure as chaves no .env. A chave dá acesso ao provedor; o modelo e a profundidade são escolhidos aqui.",
                  "Configure keys in .env. The key provides access to the provider; choose the model and depth here.",
                )}
              </p>
              <p>
                {L(
                  "Verificar conexões faz uma chamada curta, com possível cobrança, e salva a confirmação. Iniciar avaliação não repete esse teste. Se faltar uma chave no conjunto selecionado, nenhuma API será chamada.",
                  "Verify connections makes a short, potentially billable call and saves confirmation. Starting does not repeat it. If any selected key is missing, no provider will be called.",
                )}
              </p>
              <p>
                {L(
                  "Profundidade é específica de cada fabricante. Níveis com o mesmo nome não equivalem ao mesmo esforço ou custo.",
                  "Depth is provider-specific. Identically named levels do not imply equal effort or cost.",
                )}
              </p>
            </div>
          ) : (
            <div className="status-detail">
              <p>{t(detail.failure?.diagnostic?.action)}</p>
              <p>{detail.failure?.diagnostic?.detail}</p>
            </div>
          )}
        </Modal>
      )}
    </form>
  );
}
