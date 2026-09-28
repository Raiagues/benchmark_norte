import React, { useEffect, useState } from "react";
import { L } from "./i18n";
const labels = () => ({
  agree: L("Concordo com a avaliação", "Agree with evaluation"),
  disagree: L("Discordo da avaliação", "Disagree with evaluation"),
  prompt_suggestion: L("Sugestão para o prompt", "Prompt suggestion"),
  too_verbose: L("Resposta longa demais", "Response too long"),
  note: L("Observação", "Note"),
});
export default function ResultReview({ detail, target = "execution" }) {
  const [items, setItems] = useState([]),
    [verdict, setVerdict] = useState("note"),
    [comment, setComment] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/result-reviews/${detail.id}`)
      .then((r) => {
        if (!r.ok)
          throw new Error(
            L("Não foi possível carregar revisões.", "Could not load reviews."),
          );
        return r.json();
      })
      .then((v) => active && setItems(v))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [detail.id]);
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/result-reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Norte-Client": "local-ui",
        },
        body: JSON.stringify({
          result_id: detail.id,
          target,
          verdict,
          comment,
        }),
      });
      const v = await r.json();
      if (!r.ok)
        throw new Error(
          typeof v.detail === "string"
            ? v.detail
            : L("Falha ao salvar revisão.", "Could not save review."),
        );
      setItems((a) => [...a, v]);
      setComment("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  if (!detail.result) return null;
  return (
    <details className="result-review">
      <summary>
        {L("Revisão humana", "Human review")} · {target} (
        {items.filter((i) => i.target === target).length})
      </summary>
      <p>
        {L(
          "Sua observação é salva separadamente. Não altera o gabarito, o prompt nem a nota desta execução.",
          "Your note is saved separately. It does not change this execution’s reference, prompt or score.",
        )}
      </p>
      {items
        .filter((i) => i.target === target)
        .map((i) => (
          <blockquote key={i.id}>
            <b>{labels()[i.verdict] || i.verdict}</b>
            <p>{i.comment}</p>
            <small>{i.created_at}</small>
          </blockquote>
        ))}
      <form onSubmit={save}>
        <label>
          {L("Tipo de revisão", "Review type")}
          <select
            aria-label={L("Tipo de revisão", "Review type")}
            value={verdict}
            onChange={(e) => setVerdict(e.target.value)}
          >
            {Object.entries(labels()).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          {L("Comentário ou sugestão", "Comment or suggestion")}
          <textarea
            aria-label={L("Comentário ou sugestão", "Comment or suggestion")}
            required
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        <button type="submit" disabled={saving || !comment.trim()}>
          {saving
            ? L("Salvando…", "Saving…")
            : L("Salvar revisão", "Save review")}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
