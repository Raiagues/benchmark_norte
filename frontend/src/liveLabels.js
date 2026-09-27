import { L, locale } from "./i18n";
export const taskLabel = (v) =>
  ({
    entity_extraction: L("Dados e parâmetros", "Entities and parameters"),
    relationship_extraction: L("Relações", "Relationships"),
    change_impact: L("Impactos", "Impact analysis"),
    impact_explanation: L("Explicações", "Explanations"),
    one_hop: L("Um passo de raciocínio", "One-hop reasoning"),
  })[v] || v;
export const statusLabel = (v) =>
  ({
    QUEUED: L("Na fila", "Queued"),
    RUNNING: L("Em execução", "Running"),
    STOPPING: L("Encerrando", "Stopping"),
    COMPLETED: L("Concluída", "Completed"),
    COMPLETED_WITH_ERRORS: L(
      "Concluída com erros técnicos",
      "Completed with technical errors",
    ),
    PARTIALLY_COMPLETED: L("Parcialmente concluída", "Partially completed"),
    INTERRUPTED_BY_USER: L("Interrompida pelo usuário", "Interrupted by user"),
    COMPLETED_CORRECT: L("Correta", "Correct"),
    COMPLETED_INCORRECT: L("Resposta com erros", "Answer has errors"),
    TECHNICAL_ERROR: L("Erro técnico", "Technical error"),
    INTERRUPTED: L("Interrompida", "Interrupted"),
    Running: L("Em execução", "Running"),
    Waiting: L("Aguardando", "Waiting"),
    Completed: L("Concluído", "Completed"),
    "Completed with errors": L(
      "Concluído com erros técnicos",
      "Completed with technical errors",
    ),
    Interrupted: L("Interrompido", "Interrupted"),
    "Quota error": L("Cota / faturamento", "Quota / billing error"),
    "Provider error": L("Erro do provedor", "Provider error"),
    "Rate limited": L("Limite temporário", "Rate limited"),
  })[v] || v;
export const stageLabel = (v) =>
  ({
    CALL_ERROR: L("Erro na solicitação", "Request error"),
    PREPARING: L("Preparando entradas", "Preparing inputs"),
    BUILDING_REQUEST: L("Construindo solicitação", "Building request"),
    WAITING_FOR_RESPONSE: L(
      "Aguardando resposta do provedor",
      "Waiting for provider response",
    ),
    RESPONSE_RECEIVED: L("Resposta recebida", "Response received"),
    VALIDATING_OUTPUT: L("Validando estrutura", "Validating output"),
    EVALUATING: L("Comparando com o gabarito", "Comparing with ground truth"),
    CALCULATING_METRICS: L("Calculando métricas", "Calculating metrics"),
    SAVING: L("Salvando resultado", "Saving result"),
  })[v] || statusLabel(v);
export const eventLabel = (v) =>
  ({
    RUN_CREATED: L("Avaliação registrada", "Run created"),
    RUN_STARTED: L("Avaliação iniciada", "Run started"),
    EXECUTION_QUEUED: L("Execução adicionada à fila", "Execution queued"),
    EXECUTION_STARTED: L("Preparação iniciada", "Execution started"),
    INPUT_PREPARED: L("Entradas preparadas", "Input prepared"),
    REQUEST_PREPARED: L("Solicitação preparada", "Request prepared"),
    API_REQUEST_SENT: L(
      "Solicitação enviada ao provedor",
      "Request sent to provider",
    ),
    API_RESPONSE_RECEIVED: L(
      "Resposta recebida do provedor",
      "Provider response received",
    ),
    API_ATTEMPT_FINISHED: L(
      "Tentativa de API encerrada",
      "API attempt finished",
    ),
    VALIDATION_STARTED: L("Validação iniciada", "Validation started"),
    OUTPUT_PARSED: L("JSON validado", "JSON validated"),
    EVALUATION_STARTED: L("Avaliação iniciada", "Evaluation started"),
    EVALUATION_COMPLETED: L("Comparação concluída", "Comparison completed"),
    SAVING_STARTED: L("Salvando resultado", "Saving result"),
    EXECUTION_COMPLETED: L("Resultado salvo", "Result saved"),
    EXECUTION_FAILED: L("Erro técnico registrado", "Technical error recorded"),
    EXECUTION_INTERRUPTED: L("Execução interrompida", "Execution interrupted"),
    METRICS_UPDATED: L("Métricas atualizadas", "Metrics updated"),
    RUN_STOP_REQUESTED: L(
      "Interrupção solicitada pelo usuário",
      "Stop requested by user",
    ),
    RUN_CANCELLED: L(
      "Avaliação interrompida pelo usuário",
      "Run stopped by user",
    ),
    RUN_RECOVERED: L(
      "Interrupção identificada ao reiniciar",
      "Interruption detected after restart",
    ),
    RUN_COMPLETED: L("Avaliação encerrada", "Run finished"),
  })[v] || v;
