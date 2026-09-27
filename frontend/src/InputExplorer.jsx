import React, { useEffect, useState } from "react";
import { L, t } from "./i18n";
import Icon from "./Icon";
import { Tabs } from "./ScreenUI";
import PdfViewer from "./PdfViewer";
import { taskLabel } from "./liveLabels";
export const inputTabs = () => [
  ["original", L("Documentos originais", "Original documents")],
  ["project", L("Documentos do projeto", "Project documents")],
  ["requirements", L("Requisitos", "Requirements")],
  ["configuration", L("Configuração", "Configuration")],
  ["scenarios", L("Cenários", "Scenarios")],
];
const reqCategoryId = (id) =>
  ({
    "REQ-001": "electrical",
    "REQ-002": "performance",
    "REQ-003": "control",
    "REQ-004": "interface",
    "REQ-005": "electrical",
  })[id] || "project";
const reqCategory = (id) =>
  ({
    "REQ-001": L("Elétrico", "Electrical"),
    "REQ-002": L("Desempenho", "Performance"),
    "REQ-003": L("Controle", "Control"),
    "REQ-004": L("Interface elétrica", "Electrical interface"),
    "REQ-005": L("Elétrico", "Electrical"),
  })[id] || L("Requisito de projeto", "Project requirement");
const componentFor = (id) =>
  ({
    "REQ-001": "FAN",
    "REQ-002": "FAN",
    "REQ-003": "ESP32",
    "REQ-004": "SENSOR",
    "REQ-005": "DRIVER",
  })[id];
const changeType = (k) =>
  ({
    component: L("Componente", "Component"),
    configuration: L("Configuração", "Configuration"),
    requirement: L("Requisito", "Requirement"),
    document: L("Documento", "Document"),
    no_impact: L("Controle sem impacto", "No-impact control"),
  })[k] || k;
const docName = (k) =>
  ({
    FAN: L("Ventilador", "Fan"),
    SENSOR: L("Sensor de temperatura", "Temperature sensor"),
    DRIVER: L("Chave de alimentação", "Power switch"),
    REQUIREMENTS: L("Requisitos do projeto", "Project requirements"),
    PROJECT: L("Arquitetura e hipóteses", "Architecture and assumptions"),
  })[k] || k;
