import React, { useState } from "react";
import { L } from "./i18n";
import { taskLabel, statusLabel, displayState } from "./liveLabels";
import { Modal } from "./ScreenUI";
const esc = (v) =>
  String(v ?? "—").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const color = (s) =>
  s === "correct"
    ? "#087d60"
    : s === "correct_bad_evidence"
      ? "#a16b00"
      : "#bd2245";
export function diagramSvg(detail, kind = "model") {
  const edges = (detail.comparison?.edges || []).filter((e) =>
    kind === "model" ? e.model_edge : e.ground_truth_edge,
  );
  const ids = [...new Set(edges.flatMap((e) => [e.key[0], e.key[2]]))],
    nodes =
      kind === "model"
        ? detail.result.parsed_output.nodes
        : detail.ground_truth.entities.nodes;
  const sources = [...new Set(edges.map((e) => e.key[0]))],
    targets = [...new Set(edges.map((e) => e.key[2]))];
  const height = Math.max(
    180,
    90 + Math.max(sources.length, targets.length) * 76,
  );
  const title = kind === "model" ? detail.model : L("Gabarito", "Reference");
  const blocks = (list, x) =>
    list
      .map(
        (id, i) =>
          `<rect x="${x}" y="${65 + i * 76}" width="225" height="46" rx="6" fill="#edf3fa" stroke="#839ab1"/><text x="${x + 9}" y="${84 + i * 76}" font-size="12">${esc(id)}</text><text x="${x + 9}" y="${101 + i * 76}" font-size="10">${esc((nodes?.find((n) => n.id === id)?.name || "").slice(0, 34))}</text>`,
      )
      .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="${height}" viewBox="0 0 900 ${height}" role="img" aria-label="${esc(title)}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial,sans-serif" fill="#13263a"><text x="20" y="25" font-size="17">${esc(title)} · ${esc(taskLabel(detail.task))} · Rep. ${detail.repetition}</text><text x="20" y="45" font-size="10">${esc(L("Verde: correto · amarelo: evidência parcial · vermelho: ausente / incorreto", "Green: correct · yellow: partial evidence · red: missing / incorrect"))}</text>${edges
    .map((e) => {
      const y1 = 88 + sources.indexOf(e.key[0]) * 76,
        y2 = 88 + targets.indexOf(e.key[2]) * 76,
        c = color(e.status);
      return `<path d="M245 ${y1} C405 ${y1},475 ${y2},635 ${y2}" stroke="${c}" fill="none" stroke-width="2"/><polygon points="635,${y2} 626,${y2 - 4} 626,${y2 + 4}" fill="${c}"/><text x="355" y="${(y1 + y2) / 2 - 4}" font-size="10" fill="${c}">${esc(e.key[1])}</text>`;
    })
    .join(
      "",
    )}${blocks(sources, 20)}${blocks(targets, 635)}${!ids.length ? `<text x="20" y="90">${esc(L("Nenhuma relação neste filtro", "No relationships in this filter"))}</text>` : ""}</g></svg>`;
}
export function downloadDiagram(d, kind) {
  const u = URL.createObjectURL(
      new Blob([diagramSvg(d, kind)], { type: "image/svg+xml" }),
    ),
    a = document.createElement("a");
  a.href = u;
  a.download = `${d.id}-${kind}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function table(head, rows) {
  return `<table><thead><tr>${head.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function reportDetail(d) {
  const o = d.result?.parsed_output || {},
    m = d.result?.metrics || {};
  let body = "";
  if (d.comparison) {
    body += `<div class="graphs">${diagramSvg(d, "model")}${diagramSvg(d, "reference")}</div>`;
    body += table(
      [
        L("Origem", "Source"),
        L("Relação", "Relationship"),
        L("Destino", "Target"),
        L("Modelo", "Model"),
        L("Esperado", "Expected"),
        L("Avaliação", "Evaluation"),
      ],
      d.comparison.edges.map((e) => [
        ...e.key,
        e.model_edge?.reason || "—",
        e.ground_truth_edge?.reason || "—",
        e.status,
      ]),
    );
  }
  for (const s of d.inspection || [])
    body +=
      `<h3>${esc(s.id)}</h3><p>${esc(s.description)}</p>` +
      table(
        [
          L("Requisito", "Requirement"),
          L("Modelo: impacto", "Model: impact"),
          L("Esperado: impacto", "Expected: impact"),
          L("Diferenças", "Differences"),
        ],
        s.rows.map((r) => [
          `${r.requirement_id}: ${r.requirement_text}`,
          r.predicted_affected ? "✓" : "—",
          r.expected_affected ? "✓" : "—",
          r.issues.join(" · ") || "✓",
        ]),
      );
  if (o.parameters)
    body += table(
      ["ID", L("Modelo", "Model"), L("Esperado", "Expected")],
      o.parameters.map((p) => {
        const ref = d.ground_truth?.entities?.parameters?.find(
          (e) => e.id === p.id,
        );
        return [
          p.id,
          `${p.values?.join(" – ")} ${p.unit}`,
          ref ? `${ref.values?.join(" – ")} ${ref.unit}` : "—",
        ];
      }),
    );
  if (o.nodes)
    body += table(
      [
        "ID",
        L("Nome declarado", "Declared name"),
        L("Tipo", "Type"),
        L("Fonte declarada", "Declared source"),
      ],
      o.nodes.map((n) => [
        n.id,
        n.name,
        n.type,
        `${n.source || ""} ${n.source_reference || ""}`,
      ]),
    );
  const metricRows = Object.entries(m)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => [k, v]);
  body += table(
    [L("Métrica salva", "Stored metric"), L("Valor", "Value")],
    metricRows,
  );
  return `<section class="result"><h2>${esc(d.model)} · ${esc(taskLabel(d.task))} · ${esc(d.difficulty)} · Rep. ${d.repetition}</h2><p>${esc(statusLabel(displayState(d)))} · ${esc(d.result?.latency_seconds)} s</p><p>Run ${esc(d.run_id)} · ${esc(d.id)}<br/>Dataset ${esc(d.snapshot_metadata.dataset_version)} · ${esc(d.snapshot_metadata.dataset_hash)}<br/>Prompt ${esc(d.prompt_hash)}</p>${body}</section>`;
}
export default function ResultExport({ api, run }) {
  const [open, setOpen] = useState(false),
    [selected, setSelected] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const calls = run.calls.filter((c) => c.has_result);
  async function exportPdf() {
    const win = window.open("", "_blank");
    if (!win) {
      setError(
        L(
          "Permita a janela do relatório no navegador.",
          "Allow the report window in your browser.",
        ),
      );
      return;
    }
    win.opener = null;
    win.document.body.textContent = L(
      "Preparando relatório…",
      "Preparing report…",
    );
    setBusy(true);
    try {
      const data = await Promise.all(
        selected.map((id) => api(`/live-results/${id}`)),
      );
      win.document.open();
      win.document.write(
        `<!doctype html><html><head><meta charset="utf-8"><title>Norte · ${esc(run.id)}</title><style>body{font:13px Arial;color:#142333;margin:30px}table{width:100%;border-collapse:collapse;margin:16px 0;font-size:11px}td,th{border:1px solid #bcc8d4;padding:7px;text-align:left;overflow-wrap:anywhere}th{background:#edf3fa}svg{max-width:100%;height:auto}.result{break-before:page}.graphs{display:grid;grid-template-columns:1fr 1fr}h2,h3{break-after:avoid}tr{break-inside:avoid}@media print{button{display:none}body{margin:0}@page{size:A4 landscape;margin:12mm}}</style></head><body><button id="print">${esc(L("Imprimir / salvar como PDF", "Print / save as PDF"))}</button><h1>Norte · ${esc(L("Resultados selecionados", "Selected results"))}</h1><p>${esc(run.id)} · ${data.length} ${esc(L("respostas preservadas", "preserved responses"))}</p><p>${esc(L("Cada resultado mantém sua versão e referência. Não são somadas médias de protocolos diferentes. Este relatório não executa modelos.", "Each result retains its version and reference. Means from different protocols are not combined. This report does not execute models."))}</p>${data.map(reportDetail).join("")}</body></html>`,
      );
      win.document.close();
      win.document.getElementById("print").onclick = () => win.print();
      setOpen(false);
    } catch (e) {
      win.close();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        disabled={!calls.length}
        onClick={() => {
          setOpen(true);
          setSelected([]);
          setError("");
        }}
      >
        {L("Exportar resultados", "Export results")}
      </button>
      {open && (
        <Modal
          title={L("Selecionar resultados para PDF", "Select results for PDF")}
          onClose={() => !busy && setOpen(false)}
        >
          <p>
            {L(
              "O relatório inclui tabelas e diagramas disponíveis. Use Imprimir / salvar como PDF na janela aberta.",
              "The report includes available tables and diagrams. Use Print / save as PDF in the report window.",
            )}
          </p>
          <button onClick={() => setSelected(calls.map((c) => c.id))}>
            {L("Selecionar todas as respostas", "Select all responses")}
          </button>
          <div className="retry-list">
            {calls.map((c) => (
              <label className="export-choice" key={c.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={(e) =>
                    setSelected((a) =>
                      e.target.checked
                        ? [...a, c.id]
                        : a.filter((v) => v !== c.id),
                    )
                  }
                />
                {c.model} · {taskLabel(c.task)} · {c.difficulty.split("_")[0]} ·
                Rep. {c.repetition}
              </label>
            ))}
          </div>
          <button
            disabled={!selected.length || busy}
            className="primary"
            onClick={exportPdf}
          >
            {L("Abrir relatório", "Open report")} ({selected.length})
          </button>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </>
  );
}
