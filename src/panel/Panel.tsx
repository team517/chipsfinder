import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Lang } from "../i18n";
import { initialLang, saveLang } from "../lang";
import { getTheme, setTheme, type Theme } from "../theme";
import { roleOf, supabase } from "../auth";
import { ENTITIES, NAV, SECTION_CODE, SECTION_TITLE, type EntityId, type SectionId } from "./entities";
import EntityPage from "./EntityPage";
import Home from "./Home";
import TeamPage from "./TeamPage";
import Account from "./Account";
import Pedidos from "./Pedidos";
import Proveedores from "./Proveedores";
import Referencias from "./Referencias";
import Tareas, { contarTareas } from "./Tareas";
import Unibox from "./Unibox";
import ErrorBoundary from "./ErrorBoundary";
import { listUsers } from "./team";
import { tr, type Tr } from "./format";

const C = {
  panel: ["Panel interno", "Internal dashboard"] as Tr,
  menu: ["Menú", "Menu"] as Tr,
  close: ["Cerrar menú", "Close menu"] as Tr,
  logout: ["Cerrar sesión", "Sign out"] as Tr,
  admin: ["Administrador", "Administrator"] as Tr,
  team: ["Equipo", "Team"] as Tr,
  lang: ["Idioma", "Language"] as Tr,
  main: ["Secciones", "Sections"] as Tr,
  toLight: ["Modo claro", "Light mode"] as Tr,
  toDark: ["Modo oscuro", "Dark mode"] as Tr,
  adminGroup: ["Administración", "Administration"] as Tr,
  comunicacion: ["Comunicación", "Comms"] as Tr,
  unibox: ["Unibox", "Unibox"] as Tr,
  equipo: ["Equipo", "Team"] as Tr,
  account: ["Mi cuenta", "My account"] as Tr,
  seguimiento: ["Seguimiento", "Follow-up"] as Tr,
  tareas: ["Situación y tareas", "Status & tasks"] as Tr,
  openAccount: ["Ver mi cuenta", "View my account"] as Tr,
};

type PanelSection = SectionId | "unibox" | "equipo" | "cuenta" | "tareas";

const EXTRA: Record<"unibox" | "equipo" | "cuenta" | "tareas", Tr> = { unibox: C.unibox, equipo: C.equipo, cuenta: C.account, tareas: C.tareas };

const RECOGNISED: PanelSection[] = ["inicio", "pedidos", "unibox", "referencias", "proveedores", "clientes", "equipo", "cuenta", "tareas"];

type Route = { section: PanelSection; id: string | null };

function readRoute(): Route {
  const parts = window.location.pathname.replace(/^\/panel\/?/, "").split("/").filter(Boolean);
  const section = (RECOGNISED as string[]).includes(parts[0] ?? "") ? (parts[0] as PanelSection) : "inicio";
  const hasId = section !== "inicio" && section !== "cuenta" && section !== "tareas";
  return { section, id: hasId ? parts[1] ?? null : null };
}

function routePath(r: Route) {
  if (r.section === "inicio") return "/panel";
  return "/panel/" + r.section + (r.id ? "/" + r.id : "");
}

function sectionTitle(s: PanelSection): Tr {
  return s === "unibox" || s === "equipo" || s === "cuenta" || s === "tareas" ? EXTRA[s] : SECTION_TITLE[s];
}

type Counts = Partial<Record<EntityId, number>> & { equipo?: number; unibox?: number; tareas?: number };

