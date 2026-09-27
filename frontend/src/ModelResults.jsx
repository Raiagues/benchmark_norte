import React, { useEffect, useState } from "react";
import { Modal } from "./ScreenUI";
import { L } from "./i18n";
import { taskLabel, statusLabel } from "./liveLabels";

export default function ModelResults({
  calls,
  selection,
  api,
  onClose,
  renderDetail,
}) {
  const choices = [...new Set(calls.map((c) => `${c.task}|${c.difficulty}`))];
  const [task, setTask] = useState(selection.task || choices[0]);
  const [rep, setRep] = useState(selection.rep || 1);
  const [scenario, setScenario] = useState(selection.scenario || "");
  const [detail, setDetail] = useState(null),
    [error, setError] = useState("");
  const chosen = calls.find(
    (c) => `${c.task}|${c.difficulty}` === task && c.repetition === rep,
  );
  useEffect(() => {
    let current = true;
    setDetail(null);
    setError("");
    if (chosen)
      api(`/live-results/${chosen.id}`)
        .then((d) => current && setDetail(d))
        .catch((e) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [chosen?.id, chosen?.status, chosen?.stage]);
  return (
    <Modal
      title={calls[0]?.model || L("Resultados do modelo", "Model results")}
      onClose={onClose}
    >
      <div className="model-result-controls">
        <label>
          {L("Categoria de teste", "Test category")}
          <select
            aria-label={L("Categoria de teste", "Test category")}
            value={task}
            onChange={(e) => setTask(e.target.value)}
          >
            {choices.map((k) => (
              <option key={k} value={k}>
                {taskLabel(k.split("|")[0])} · {k.split("|")[1].split("_")[0]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {L("Repetição", "Repetition")}
          <select
            aria-label={L("Repetição do resultado", "Result repetition")}
            value={rep}
            onChange={(e) => setRep(Number(e.target.value))}
          >
            {[...new Set(calls.map((c) => c.repetition))]
              .sort((a, b) => a - b)
              .map((r) => {
                const c = calls.find(
                  (c) =>
                    c.repetition === r && `${c.task}|${c.difficulty}` === task,
                );
                return (
                  <option key={r} value={r}>
                    {r} · {statusLabel(c?.status || "QUEUED")}
                  </option>
                );
              })}
          </select>
        </label>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : detail ? (
        renderDetail(detail, scenario, setScenario)
      ) : (
        <p>
          {L("Carregando resposta preservada…", "Loading preserved response…")}
        </p>
      )}
    </Modal>
  );
}
