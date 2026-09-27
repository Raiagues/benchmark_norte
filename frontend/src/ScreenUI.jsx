import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
import { L } from "./i18n";
import Icon from "./Icon";

export function Tabs({ value, onChange, items, label }) {
  return (
    <nav className="screen-tabs" aria-label={label}>
      {items.map(([id, text]) => (
        <button
          type="button"
          key={id}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </nav>
  );
}
export function Pager({ index, count, onChange, label }) {
  return (
    <div className="pager" aria-label={label || L("Paginação", "Pagination")}>
      <button
        type="button"
        disabled={index <= 0}
        onClick={() => onChange(index - 1)}
        aria-label={L("Anterior", "Previous")}
      >
        ←
      </button>
      <span aria-live="polite">
        {count ? index + 1 : 0} / {count}
      </span>
      <button
        type="button"
        disabled={index >= count - 1}
        onClick={() => onChange(index + 1)}
        aria-label={L("Próximo", "Next")}
      >
        →
      </button>
    </div>
  );
}
export function PagedItems({ items, children, resetKey, size = 1 }) {
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [resetKey]);
  const count = Math.ceil(items.length / size),
    current = Math.min(page, Math.max(0, count - 1));
  return (
    <div className="paged-items">
      <div className="paged-items-content">
        {items.slice(current * size, (current + 1) * size).map(children)}
      </div>
      <Pager index={current} count={count} onChange={setPage} />
    </div>
  );
}
// Exact original text, split into reading pages; no truncation or summarization.
export function PagedText({ text = "", label }) {
  const area = useRef(null),
    [size, setSize] = useState({ width: 0, height: 0 }),
    [chunks, setChunks] = useState([]),
    [index, setIndex] = useState(0);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((old) =>
        old.width === width && old.height === height ? old : { width, height },
      );
    });
    observer.observe(area.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!size.width || !size.height) return;
    const measure = document.createElement("pre");
    Object.assign(measure.style, {
      position: "fixed",
      visibility: "hidden",
      pointerEvents: "none",
      left: "0",
      top: "0",
      width: `${size.width}px`,
      height: "auto",
      maxHeight: "none",
      margin: "0",
      padding: "16px",
      boxSizing: "border-box",
      border: "0",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      wordBreak: "normal",
      font: "12px/21px ui-monospace,SFMono-Regular,Consolas,monospace",
    });
    document.body.appendChild(measure);
    const pages = [];
    for (let start = 0; start < text.length; ) {
      let lo = 1,
        hi = Math.min(
          text.length - start,
          Math.max(100, Math.ceil((size.width * size.height) / 90)),
        ),
        best = 1;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        measure.textContent = text.slice(start, start + mid);
        if (measure.getBoundingClientRect().height <= size.height - 2) {
          best = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      // Keep complete lines together when doing so leaves at least half a page.
      const newline = text.lastIndexOf("\n", start + best - 1);
      if (start + best < text.length && newline > start + best / 2)
        best = newline + 1 - start;
      pages.push(text.slice(start, start + best));
      start += best;
    }
    measure.remove();
    setChunks(pages);
    setIndex(0);
  }, [text, size]);
  const page = Math.min(index, Math.max(0, chunks.length - 1));
  return (
    <div className="paged-text" aria-label={label}>
      <div className="paged-text-area" ref={area}>
        <pre lang="en" data-source-content>
          {chunks[page] || "—"}
        </pre>
      </div>
      <Pager index={page} count={chunks.length} onChange={setIndex} />
    </div>
  );
}

export function Modal({ title, children, onClose }) {
  const dialog = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.current.contains(document.activeElement))
      dialog.current.querySelector("button")?.focus();
    const handler = (e) => {
      const dialogs = document.querySelectorAll("[aria-modal=true]");
      if (dialogs[dialogs.length - 1] !== dialog.current) return;
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const fields = [
          ...dialog.current.querySelectorAll(
            "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]",
          ),
        ];
        const first = fields[0],
          last = fields[fields.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", handler);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="workbench-dialog"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={L("Fechar", "Close")}
          >
            <Icon name="close" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function MetricGrid({ children }) {
  const [compact, setCompact] = useState(() => window.innerWidth < 800),
    [page, setPage] = useState(0);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 800px)");
    const update = () => {
      setCompact(query.matches);
      setPage(0);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const cards = React.Children.toArray(children),
    size = compact ? 2 : cards.length;
  return (
    <div className="metric-pages">
      <div className="chart-grid">
        {cards.slice(page * size, (page + 1) * size)}
      </div>
      {compact && (
        <Pager
          index={page}
          count={Math.ceil(cards.length / size)}
          onChange={setPage}
          label={L("Páginas de métricas", "Metric pages")}
        />
      )}
    </div>
  );
}

export function DetailButton({ label, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="detail-button"
        onClick={() => setOpen(true)}
      >
        {label} ↗
      </button>
      {open && (
        <Modal title={label} onClose={() => setOpen(false)}>
          {children}
        </Modal>
      )}
    </>
  );
}