export default function Panel({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const [route, setRoute] = useState<Route>(readRoute);
  const [menuOpen, setMenuOpen] = useState(false);
  const [counts, setCounts] = useState<Counts>({});
  const [refreshKey, setRefreshKey] = useState(0);

  const email = session.user.email ?? "";
  const isAdmin = roleOf(session) === "ADMIN";
  const name = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.title = "ChipsFinder · " + tr(sectionTitle(route.section), lang);
  }, [route.section, lang]);

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Si la dirección no corresponde a la sección (p. ej. una ruta antigua de /panel/lotes),
  // se normaliza sin dejar rastro en el historial.
  useEffect(() => {
    const want = routePath(route);
    if (window.location.pathname !== want) window.history.replaceState(null, "", want);
  }, [route]);

  const navigate = useCallback((r: Route, replace = false) => {
    const path = routePath(r);
    if (path !== window.location.pathname) {
      if (replace) window.history.replaceState(null, "", path);
      else window.history.pushState(null, "", path);
    }
    setRoute(r);
    setMenuOpen(false);
  }, []);

  // Quien no es administrador no puede entrar en Equipo
  useEffect(() => {
    if (route.section === "equipo" && !isAdmin) navigate({ section: "inicio", id: null }, true);
  }, [route.section, isAdmin, navigate]);

  // Números del menú lateral
  const loadCounts = useCallback(async () => {
    const ids = Object.keys(ENTITIES) as EntityId[];
    const res = await Promise.all(
      ids.map((id) => supabase.from(ENTITIES[id].table).select("id", { count: "exact", head: true })),
    );
    const next: Counts = {};
    ids.forEach((id, i) => {
      if (!res[i].error) next[id] = res[i].count ?? 0;
    });
    const mail = await supabase.from("mensajes").select("id", { count: "exact", head: true }).eq("seen", false).eq("direction", "in");
    if (!mail.error) next.unibox = mail.count ?? 0;
    try { next.tareas = await contarTareas(); } catch { /* sin contador */ }
    if (isAdmin) {
      const u = await listUsers();
      if (u.ok) next.equipo = u.users.length;
    }
    setCounts(next);
  }, [isAdmin]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts, refreshKey]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const setLang = (l: Lang) => {
    saveLang(l);
    setLangState(l);
  };

  const toggleTheme = () => {
    const t: Theme = theme === "light" ? "dark" : "light";
    setTheme(t);
    setThemeState(t);
  };

  const navItem = (s: PanelSection, code: string, label: Tr, n?: number) => {
    const active = route.section === s;
    return (
      <li key={s}>
        <a
          href={routePath({ section: s, id: null })}
          className={"nav-item" + (active ? " is-active" : "")}
          aria-current={active ? "page" : undefined}
          onClick={(e) => {
            e.preventDefault();
            navigate({ section: s, id: null });
          }}
        >
          <span className="nav-item__code">{code}</span>
          <span className="nav-item__label">{tr(label, lang)}</span>
          {n !== undefined && <span className="nav-item__n">{n}</span>}
        </a>
      </li>
    );
  };

  const sidebar = (
    <nav className="sb-nav" aria-label={tr(C.main, lang)}>
      {NAV.map((g) => (
        <div className="nav-group" key={g.group[0]}>
          <span className="nav-group__label">{tr(g.group, lang)}</span>
          <ul>
            {g.items.map((s) =>
              navItem(s, SECTION_CODE[s], SECTION_TITLE[s], s === "inicio" ? undefined : counts[s as EntityId]),
            )}
          </ul>
        </div>
      ))}
      <div className="nav-group">
        <span className="nav-group__label">{tr(C.comunicacion, lang)}</span>
        <ul>{navItem("unibox", "✉", C.unibox, counts.unibox)}</ul>
      </div>
      {isAdmin && (
        <div className="nav-group">
          <span className="nav-group__label">{tr(C.adminGroup, lang)}</span>
          <ul>{navItem("equipo", "05", C.equipo, counts.equipo)}</ul>
        </div>
      )}
      <div className="nav-group">
        <span className="nav-group__label">{tr(C.seguimiento, lang)}</span>
        <ul>{navItem("tareas", "✓", C.tareas, counts.tareas)}</ul>
      </div>
    </nav>
  );

  const accountActive = route.section === "cuenta";
  const userBox = (
    <div className="sb-user">
      <button
        type="button"
        className={"sb-user__who" + (accountActive ? " is-active" : "")}
        onClick={() => navigate({ section: "cuenta", id: null })}
        aria-label={tr(C.openAccount, lang)}
      >
        <span className="sb-user__avatar" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
        <span className="sb-user__text">
          <span className="sb-user__email" title={email}>
            {email}
          </span>
          <span className={"sb-user__role" + (isAdmin ? " is-admin" : "")}>{tr(isAdmin ? C.admin : C.team, lang)}</span>
        </span>
        <span className="sb-user__cog" aria-hidden="true">
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M6 2.2l.5-1.4h3l.5 1.4 1.3.5 1.4-.6 2 2-.6 1.4.5 1.3 1.4.5v2.8l-1.4.5-.5 1.3.6 1.4-2 2-1.4-.6-1.3.5-.5 1.4h-3l-.5-1.4-1.3-.5-1.4.6-2-2 .6-1.4-.5-1.3L.8 9.4V6.6l1.4-.5.5-1.3-.6-1.4 2-2 1.4.6z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </span>
      </button>
      <div className="sb-user__actions">
        <div className="langs langs--sm" role="group" aria-label={tr(C.lang, lang)}>
          {(["es", "en"] as const).map((code) => (
            <button key={code} type="button" className="langs__btn" aria-pressed={lang === code} onClick={() => setLang(code)}>
              {code}
            </button>
          ))}
        </div>
        <button type="button" className="themebtn" onClick={toggleTheme} aria-label={tr(theme === "light" ? C.toDark : C.toLight, lang)} title={tr(theme === "light" ? C.toDark : C.toLight, lang)}>
          {theme === "light" ? (
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
          ) : (
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6L13 13M13 3l-1.4 1.4M4.4 11.6L3 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
          )}
        </button>
        <button type="button" className="btn btn--ghost btn--sm btn--logout" onClick={onSignOut}>
          {tr(C.logout, lang)}
        </button>
      </div>
    </div>
  );

  return (
    <div className={"shell" + (menuOpen ? " is-menu" : "")}>
      <aside className="sb" aria-label={tr(C.panel, lang)}>
        <div className="sb-brand">
          <img src="/logo-chf-white.png" alt="CHF Finder" className="sb-brand__logo" />
          <span className="sb-brand__text">
            <span className="sb-brand__name">ChipsFinder</span>
            <span className="sb-brand__sub">
              <span className="dot dot--pulse" aria-hidden="true" /> {tr(C.panel, lang)}
            </span>
          </span>
          <button type="button" className="iconbtn sb-brand__close" onClick={() => setMenuOpen(false)} aria-label={tr(C.close, lang)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {sidebar}
        {userBox}
      </aside>
      <div className="sb-scrim" onClick={() => setMenuOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button type="button" className="topbar__menu" onClick={() => setMenuOpen(true)} aria-expanded={menuOpen}>
            <span className="topbar__burger" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            {tr(C.menu, lang)}
          </button>
          <span className="topbar__crumb">
            CHF/INT <span className="topbar__sep">/</span>{" "}
            <span className="topbar__here">{tr(sectionTitle(route.section), lang)}</span>
          </span>
          <span className="topbar__status">
            <span className="dot" aria-hidden="true" /> {email}
          </span>
        </header>

        <main className="content">
          <ErrorBoundary key={route.section + "/" + (route.id ?? "")} es={lang === "es"}>
          {route.section === "inicio" ? (
            <Home lang={lang} name={name} refreshKey={refreshKey} go={(section, id) => navigate({ section, id: id ?? null })} />
          ) : route.section === "cuenta" ? (
            <Account lang={lang} session={session} />
          ) : route.section === "unibox" ? (
            <Unibox lang={lang} isAdmin={isAdmin} onOpenClient={(id) => navigate({ section: "pedidos", id })} />
          ) : route.section === "equipo" ? (
            <TeamPage lang={lang} openId={route.id} onOpen={(id: string | null) => navigate({ section: "equipo", id }, true)} />
          ) : route.section === "pedidos" ? (
            <Pedidos
              lang={lang}
              isAdmin={isAdmin}
              clienteId={route.id}
              onOpen={(id: string | null) => navigate({ section: "pedidos", id }, true)}
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          ) : route.section === "tareas" ? (
            <Tareas
              lang={lang}
              goSuppliers={(cid, pid) => navigate({ section: "proveedores", id: "c~" + cid + "~" + pid })}
              goClient={(cid) => navigate({ section: "pedidos", id: cid })}
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          ) : route.section === "proveedores" ? (
            <Proveedores
              lang={lang}
              isAdmin={isAdmin}
              openId={route.id}
              onOpen={(id: string | null) => navigate({ section: "proveedores", id }, true)}
              onOpenClient={(id) => navigate({ section: "pedidos", id })}
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          ) : route.section === "referencias" ? (
            <Referencias
              lang={lang}
              isAdmin={isAdmin}
              openId={route.id}
              onOpen={(id: string | null) => navigate({ section: "referencias", id }, true)}
              onOpenProv={(id) => navigate({ section: "proveedores", id })}
              onOpenClient={(id) => navigate({ section: "pedidos", id })}
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          ) : (
            <EntityPage
              entity={ENTITIES[route.section]}
              lang={lang}
              isAdmin={isAdmin}
              openId={route.id}
              onOpen={(id) => navigate({ section: route.section, id }, true)}
              onChanged={() => setRefreshKey((k) => k + 1)}
            />
          )}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
