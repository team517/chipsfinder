// Situación y tareas: en qué punto está cada chip pedido y qué falta por hacer.
// Las tareas automáticas salen de los pedidos abiertos y sus ofertas, y desaparecen solas
// cuando se hace el trabajo. Las manuales se guardan en la tabla "tareas".

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
  kWaiting: ["Sin responder", "No reply"] as Tr,
  kWaitingSub: ["proveedores contactados", "suppliers contacted"] as Tr,
  kReady: ["Para cotizar", "Ready to quote"] as Tr,
  kReadySub: ["con precio, falta dárselo al cliente", "priced, client not quoted yet"] as Tr,
  tasks: ["Tareas pendientes", "Pending tasks"] as Tr,
  noTasks: ["Todo al día. No hay nada pendiente.", "All caught up. Nothing pending."] as Tr,
  newTask: ["Nueva tarea…", "New task…"] as Tr,
  add: ["Añadir", "Add"] as Tr,
  linkTo: ["— Sin chip —", "— No chip —"] as Tr,
  due: ["Vence", "Due"] as Tr,
  done: ["Hechas", "Done"] as Tr,
  manual: ["Manual", "Manual"] as Tr,
  del: ["Borrar", "Delete"] as Tr,
  situation: ["Chips sin precio de proveedor", "Chips without a supplier price"] as Tr,
  allPriced: ["Todos los chips abiertos tienen ya algún precio.", "Every open chip already has a price."] as Tr,
  colChip: ["Chip", "Chip"] as Tr,
  colClient: ["Cliente", "Client"] as Tr,
  colUnits: ["Unidades", "Units"] as Tr,
  colSup: ["Proveedores", "Suppliers"] as Tr,
  // tareas automáticas
  tBuscar: (mpn: string): Tr => [`Buscar proveedor para ${mpn}`, `Find a supplier for ${mpn}`],
  tContactar: (n: number, mpn: string): Tr => [`Contactar ${n === 1 ? "1 proveedor" : n + " proveedores"} · ${mpn}`, `Contact ${n === 1 ? "1 supplier" : n + " suppliers"} · ${mpn}`],
  tReclamar: (n: number, mpn: string): Tr => [`Reclamar respuesta a ${n === 1 ? "1 proveedor" : n + " proveedores"} · ${mpn}`, `Chase ${n === 1 ? "1 supplier" : n + " suppliers"} for a reply · ${mpn}`],
  tAnotar: (n: number, mpn: string): Tr => [`Anotar el precio de ${n === 1 ? "1 respuesta" : n + " respuestas"} · ${mpn}`, `Log the price from ${n === 1 ? "1 reply" : n + " replies"} · ${mpn}`],
  tCotizar: (mpn: string): Tr => [`Pasar precio al cliente · ${mpn}`, `Send price to client · ${mpn}`],
  tCantidad: (mpn: string): Tr => [`Confirmar cantidad con el cliente · ${mpn}`, `Confirm quantity with client · ${mpn}`],
  days: (d: number): Tr => [d === 0 ? "hoy" : d === 1 ? "hace 1 día" : `hace ${d} días`, d === 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`],
  go: ["Ir", "Go"] as Tr,
  st: { por_contactar: ["por contactar", "to contact"], contactado: ["sin responder", "no reply"], respondido: ["respondido", "replied"], oferta: ["con oferta", "quoted"], descartado: ["descartado", "discarded"] } as Record<string, Tr>,
};

type Of = { id: string; estado: string; precio: number | null; proveedor: string | null; updated_at: string; prov: { nombre: string } | null };
type Ped = {
  id: string; numero: number; mpn: string | null; unidades: string | null; estado: string; precio_cliente: number | null;
  cliente: { id: string; nombre: string } | null; referencia: { mpn: string } | null; ofertas: Of[];
};
type Tarea = { id: string; titulo: string; notas: string | null; pedido_id: string | null; vence: string | null; hecha: boolean; hecha_el: string | null; pedido: { mpn: string | null; cliente_id: string; cliente: { nombre: string } | null } | null };

type Kind = "buscar" | "contactar" | "reclamar" | "anotar" | "cotizar" | "cantidad";
type AutoTask = { key: string; kind: Kind; title: Tr; sub: string; ped: Ped; tone: string; order: number };

const TONE: Record<Kind, string> = { buscar: "bad", contactar: "warn", reclamar: "info", anotar: "warn", cotizar: "ok", cantidad: "muted" };
const ORDER: Record<Kind, number> = { buscar: 0, contactar: 1, anotar: 2, cotizar: 3, reclamar: 4, cantidad: 5 };
const LABEL: Record<Kind, Tr> = {
  buscar: ["Buscar", "Find"], contactar: ["Contactar", "Contact"], reclamar: ["Reclamar", "Chase"],
  anotar: ["Anotar", "Log"], cotizar: ["Cotizar", "Quote"], cantidad: ["Cantidad", "Quantity"],
};

const daysAgo = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const provName = (o: Of) => o.prov?.nombre ?? o.proveedor ?? "—";
const mpnOf = (p: Ped) => p.referencia?.mpn ?? p.mpn ?? "—";

function autoTasks(peds: Ped[], lang: Lang): AutoTask[] {
  const out: AutoTask[] = [];
  for (const p of peds) {
    const mpn = mpnOf(p);
    const cli = p.cliente?.nombre ?? "—";
    const live = p.ofertas.filter((o) => o.estado !== "descartado");
    const push = (kind: Kind, title: Tr, sub: string) => out.push({ key: kind + p.id, kind, title, sub, ped: p, tone: TONE[kind], order: ORDER[kind] });
    if (!live.length) push("buscar", C.tBuscar(mpn), [cli, p.unidades].filter(Boolean).join(" · "));
    const porC = live.filter((o) => o.estado === "por_contactar");
    if (porC.length) push("contactar", C.tContactar(porC.length, mpn), cli + " · " + porC.map(provName).join(", "));
    const resp = live.filter((o) => (o.estado === "respondido" || o.estado === "oferta") && o.precio == null);
    if (resp.length) push("anotar", C.tAnotar(resp.length, mpn), cli + " · " + resp.map(provName).join(", "));
    const priced = live.some((o) => o.precio != null);
    if (priced && p.precio_cliente == null) push("cotizar", C.tCotizar(mpn), cli + (p.unidades ? " · " + p.unidades : ""));
    const cont = live.filter((o) => o.estado === "contactado");
    if (cont.length) {
      const oldest = Math.max(...cont.map((o) => daysAgo(o.updated_at)));
      push("reclamar", C.tReclamar(cont.length, mpn), cli + " · " + cont.map(provName).join(", ") + " · " + tr(C.days(oldest), lang));
    }
    if (!p.unidades || /pendiente/i.test(p.unidades)) push("cantidad", C.tCantidad(mpn), cli);
  }
  return out.sort((a, b) => a.order - b.order);
}

async function loadAll(): Promise<{ peds: Ped[]; tareas: Tarea[] }> {
  const [p, t] = await Promise.all([
    supabase.from("pedidos")
      .select("id, numero, mpn, unidades, estado, precio_cliente, cliente:clientes(id, nombre), referencia:referencias(mpn), ofertas(id, estado, precio, proveedor, updated_at, prov:proveedores(nombre))")
      .in("estado", PEDIDOS_ABIERTOS).order("numero", { ascending: false }).limit(2000),
    supabase.from("tareas").select("*, pedido:pedidos(mpn, cliente_id, cliente:clientes(nombre))").order("hecha").order("vence", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(500),
  ]);
  return { peds: (p.data ?? []) as unknown as Ped[], tareas: (t.data ?? []) as unknown as Tarea[] };
}

/** Nº de tareas pendientes (para el menú lateral). */
export async function contarTareas(): Promise<number> {
  const { peds, tareas } = await loadAll();
  return autoTasks(peds, "es").length + tareas.filter((t) => !t.hecha).length;
}

export default function Tareas({ lang, goSuppliers, goClient, onChanged }: {
  lang: Lang;
  goSuppliers: (clienteId: string, pedidoId: string) => void;
  goClient: (clienteId: string) => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<{ peds: Ped[]; tareas: Tarea[] } | null>(null);
  const [titulo, setTitulo] = useState("");
  const [vence, setVence] = useState("");
  const [pedId, setPedId] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => setData(await loadAll()), []);
  useEffect(() => { load(); }, [load]);

  const autos = useMemo(() => (data ? autoTasks(data.peds, lang) : []), [data, lang]);

  if (!data) return <div className="state" style={{ marginTop: 24 }}>{tr(C.loading, lang)}</div>;

  const { peds, tareas } = data;
  const pend = tareas.filter((t) => !t.hecha);
  const hechas = tareas.filter((t) => t.hecha);
  const sinPrecio = peds.filter((p) => !p.ofertas.some((o) => o.estado !== "descartado" && o.precio != null));
  const sinResp = peds.reduce((n, p) => n + p.ofertas.filter((o) => o.estado === "contactado").length, 0);
  const paraCotizar = peds.filter((p) => p.precio_cliente == null && p.ofertas.some((o) => o.estado !== "descartado" && o.precio != null)).length;

  const goPed = (p: { id: string; cliente_id?: string; cliente?: { id: string } | null }, kind?: Kind) => {
    const cid = p.cliente?.id ?? p.cliente_id;
    if (!cid) return;
    if (kind === "cotizar" || kind === "cantidad") goClient(cid);
    else goSuppliers(cid, p.id);
  };

  async function addTask(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || busy) return;
    setBusy(true);
    await supabase.from("tareas").insert({ titulo: titulo.trim(), vence: vence || null, pedido_id: pedId || null });
    setBusy(false);
    setTitulo(""); setVence(""); setPedId("");
    await load(); onChanged();
  }
  async function toggle(t: Tarea) {
    await supabase.from("tareas").update({ hecha: !t.hecha, hecha_el: t.hecha ? null : new Date().toISOString() }).eq("id", t.id);
    await load(); onChanged();
  }
  async function remove(t: Tarea) {
    await supabase.from("tareas").delete().eq("id", t.id);
    await load(); onChanged();
  }

  const today = new Date().toISOString().slice(0, 10);

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
        <div className="kpi"><span className="kpi__label">{tr(C.kWaiting, lang)}</span><span className="kpi__value">{num(sinResp, lang)}</span><span className="kpi__sub">{tr(C.kWaitingSub, lang)}</span></div>
        <div className="kpi"><span className="kpi__label">{tr(C.kReady, lang)}</span><span className="kpi__value">{num(paraCotizar, lang)}</span><span className="kpi__sub">{tr(C.kReadySub, lang)}</span></div>
      </div>

      <div className="offers offers--card tasks-card">
        <div className="offers__head">
          <span className="offers__title">{tr(C.tasks, lang)} · {autos.length + pend.length}</span>
        </div>

        <form className="task-new" onSubmit={addTask}>
          <input className="input input--sm task-new__title" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tr(C.newTask, lang)} />
          <select className="input input--sm task-new__ped" value={pedId} onChange={(e) => setPedId(e.target.value)}>
            <option value="">{tr(C.linkTo, lang)}</option>
            {peds.map((p) => <option key={p.id} value={p.id}>{mpnOf(p)} · {p.cliente?.nombre ?? "—"}</option>)}
          </select>
          <input className="input input--sm task-new__due" type="date" value={vence} onChange={(e) => setVence(e.target.value)} aria-label={tr(C.due, lang)} />
          <button type="submit" className="btn btn--primary btn--sm" disabled={!titulo.trim() || busy}>{tr(C.add, lang)}</button>
        </form>

        {autos.length + pend.length === 0 ? (
          <p className="offers__empty">{tr(C.noTasks, lang)}</p>
        ) : (
          <ul className="tasks">
            {pend.map((t) => (
              <li key={t.id} className="task">
                <button type="button" className="task__check" aria-label="✓" onClick={() => toggle(t)} />
                <div className="task__main">
                  <span className="task__title">{t.titulo}</span>
                  <span className="task__sub">
                    {[t.pedido ? (t.pedido.mpn ?? "") + " · " + (t.pedido.cliente?.nombre ?? "") : null, t.notas].filter(Boolean).join(" · ")}
                    {t.vence && <span className={"task__due" + (t.vence < today ? " is-late" : "")}>{tr(C.due, lang)} {date(t.vence, lang)}</span>}
                  </span>
                </div>
                <span className="pill pill--muted">{tr(C.manual, lang)}</span>
                {t.pedido_id && t.pedido && <button type="button" className="chipbtn" onClick={() => goPed({ id: t.pedido_id!, cliente_id: t.pedido!.cliente_id })}>{tr(C.go, lang)} →</button>}
                <button type="button" className="chipbtn chipbtn--danger" onClick={() => remove(t)}>{tr(C.del, lang)}</button>
              </li>
            ))}
            {autos.map((a) => (
              <li key={a.key} className="task task--auto">
                <span className={"task__dot task__dot--" + a.tone} aria-hidden="true" />
                <div className="task__main">
                  <span className="task__title">{tr(a.title, lang)}</span>
                  <span className="task__sub">{a.sub}</span>
                </div>
                <span className={"pill pill--" + a.tone}>{tr(LABEL[a.kind], lang)}</span>
                <button type="button" className="chipbtn chipbtn--contact" onClick={() => goPed(a.ped, a.kind)}>{tr(C.go, lang)} →</button>
              </li>
            ))}
          </ul>
        )}

        {hechas.length > 0 && (
          <div className="tasks-done">
            <button type="button" className="linkbtn" onClick={() => setShowDone((v) => !v)}>{showDone ? "▾" : "▸"} {tr(C.done, lang)} · {hechas.length}</button>
            {showDone && (
              <ul className="tasks">
                {hechas.slice(0, 30).map((t) => (
                  <li key={t.id} className="task is-done">
                    <button type="button" className="task__check is-on" aria-label="✓" onClick={() => toggle(t)}>✓</button>
                    <div className="task__main"><span className="task__title">{t.titulo}</span>{t.hecha_el && <span className="task__sub">{date(t.hecha_el, lang)}</span>}</div>
                    <button type="button" className="chipbtn chipbtn--danger" onClick={() => remove(t)}>{tr(C.del, lang)}</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

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
                  return (
                    <tr key={p.id} tabIndex={0} onClick={() => goPed(p)} onKeyDown={(e) => { if (e.key === "Enter") goPed(p); }}>
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
