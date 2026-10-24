import type { Lang } from "./i18n";

const LANG_KEY = "chf-lang";

export function initialLang(): Lang {
  try {
    const l = localStorage.getItem(LANG_KEY);
    if (l === "es" || l === "en") return l;
  } catch {
    /* almacenamiento bloqueado */
  }
  return "es";
}

export function saveLang(code: Lang) {
  try {
    localStorage.setItem(LANG_KEY, code);
  } catch {
    /* almacenamiento bloqueado */
  }
}
