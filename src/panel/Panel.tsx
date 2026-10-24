import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { Lang } from "../i18n";
import { initialLang, saveLang } from "../lang";
import { roleOf, supabase } from "../auth";
import { ENTITIES, NAV, SECTION_CODE, SECTION_TITLE, type EntityId, type SectionId } from "./entities";
import EntityPage from "./EntityPage";
import Home from "./Home";
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
};

const SECTIONS: SectionId[] = ["inicio", "pedidos", "lotes", "referencias", "proveedores", "clientes"];

type Route = { section: SectionId; id: string | null };

function readRoute(): Route {
  const parts = window.location.pathname.replace(/^\/panel\/?/, "").split("/").filter(Boolean);
  const section = (SECTIONS as string[]).includes(parts[0] ?? "") ? (parts[0] as SectionId) : "inicio";
  return { section, id: section === "inicio" ? null : parts[1] ?? null };
}

function routePath(r: Route) {
  if (r.section === "inicio") return "/panel";
  return "/panel/" + r.section + (r.id ? "/" + r.id : "");
}

type Counts = Partial<Record<EntityId, number>>;

export default function Panel({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
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
    document.title = "ChipsFinder · " + tr(SECTION_TITLE[route.section], lang);
  }, [route.section, lang]);

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((r: Route, replace = false) => {
    const path = routePath(r);
    if (path !== window.location.pathname) {
      if (replace) window.history.replaceState(null, "", path);
      else window.history.pushState(null, "", path);
    }
    setRoute(r);
    setMenuOpen(false);
  }, []);

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
    setCounts(next);
  }, []);

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

  const sidebar = (
    <nav className="sb-nav" aria-label={tr(C.main, lang)}>
      {NAV.map((g) => (
        <div className="nav-group" key={g.group[0]}>
          <span className="nav-group__label">{tr(g.group, lang)}</span>
          <ul>
            {g.items.map((s) => {
              const active = route.section === s;
              const n = s === "inicio" ? undefined : counts[s];
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
                    <span className="nav-item__code">{SECTION_CODE[s]}</span>
                    <span className="nav-item__label">{tr(SECTION_TITLE[s], lang)}</span>
                    {n !== undefined && <span className="nav-item__n">{n}</span>}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const userBox = (
    <div className="sb-user">
      <div className="sb-user__who">
        <span className="sb-user__avatar" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
        <span className="sb-user__text">
          <span className="sb-user__email" title={email}>
            {email}
          </span>
          <span className={"sb-user__role" + (isAdmin ? " is-admin" : "")}>{tr(isAdmin ? C.admin : C.team, lang)}</span>
        </span>
      </div>
      <div className="sb-user__actions">
        <div className="langs langs--sm" role="group" aria-label={tr(C.lang, lang)}>
          {(["es", "en"] as const).map((code) => (
            <button key={code} type="button" className="langs__btn" aria-pressed={lang === code} onClick={() => setLang(code)}>
              {code}
            </button>
          ))}
        </div>
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
            <span className="topbar__here">{tr(SECTION_TITLE[route.section], lang)}</span>
          </span>
          <span className="topbar__status">
            <span className="dot" aria-hidden="true" /> {email}
          </span>
        </header>

        <main className="content">
          {route.section === "inicio" ? (
            <Home
              lang={lang}
              name={name}
              refreshKey={refreshKey}
              go={(section, id) => navigate({ section, id: id ?? null })}
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
        </main>
      </div>
    </div>
  );
}
