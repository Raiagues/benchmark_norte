// Interface language never changes benchmark documents, prompts, or model responses.
import translations from "./translations.json";
import messages from "./messages.json";
let language = localStorage.getItem("norte-language") === "en" ? "en" : "pt";
export const getLanguage = () => language;
export const locale = () => (language === "en" ? "en-US" : "pt-BR");
export function setLanguage(value) {
  language = value === "en" ? "en" : "pt";
  localStorage.setItem("norte-language", language);
  document.documentElement.lang = locale();
}
export const L = (pt, en) => (language === "en" ? en : pt);
export function t(value) {
  if (typeof value !== "string") return value;
  if (messages[value]) return messages[value][language];
  if (language === "pt") return value;
  if (translations[value]) return translations[value];
  // Whitespace around inline JSX text is meaningful.
  const key = value.trim();
  return translations[key] ? value.replace(key, translations[key]) : value;
}
