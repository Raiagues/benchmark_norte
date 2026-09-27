import React, { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { L } from "./i18n";
GlobalWorkerOptions.workerSrc = worker;
export default function PdfViewer({ source, onDownload, downloading }) {
  const canvas = useRef(null),
    [doc, setDoc] = useState(null),
    [page, setPage] = useState(1),
    [zoom, setZoom] = useState(1),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const url = `/api/sources/${encodeURIComponent(source.document_id)}/pdf`;
  useEffect(() => {
    let mounted = true;
    setDoc(null);
    setPage(1);
    setError("");
    setLoading(true);
    if (!source.available) {
      setLoading(false);
      return;
    }
    const job = getDocument({ url, isEvalSupported: false });
    job.promise
      .then((d) => {
        if (mounted) setDoc(d);
      })
      .catch(
        () =>
          mounted &&
          setError(
            L(
              "Não foi possível renderizar o PDF. Use o leitor do navegador abaixo.",
              "PDF rendering failed. Use the browser viewer below.",
            ),
          ),
      )
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
      // Navigation can terminate the worker before loading finishes. This is
      // cleanup, not a document error; don't leave its rejected promise unhandled.
      job.destroy().catch(() => {});
    };
  }, [source.document_id, source.available]);
  useEffect(() => {
    if (!doc) return;
    let mounted = true,
      render;
    doc
      .getPage(page)
      .then(async (p) => {
        if (!mounted) return;
        const viewport = p.getViewport({ scale: zoom * 1.1 }),
          node = canvas.current,
          ratio = window.devicePixelRatio || 1;
        node.width = viewport.width * ratio;
        node.height = viewport.height * ratio;
        node.style.width = `${viewport.width}px`;
        node.style.height = `${viewport.height}px`;
        render = p.render({
          canvasContext: node.getContext("2d"),
          viewport,
          transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0],
        });
        await render.promise;
        const content = await p.getTextContent();
        if (mounted) setText(content.items.map((i) => i.str).join(" "));
      })
      .catch((e) => {
        if (mounted && e.name !== "RenderingCancelledException")
          setError(
            L("Falha ao desenhar esta página.", "Could not render this page."),
          );
      });
    return () => {
      mounted = false;
      render?.cancel();
    };
  }, [doc, page, zoom]);
  if (!source.available)
    return (
      <div className="product-empty">
        <h3>
          {L(
            "PDF original não disponível localmente",
            "Original PDF not available locally",
          )}
        </h3>
        <p>
          {L(
            "Os fatos normalizados continuam disponíveis. O PDF do fabricante é uma fonte separada.",
            "Normalized facts remain available. The manufacturer PDF is a separate source.",
          )}
        </p>
        <button className="primary" disabled={downloading} onClick={onDownload}>
          {downloading
            ? L("Obtendo PDF…", "Downloading PDF…")
            : L(
                "Obter PDF oficial para uso local",
                "Get official PDF for local use",
              )}
        </button>
        <p className="muted">
          {L(
            "Cópia privada fora do Git. Nenhum documento é enviado a modelos nesta ação.",
            "Private local copy, excluded from Git. This action does not send documents to models.",
          )}
        </p>
        <a
          className="button"
          href={source.official_datasheet_url}
          target="_blank"
          rel="noreferrer"
        >
          {L("Abrir fonte oficial", "Open official source")} ↗
        </a>
      </div>
    );
  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <button
          disabled={!doc || page === 1}
          aria-label={L("Página anterior do PDF", "Previous PDF page")}
          onClick={() => setPage((p) => p - 1)}
        >
          ←
        </button>
        <label>
          {L("Página", "Page")}
          <input
            aria-label={L("Página do PDF", "PDF page")}
            type="number"
            min="1"
            max={doc?.numPages || 1}
            value={page}
            onChange={(e) =>
              setPage(
                Math.max(
                  1,
                  Math.min(doc?.numPages || 1, Number(e.target.value)),
                ),
              )
            }
          />
        </label>
        <span>/ {doc?.numPages || source.pages || "—"}</span>
        <button
          disabled={!doc || page === doc.numPages}
          aria-label={L("Próxima página do PDF", "Next PDF page")}
          onClick={() => setPage((p) => p + 1)}
        >
          →
        </button>
        <label>
          Zoom
          <select
            aria-label="Zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[0.6, 0.8, 1, 1.25, 1.5, 2].map((z) => (
              <option key={z} value={z}>
                {z * 100}%
              </option>
            ))}
          </select>
        </label>
        <a href={url} target="_blank" rel="noreferrer">
          {L("Leitor do navegador", "Browser viewer")} ↗
        </a>
      </div>
      {loading && <p>{L("Abrindo PDF original…", "Opening original PDF…")}</p>}
      {error ? (
        <>
          <p role="alert">{error}</p>
          <iframe
            title={L(
              "PDF original no leitor do navegador",
              "Original PDF in browser viewer",
            )}
            src={`${url}#page=${page}&zoom=${zoom * 100}`}
            className="pdf-fallback"
          />
        </>
      ) : (
        <div className="pdf-canvas-wrap">
          <canvas
            ref={canvas}
            aria-label={`${source.part_number} · ${L("página", "page")} ${page}`}
            role="img"
          />
        </div>
      )}
      <details className="quiet-details">
        <summary>
          {L(
            "Texto acessível desta página do PDF",
            "Accessible text from this PDF page",
          )}
        </summary>
        <p lang="en">
          {text ||
            L(
              "Sem texto extraível nesta página.",
              "No extractable text on this page.",
            )}
        </p>
      </details>
    </div>
  );
}
