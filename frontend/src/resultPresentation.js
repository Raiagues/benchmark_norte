import { L } from "./i18n";
export const relationName = (v) =>
  ({
    has_parameter: L("tem parâmetro", "has parameter"),
    depends_on: L("depende de", "depends on"),
    constrains: L("estabelece limite para", "constrains"),
    verified_by: L("é verificado por", "is verified by"),
  })[v] || v;
export const relationMeaning = (v) =>
  ({
    has_parameter: L(
      "Associa um componente à sua característica técnica.",
      "Associates a component with a technical characteristic.",
    ),
    depends_on: L(
      "Indica uma dependência; não declara um limite para o valor.",
      "Indicates a dependency; it does not specify a limit for the value.",
    ),
    constrains: L(
      "O requisito estabelece um limite ou condição para este parâmetro.",
      "The requirement sets a limit or condition for this parameter.",
    ),
    verified_by: L(
      "Associa o requisito à verificação prevista.",
      "Associates the requirement with its planned verification.",
    ),
  })[v] || v;
export const rowStatus = (row) =>
  row.status === "correct"
    ? "correct"
    : row.decision_correct
      ? "partial"
      : "incorrect";
export const statusText = (v) =>
  ({
    correct: L("Correto", "Correct"),
    partial: L("Parcial", "Partial"),
    incorrect: L("Incorreto", "Incorrect"),
    unknown: L("Não avaliado", "Not evaluated"),
  })[v] || v;
export const statusClass = (v) =>
  ({ correct: "answer-good", partial: "answer-warn", incorrect: "answer-bad" })[
    v
  ] || "muted";
export function itemName(d, id) {
  const n =
    d.ground_truth?.entities?.nodes?.find((n) => n.id === id) ||
    d.result?.parsed_output?.nodes?.find((n) => n.id === id);
  return n?.name ? `${id} · ${n.name}` : id || "—";
}
