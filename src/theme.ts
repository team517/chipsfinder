export type Theme = "light" | "dark";
const KEY = "chf-theme";

export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(t: Theme) {
  const el = document.documentElement;
  if (t === "light") el.setAttribute("data-theme", "light");
  else el.removeAttribute("data-theme");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", t === "light" ? "#f4f4f5" : "#101010");
}

export function setTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* almacenamiento bloqueado */
  }
  applyTheme(t);
}