export function SourceFacts({ ds, id }) {
  return (
    <div className="normalized-facts">
      {Object.entries(ds.documents[id] || {}).map(([loc, text]) => (
        <article key={loc}>
          <span className="source-location">
            {id} · {loc}
          </span>
          <p lang="en" data-source-content>
            {text}
          </p>
        </article>
      ))}
      {!ds.documents[id] && (
        <p>
          {L(
            "Esta fonte alternativa entra no contexto dos cenários correspondentes pelo registro de fontes.",
            "This alternative source is included in the relevant scenario context through the source registry.",
          )}
        </p>
      )}
    </div>
  );
}
export default function InputExplorer({ api, ds, runs, sourcePage = false }) {
  const [tab, setTab] = useState(location.hash.split("/")[1] || "original"),
    [sources, setSources] = useState(null),
    [sourceId, setSourceId] = useState("FAN"),
    [docTab, setDocTab] = useState("pdf"),
    [error, setError] = useState(""),
    [downloading, setDownloading] = useState(false);
  useEffect(() => {
    api("/sources")
      .then(setSources)
      .catch((e) => setError(e.message));
  }, [ds]);
  useEffect(() => {
    const read = () => setTab(location.hash.split("/")[1] || "original");
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  if (!sources)
    return (
      <p role={error ? "alert" : undefined}>
        {error || L("Conferindo fontes locais…", "Checking local sources…")}
      </p>
    );
  const source = sources.find((s) => s.document_id === sourceId) || sources[0];
  return (
    <div className="product-stack artifact-explorer">
      {!sourcePage && (
        <>
          <div className="input-story">
            <span className="source-badge">
              {L("ENTRADA DO MODELO", "MODEL INPUT")}
            </span>
            <span>
              {L(
                "Documentos + requisitos + contexto → prompt → resposta → avaliação",
                "Documents + requirements + context → prompt → output → evaluation",
              )}
            </span>
            <a href="#context">
              {L("Ver mensagem exata", "View exact message")} →
            </a>
          </div>
          <Tabs
            value={tab}
            onChange={(v) => {
              setTab(v);
              location.hash = `inputs/${v}`;
            }}
            items={inputTabs()}
            label={L("Tipos de entrada", "Input types")}
          />
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {(sourcePage || tab === "original") && (
        <div className="explorer-columns">
          <aside className="artifact-list">
            <h2>
              {sourcePage
                ? L("Fontes registradas", "Registered sources")
                : L("Datasheets oficiais", "Official datasheets")}
            </h2>
            {sources.map((s) => (
              <button
                key={s.document_id}
                aria-pressed={source.document_id === s.document_id}
                onClick={() => {
                  setSourceId(s.document_id);
                  setDocTab(sourcePage ? "metadata" : "pdf");
                }}
              >
                <Icon
                  name={
                    s.document_id.includes("FAN")
                      ? "fan"
                      : s.document_id === "SENSOR"
                        ? "sensor"
                        : "switch"
                  }
                  size={27}
                />
                <span>
                  <strong>{s.part_number}</strong>
                  <small>{s.manufacturer} · PDF</small>
                  <small>
                    {s.available
                      ? L("Disponível localmente", "Available locally")
                      : L("Fonte oficial externa", "External official source")}
                  </small>
                </span>
              </button>
            ))}
            <a href="#inputs/requirements" className="artifact-link">
              <Icon name="reference" />
              {L(
                "Requisitos do projeto · texto",
                "Project requirements · text",
              )}
            </a>
          </aside>
          <section className="product-panel document-workspace">
            <div className="panel-heading">
              <div>
                <span className="source-badge manufacturer">
                  {L("FONTE DO FABRICANTE", "MANUFACTURER SOURCE")}
                </span>
                <h2>{source.part_number}</h2>
                <p>
                  {source.manufacturer} · {source.revision}
                </p>
              </div>
              <a
                href={source.official_datasheet_url}
                target="_blank"
                rel="noreferrer"
              >
                {L("Fonte oficial", "Official source")} ↗
              </a>
            </div>
            <Tabs
              value={docTab}
              onChange={setDocTab}
              items={[
                ["pdf", L("PDF original", "Original PDF")],
                ["metadata", L("Proveniência", "Provenance")],
              ]}
            />
            {docTab === "metadata" ? (
              <SourceMetadata source={source} />
            ) : (
              <PdfViewer
                source={source}
                downloading={downloading}
                onDownload={async () => {
                  setDownloading(true);
                  setError("");
                  try {
                    setSources(
                      await api(
                        `/sources/${source.document_id}/cache`,
                        "POST",
                        {},
                      ),
                    );
                  } catch {
                    setError(
                      L(
                        "Não foi possível obter o PDF. Abra a fonte oficial e tente novamente mais tarde.",
                        "Could not retrieve the PDF. Open the official source and try again later.",
                      ),
                    );
                  } finally {
                    setDownloading(false);
                  }
                }}
              />
            )}
          </section>
        </div>
      )}
      {!sourcePage && ["project", "normalized"].includes(tab) && (
        <ProjectInputs ds={ds} />
      )}
      {!sourcePage && tab === "requirements" && <Requirements ds={ds} />}
      {!sourcePage && tab === "configuration" && <Configuration ds={ds} />}
      {!sourcePage && tab === "scenarios" && (
        <Scenarios ds={ds} runs={runs} api={api} />
      )}
      {sourcePage && <Vocabulary ds={ds} />}
    </div>
  );
}
export function SourceMetadata({ source: s }) {
  return (
    <div className="provenance-view">
      <dl className="property-grid">
        {[
          [L("Documento", "Document"), s.document_id],
          [L("Fabricante", "Manufacturer"), s.manufacturer],
          [L("Peça exata", "Exact part"), s.part_number],
          [L("Revisão", "Revision"), s.revision],
          [L("Acessado em", "Accessed on"), s.date_accessed],
          [
            L("Páginas no PDF local", "Pages in local PDF"),
            s.pages ?? L("Indisponível", "Unavailable"),
          ],
          [
            L("Tipo de fonte", "Source type"),
            L("PDF oficial do fabricante", "Official manufacturer PDF"),
          ],
          [
            L("Seções utilizadas", "Referenced sections"),
            s.sections.join(" · "),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="provenance-note">
        <Icon name="lock" />
        <div>
          <strong>
            {L("Arquivo local, fora do Git", "Local file, excluded from Git")}
          </strong>
          <p>
            {L(
              "Os PDFs não são redistribuídos pelo repositório. Os fatos curtos e suas fontes fazem parte do benchmark.",
              "The repository does not redistribute PDFs. Short technical facts and their sources form the benchmark.",
            )}
          </p>
          <p lang="en">{s.redistribution}</p>
        </div>
      </div>
      {s.sha256 && (
        <details className="quiet-details">
          <summary>
            {s.matches_checked_document === true
              ? L(
                  "✓ PDF confere com a edição verificada",
                  "✓ PDF matches the verified edition",
                )
              : L("Conferir identidade do PDF", "Check PDF identity")}
          </summary>
          <code className="hash-line">SHA-256 {s.sha256}</code>
        </details>
      )}
      {s.matches_checked_document === false && (
        <p role="alert">
          {L(
            "Atenção: este PDF difere da edição usada para verificar os fatos. Não compare versões como se fossem idênticas.",
            "This PDF differs from the edition used to verify facts. Do not treat the versions as identical.",
          )}
        </p>
      )}
    </div>
  );
}
function ProjectInputs({ ds }) {
  const [doc, setDoc] = useState("PROJECT");
  return (
    <div className="explorer-columns">
      <aside className="artifact-list">
        {["PROJECT", "REQUIREMENTS"].map((id) => (
          <button key={id} aria-pressed={doc === id} onClick={() => setDoc(id)}>
            <Icon name={id === "PROJECT" ? "config" : "document"} />
            <span>
              <strong>{docName(id)}</strong>
              <small>
                {id} · {Object.keys(ds.documents[id]).length}{" "}
                {L("trechos", "passages")}
              </small>
            </span>
          </button>
        ))}
      </aside>
      <section className="product-panel">
        <div className="panel-heading">
          <div>
            <span className="source-badge">
              {L("TEXTO ENVIADO AO MODELO", "TEXT SENT TO THE MODEL")}
            </span>
            <h2>{docName(doc)}</h2>
          </div>
          <a className="button" href="#context">
            {L("Prompt e edição", "Prompt and editing")} →
          </a>
        </div>
        <p className="inline-note">
          {L(
            "Documentos de autoria do projeto, enviados junto ao texto integral dos PDFs. Não contêm o gabarito de relações ou de impactos.",
            "Project-authored documents, sent alongside full PDF text. They do not contain the relationship or impact answer key.",
          )}
        </p>
        <SourceFacts ds={ds} id={doc} />
      </section>
    </div>
  );
}
export function Requirements({ ds }) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [component, setComponent] = useState(""),
    [kind, setKind] = useState(""),
    [source, setSource] = useState(""),
    [scenario, setScenario] = useState(""),
    [impact, setImpact] = useState(""),
    [sort, setSort] = useState("id"),
    [selected, setSelected] = useState(null);
  const all = ds.ground_truth.requirements,
    categories = [...new Set(all.map((r) => reqCategoryId(r.id)))],
    chosenCase = ds.ground_truth.change_scenarios.find(
      (s) => s.id === scenario,
    );
  const rows = all
    .filter(
      (r) =>
        (r.id + " " + r.text).toLowerCase().includes(search.toLowerCase()) &&
        (!category || reqCategoryId(r.id) === category) &&
        (!component || componentFor(r.id) === component) &&
        (!kind || r.kind === kind) &&
        (!source || source === "REQUIREMENTS") &&
        (!impact ||
          !chosenCase ||
          (impact === "yes") ===
            chosenCase.affected_requirements.includes(r.id)),
    )
    .sort((a, b) =>
      sort === "category"
        ? reqCategory(a.id).localeCompare(reqCategory(b.id))
        : sort === "critical"
          ? Number(b.critical) - Number(a.critical)
          : a.id.localeCompare(b.id),
    );
  const chosen = rows.find((r) => r.id === selected) || rows[0],
    links = ds.ground_truth.relationships.filter(
      (e) => e.source === chosen?.id,
    ),
    node = ds.ground_truth.entities.nodes.find((n) => n.id === chosen?.id);
  return (
    <section className="product-panel requirements-explorer">
      <div className="panel-heading">
        <div>
          <span className="source-badge requirement">
            {L(
              "REQUISITOS DE PRODUTO · ENTRADA",
              "PRODUCT REQUIREMENTS · INPUT",
            )}
          </span>
          <h2>{L("Requisitos do sistema", "System requirements")}</h2>
        </div>
        <span>
          {rows.length} / {all.length}
        </span>
      </div>
      <div className="filter-row">
        <label className="search-field">
          {L("Buscar requisito", "Search requirements")}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={L("ID ou texto", "ID or text")}
          />
        </label>
        <label>
          {L("Categoria", "Category")}
          <select
            aria-label={L("Categoria", "Category")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{L("Todas", "All")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {reqCategory(all.find((r) => reqCategoryId(r.id) === c).id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {L("Componente", "Component")}
          <select
            aria-label={L("Componente", "Component")}
            value={component}
            onChange={(e) => setComponent(e.target.value)}
          >
            <option value="">{L("Todos", "All")}</option>
            {[...new Set(all.map((r) => componentFor(r.id)))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          {L("Ordenar", "Sort")}
          <select
            aria-label={L("Ordenar", "Sort")}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="id">ID</option>
            <option value="category">{L("Categoria", "Category")}</option>
            <option value="critical">{L("Criticidade", "Criticality")}</option>
          </select>
        </label>
      </div>
      <details className="quiet-details">
        <summary>
          {L(
            "Mais filtros · origem e impacto esperado",
            "More filters · origin and expected impact",
          )}
        </summary>
        <div className="filter-row">
          <label>
            {L("Tipo", "Type")}
            <select
              aria-label={L("Tipo", "Type")}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="">{L("Todos", "All")}</option>
              <option value="product_requirement">
                {L("Requisito de produto", "Product requirement")}
              </option>
            </select>
          </label>
          <label>
            {L("Origem", "Origin")}
            <select
              aria-label={L("Origem", "Origin")}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <option value="">{L("Todas", "All")}</option>
              <option value="REQUIREMENTS">REQUIREMENTS</option>
            </select>
          </label>
          <label>
            {L("Cenário do gabarito", "Ground-truth scenario")}
            <select
              aria-label={L("Cenário do gabarito", "Ground-truth scenario")}
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
            >
              <option value="">{L("Selecionar", "Select")}</option>
              {ds.ground_truth.change_scenarios.map((s) => (
                <option key={s.id}>{s.id}</option>
              ))}
            </select>
          </label>
          <label>
            {L("Impacto esperado", "Expected impact")}
            <select
              aria-label={L("Impacto esperado", "Expected impact")}
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
              disabled={!scenario}
            >
              <option value="">{L("Todos", "All")}</option>
              <option value="yes">{L("Afetado", "Affected")}</option>
              <option value="no">{L("Não afetado", "Unaffected")}</option>
            </select>
          </label>
        </div>
      </details>
      <div className="requirements-layout">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>{L("Categoria", "Category")}</th>
                <th>{L("Componente", "Component")}</th>
                <th>{L("Crítico", "Critical")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className={chosen?.id === r.id ? "selected-row" : ""}
                >
                  <th>
                    <button onClick={() => setSelected(r.id)}>{r.id}</button>
                  </th>
                  <td>{reqCategory(r.id)}</td>
                  <td>{componentFor(r.id)}</td>
                  <td>{r.critical ? L("Sim", "Yes") : L("Não", "No")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p>
              {L(
                "Nenhum requisito corresponde aos filtros.",
                "No requirement matches these filters.",
              )}
            </p>
          )}
        </div>
        {chosen && (
          <article className="requirement-detail">
            <span className="source-location">REQUIREMENTS · {chosen.id}</span>
            <h3>{node?.name || chosen.id}</h3>
            <p lang="en" data-source-content>
              {chosen.text}
            </p>
            <div className="detail-chips">
              <span>{reqCategory(chosen.id)}</span>
              <span>{L("Definido pelo projeto", "Project-defined")}</span>
              <span>
                {L(
                  "Não é especificação do fabricante",
                  "Not a manufacturer specification",
                )}
              </span>
            </div>
            <h4>
              {L(
                "Verificação definida no requisito",
                "Verification defined by this requirement",
              )}
            </h4>
            <p>
              {chosen.text
                .match(/(?:[Vv]erify|[Rr]eview|use V-SPEED)[^.]*\./g)
                ?.join(" ") ||
                L(
                  "Consulte o texto integral acima.",
                  "See the full requirement above.",
                )}
            </p>
            <h4>
              {L(
                "Vínculos no gabarito · usados na avaliação",
                "Ground-truth links · used for evaluation",
              )}
            </h4>
            {links.map((e) => (
              <div className="dependency-line" key={e.relationship + e.target}>
                <strong>{e.source}</strong>
                <span>{e.relationship}</span>
                <strong>{e.target}</strong>
              </div>
            ))}
            <a href="#reference">
              {L(
                "Revisar, confirmar ou corrigir o gabarito",
                "Review, confirm or correct ground truth",
              )}{" "}
              →
            </a>
          </article>
        )}
      </div>
      <small className="muted">
        {L(
          "Categorias e componentes organizam a navegação; não alteram o texto, o prompt nem a referência.",
          "Categories and components organize navigation; they do not alter text, prompts or ground truth.",
        )}
      </small>
    </section>
  );
}
export function Configuration({ ds }) {
  const cfg = ds.system_config;
  const labels = {
    fan_voltage_V: L("Alimentação do ventilador", "Fan rail"),
    sensor_voltage_V: L("Alimentação do sensor", "Sensor rail"),
    activation_threshold_degC: L(
      "Temperatura de ativação",
      "Activation threshold",
    ),
    control: L("Controle", "Control"),
    controller_concept: L("Controlador conceitual", "Conceptual controller"),
    hardware_verified: L("Hardware verificado", "Hardware verified"),
  };
  return (
    <div className="product-stack">
      <section className="product-panel">
        <div className="panel-heading">
          <h2>{L("Configuração do sistema", "System configuration")}</h2>
          <span className="source-badge assumption">
            {L("HIPÓTESE DO BENCHMARK", "BENCHMARK ASSUMPTION")}
          </span>
        </div>
        <p className="inline-note">
          {L(
            "São escolhas do projeto usadas como entrada. A coincidência com um valor nominal do fabricante não transforma uma escolha em especificação.",
            "These are project choices supplied as input. Matching a manufacturer nominal value does not make a project choice a specification.",
          )}
        </p>
        <div className="config-cards">
          {Object.entries(cfg)
            .filter(([k]) => !["document_id", "kind"].includes(k))
            .map(([k, v]) => (
              <article key={k}>
                <span>{labels[k] || k}</span>
                <strong>
                  {typeof v === "boolean"
                    ? v
                      ? L("Sim", "Yes")
                      : L("Não", "No")
                    : v}
                  {k.endsWith("_V") ? " V" : k.endsWith("_degC") ? " °C" : ""}
                </strong>
                <small>
                  CONFIG · {L("Hipótese do benchmark", "Benchmark assumption")}
                </small>
              </article>
            ))}
        </div>
        <a href="#context">
          {L(
            "Editar configuração com nova versão",
            "Edit configuration as a new version",
          )}{" "}
          →
        </a>
      </section>
      <section className="product-panel">
        <h2>
          {L(
            "Arquitetura e hipóteses documentadas",
            "Documented architecture and assumptions",
          )}
        </h2>
        <SourceFacts ds={ds} id="PROJECT" />
      </section>
      <section className="product-panel">
        <h2>{L("Configuração da execução", "Execution configuration")}</h2>
        <p>
          {L(
            "Modelos, profundidade, tarefas, modo de documentos e repetições são escolhidos para cada avaliação e preservados com o resultado. Eles não são propriedades dos componentes.",
            "Models, reasoning depth, tasks, document mode and repetitions are chosen per run and preserved with the result. They are not component properties.",
          )}
        </p>
        <div className="inline-actions">
          <a className="button" href="#run">
            {L("Configurar avaliação", "Configure run")}
          </a>
          <a className="button" href="#context">
            {L("Inspecionar prompt e versão", "Inspect prompt and version")}
          </a>
        </div>
      </section>
    </div>
  );
}
export function ScenarioDetail({ scenario: s, ds, hasResult = false }) {
  const transition = s.description.match(
    /from (.+?) to (.+?)(?=;|,|\.\s|\.$|$)/i,
  );
  const baseline =
    s.changed_entity === "FAN"
      ? ds.sources.find((x) => x.document_id === "FAN")?.part_number
      : s.changed_entity === "DRIVER"
        ? ds.sources.find((x) => x.document_id === "DRIVER")?.part_number
        : null;
  const replacement = s.description.match(
    /(?:with|using) (?:the real )?(?:Noctua |TI )?(NF-[\w-]+(?: 5V)?|TPS\d+\w*)/i,
  )?.[1];
  return (
    <article className="scenario-detail">
      <div className="detail-chips">
        <span>{s.id}</span>
        <span>{s.difficulty.split("_")[0]}</span>
        <span>{changeType(s.change_type)}</span>
        <span>
          {s.split === "transfer"
            ? L("Transferência de aprendizado", "Feedback transfer")
            : L("Caso principal", "Core case")}
        </span>
      </div>
      <h3>{t(s.title)}</h3>
      <p lang="en" data-source-content>
        {s.description}
      </p>
      <dl className="property-grid">
        <div>
          <dt>{L("Elemento alterado", "Changed element")}</dt>
          <dd>{s.changed_entity}</dd>
        </div>
        <div>
          <dt>{L("Resultado real", "Real result")}</dt>
          <dd>
            {hasResult == null
              ? L("Não disponível", "Not available")
              : hasResult
                ? L(
                    "Existe uma execução avaliada",
                    "An evaluated execution exists",
                  )
                : L("Ainda não executado", "Not tested yet")}
          </dd>
        </div>
      </dl>
      {(transition || (baseline && replacement)) && (
        <div className="change-values">
          <div>
            <small>{L("Antes", "Before")}</small>
            <strong>{transition?.[1] || baseline}</strong>
          </div>
          <Icon name="arrow" />
          <div>
            <small>{L("Proposta", "Proposed")}</small>
            <strong>{transition?.[2] || replacement}</strong>
          </div>
        </div>
      )}
      <div className="scenario-question">
        <Icon name="model" />
        <p>
          {L(
            "O modelo identifica quais requisitos precisam de revisão ou reverificação após esta mudança.",
            "The model identifies which requirements need review or reverification after this change.",
          )}
        </p>
      </div>
      <details className="ground-truth-drawer">
        <summary>
          {L(
            "Gabarito esperado · não enviado ao modelo",
            "Expected ground truth · not sent to the model",
          )}
        </summary>
        <strong>
          {s.affected_requirements.join(", ") ||
            L("Nenhum requisito afetado", "No affected requirements")}
        </strong>
        <p lang="en">{s.expected_reason}</p>
        <p>
          {L("Não afetados", "Unaffected")}:{" "}
          {s.unaffected_requirements.join(", ")}
        </p>
      </details>
      <p className="muted">
        {L("Tarefas", "Tasks")}:{" "}
        {s.difficulty === "L1_DIRECT"
          ? `${taskLabel("change_impact")} · ${taskLabel("impact_explanation")}`
          : `${taskLabel("one_hop")} · ${taskLabel("impact_explanation")}`}
      </p>
    </article>
  );
}
export function Scenarios({ ds, runs, api }) {
  const [type, setType] = useState(""),
    [level, setLevel] = useState(""),
    [id, setId] = useState(""),
    [coverage, setCoverage] = useState(null);
  useEffect(() => {
    let current = true;
    setCoverage(null);
    Promise.all(runs.map((r) => api(`/runs/${r.id}`)))
      .then((records) => {
        if (current)
          setCoverage(
            new Set(
              records.flatMap((r) =>
                r.results.flatMap(
                  (x) =>
                    x.parsed_output?.scenarios
                      ?.filter((s) => {
                        const original =
                          r.snapshot.dataset.ground_truth.change_scenarios.find(
                            (c) => c.id === s.scenario_id,
                          );
                        const currentCase =
                          ds.ground_truth.change_scenarios.find(
                            (c) => c.id === s.scenario_id,
                          );
                        return (
                          original &&
                          currentCase &&
                          original.description === currentCase.description &&
                          original.difficulty === currentCase.difficulty
                        );
                      })
                      .map((s) => s.scenario_id) || [],
                ),
              ),
            ),
          );
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [
    JSON.stringify(ds.ground_truth.change_scenarios),
    runs
      .map((r) => `${r.id}:${r.completed_calls}:${r.evaluated_calls}`)
      .join("|"),
  ]);
  const cases = ds.ground_truth.change_scenarios.filter(
      (s) =>
        (!type || s.change_type === type) && (!level || s.difficulty === level),
    ),
    chosen = cases.find((s) => s.id === id) || cases[0];
  return (
    <section className="product-panel">
      <div className="panel-heading">
        <h2>{L("Casos de mudança", "Change cases")}</h2>
        <span>
          {cases.length} {L("cenários definidos", "defined scenarios")}
        </span>
      </div>
      <div className="filter-row">
        <label>
          {L("Tipo de mudança", "Change type")}
          <select
            aria-label={L("Tipo de mudança", "Change type")}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">{L("Todos", "All")}</option>
            {[
              ...new Set(
                ds.ground_truth.change_scenarios.map((s) => s.change_type),
              ),
            ].map((x) => (
              <option key={x} value={x}>
                {changeType(x)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {L("Nível", "Level")}
          <select
            aria-label={L("Nível", "Level")}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="">L1 + L2</option>
            <option value="L1_DIRECT">L1 · {L("Direto", "Direct")}</option>
            <option value="L2_ONE_HOP">L2 · {L("Um passo", "One hop")}</option>
          </select>
        </label>
      </div>
      <div className="explorer-columns">
        <aside className="artifact-list">
          {cases.map((s) => (
            <button
              key={s.id}
              aria-pressed={s.id === chosen?.id}
              onClick={() => setId(s.id)}
            >
              <Icon name="change" />
              <span>
                <strong>
                  {s.id} · {t(s.title)}
                </strong>
                <small>
                  {s.difficulty.split("_")[0]} · {changeType(s.change_type)}
                </small>
              </span>
            </button>
          ))}
        </aside>
        {chosen ? (
          <ScenarioDetail
            scenario={chosen}
            ds={ds}
            hasResult={coverage?.has(chosen.id) ?? null}
          />
        ) : (
          <p>
            {L(
              "Nenhum cenário corresponde aos filtros.",
              "No scenario matches these filters.",
            )}
          </p>
        )}
      </div>
    </section>
  );
}
function Vocabulary({ ds }) {
  return (
    <section className="product-panel">
      <h2>
        {L(
          "Esquema e referência de avaliação",
          "Schema and evaluation reference",
        )}
      </h2>
      <p>
        {L(
          "O modelo recebe os tipos permitidos e a convenção de nomes. O inventário de IDs abaixo pertence ao avaliador e não é enviado ao modelo.",
          "The model receives allowed types and naming conventions. The ID inventory below belongs to the evaluator and is not sent to the model.",
        )}
      </p>
      <div className="vocabulary-grid">
        <div>
          <h3>{L("Tipos de nó", "Node types")}</h3>
          {[...new Set(ds.scope.nodes.map((n) => n.type))].map((x) => (
            <span className="vocabulary-term" key={x}>
              {x}
            </span>
          ))}
        </div>
        <div>
          <h3>{L("Relações permitidas", "Allowed relationships")}</h3>
          {["has_parameter", "constrains", "depends_on", "verified_by"].map(
            (x) => (
              <span className="vocabulary-term" key={x}>
                {x}
              </span>
            ),
          )}
        </div>
      </div>
      <details className="quiet-details">
        <summary>
          {L(
            "IDs de referência · somente avaliador",
            "Reference IDs · evaluator only",
          )}
        </summary>
        <div className="table-scroll">
          <table>
            <tbody>
              {ds.scope.nodes.map((n) => (
                <tr key={n.id}>
                  <th>{n.id}</th>
                  <td>{n.type}</td>
                  <td>{n.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
