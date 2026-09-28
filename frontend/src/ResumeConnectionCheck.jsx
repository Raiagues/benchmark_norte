import React, { useEffect, useState } from "react";
import { L, locale } from "./i18n";

// Opening this panel only reads local validation. Only the button calls a provider.
export default function ResumeConnectionCheck({
  api,
  models,
  busy,
  onBusy,
  onReady,
}) {
  const [selection, setSelection] = useState(null),
    [checks, setChecks] = useState([]),
    [error, setError] = useState("");
  const modelKey = JSON.stringify(models);
  useEffect(() => {
    let active = true;
    setSelection(null);
    setChecks([]);
    setError("");
    async function load() {
      const config = await api("/config");
      const indices = [],
        depths = {};
      for (const model of models) {
        const index = config.models.findIndex(
          (m) => m.provider === model.provider && m.model === model.model,
        );
        if (
          index < 0 ||
          (indices.includes(index) && depths[index] !== model.depth)
        )
          throw new Error(
            L(
              "A configuração histórica requer revisão em Nova avaliação.",
              "Review the historical configuration in New evaluation.",
            ),
          );
        if (!indices.includes(index)) indices.push(index);
        if (model.depth) depths[index] = model.depth;
      }
      if (!indices.length) return;
      const body = { models: indices, depths };
      const statuses = await api("/connections/status", "POST", body);
      if (active) {
        setSelection(body);
        setChecks(statuses);
      }
    }
    load().catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [modelKey]);
  const ready = checks.length > 0 && checks.every((c) => c.ready);
  return (
    <section
      className="resume-protocol"
      aria-label={L("Validação da conexão", "Connection validation")}
    >
      <strong>
        {L("Conexão antes de retomar", "Connection before resuming")}
      </strong>
      <p>
        {L(
          "Este é o estado da última verificação, não uma consulta ao saldo atual. Após recarregar créditos, verifique a conexão novamente.",
          "This is the last check's status, not a current balance lookup. After adding credits, check the connection again.",
        )}
      </p>
      {checks.map((c) => (
        <p
          key={`${c.provider}|${c.model}`}
          className={c.ready ? "answer-good" : "answer-warn"}
        >
          <strong>{c.model}</strong> ·{" "}
          {c.ready
            ? L("Conexão confirmada", "Connection confirmed")
            : L("Requer nova verificação", "Needs a new check")}
          {c.checked_at && (
            <small>
              {L("Última resposta", "Last response")}:{" "}
              {new Date(c.checked_at).toLocaleString(locale())}
            </small>
          )}
          {!c.ready && c.diagnostic?.detail && (
            <small>{c.diagnostic.detail}</small>
          )}
        </p>
      ))}
      {error && (
        <p role="alert" className="answer-bad">
          {error}
        </p>
      )}
      {ready ? (
        <p className="answer-good" role="status">
          {L(
            "Conexão confirmada. Use Confirmar retomada quando quiser iniciar os pendentes.",
            "Connection confirmed. Use Confirm resume when you want to start pending work.",
          )}
        </p>
      ) : (
        <>
          <p>
            {L(
              "O botão envia uma chamada curta por modelo ainda não confirmado e pode consumir tokens. Não inicia nem repete testes. Durante outra avaliação, a verificação fica bloqueada.",
              "The button sends a short call per unconfirmed model and may consume tokens. It does not start or repeat tests. Verification is blocked while another benchmark is running.",
            )}
          </p>
          <button
            disabled={busy || !selection}
            onClick={async () => {
              onBusy(true);
              setError("");
              try {
                const result = await api("/connections/verify", "POST", {
                  ...selection,
                  force: false,
                });
                setChecks(result.checks);
                if (result.checks.length && result.checks.every((c) => c.ready))
                  onReady();
                else if (result.message) setError(result.message);
              } catch (e) {
                setError(e.message);
              } finally {
                onBusy(false);
              }
            }}
          >
            {busy
              ? L("Verificando…", "Checking…")
              : L("Verificar conexão novamente", "Check connection again")}
          </button>
        </>
      )}
    </section>
  );
}
