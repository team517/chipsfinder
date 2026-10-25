// Situación y tareas: en qué punto está cada chip pedido y qué falta por hacer.
// Las tareas automáticas salen de los pedidos abiertos y sus ofertas, y desaparecen solas
// cuando se hace el trabajo (o al quitarlas: se guarda su clave en "tareas").
// Las manuales se guardan en la tabla "tareas".

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Lang } from "../i18n";
import { supabase } from "../auth";
import { PEDIDOS_ABIERTOS } from "./entities";
import { date, num, pedidoCode, text, tr, type Tr } from "./format";
import { findReplyThread } from "./mail-data";

const C = {
  eyebrow: ["Seguimiento", "Follow-up"] as Tr,
  title: ["Situación y tareas", "Status & tasks"] as Tr,
  intro: ["En qué punto está cada chip que te han pedido y qué te queda por hacer.", "Where each requested chip stands and what is left to do."] as Tr,
  loading: ["Cargando…", "Loading…"] as Tr,
  kOpen: ["Chips abiertos", "Open chips"] as Tr,
  kOpenSub: ["pedidos en curso", "orders in progress"] as Tr,
  kNoPrice: ["Sin precio", "No price"] as Tr,
  kNoPriceSub: ["aún sin precio de proveedor", "no supplier price yet"] as Tr,
  kWaiting: ["Esperando respuesta", "Awaiting reply"] as Tr,
  kWaitingSub: ["proveedores sin responder", "suppliers without reply"] as Tr,
  kReady: ["Para cotizar", "Ready to quote"] as Tr,
  kReadySub: ["con precio, falta el cliente", "priced, client not quoted"] as Tr,
  tasks: ["Tareas", "Tasks"] as Tr,
  tasksOf: ["Tareas de este chip", "Tasks for this chip"] as Tr,
  all: ["Todas", "All"] as Tr,
  noTasks: ["Todo al día. No hay nada pendiente.", "All caught up. Nothing pending."] as Tr,
  noneHere: ["Nada en este grupo.", "Nothing in this group."] as Tr,
  newTask: ["Escribe una tarea nueva…", "Write a new task…"] as Tr,
  add: ["Añadir", "Add"] as Tr,
  linkTo: ["— Sin chip —", "— No chip —"] as Tr,
  due: ["Vence", "Due"] as Tr,
  late: ["Atrasada", "Overdue"] as Tr,
  done: ["Hechas y quitadas", "Done & removed"] as Tr,
  restore: ["Recuperar", "Restore"] as Tr,
  autoTag: ["automática", "automatic"] as Tr,
  remove: ["Quitar tarea", "Remove task"] as Tr,
  markDone: ["Marcar como hecha", "Mark as done"] as Tr,
  viewReply: ["Ver respuesta", "View reply"] as Tr,
  searching: ["Buscando…", "Searching…"] as Tr,
  noReply: ["No encuentro su respuesta en el Unibox.", "Their reply is not in the Unibox."] as Tr,
  situation: ["Chips sin precio de proveedor", "Chips without a supplier price"] as Tr,
  allPriced: ["Todos los chips abiertos tienen ya algún precio.", "Every open chip already has a price."] as Tr,
  colChip: ["Chip", "Chip"] as Tr,
  colClient: ["Cliente", "Client"] as Tr,
  colUnits: ["Unidades", "Units"] as Tr,
  colSup: ["Proveedores", "Suppliers"] as Tr,
  mine: ["Mis tareas", "My tasks"] as Tr,
  days: (d: number): Tr => [d === 0 ? "hoy" : d === 1 ? "1 día" : `${d} días`, d === 0 ? "today" : d === 1 ? "1 day" : `${d} days`],
  st: { por_contactar: ["por contactar", "to contact"], contactado: ["esperando", "awaiting"], respondido: ["respondido", "replied"], oferta: ["con oferta", "quoted"], descartado: ["descartado", "discarded"] } as Record<string, Tr>,
};

