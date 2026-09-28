import React from "react";
import { L } from "./i18n";
import { relationName } from "./resultPresentation";

// This is rejected, untrusted output: a malformed field must not break the inspector.
const label = (value) => (typeof value === "string" ? value : "—");

function canonical(value) {
  if (typeof value !== "string") return null;
  const id = value
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  const match = /^(REQ|CHG)-?(\d+)$/.exec(id);
  return match
    ? `${match[1]}-${String(Number(match[2])).padStart(3, "0")}`
    : id;
}

// Inspect the saved answer only. Never repair it, grade it, or replace its status.
export default function RejectedOutput({ detail }) {
  let output;
  try {
    output = JSON.parse(detail.call?.text || "");
  } catch {
    output = null;
  }
  const duplicates = [];
  if (
    detail.error === "invalid_structured_output" &&
    Array.isArray(output?.scenarios)
  ) {
    for (const scenario of output.scenarios) {
      const groups = new Map();
      if (!Array.isArray(scenario?.impacts)) continue;
      scenario.impacts.forEach((impact, index) => {
        const id = canonical(impact?.requirement_id);
        if (id)
          groups.set(id, [
            ...(groups.get(id) || []),
            { ...impact, position: index + 1 },
          ]);
      });
      for (const [id, entries] of groups)
        if (entries.length > 1)
          duplicates.push({ scenario: scenario.scenario_id, id, entries });
    }
  }
  if (!duplicates.length)
    return (
      <p className="inspector-empty">
        {detail.error === "invalid_structured_output" && detail.call?.text
          ? L(
              "A resposta recebida foi preservada, mas não passou na validação. Ela está disponível em Downloads técnicos e não contribui para as métricas de qualidade.",
              "The received response was preserved but did not pass validation. It is available in Technical downloads and does not contribute to quality metrics.",
            )
          : detail.error
            ? L(
                "Sem resposta avaliada. O diagnóstico acima registra a falha técnica.",
                "No evaluated response. The diagnostic above records the technical failure.",
              )
            : L(
                "Sem resposta avaliada. Nenhuma saída foi substituída pelo gabarito.",
                "No evaluated response. No output was substituted with ground truth.",
              )}
      </p>
    );
  return (
    <section className="rejected-output">
      <h3>{L("O que impediu a avaliação", "What prevented evaluation")}</h3>
      <p>
        {L(
          "A resposta contém mais de uma entrada para o mesmo requisito no mesmo cenário. A regra do benchmark exige uma entrada por requisito (duplicate_impact). As dependências abaixo vieram da resposta original; a duplicação é um problema de formato, não uma comparação com o gabarito.",
          "The response contains multiple entries for the same requirement in one scenario. The benchmark rule requires one entry per requirement (duplicate_impact). The dependencies below come from the original response; the duplication is a format issue, not a ground-truth comparison.",
        )}
      </p>
      {duplicates.map((group, index) => (
        <div key={index}>
          <h4 className="answer-bad">
            {label(group.scenario)} · {group.id} · {group.entries.length}{" "}
            {L(
              "entradas recebidas; esperado: 1",
              "entries received; expected: 1",
            )}
          </h4>
          <div className="table-scroll">
            <table className="compact-results">
              <thead>
                <tr>
                  {[
                    L("Posição", "Position"),
                    L("Origem", "Source"),
                    L("Relação recebida", "Received relationship"),
                    L("Destino", "Target"),
                  ].map((name) => (
                    <th key={name}>{name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.entries.map((item) => (
                  <tr key={item.position}>
                    <td>{item.position}</td>
                    <td>{label(item.dependency?.source)}</td>
                    <td>
                      {relationName(label(item.dependency?.relationship))}
                    </td>
                    <td>{label(item.dependency?.target)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p>
        {L(
          "Nenhuma entrada foi descartada ou corrigida automaticamente. A resposta e o erro original permanecem no histórico, sem nota de qualidade.",
          "No entry was discarded or automatically corrected. The response and original error remain in history, without a quality score.",
        )}
      </p>
      <p className="notice">
        {L(
          "Alterar o prompt não modifica esta resposta já recebida. Para testar a instrução atual, feche o inspetor e use Selecionar novas tentativas: escolha o modelo, a categoria e a repetição desta falha e confirme as novas chamadas. Isso consome créditos e preserva esta tentativa no histórico.",
          "Changing the prompt does not change this saved response. To test the current instruction, close the inspector and use Select new attempts: select the model, category and repetition of this failure, then confirm the new calls. This consumes credits and preserves this attempt in history.",
        )}
      </p>
    </section>
  );
}
