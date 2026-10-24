import { useEffect, useState } from "react";
import type { Lang } from "../i18n";
import { supabase } from "../auth";
import { LOTE_ESTADOS, PEDIDO_ESTADOS, PEDIDOS_ABIERTOS, type EntityId, type Row } from "./entities";
import { StatusPill } from "./EntityPage";
import { date, num, pedidoCode, text, tr, type Tr } from "./format";

const C = {
  eyebrow: ["Panel interno", "Internal dashboard"] as Tr,
  hello: ["Hola", "Hello"] as Tr,
  intro: [
    "Resumen del día: lo que está abierto, lo que falta revisar y lo último que ha entrado.",
    "Today at a glance: what is open, what needs checking and the latest arrivals.",
  ] as Tr,
  openOrders: ["Pedidos abiertos", "Open orders"] as Tr,
  openOrdersSub: ["nuevos, cotizados o confirmados", "new, quoted or confirmed"] as Tr,
  pendingLots: ["Lotes por revisar", "Batches to check"] as Tr,
  pendingLotsSub: ["pendientes o en inspección", "pending or being inspected"] as Tr,
  parts: ["Referencias", "Parts"] as Tr,
  partsSub: (n: string, one: boolean): Tr => [n + (one ? " ud. en stock" : " uds. en stock"), n + (one ? " unit in stock" : " units in stock")],
  clients: ["Clientes", "Clients"] as Tr,
  clientsSub: (n: string, one: boolean): Tr => [n + (one ? " proveedor" : " proveedores"), n + (one ? " supplier" : " suppliers")],
  lastOrders: ["Últimos pedidos", "Latest orders"] as Tr,
  lotsQueue: ["Lotes pendientes", "Pending batches"] as Tr,
  seeAll: ["Ver todos", "See all"] as Tr,
  noOrders: ["Aún no hay pedidos.", "No orders yet."] as Tr,
  noLots: ["No hay lotes pendientes de revisar.", "No batches waiting for inspection."] as Tr,
  create: ["Crear el primero", "Create the first one"] as Tr,
  loadErr: ["No se pudo cargar el resumen.", "Could not load the summary."] as Tr,
};

type Stats = {
  openOrders: number;
  pendingLots: number;
  parts: number;
  units: number;
  clients: number;
  suppliers: number;
};