export const metricLabel = (v) =>
  ({
    entity_precision: L("Precisão de entidades", "Entity precision"),
    entity_recall: L("Recall de entidades", "Entity recall"),
    entity_f1: L("F1 de entidades", "Entity F1"),
    parameter_precision: L("Precisão de parâmetros", "Parameter precision"),
    parameter_recall: L("Recall de parâmetros", "Parameter recall"),
    parameter_f1: L("F1 de parâmetros", "Parameter F1"),
    relationship_precision: L("Precisão de relações", "Relationship precision"),
    relationship_recall: L("Recall de relações", "Relationship recall"),
    relationship_f1: L("F1 de relações", "Relationship F1"),
    impact_precision: L("Precisão de impactos", "Impact precision"),
    impact_recall: L("Recall de impactos", "Impact recall"),
    impact_f1: L("F1 de impactos", "Impact F1"),
    critical_impact_miss_rate: L(
      "Impactos críticos perdidos",
      "Critical miss rate",
    ),
    unsupported_relationship_rate: L(
      "Relações sem suporte",
      "Unsupported relationships",
    ),
    unsupported_fact_rate: L("Fatos sem suporte", "Unsupported facts"),
    unsupported_explanation_claim_rate: L(
      "Afirmações sem suporte",
      "Unsupported explanation claims",
    ),
    explanation_rule_pass_rate: L(
      "Explicações validadas",
      "Explanation rule pass rate",
    ),
    evidence_accuracy: L("Evidências válidas", "Evidence accuracy"),
    source_attribution_accuracy: L(
      "Atribuição de fontes",
      "Source attribution accuracy",
    ),
    value_accuracy: L("Valores corretos", "Value accuracy"),
    unit_accuracy: L("Unidades corretas", "Unit accuracy"),
    consistency: L("Consistência", "Consistency"),
  })[v] || v;
export const percent = (v) =>
  v == null
    ? "—"
    : `${(100 * v).toLocaleString(locale(), { maximumFractionDigits: 1 })}%`;
export const number = (v) =>
  v == null ? "—" : v.toLocaleString(locale(), { maximumFractionDigits: 1 });
export const stamp = (v) => (v ? new Date(v).toLocaleString(locale()) : "—");
export const elapsed = (from, to = Date.now()) =>
  from
    ? `${Math.max(0, Math.floor((new Date(to) - new Date(from)) / 1000))} s`
    : "—";
export const money = (v) =>
  v == null ? L("Indisponível", "Unavailable") : `$${v.toFixed(4)}`;
export const tone = (state) =>
  ["COMPLETED_CORRECT", "COMPLETED", "Completed"].includes(state)
    ? "good"
    : [
          "TECHNICAL_ERROR",
          "COMPLETED_INCORRECT",
          "COMPLETED_WITH_ERRORS",
          "Provider error",
          "Quota error",
          "Rate limited",
        ].includes(state)
      ? "bad"
      : ["RUNNING", "Running"].includes(state)
        ? "active"
        : "neutral";

export const issueLabel = (code) =>
  ({
    source_attribution: L(
      "Atribuição de fonte rejeitada",
      "Source attribution rejected",
    ),
    missing: L(
      "Item esperado não identificado",
      "Expected item not identified",
    ),
    extra: L("Item adicional incorreto", "Incorrect additional item"),
    correct_changed_element: L(
      "Elemento alterado incorreto",
      "Incorrect changed element",
    ),
    correct_dependency: L(
      "Dependência diferente da esperada",
      "Dependency differs from the reference",
    ),
    valid_evidence: L(
      "Citação inválida ou inadequada à dependência",
      "Citation is invalid or unrelated to the dependency",
    ),
    unsupported_structured_claims: L(
      "Alegação numérica rejeitada pela regra",
      "Numerical claim rejected by the rule",
    ),
    empty_explanation: L("Explicação ausente", "Missing explanation"),
  })[code] || code;

export const taskPurpose = (task) =>
  ({
    entity_extraction: L(
      "Extrai componentes, requisitos e valores dos documentos.",
      "Extracts components, requirements and values from documents.",
    ),
    relationship_extraction: L(
      "Identifica relações entre os itens de engenharia e suas evidências.",
      "Identifies engineering relationships and their evidence.",
    ),
    change_impact: L(
      "Pergunta quais requisitos precisam de revisão após cada mudança. Também exige dependência e evidências.",
      "Asks which requirements need review after each change. Dependencies and evidence are also required.",
    ),
    impact_explanation: L(
      "Uma chamada independente enfatiza a justificativa de cada impacto. Usa os mesmos documentos e cenários; não recebe a resposta do teste de Impactos.",
      "An independent call emphasizes the justification for each impact. It uses the same documents and scenarios; it does not receive the Impact analysis answer.",
    ),
    one_hop: L(
      "Avalia os cenários L2, inferindo o impacto a partir dos documentos.",
      "Evaluates L2 scenarios, inferring impact from the documents.",
    ),
  })[task] || task;