type Of = {
  id: string; estado: string; precio: number | null; proveedor: string | null; email: string | null; updated_at: string;
  respuesta_thread: string | null; prov: { nombre: string; email: string | null } | null;
};
type Ped = {
  id: string; numero: number; mpn: string | null; unidades: string | null; estado: string; precio_cliente: number | null;
  cliente: { id: string; nombre: string } | null; referencia: { mpn: string; fabricante: string | null } | null; ofertas: Of[];
};
type Tarea = {
  id: string; titulo: string; notas: string | null; pedido_id: string | null; vence: string | null; hecha: boolean; hecha_el: string | null; clave: string | null;
  pedido: { mpn: string | null; cliente_id: string; cliente: { nombre: string } | null } | null;
};

export type Kind = "buscar" | "contactar" | "esperando" | "anotar" | "cotizar" | "cantidad";
type AutoTask = { key: string; kind: Kind; ped: Ped; ofs: Of[]; age: number | null };

const KINDS: { kind: Kind; label: Tr; what: Tr; action: Tr; tone: string; icon: string }[] = [
  { kind: "anotar", label: ["Han respondido", "Replied"], what: ["Lee su respuesta y anota el precio", "Read the reply and log the price"], action: ["Anotar precio", "Log price"], tone: "warn", icon: "↩" },
  { kind: "buscar", label: ["Buscar proveedor", "Find a supplier"], what: ["Este chip no tiene ningún proveedor", "This chip has no supplier"], action: ["Buscar", "Find"], tone: "bad", icon: "⌕" },
  { kind: "contactar", label: ["Por contactar", "To contact"], what: ["Escríbeles pidiendo stock, plazo y precio", "Ask them for stock, lead time and price"], action: ["Contactar", "Contact"], tone: "accent", icon: "✉" },
  { kind: "cotizar", label: ["Pasar precio al cliente", "Quote the client"], what: ["Ya tienes precio: dale el tuyo al cliente", "You have a cost: send your price"], action: ["Cotizar", "Quote"], tone: "ok", icon: "€" },
  { kind: "esperando", label: ["Esperando respuesta", "Awaiting reply"], what: ["Contactados que aún no han contestado", "Contacted, no answer yet"], action: ["Reclamar", "Chase"], tone: "info", icon: "◷" },
  { kind: "cantidad", label: ["Confirmar cantidad", "Confirm quantity"], what: ["Falta saber cuántas unidades quiere", "Quantity still unknown"], action: ["Ver pedido", "View order"], tone: "muted", icon: "#" },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.kind, k])) as Record<Kind, (typeof KINDS)[number]>;

const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const provName = (o: Of) => o.prov?.nombre ?? o.proveedor ?? "—";
const mpnOf = (p: Ped) => p.referencia?.mpn ?? p.mpn ?? "—";

function autoTasks(peds: Ped[]): AutoTask[] {
  const out: AutoTask[] = [];
  for (const p of peds) {
    const live = p.ofertas.filter((o) => o.estado !== "descartado");
    // La clave incluye las ofertas implicadas: si cambian, la tarea vuelve aunque se hubiera quitado
    const push = (kind: Kind, ofs: Of[] = [], age: number | null = null) =>
      out.push({ key: kind + ":" + p.id + ":" + ofs.map((o) => o.id).sort().join(","), kind, ped: p, ofs, age });
    if (!live.length) push("buscar");
    const resp = live.filter((o) => (o.estado === "respondido" || o.estado === "oferta") && o.precio == null);
    if (resp.length) push("anotar", resp);
    const porC = live.filter((o) => o.estado === "por_contactar");
    if (porC.length) push("contactar", porC);
    const priced = live.filter((o) => o.precio != null);
    if (priced.length && p.precio_cliente == null) push("cotizar", priced);
    const cont = live.filter((o) => o.estado === "contactado");
    if (cont.length) push("esperando", cont, Math.max(...cont.map((o) => daysAgo(o.updated_at))));
    if (!p.unidades || /pendiente/i.test(p.unidades)) push("cantidad");
  }
  return out;
}

