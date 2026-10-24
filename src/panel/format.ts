import type { Lang } from "../i18n";

/** Texto en los dos idiomas: [es, en] */
export type Tr = readonly [string, string];

export const tr = (t: Tr, lang: Lang) => (lang === "es" ? t[0] : t[1]);

const locale = (lang: Lang) => (lang === "es" ? "es-ES" : "en-GB");

export function money(v: unknown, lang: Lang): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(locale(lang), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(n);
}

export function num(v: unknown, lang: Lang): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? new Intl.NumberFormat(locale(lang)).format(n) : "—";
}

export function date(v: unknown, lang: Lang): string {
  if (!v || typeof v !== "string") return "—";
  const d = new Date(v.length === 10 ? v + "T00:00:00" : v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale(lang), { day: "2-digit", month: "short", year: "numeric" });
}

export function pedidoCode(n: unknown): string {
  return n === null || n === undefined ? "—" : "PED-" + String(n).padStart(4, "0");
}

export function text(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s ? s : "—";
}
