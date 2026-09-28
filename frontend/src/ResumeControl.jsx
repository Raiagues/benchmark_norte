import React, { useEffect, useState } from "react";
import { L } from "./i18n";
import { Modal } from "./ScreenUI";
import ResumeConnectionCheck from "./ResumeConnectionCheck";
export default function ResumeControl({ api, run }) {
  const [plan, setPlan] = useState(null),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setPlan(null);
    setError("");
    api(`/live/${run.id}/resume`)
      .then((p) => active && setPlan(p))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [run.id]);
  return (
    <div className="resume-control">
      {plan?.children?.map((c) => (
        <a className="button" key={c.id} href={`#live/${c.id}`}>
          {L("Abrir continuação", "Open continuation")} →
        </a>
      ))}
      <button
        className="button resume-button"
        disabled={!plan?.eligible}
        title={
          plan?.uncertain
            ? L(
                "Chamadas com envio incerto não serão repetidas.",
                "Calls with uncertain dispatch will not be repeated.",
              )
            : undefined
        }
        onClick={() => setOpen(true)}
      >
        {L("Retomar pendentes", "Resume pending")}
        {plan ? ` · ${plan.eligible}` : ""}
      </button>
      {error && !open && (
        <small role="alert" className="answer-bad">
          {error}
        </small>
      )}
      {open && (
        <Modal
          title={L(
            "Retomar apenas o que não foi enviado",
            "Resume only work that was never sent",
          )}
          onClose={() => !busy && setOpen(false)}
        >
          <div className="resume-summary">
            <strong>
              {plan.eligible} {L("chamadas pendentes", "pending calls")}
            </strong>
            <p>
              {plan.completed_preserved}{" "}
              {L(
                "respostas concluídas serão preservadas, inclusive as incorretas. Nenhuma será repetida.",
                "completed responses will be preserved, including incorrect answers. None will be repeated.",
              )}
            </p>
            {plan.uncertain > 0 && (
              <p className="resume-warning">
                {plan.uncertain}{" "}
                {L(
                  "chamadas têm envio anterior incerto ou já registrado. Elas ficam excluídas para evitar repetição e cobrança duplicada.",
                  "calls have uncertain or recorded prior dispatch. They are excluded to avoid repetition and duplicate charges.",
                )}
              </p>
            )}
            <ul>
              {plan.models.map((m) => (
                <li key={m.provider + m.model + m.depth}>
                  <strong>{m.model}</strong> · {m.calls}{" "}
                  {L("chamadas", "calls")} · {m.depth}
                </li>
              ))}
            </ul>
            <div className="resume-protocol">
              <strong>
                {L("Versão desta continuação", "Continuation version")}:{" "}
                {plan.dataset_version}
              </strong>
              <p>
                {plan.context_changed
                  ? L(
                      "O protocolo mudou desde a execução original. Os pendentes usarão os PDFs e as instruções atuais, sem as pistas antigas. Os resultados ficam em um grupo separado, vinculado ao histórico.",
                      "The protocol has changed since the original run. Pending work uses the current PDFs and instructions, without the old hints. Results stay in a separate group linked to the history.",
                    )
                  : L(
                      "A continuação cria registros vinculados. Os registros originais permanecem intactos.",
                      "Continuation creates linked records. Original records remain intact.",
                    )}
              </p>
            </div>
            <p>
              {L(
                "Todas as conexões necessárias serão conferidas localmente antes de começar. As chamadas retomadas consomem créditos.",
                "All required connections are checked locally before starting. Resumed requests consume credits.",
              )}
            </p>
            {error && (
              <p role="alert" className="answer-bad">
                {error}
              </p>
            )}
            <ResumeConnectionCheck
              api={api}
              models={plan.models}
              busy={busy}
              onBusy={setBusy}
              onReady={() => setError("")}
            />
            <div className="inline-actions">
              <button disabled={busy} onClick={() => setOpen(false)}>
                {L("Voltar", "Back")}
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const r = await api(`/live/${run.id}/resume`, "POST", {
                      confirmed: true,
                      token: plan.token,
                    });
                    setOpen(false);
                    location.hash = `live/${r.batch_id}`;
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? L("Preparando…", "Preparing…")
                  : L("Confirmar retomada", "Confirm resume")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