async function loadAll(pedidoId?: string): Promise<{ peds: Ped[]; tareas: Tarea[] }> {
  let pq = supabase.from("pedidos")
    .select("id, numero, mpn, unidades, estado, precio_cliente, cliente:clientes(id, nombre), referencia:referencias(mpn, fabricante), ofertas(id, estado, precio, proveedor, email, updated_at, respuesta_thread, prov:proveedores(nombre, email))")
    .order("numero", { ascending: false }).limit(2000);
  pq = pedidoId ? pq.eq("id", pedidoId) : pq.in("estado", PEDIDOS_ABIERTOS);
  let tq = supabase.from("tareas").select("*, pedido:pedidos(mpn, cliente_id, cliente:clientes(nombre))")
    .order("vence", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(1000);
  if (pedidoId) tq = tq.eq("pedido_id", pedidoId);
  const [p, t] = await Promise.all([pq, tq]);
  return { peds: (p.data ?? []) as unknown as Ped[], tareas: (t.data ?? []) as unknown as Tarea[] };
}

const visibleAutos = (peds: Ped[], tareas: Tarea[]) => {
  const quitadas = new Set(tareas.filter((t) => t.clave).map((t) => t.clave));
  return autoTasks(peds).filter((a) => !quitadas.has(a.key));
};

/** Nº de tareas pendientes (para el menú lateral). */
export async function contarTareas(): Promise<number> {
  const { peds, tareas } = await loadAll();
  return visibleAutos(peds, tareas).length + tareas.filter((t) => !t.hecha && !t.clave).length;
}

const Trash = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8l.6-8.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/* ---------------- Tareas (página completa o la de un chip) ---------------- */

export function TaskPanel({ lang, pedidoId, goPed, goThread, onChanged, reloadKey = 0 }: {
  lang: Lang;
  pedidoId?: string;
  goPed?: (clienteId: string, pedidoId: string, kind?: Kind) => void;
  goThread?: (threadId: string) => void;
  onChanged?: () => void;
  reloadKey?: number;
}) {
  const [data, setData] = useState<{ peds: Ped[]; tareas: Tarea[] } | null>(null);
  const [titulo, setTitulo] = useState("");
  const [vence, setVence] = useState("");
  const [pedSel, setPedSel] = useState("");
  const [filter, setFilter] = useState<Kind | "mine" | "all">("all");
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState<string | null>(null);
  const [missing, setMissing] = useState<string | null>(null);

  const load = useCallback(async () => setData(await loadAll(pedidoId)), [pedidoId]);
  useEffect(() => { load(); }, [load, reloadKey]);

  const autos = useMemo(() => (data ? visibleAutos(data.peds, data.tareas) : []), [data]);
  if (!data) return <div className="tpanel"><p className="offers__empty">{tr(C.loading, lang)}</p></div>;

  const pend = data.tareas.filter((t) => !t.hecha && !t.clave);
  const hechas = data.tareas.filter((t) => t.hecha);
  const today = new Date().toISOString().slice(0, 10);
  const changed = async () => { await load(); onChanged?.(); };
  const total = autos.length + pend.length;
  const compact = !!pedidoId;

  async function addTask(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || busy) return;
    setBusy(true);
    await supabase.from("tareas").insert({ titulo: titulo.trim(), vence: vence || null, pedido_id: pedidoId ?? (pedSel || null) });
    setBusy(false);
    setTitulo(""); setVence(""); setPedSel("");
    await changed();
  }
  async function toggle(t: Tarea) {
    if (t.clave) await supabase.from("tareas").delete().eq("id", t.id); // recuperar una automática
    else await supabase.from("tareas").update({ hecha: !t.hecha, hecha_el: t.hecha ? null : new Date().toISOString() }).eq("id", t.id);
    await changed();
  }
  async function removeManual(t: Tarea) {
    await supabase.from("tareas").delete().eq("id", t.id);
    await changed();
  }
  async function dismiss(a: AutoTask) {
    const k = KIND[a.kind];
    await supabase.from("tareas").insert({ titulo: tr(k.label, lang) + " · " + mpnOf(a.ped), clave: a.key, pedido_id: a.ped.id, hecha: true, hecha_el: new Date().toISOString() });
    await changed();
  }
  async function viewReply(o: Of) {
    setLooking(o.id); setMissing(null);
    const th = await findReplyThread({ respuesta_thread: o.respuesta_thread, email: o.email, provEmail: o.prov?.email });
    setLooking(null);
    if (th && goThread) goThread(th);
    else setMissing(o.id);
  }
  const go = (a: AutoTask) => { if (a.ped.cliente && goPed) goPed(a.ped.cliente.id, a.ped.id, a.kind); };

  const groups = KINDS.map((k) => ({ ...k, items: autos.filter((a) => a.kind === k.kind) }));
  const shownGroups = groups.filter((g) => g.items.length && (filter === "all" || filter === g.kind));
  const showMine = pend.length > 0 && (filter === "all" || filter === "mine");

  const tile = (key: Kind | "mine" | "all", label: Tr, n: number, tone: string, icon: string) => (
    <button key={key} type="button" className={"ttile ttile--" + tone + (filter === key ? " is-on" : "") + (n === 0 ? " is-zero" : "")} onClick={() => setFilter(filter === key && key !== "all" ? "all" : key)}>
      <span className="ttile__icon" aria-hidden="true">{icon}</span>
      <span className="ttile__n">{n}</span>
      <span className="ttile__label">{tr(label, lang)}</span>
    </button>
  );

  const card = (a: AutoTask): ReactNode => {
    const k = KIND[a.kind];
    return (
      <li key={a.key} className={"tcard tcard--" + k.tone}>
        <div className="tcard__top">
          <span className="tcard__mpn">{mpnOf(a.ped)}</span>
          {!compact && a.ped.cliente && <span className="tcard__client">{a.ped.cliente.nombre}</span>}
          {a.age != null && <span className={"tcard__age" + (a.age >= 3 ? " is-late" : "")}>◷ {tr(C.days(a.age), lang)}</span>}
          <button type="button" className="tcard__del" title={tr(C.remove, lang)} aria-label={tr(C.remove, lang)} onClick={() => dismiss(a)}><Trash /></button>
        </div>
        <p className="tcard__what">{tr(k.what, lang)}{a.ped.unidades && !compact ? " · " + a.ped.unidades : ""}</p>
        {a.ofs.length > 0 && (
          <div className="tcard__sups">
            {a.ofs.map((o) => {
              const replied = o.estado === "respondido" || o.estado === "oferta";
              return (
                <span key={o.id} className={"tsup" + (replied ? " tsup--replied" : "")}>
                  <span className={"tsup__dot tsup__dot--" + o.estado} aria-hidden="true" />
                  {provName(o)}
                  {replied && goThread && (
                    <button type="button" className="tsup__reply" onClick={() => viewReply(o)} disabled={looking === o.id}>
                      {looking === o.id ? tr(C.searching, lang) : tr(C.viewReply, lang) + " →"}
                    </button>
                  )}
                  {missing === o.id && <span className="tsup__miss">{tr(C.noReply, lang)}</span>}
                </span>
              );
            })}
          </div>
        )}
        {goPed && (
          <div className="tcard__foot">
            {a.kind === "anotar" && a.ofs.length === 1 && goThread && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => viewReply(a.ofs[0])} disabled={looking === a.ofs[0].id}>↩ {tr(C.viewReply, lang)}</button>
            )}
            <button type="button" className="btn btn--primary btn--sm" onClick={() => go(a)}>{tr(k.action, lang)} →</button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className={"tpanel" + (compact ? " tpanel--compact" : "")}>
      <div className="tpanel__head">
        <span className="offers__title">{tr(compact ? C.tasksOf : C.tasks, lang)} · {total}</span>
      </div>

      {!compact && (
        <div className="ttiles">
          {tile("all", C.all, total, "neutral", "≡")}
          {groups.map((g) => tile(g.kind, g.label, g.items.length, g.tone, g.icon))}
          {tile("mine", C.mine, pend.length, "neutral", "✓")}
        </div>
      )}

      <form className="task-new" onSubmit={addTask}>
        <span className="task-new__plus" aria-hidden="true">+</span>
        <input className="input input--sm task-new__title" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tr(C.newTask, lang)} />
        {!pedidoId && (
          <select className="input input--sm task-new__ped" value={pedSel} onChange={(e) => setPedSel(e.target.value)}>
            <option value="">{tr(C.linkTo, lang)}</option>
            {data.peds.map((p) => <option key={p.id} value={p.id}>{mpnOf(p)} · {p.cliente?.nombre ?? "—"}</option>)}
          </select>
        )}
        <input className="input input--sm task-new__due" type="date" value={vence} onChange={(e) => setVence(e.target.value)} aria-label={tr(C.due, lang)} />
        <button type="submit" className="btn btn--primary btn--sm" disabled={!titulo.trim() || busy}>{tr(C.add, lang)}</button>
      </form>

      {total === 0 && <div className="tempty"><span className="tempty__icon">✓</span>{tr(C.noTasks, lang)}</div>}
      {total > 0 && !showMine && shownGroups.length === 0 && <p className="offers__empty">{tr(C.noneHere, lang)}</p>}

      {showMine && (
        <section className="tsec">
          <h3 className="tsec__head"><span className="tsec__icon tsec__icon--neutral">✓</span>{tr(C.mine, lang)}<span className="tsec__n">{pend.length}</span></h3>
          <ul className="tgrid">
            {pend.map((t) => {
              const late = !!t.vence && t.vence < today;
              return (
                <li key={t.id} className={"tcard tcard--mine" + (late ? " tcard--late" : "")}>
                  <div className="tcard__top">
                    <button type="button" className="task__check" title={tr(C.markDone, lang)} aria-label={tr(C.markDone, lang)} onClick={() => toggle(t)} />
                    <span className="tcard__title">{t.titulo}</span>
                    <button type="button" className="tcard__del" title={tr(C.remove, lang)} aria-label={tr(C.remove, lang)} onClick={() => removeManual(t)}><Trash /></button>
                  </div>
                  {(t.vence || (!compact && t.pedido) || t.notas) && (
                    <div className="tcard__meta">
                      {!compact && t.pedido && <span className="tcard__chip">{t.pedido.mpn} · {t.pedido.cliente?.nombre}</span>}
                      {t.vence && <span className={"tcard__age" + (late ? " is-late" : "")}>{late ? tr(C.late, lang) + " · " : ""}{date(t.vence, lang)}</span>}
                      {t.notas && <span>{t.notas}</span>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {shownGroups.map((g) => (
        <section key={g.kind} className="tsec">
          <h3 className="tsec__head"><span className={"tsec__icon tsec__icon--" + g.tone}>{g.icon}</span>{tr(g.label, lang)}<span className="tsec__n">{g.items.length}</span></h3>
          <ul className="tgrid">{g.items.map(card)}</ul>
        </section>
      ))}

      {hechas.length > 0 && (
        <div className="tasks-done">
          <button type="button" className="linkbtn" onClick={() => setShowDone((v) => !v)}>{showDone ? "▾" : "▸"} {tr(C.done, lang)} · {hechas.length}</button>
          {showDone && (
            <ul className="tasks">
              {hechas.slice(0, 40).map((t) => (
                <li key={t.id} className="task is-done">
                  <button type="button" className="task__check is-on" title={tr(C.restore, lang)} aria-label={tr(C.restore, lang)} onClick={() => toggle(t)}>✓</button>
                  <div className="task__main">
                    <span className="task__title">{t.titulo}</span>
                    <span className="task__sub">{t.clave ? tr(C.autoTag, lang) + " · " : ""}{t.hecha_el ? date(t.hecha_el, lang) : ""}</span>
                  </div>
                  <button type="button" className="chipbtn" onClick={() => toggle(t)}>{tr(C.restore, lang)}</button>
                  {!t.clave && <button type="button" className="tcard__del" title={tr(C.remove, lang)} aria-label={tr(C.remove, lang)} onClick={() => removeManual(t)}><Trash /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Página completa ---------------- */

export default function Tareas({ lang, goSuppliers, goClient, goThread, onChanged }: {
  lang: Lang;
  goSuppliers: (clienteId: string, pedidoId: string) => void;
  goClient: (clienteId: string) => void;
  goThread: (threadId: string) => void;
  onChanged: () => void;
}) {
  const [peds, setPeds] = useState<Ped[] | null>(null);
  const [key, setKey] = useState(0);

  const load = useCallback(async () => setPeds((await loadAll()).peds), []);
  useEffect(() => { load(); }, [load, key]);

  if (!peds) return <div className="state" style={{ marginTop: 24 }}>{tr(C.loading, lang)}</div>;

  const sinPrecio = peds.filter((p) => !p.ofertas.some((o) => o.estado !== "descartado" && o.precio != null));
  const esperando = peds.reduce((n, p) => n + p.ofertas.filter((o) => o.estado === "contactado").length, 0);
  const paraCotizar = peds.filter((p) => p.precio_cliente == null && p.ofertas.some((o) => o.estado !== "descartado" && o.precio != null)).length;
  const goPed = (cid: string, pid: string, kind?: Kind) => (kind === "cotizar" || kind === "cantidad" ? goClient(cid) : goSuppliers(cid, pid));

  return (
    <section className="page-sec">
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">✓</span>{tr(C.eyebrow, lang)}</span>
          <h1 className="sec-title">{tr(C.title, lang)}</h1>
          <p className="sec-intro">{tr(C.intro, lang)}</p>
        </div>
      </header>

      <div className="kpis">
        <div className="kpi"><span className="kpi__label">{tr(C.kOpen, lang)}</span><span className="kpi__value">{num(peds.length, lang)}</span><span className="kpi__sub">{tr(C.kOpenSub, lang)}</span></div>
        <div className={"kpi" + (sinPrecio.length ? " kpi--accent" : "")}><span className="kpi__label">{tr(C.kNoPrice, lang)}</span><span className="kpi__value">{num(sinPrecio.length, lang)}</span><span className="kpi__sub">{tr(C.kNoPriceSub, lang)}</span></div>
        <div className="kpi"><span className="kpi__label">{tr(C.kWaiting, lang)}</span><span className="kpi__value">{num(esperando, lang)}</span><span className="kpi__sub">{tr(C.kWaitingSub, lang)}</span></div>
        <div className="kpi"><span className="kpi__label">{tr(C.kReady, lang)}</span><span className="kpi__value">{num(paraCotizar, lang)}</span><span className="kpi__sub">{tr(C.kReadySub, lang)}</span></div>
      </div>

      <TaskPanel lang={lang} goPed={goPed} goThread={goThread} onChanged={() => { setKey((k) => k + 1); onChanged(); }} />

      <div className="offers offers--card tasks-card">
        <div className="offers__head"><span className="offers__title">{tr(C.situation, lang)} · {sinPrecio.length}</span></div>
        {sinPrecio.length === 0 ? <p className="offers__empty">{tr(C.allPriced, lang)}</p> : (
          <div className="table-wrap table-wrap--flat">
            <table className="tbl">
              <thead><tr>
                <th>{tr(C.colChip, lang)}</th>
                <th>{tr(C.colClient, lang)}</th>
                <th className="is-optional">{tr(C.colUnits, lang)}</th>
                <th>{tr(C.colSup, lang)}</th>
              </tr></thead>
              <tbody>
                {sinPrecio.map((p) => {
                  const counts: Record<string, number> = {};
                  p.ofertas.forEach((o) => { counts[o.estado] = (counts[o.estado] ?? 0) + 1; });
                  const open = () => p.cliente && goSuppliers(p.cliente.id, p.id);
                  return (
                    <tr key={p.id} tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === "Enter") open(); }}>
                      <td data-label={tr(C.colChip, lang)} className="is-strong"><span className="ref-mpn">{mpnOf(p)}</span><span className="ref-desc">{pedidoCode(p.numero)}</span></td>
                      <td data-label={tr(C.colClient, lang)}>{text(p.cliente?.nombre)}</td>
                      <td data-label={tr(C.colUnits, lang)} className="is-optional">{text(p.unidades)}</td>
                      <td data-label={tr(C.colSup, lang)}>
                        {p.ofertas.length === 0 ? <span className="pill pill--bad">{lang === "es" ? "ninguno" : "none"}</span> : (
                          <span className="sup-counts">
                            {["por_contactar", "contactado", "respondido", "oferta", "descartado"].filter((k) => counts[k]).map((k) => (
                              <span key={k} className={"pill pill--" + (k === "por_contactar" ? "muted" : k === "contactado" ? "info" : k === "descartado" ? "bad" : "warn")}>{counts[k]} {tr(C.st[k], lang)}</span>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