export default function Home({
  lang,
  name,
  go,
  refreshKey,
}: {
  lang: Lang;
  name: string;
  go: (section: EntityId, id?: string) => void;
  refreshKey: number;
}) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<Row[]>([]);
  const [lots, setLots] = useState<Row[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const head = { count: "exact" as const, head: true };
      const [o, l, p, c, s, stock, lastO, lastL] = await Promise.all([
        supabase.from("pedidos").select("id", head).in("estado", PEDIDOS_ABIERTOS),
        supabase.from("lotes").select("id", head).in("estado", ["pendiente", "inspeccion"]),
        supabase.from("referencias").select("id", head),
        supabase.from("clientes").select("id", head),
        supabase.from("proveedores").select("id", head),
        supabase.from("referencias").select("stock").limit(10000),
        supabase
          .from("pedidos")
          .select("id, numero, estado, cantidad, mpn, created_at, cliente:clientes(nombre), referencia:referencias(mpn)")
          .order("numero", { ascending: false })
          .limit(6),
        supabase
          .from("lotes")
          .select("id, codigo, estado, cantidad, recibido_el, referencia:referencias(mpn), proveedor:proveedores(nombre)")
          .in("estado", ["pendiente", "inspeccion"])
          .order("recibido_el", { ascending: true })
          .limit(6),
      ]);
      if (!alive) return;
      if ([o, l, p, c, s, stock, lastO, lastL].some((r) => r.error)) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setStats({
        openOrders: o.count ?? 0,
        pendingLots: l.count ?? 0,
        parts: p.count ?? 0,
        clients: c.count ?? 0,
        suppliers: s.count ?? 0,
        units: ((stock.data ?? []) as { stock: number }[]).reduce((a, r) => a + (r.stock || 0), 0),
      });
      setOrders((lastO.data ?? []) as unknown as Row[]);
      setLots((lastL.data ?? []) as unknown as Row[]);
    })();
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const rel = (r: Row, k: string, f: string) => (r[k] as Record<string, unknown> | null)?.[f];
  const today = new Date().toLocaleDateString(lang === "es" ? "es-ES" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const kpis: { label: Tr; value: number | undefined; sub: Tr; to: EntityId; accent?: boolean }[] = [
    { label: C.openOrders, value: stats?.openOrders, sub: C.openOrdersSub, to: "pedidos", accent: true },
    { label: C.pendingLots, value: stats?.pendingLots, sub: C.pendingLotsSub, to: "lotes" },
    { label: C.parts, value: stats?.parts, sub: C.partsSub(num(stats?.units ?? 0, lang), stats?.units === 1), to: "referencias" },
    { label: C.clients, value: stats?.clients, sub: C.clientsSub(num(stats?.suppliers ?? 0, lang), stats?.suppliers === 1), to: "clientes" },
  ];

  return (
    <section className="page-sec">
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow">
            <span className="sec-eyebrow__code">00</span>
            {tr(C.eyebrow, lang)} · <span className="sec-eyebrow__date">{today}</span>
          </span>
          <h1 className="sec-title">
            {tr(C.hello, lang)}, {name}
          </h1>
          <p className="sec-intro">{tr(C.intro, lang)}</p>
        </div>
      </header>

      {failed && (
        <div className="note note--error" role="alert">
          <span className="note__tag">ERR</span>
          <span className="note__text">{tr(C.loadErr, lang)}</span>
        </div>
      )}

      <div className="kpis">
        {kpis.map((k) => (
          <button key={k.to} type="button" className={"kpi" + (k.accent ? " kpi--accent" : "")} onClick={() => go(k.to)}>
            <span className="kpi__label">{tr(k.label, lang)}</span>
            <span className="kpi__value">{k.value === undefined ? "–" : num(k.value, lang)}</span>
            <span className="kpi__sub">{tr(k.sub, lang)}</span>
            <span className="kpi__arrow" aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>

      <div className="boards">
        <div className="board">
          <div className="board__head">
            <h2 className="board__title">{tr(C.lastOrders, lang)}</h2>
            <button type="button" className="linkbtn" onClick={() => go("pedidos")}>
              {tr(C.seeAll, lang)} →
            </button>
          </div>
          {stats && orders.length === 0 ? (
            <div className="board__empty">
              <p>{tr(C.noOrders, lang)}</p>
              <button type="button" className="linkbtn" onClick={() => go("pedidos", "nuevo")}>
                + {tr(C.create, lang)}
              </button>
            </div>
          ) : (
            <ul className="blist">
              {orders.map((r) => (
                <li key={r.id}>
                  <button type="button" className="blist__row" onClick={() => go("pedidos", r.id)}>
                    <span className="blist__code">{pedidoCode(r.numero)}</span>
                    <span className="blist__main">
                      <span className="blist__title">{text(rel(r, "cliente", "nombre"))}</span>
                      <span className="blist__sub">
                        {text(rel(r, "referencia", "mpn") ?? r.mpn)}
                        {r.cantidad ? " · " + num(r.cantidad, lang) + (lang === "es" ? " uds." : " units") : ""}
                      </span>
                    </span>
                    <StatusPill options={PEDIDO_ESTADOS} value={r.estado} lang={lang} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="board">
          <div className="board__head">
            <h2 className="board__title">{tr(C.lotsQueue, lang)}</h2>
            <button type="button" className="linkbtn" onClick={() => go("lotes")}>
              {tr(C.seeAll, lang)} →
            </button>
          </div>
          {stats && lots.length === 0 ? (
            <div className="board__empty">
              <p>{tr(C.noLots, lang)}</p>
            </div>
          ) : (
            <ul className="blist">
              {lots.map((r) => (
                <li key={r.id}>
                  <button type="button" className="blist__row" onClick={() => go("lotes", r.id)}>
                    <span className="blist__code">{text(r.codigo)}</span>
                    <span className="blist__main">
                      <span className="blist__title">{text(rel(r, "referencia", "mpn"))}</span>
                      <span className="blist__sub">
                        {text(rel(r, "proveedor", "nombre"))} · {date(r.recibido_el, lang)}
                      </span>
                    </span>
                    <StatusPill options={LOTE_ESTADOS} value={r.estado} lang={lang} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
