import React, { useState } from "react";
import { L } from "./i18n";
import { taskLabel, statusLabel } from "./liveLabels";
import { Modal } from "./ScreenUI";
export default function RetryControl({ api, run }) {
  const [open, setOpen] = useState(false),
    [plan, setPlan] = useState(null),
    [chosen, setChosen] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [model, setModel] = useState("");
  const list = (plan?.calls || []).filter((c) => !model || c.model === model);
  async function preview() {
    setOpen(true);
    setError("");
    setPlan(null);
    setChosen([]);
    try {
      setPlan(await api(`/live/${run.id}/retry`));
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <button onClick={preview}>
        {L("Selecionar novas tentativas", "Select new attempts")}
      </button>
      {open && (
        <Modal
          title={L(
            "Nova tentativa no mesmo estudo",
            "New attempt in the same study",
          )}
          onClose={() => !busy && setOpen(false)}
        >
          <p>
            {L(
              "Cada seleção gera uma nova chamada e pode consumir créditos. A resposta, a nota e o prompt anteriores permanecem no histórico. Nada é repetido automaticamente.",
              "Each selected test generates a new call and may consume credits. The previous response, score and prompt remain in history. Nothing is repeated automatically.",
            )}
          </p>
          {plan && (
            <>
              <p>
                {L("Protocolo atual", "Current protocol")}:{" "}
                {plan.dataset_version}.{" "}
                {L(
                  "Versões diferentes ficam identificadas; suas médias não são misturadas.",
                  "Different versions stay identified; their averages are not mixed.",
                )}
              </p>
              <div className="result-filters">
                <select
                  aria-label={L(
                    "Modelo para nova tentativa",
                    "Model for new attempt",
                  )}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  <option value="">
                    {L("Todos os modelos", "All models")}
                  </option>
                  {[...new Set(plan.calls.map((c) => c.model))].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    setChosen(
                      list
                        .filter((c) => c.status === "TECHNICAL_ERROR")
                        .map((c) => c.id),
                    )
                  }
                >
                  {L("Selecionar erros técnicos", "Select technical errors")}
                </button>
                <button
                  onClick={() =>
                    setChosen(
                      list
                        .filter((c) => c.status === "INTERRUPTED")
                        .map((c) => c.id),
                    )
                  }
                >
                  {L("Selecionar interrompidos", "Select interrupted")}
                </button>
                <button onClick={() => setChosen([])}>
                  {L("Limpar seleção", "Clear selection")}
                </button>
              </div>
              <div className="table-scroll retry-list">
                <table className="compact-results">
                  <thead>
                    <tr>
                      <th>{L("Selecionar", "Select")}</th>
                      <th>{L("Modelo", "Model")}</th>
                      <th>{L("Teste", "Test")}</th>
                      <th>Rep.</th>
                      <th>{L("Tentativa anterior", "Previous attempt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${c.model} ${taskLabel(c.task)} ${c.difficulty} Rep. ${c.repetition}`}
                            checked={chosen.includes(c.id)}
                            onChange={(e) =>
                              setChosen((a) =>
                                e.target.checked
                                  ? [...a, c.id]
                                  : a.filter((id) => id !== c.id),
                              )
                            }
                          />
                        </td>
                        <td>{c.model}</td>
                        <td>
                          {taskLabel(c.task)} · {c.difficulty.split("_")[0]}
                        </td>
                        <td>{c.repetition}</td>
                        <td>{statusLabel(c.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                {chosen.length} {L("testes selecionados", "selected tests")}
              </p>
              <button
                className="primary"
                disabled={!chosen.length || busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const r = await api(`/live/${run.id}/retry`, "POST", {
                      confirmed: true,
                      token: plan.token,
                      selected: chosen,
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
                  ? L("Validando…", "Validating…")
                  : L("Confirmar novas chamadas", "Confirm new calls")}
              </button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </>
  );
}
