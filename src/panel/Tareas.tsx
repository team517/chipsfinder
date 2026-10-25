// Situación y tareas: en qué punto está cada chip pedido y qué falta por hacer.
// Las tareas automáticas salen de los pedidos abiertos y sus ofertas, y desaparecen solas
// cuando se hace el trabajo (o al quitarlas: se guarda su clave en "tareas").
// Las manuales se guardan en la tabla "tareas".

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Lang } from "../i18n";
import { supabase } from "../auth";
import { PEDIDOS_ABIERTOS } from "./entities";
import { date, num, pedidoCode, text, tr, type Tr } from "./format";

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
  kWaitingSub: ["proveedores contactados sin responder", "contacted suppliers, no reply"] as Tr,
  kReady: ["Para cotizar", "Ready to quote"] as Tr,
  kReadySub: ["con precio, falta dárselo al cliente", "priced, client not quoted yet"] as Tr,
  tasks: ["Tareas", "Tasks"] as Tr,
  tasksOf: ["Tareas de este chip", "Tasks for this chip"] as Tr,
  noTasks: ["Todo al día. No hay nada pendiente.", "All caught up. Nothing pending."] as Tr,
  newTask: ["Escribe una tarea nueva…", "Write a new task…"] as Tr,
  add: ["+ Añadir", "+ Add"] as Tr,
  linkTo: ["— Sin chip —", "— No chip —"] as Tr,
  due: ["Vence", "Due"] as Tr,
  done: ["Hechas y quitadas", "Done & removed"] as Tr,
  restore: ["Recuperar", "Restore"] as Tr,
  autoTag: ["automática", "automatic"] as Tr,
  remove: ["Quitar tarea", "Remove task"] as Tr,
  markDone: ["Marcar como hecha", "Mark as done"] as Tr,
  situation: ["Chips sin precio de proveedor", "Chips without a supplier price"] as Tr,
  allPriced: ["Todos los chips abiertos tienen ya algún precio.", "Every open chip already has a price."] as Tr,
  colChip: ["Chip", "Chip"] as Tr,
  colClient: ["Cliente", "Client"] as Tr,
  colUnits: ["Unidades", "Units"] as Tr,
  colSup: ["Proveedores", "Suppliers"] as Tr,
  mine: ["Mis tareas", "My tasks"] as Tr,
  tBuscar: (mpn: string): Tr => [`Buscar proveedor para ${mpn}`, `Find a supplier for ${mpn}`],
  tContactar: (n: number, mpn: string): Tr => [`Contactar ${n === 1 ? "1 proveedor" : n + " proveedores"} · ${mpn}`, `Contact ${n === 1 ? "1 supplier" : n + " suppliers"} · ${mpn}`],
  tEsperando: (n: number, mpn: string): Tr => [`Esperando respuesta de ${n === 1 ? "1 proveedor" : n + " proveedores"} · ${mpn}`, `Awaiting reply from ${n === 1 ? "1 supplier" : n + " suppliers"} · ${mpn}`],
  tAnotar: (n: number, mpn: string): Tr => [`Anotar el precio de ${n === 1 ? "1 respuesta" : n + " respuestas"} · ${mpn}`, `Log the price from ${n === 1 ? "1 reply" : n + " replies"} · ${mpn}`],
  tCotizar: (mpn: string): Tr => [`Pasar precio al cliente · ${mpn}`, `Send price to client · ${mpn}`],
  tCantidad: (mpn: string): Tr => [`Confirmar cantidad con el cliente · ${mpn}`, `Confirm quantity with client · ${mpn}`],
  days: (d: number): Tr => [d === 0 ? "hoy" : d === 1 ? "hace 1 día" : `hace ${d} días`, d === 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`],
  st: { por_contactar: ["por contactar", "to contact"], contactado: ["esperando", "awaiting"], respondido: ["respondido", "replied"], oferta: ["con oferta", "quoted"], descartado: ["descartado", "discarded"] } as Record<string, Tr>,
};

type Of = { id: string; estado: string; precio: number | null; proveedor: string | null; updated_at: string; prov: { nombre: string } | null };
type Ped = {
  id: string; numero: number; mpn: string | null; unidades: string | null; estado: string; precio_cliente: number | null;
  cliente: { id: string; nombre: string } | null; referencia: { mpn: string } | null; ofertas: Of[];
};
type Tarea = {
  id: string; titulo: string; notas: string | null; pedido_id: string | null; vence: string | null; hecha: boolean; hecha_el: string | null; clave: string | null;
  pedido: { mpn: string | null; cliente_id: string; cliente: { nombre: string } | null } | null;
};

export type Kind = "buscar" | "contactar" | "esperando" | "anotar" | "cotizar" | "cantidad";
type AutoTask = { key: string; kind: Kind; title: Tr; sub: string; ped: Ped };

const KINDS: { kind: Kind; label: Tr; action: Tr; tone: string }[] = [
  { kind: "buscar", label: ["Buscar proveedor", "Find a supplier"], action: ["Buscar", "Find"], tone: "bad" },
  { kind: "contactar", label: ["Contactar proveedores", "Contact suppliers"], action: ["Contactar", "Contact"], tone: "warn" },
  { kind: "anotar", label: ["Anotar precios recibidos", "Log received prices"], action: ["Anotar", "Log"], tone: "warn" },
  { kind: "cotizar", label: ["Pasar precio al cliente", "Quote the client"], action: ["Cotizar", "Quote"], tone: "ok" },
  { kind: "esperando", label: ["Esperando respuesta", "Awaiting reply"], action: ["Reclamar", "Chase"], tone: "info" },
  { kind: "cantidad", label: ["Confirmar cantidad", "Confirm quantity"], action: ["Ver pedido", "View order"], tone: "muted" },
];

const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const provName = (o: Of) => o.prov?.nombre ?? o.proveedor ?? "—";
const mpnOf = (p: Ped) => p.referencia?.mpn ?? p.mpn ?? "—";

function autoTasks(peds: Ped[], lang: Lang): AutoTask[] {
  const out: AutoTask[] = [];
  for (const p of peds) {
    const mpn = mpnOf(p);
    const cli = p.cliente?.nombre ?? "—";
    const live = p.ofertas.filter((o) => o.estado !== "descartado");
    // La clave incluye las ofertas implicadas: si cambian, la tarea vuelve a salir aunque se hubiera quitado
    const push = (kind: Kind, title: Tr, sub: string, ofs: Of[] = []) =>
      out.push({ key: kind + ":" + p.id + ":" + ofs.map((o) => o.id).sort().join(","), kind, title, sub, ped: p });
    if (!live.length) push("buscar", C.tBuscar(mpn), [cli, p.unidades].filter(Boolean).join(" · "));
    const porC = live.filter((o) => o.estado === "por_contactar");
    if (porC.length) push("contactar", C.tContactar(porC.length, mpn), cli + " · " + porC.map(provName).join(", "), porC);
    const resp = live.filter((o) => (o.estado === "respondido" || o.estado === "oferta") && o.precio == null);
    if (resp.length) push("anotar", C.tAnotar(resp.length, mpn), cli + " · " + resp.map(provName).join(", "), resp);
    const priced = live.filter((o) => o.precio != null);
    if (priced.length && p.precio_cliente == null) push("cotizar", C.tCotizar(mpn), cli + (p.unidades ? " · " + p.unidades : ""), priced);
    const cont = live.filter((o) => o.estado === "contactado");
    if (cont.length) {
      const oldest = Math.max(...cont.map((o) => daysAgo(o.updated_at)));
      push("esperando", C.tEsperando(cont.length, mpn), cli + " · " + cont.map(provName).join(", ") + " · " + tr(C.days(oldest), lang), cont);
    }
    if (!p.unidades || /pendiente/i.test(p.unidades)) push("cantidad", C.tCantidad(mpn), cli);
  }
  return out;
}

async function loadAll(pedidoId?: string): Promise<{ peds: Ped[]; tareas: Tarea[] }> {
  let pq = supabase.from("pedidos")
    .select("id, numero, mpn, unidades, estado, precio_cliente, cliente:clientes(id, nombre), referencia:referencias(mpn), ofertas(id, estado, precio, proveedor, updated_at, prov:proveedores(nombre))")
    .order("numero", { ascending: false }).limit(2000);
  pq = pedidoId ? pq.eq("id", pedidoId) : pq.in("estado", PEDIDOS_ABIERTOS);
  let tq = supabase.from("tareas").select("*, pedido:pedidos(mpn, cliente_id, cliente:clientes(nombre))")
    .order("vence", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(1000);
  if (pedidoId) tq = tq.eq("pedido_id", pedidoId);
  const [p, t] = await Promise.all([pq, tq]);
  return { peds: (p.data ?? []) as unknown as Ped[], tareas: (t.data ?? []) as unknown as Tarea[] };
}

const visibleAutos = (peds: Ped[], tareas: Tarea[], lang: Lang) => {
  const quitadas = new Set(tareas.filter((t) => t.clave).map((t) => t.clave));
  return autoTasks(peds, lang).filter((a) => !quitadas.has(a.key));
};

/** Nº de tareas pendientes (para el menú lateral). */
export async function contarTareas(): Promise<number> {
  const { peds, tareas } = await loadAll();
  return visibleAutos(peds, tareas, "es").length + tareas.filter((t) => !t.hecha && !t.clave).length;
}

/* ---------------- Lista de tareas (página completa o la de un chip) ---------------- */

export function TaskPanel({ lang, pedidoId, goPed, onChanged, reloadKey = 0 }: {
  lang: Lang;
  pedidoId?: string;
  goPed?: (clienteId: string, pedidoId: string, kind?: Kind) => void;
  onChanged?: () => void;
  reloadKey?: number;
}) {
  const [data, setData] = useState<{ peds: Ped[]; tareas: Tarea[] } | null>(null);
  const [titulo, setTitulo] = useState("");
  const [vence, setVence] = useState("");
  const [pedSel, setPedSel] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setData(await loadAll(pedidoId)), [pedidoId]);
  useEffect(() => { load(); }, [load, reloadKey]);

  const autos = useMemo(() => (data ? visibleAutos(data.peds, data.tareas, lang) : []), [data, lang]);
  if (!data) return <div className="offers offers--card tasks-card"><p className="offers__empty">{tr(C.loading, lang)}</p></div>;

  const pend = data.tareas.filter((t) => !t.hecha && !t.clave);
  const hechas = data.tareas.filter((t) => t.hecha);
  const today = new Date().toISOString().slice(0, 10);
  const changed = async () => { await load(); onChanged?.(); };

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
    await supabase.from("tareas").insert({ titulo: tr(a.title, lang), clave: a.key, pedido_id: a.ped.id, hecha: true, hecha_el: new Date().toISOString() });
    await changed();
  }

  const go = (cid: string | undefined, pid: string, kind?: Kind) => { if (cid && goPed) goPed(cid, pid, kind); };
  const total = autos.length + pend.length;
  const groups = KINDS.map((k) => ({ ...k, items: autos.filter((a) => a.kind === k.kind) })).filter((g) => g.items.length);

  const trash = (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8l.6-8.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
  );

  return (
    <div className="offers offers--card tasks-card">
      <div className="offers__head">
        <span className="offers__title">{tr(pedidoId ? C.tasksOf : C.tasks, lang)} · {total}</span>
      </div>

      <form className="task-new" onSubmit={addTask}>
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

      {total === 0 && <p className="offers__empty">{tr(C.noTasks, lang)}</p>}

      {pend.length > 0 && (
        <div className="tgroup">
          <div className="tgroup__head"><span className="task__dot task__dot--accent" /> {tr(C.mine, lang)} <span className="tgroup__n">{pend.length}</span></div>
          <ul className="tasks">
            {pend.map((t) => (
              <li key={t.id} className="task">
                <button type="button" className="task__check" title={tr(C.markDone, lang)} aria-label={tr(C.markDone, lang)} onClick={() => toggle(t)} />
                <div className="task__main">
                  <span className="task__title">{t.titulo}</span>
                  {(t.pedido || t.vence || t.notas) && (
                    <span className="task__sub">
                      {!pedidoId && t.pedido && <span>{t.pedido.mpn} · {t.pedido.cliente?.nombre}</span>}
                      {t.notas && <span>{t.notas}</span>}
                      {t.vence && <span className={"task__due" + (t.vence < today ? " is-late" : "")}>{tr(C.due, lang)} {date(t.vence, lang)}</span>}
                    </span>
                  )}
                </div>
                {!pedidoId && t.pedido_id && t.pedido && goPed && <button type="button" className="chipbtn" onClick={() => go(t.pedido!.cliente_id, t.pedido_id!)}>→</button>}
                <button type="button" className="iconbtn task__del" title={tr(C.remove, lang)} aria-label={tr(C.remove, lang)} onClick={() => removeManual(t)}>{trash}</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.kind} className="tgroup">
          <div className="tgroup__head"><span className={"task__dot task__dot--" + g.tone} /> {tr(g.label, lang)} <span className="tgroup__n">{g.items.length}</span></div>
          <ul className="tasks">
            {g.items.map((a) => (
              <li key={a.key} className="task task--auto">
                <span className="task__auto" title={tr(C.autoTag, lang)}>⚡</span>
                <div className="task__main">
                  <span className="task__title">{tr(a.title, lang)}</span>
                  <span className="task__sub">{a.sub}</span>
                </div>
                {goPed && <button type="button" className={"chipbtn chipbtn--contact"} onClick={() => go(a.ped.cliente?.id, a.ped.id, a.kind)}>{tr(g.action, lang)} →</button>}
                <button type="button" className="iconbtn task__del" title={tr(C.remove, lang)} aria-label={tr(C.remove, lang)} onClick={() => dismiss(a)}>{trash}</button>
              </li>
            ))}
          </ul>
        </div>
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
                  {!t.clave && <button type="button" className="iconbtn task__del" title={tr(C.remove, lang)} aria-label={tr(C.remove, lang)} onClick={() => removeManual(t)}>{trash}</button>}
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

export default function Tareas({ lang, goSuppliers, goClient, onChanged }: {
  lang: Lang;
  goSuppliers: (clienteId: string, pedidoId: string) => void;
  goClient: (clienteId: string) => void;
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

      <TaskPanel lang={lang} goPed={goPed} onChanged={() => { setKey((k) => k + 1); onChanged(); }} />

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
