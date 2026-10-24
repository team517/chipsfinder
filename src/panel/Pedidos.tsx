import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Lang } from "../i18n";
import { supabase } from "../auth";
import { PEDIDO_ESTADOS } from "./entities";
import { StatusPill } from "./EntityPage";
import { money, moneyCur, num, text, tr, type Tr } from "./format";
import { EstadoPill, OfferEditor } from "./sourcing";
import {
  clienteNuevo,
  deleteOferta,
  deletePedido,
  fetchCliente,
  fetchClientesConPedidos,
  savePedido,
  setElegida,
  setPrecioCliente,
  type Cliente,
  type ClienteResumen,
  type Oferta,
  type Pedido,
  type PedidoInput,
} from "./pedidos-data";

const C = {
  eyebrow: ["Pedidos entrantes", "Incoming orders"] as Tr,
  title: ["Pedidos", "Orders"] as Tr,
  intro: [
    "Cada cliente y lo que te ha pedido. Entra en uno para ver sus referencias y precios.",
    "Each client and what they asked for. Open one to see their parts and prices.",
  ] as Tr,
  newOrder: ["Nuevo pedido", "New order"] as Tr,
  newItem: ["Nueva referencia", "New part"] as Tr,
  search: ["Buscar cliente…", "Search client…"] as Tr,
  clients: (n: number): Tr => [n === 1 ? "1 cliente" : n + " clientes", n === 1 ? "1 client" : n + " clients"],
  loading: ["Cargando…", "Loading…"] as Tr,
  loadErr: ["No se pudo cargar.", "Could not load."] as Tr,
  retry: ["Reintentar", "Retry"] as Tr,
  empty: ["Todavía no hay pedidos. Crea el primero.", "No orders yet. Create the first one."] as Tr,
  noMatch: ["Ningún cliente coincide.", "No client matches."] as Tr,
  items: (n: number): Tr => [n === 1 ? "1 referencia" : n + " referencias", n === 1 ? "1 part" : n + " parts"],
  back: ["Pedidos", "Orders"] as Tr,
  backClient: ["Referencias", "Parts"] as Tr,
  client: ["Cliente", "Client"] as Tr,
  // proceso
  stNuevo: ["Nuevo", "New"] as Tr,
  stCotizando: ["Cotizando", "Quoting"] as Tr,
  stEnCurso: ["En curso", "In progress"] as Tr,
  stCerrado: ["Cerrado", "Closed"] as Tr,
  process: ["Proceso", "Stage"] as Tr,
  // lista de referencias
  colRef: ["Referencia", "Part"] as Tr,
  colUnits: ["Unidades", "Units"] as Tr,
  colSuppliers: ["Prov.", "Sup."] as Tr,
  colBest: ["Mejor precio", "Best price"] as Tr,
  colOur: ["Nuestro", "Ours"] as Tr,
  // detalle
  target: ["Objetivo cliente", "Client target"] as Tr,
  ourPrice: ["Precio que damos", "Our price"] as Tr,
  units: ["Unidades", "Units"] as Tr,
  margin: ["Margen", "Margin"] as Tr,
  offers: ["Proveedores", "Suppliers"] as Tr,
  addOffer: ["Añadir proveedor", "Add supplier"] as Tr,
  noOffers: ["Aún no hay proveedores para esta referencia.", "No suppliers for this part yet."] as Tr,
  chosen: ["Elegido", "Chosen"] as Tr,
  choose: ["Elegir", "Choose"] as Tr,
  write: ["Escribir", "Email"] as Tr,
  visit: ["Abrir", "Open"] as Tr,
  edit: ["Editar", "Edit"] as Tr,
  del: ["Borrar", "Delete"] as Tr,
  delItem: ["¿Borrar esta referencia y sus proveedores?", "Delete this part and its suppliers?"] as Tr,
  delOffer: ["¿Borrar este proveedor?", "Delete this supplier?"] as Tr,
  yes: ["Sí, borrar", "Yes, delete"] as Tr,
  cancel: ["Cancelar", "Cancel"] as Tr,
  close: ["Cerrar", "Close"] as Tr,
  save: ["Guardar", "Save"] as Tr,
  saving: ["Guardando…", "Saving…"] as Tr,
  // recomendador
  calc: ["Precio y margen", "Price and margin"] as Tr,
  qty: ["Cantidad", "Quantity"] as Tr,
  cost: ["Coste del proveedor (€/ud.)", "Supplier cost (€/unit)"] as Tr,
  costFrom: (s: string): Tr => ["Del proveedor " + s, "From supplier " + s],
  reco: ["Precio recomendado", "Recommended price"] as Tr,
  yourQuote: ["Precio que le das (€/ud.)", "Your quote (€/unit)"] as Tr,
  totalSale: ["Venta total", "Total sale"] as Tr,
  totalCost: ["Coste total", "Total cost"] as Tr,
  profit: ["Tu beneficio", "Your profit"] as Tr,
  marginPct: ["Margen", "Margin"] as Tr,
  useReco: ["Usar el recomendado", "Use recommended"] as Tr,
  savePrice: ["Guardar este precio", "Save this price"] as Tr,
  saved: ["Guardado", "Saved"] as Tr,
  noCost: ["Añade un proveedor con precio para calcular el margen.", "Add a supplier with a price to work out the margin."] as Tr,
  vGreat: ["Buen precio: margen sano para ti y dentro de lo que quiere pagar el cliente.", "Good price: a healthy margin for you and within the client's budget."] as Tr,
  vTight: ["El margen es pequeño; mira si puedes conseguir mejor coste o subir un poco el precio.", "The margin is slim; try to get a better cost or raise the price a bit."] as Tr,
  vOk: ["Precio con un margen sano para reventa.", "A price with a healthy resale margin."] as Tr,
  vLoss: ["Cuidado: a este precio vendes por debajo del coste y pierdes dinero.", "Warning: at this price you sell below cost and lose money."] as Tr,
  vAbove: ["Por encima de lo que quiere pagar el cliente; quizá pida rebaja. Buen margen para ti.", "Above what the client wants to pay; they may ask for a discount. Good margin for you."] as Tr,
  targetBelow: (c: string): Tr => [
    "El objetivo del cliente está por debajo del coste del proveedor (" + c + "). No se puede llegar a ese precio sin perder.",
    "The client's target is below the supplier cost (" + c + "). You can't reach it without a loss.",
  ],
  factorsT: ["A tener en cuenta", "Keep in mind"] as Tr,
  factors: [
    ["Pedido mínimo (MOQ) del proveedor", "Supplier minimum order (MOQ)"],
    ["Plazo de entrega y urgencia del cliente", "Lead time and client urgency"],
    ["Condición y date code del lote", "Batch condition and date code"],
    ["Escasez o exceso en el mercado", "Market shortage or surplus"],
    ["Divisa y transporte/aduanas", "Currency and shipping/customs"],
  ] as Tr[],
  // form
  fFind: ["Referencia (MPN)", "Part (MPN)"] as Tr,
  fDesc: ["Descripción", "Description"] as Tr,
  fUnits: ["Unidades (lo que pide)", "Units (as requested)"] as Tr,
  fUnitsHint: ["Tal cual: «150 y 200 uds.»", "As stated: “150 and 200 pcs”"] as Tr,
  fQty: ["Cantidad para calcular", "Quantity for the maths"] as Tr,
  fTarget: ["Objetivo del cliente (€/ud.)", "Client target (€/unit)"] as Tr,
  fStatus: ["Estado", "Status"] as Tr,
  fNotes: ["Observaciones", "Notes"] as Tr,
  pickClient: ["Cliente", "Client"] as Tr,
  newClient: ["➕ Cliente nuevo", "➕ New client"] as Tr,
  clientName: ["Nombre del cliente", "Client name"] as Tr,
  clientEmail: ["Correo del cliente", "Client email"] as Tr,
  oSupplier: ["Proveedor", "Supplier"] as Tr,
  oPick: ["— Proveedor nuevo —", "— New supplier —"] as Tr,
  oName: ["Nombre del proveedor", "Supplier name"] as Tr,
  oEmail: ["Correo", "Email"] as Tr,
  oWeb: ["Enlace / web", "Link / website"] as Tr,
  oCountry: ["País", "Country"] as Tr,
  oPrice: ["Precio del proveedor (€/ud.)", "Supplier price (€/unit)"] as Tr,
  oAvail: ["Disponibilidad", "Availability"] as Tr,
  oAvailHint: ["«Anuncia 8.163 uds.», «Bajo pedido…»", "“Lists 8,163 pcs”, “On order…”"] as Tr,
  oChosen: ["Marcar como proveedor elegido", "Mark as chosen supplier"] as Tr,
  reqErr: ["Rellena los campos obligatorios.", "Fill in the required fields."] as Tr,
  saveErr: ["No se pudo guardar. Inténtalo de nuevo.", "Could not save. Try again."] as Tr,
};

const estadoOf = (v: string, lang: Lang) => {
  const o = PEDIDO_ESTADOS.find((e) => e.value === v);
  return o ? (lang === "es" ? o.label[0] : o.label[1]) : v;
};

type Stage = "nuevo" | "cotizando" | "curso" | "cerrado";
function stageOf(estados: string[]): Stage {
  if (estados.length === 0) return "nuevo";
  if (estados.some((e) => e === "confirmado" || e === "enviado")) return "curso";
  if (estados.every((e) => e === "cerrado" || e === "perdido")) return "cerrado";
  if (estados.some((e) => e === "cotizado")) return "cotizando";
  return "nuevo";
}
const stageTone: Record<Stage, string> = { nuevo: "accent", cotizando: "info", curso: "warn", cerrado: "muted" };
const stageLabel = (s: Stage) => (s === "nuevo" ? C.stNuevo : s === "cotizando" ? C.stCotizando : s === "curso" ? C.stEnCurso : C.stCerrado);

const firstNum = (s: string | null | undefined): number | null => {
  const m = (s ?? "").replace(/[.,](?=\d{3}\b)/g, "").match(/\d+/);
  return m ? Number(m[0]) : null;
};
const bestCost = (p: Pedido): { cost: number; name: string } | null => {
  const live = p.ofertas.filter((o) => o.precio != null && o.estado !== "descartado");
  const eur = live.filter((o) => (o.moneda ?? "EUR") === "EUR");
  const withPrice = eur.length ? eur : live;
  if (!withPrice.length) return null;
  const chosen = withPrice.find((o) => o.elegida);
  const o = chosen ?? withPrice.reduce((a, b) => ((b.precio ?? 0) < (a.precio ?? 0) ? b : a));
  return { cost: o.precio as number, name: o.proveedor ?? "" };
};

export default function Pedidos({
  lang,
  isAdmin,
  clienteId,
  onOpen,
  onChanged,
}: {
  lang: Lang;
  isAdmin: boolean;
  clienteId: string | null;
  onOpen: (id: string | null) => void;
  onChanged: () => void;
}) {
  return clienteId ? (
    <ClientDetail key={clienteId} lang={lang} isAdmin={isAdmin} clienteId={clienteId} onBack={() => onOpen(null)} onChanged={onChanged} />
  ) : (
    <ClientsGrid lang={lang} onOpen={onOpen} onChanged={onChanged} />
  );
}

/* ---------------- Lista de clientes ---------------- */

function ClientsGrid({ lang, onOpen, onChanged }: { lang: Lang; onOpen: (id: string) => void; onChanged: () => void }) {
  const [rows, setRows] = useState<(ClienteResumen & { estados?: string[] })[] | null>(null);
  const [stages, setStages] = useState<Record<string, Stage>>({});
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setErr(false);
    const res = await fetchClientesConPedidos();
    if (!res.ok) return setErr(true), setRows([]);
    setRows(res.data);
    // proceso por cliente
    const { data } = await supabase.from("pedidos").select("cliente_id, estado").limit(5000);
    const byClient: Record<string, string[]> = {};
    for (const r of (data ?? []) as { cliente_id: string; estado: string }[]) (byClient[r.cliente_id] ??= []).push(r.estado);
    const st: Record<string, Stage> = {};
    for (const id in byClient) st[id] = stageOf(byClient[id]);
    setStages(st);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !n || r.nombre.toLowerCase().includes(n) || (r.email ?? "").toLowerCase().includes(n));
  }, [rows, q]);

  return (
    <section className="page-sec">
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">01</span>{tr(C.eyebrow, lang)}</span>
          <h1 className="sec-title">{tr(C.title, lang)}</h1>
          <p className="sec-intro">{tr(C.intro, lang)}</p>
        </div>
        <button type="button" className="btn btn--primary btn--new" onClick={() => setCreating(true)}>
          <span aria-hidden="true">+</span> {tr(C.newOrder, lang)}
        </button>
      </header>

      <div className="toolbar">
        <label className="search">
          <span className="sr-only">{tr(C.search, lang)}</span>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(C.search, lang)} className="search__input" />
        </label>
        {rows && <span className="toolbar__count">{tr(C.clients(filtered.length), lang)}</span>}
      </div>

      {rows === null ? (
        <div className="state">{tr(C.loading, lang)}</div>
      ) : err ? (
        <div className="state"><span className="note__tag">ERR</span> {tr(C.loadErr, lang)} <button className="linkbtn" onClick={load}>{tr(C.retry, lang)}</button></div>
      ) : rows.length === 0 ? (
        <div className="state state--empty">
          <span className="state__code">01</span>
          <p className="state__text">{tr(C.empty, lang)}</p>
          <button type="button" className="btn btn--primary btn--new" onClick={() => setCreating(true)}><span aria-hidden="true">+</span> {tr(C.newOrder, lang)}</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="state">{tr(C.noMatch, lang)}</div>
      ) : (
        <div className="client-grid">
          {filtered.map((c) => {
            const st = stages[c.id] ?? "nuevo";
            return (
              <button key={c.id} type="button" className="client-card" onClick={() => onOpen(c.id)}>
                <div className="client-card__top">
                  <span className="client-card__avatar" aria-hidden="true">{c.nombre.slice(0, 1).toUpperCase()}</span>
                  <span className="client-card__name">{c.nombre}</span>
                  <span className={"pill pill--" + stageTone[st]}>{tr(stageLabel(st), lang)}</span>
                </div>
                {(c.contacto || c.email || c.pais) && (
                  <span className="client-card__meta">{[c.contacto, c.email, c.pais].filter(Boolean).join(" · ")}</span>
                )}
                <div className="client-card__stats">
                  <span className="cstat"><b>{num(c.articulos, lang)}</b> {lang === "es" ? "ref." : "parts"}</span>
                  <span className="cstat"><b>{num(c.ofertas, lang)}</b> {lang === "es" ? "prov." : "sup."}</span>
                  {c.abiertos > 0 && <span className="cstat cstat--open"><b>{num(c.abiertos, lang)}</b> {lang === "es" ? "abiertos" : "open"}</span>}
                  <span className="client-card__arrow" aria-hidden="true">→</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {creating && <ItemDrawer lang={lang} onClose={() => setCreating(false)} onSaved={(cid) => { setCreating(false); onChanged(); onOpen(cid); }} />}
    </section>
  );
}

/* ---------------- Detalle de un cliente: lista de referencias + ficha ---------------- */

function ClientDetail({
  lang, isAdmin, clienteId, onBack, onChanged,
}: {
  lang: Lang; isAdmin: boolean; clienteId: string; onBack: () => void; onChanged: () => void;
}) {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [err, setErr] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  const [itemDrawer, setItemDrawer] = useState<Pedido | "new" | null>(null);

  const load = useCallback(async () => {
    setErr(false);
    const res = await fetchCliente(clienteId);
    if (!res.ok) return setErr(true);
    setCliente(res.data.cliente);
    setPedidos(res.data.pedidos);
  }, [clienteId]);
  useEffect(() => {
    load();
  }, [load]);

  async function reload() {
    await load();
    onChanged();
  }

  if (err) return <div className="state" style={{ marginTop: 24 }}><span className="note__tag">ERR</span> {tr(C.loadErr, lang)} <button className="linkbtn" onClick={load}>{tr(C.retry, lang)}</button></div>;
  if (!cliente || pedidos === null) return <div className="state" style={{ marginTop: 24 }}>{tr(C.loading, lang)}</div>;

  const selected = selId ? pedidos.find((p) => p.id === selId) ?? null : null;
  const stage = stageOf(pedidos.map((p) => p.estado));

  // Vista: ficha de una referencia
  if (selected) {
    return (
      <section className="page-sec">
        <button type="button" className="backlink" onClick={() => setSelId(null)}>← {cliente.nombre} · {tr(C.backClient, lang)}</button>
        <ItemDetail lang={lang} isAdmin={isAdmin} pedido={selected}
          onEdit={() => setItemDrawer(selected)}
          onDeleted={async () => { setSelId(null); await reload(); }}
          onChanged={reload}
        />
        {itemDrawer && (
          <ItemDrawer lang={lang} fixedCliente={cliente} pedido={itemDrawer === "new" ? undefined : itemDrawer}
            onClose={() => setItemDrawer(null)} onSaved={() => { setItemDrawer(null); reload(); }} />
        )}
      </section>
    );
  }

  // Vista: lista de referencias del cliente
  return (
    <section className="page-sec">
      <button type="button" className="backlink" onClick={onBack}>← {tr(C.back, lang)}</button>

      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">01</span>{tr(C.client, lang)}</span>
          <h1 className="sec-title">{cliente.nombre}</h1>
          <p className="sec-intro">
            <span className={"pill pill--" + stageTone[stage]} style={{ marginRight: 10 }}>{tr(C.process, lang)}: {tr(stageLabel(stage), lang)}</span>
            {[cliente.contacto, cliente.email, cliente.sector, cliente.pais].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button type="button" className="btn btn--primary btn--new" onClick={() => setItemDrawer("new")}>
          <span aria-hidden="true">+</span> {tr(C.newItem, lang)}
        </button>
      </header>

      {pedidos.length === 0 ? (
        <div className="state state--empty">
          <span className="state__code">01</span>
          <p className="state__text">{lang === "es" ? "Este cliente aún no tiene referencias." : "This client has no parts yet."}</p>
          <button type="button" className="btn btn--primary btn--new" onClick={() => setItemDrawer("new")}><span aria-hidden="true">+</span> {tr(C.newItem, lang)}</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{tr(C.colRef, lang)}</th>
                <th className="is-optional">{tr(C.colUnits, lang)}</th>
                <th className="is-right">{tr(C.colSuppliers, lang)}</th>
                <th className="is-right is-optional">{tr(C.colBest, lang)}</th>
                <th className="is-right">{tr(C.colOur, lang)}</th>
                <th>{tr(C.fStatus, lang)}</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => {
                const bc = bestCost(p);
                return (
                  <tr key={p.id} tabIndex={0} onClick={() => setSelId(p.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelId(p.id); } }}>
                    <td data-label={tr(C.colRef, lang)} className="is-strong">
                      <span className="ref-mpn">{text(p.mpn)}</span>
                      {p.descripcion && <span className="ref-desc">{p.descripcion}</span>}
                    </td>
                    <td data-label={tr(C.colUnits, lang)} className="is-optional">{text(p.unidades)}</td>
                    <td data-label={tr(C.colSuppliers, lang)} className="is-right is-mono">{p.ofertas.length}</td>
                    <td data-label={tr(C.colBest, lang)} className="is-right is-mono is-optional">{bc ? money(bc.cost, lang) : "—"}</td>
                    <td data-label={tr(C.colOur, lang)} className="is-right is-mono">{p.precio_cliente != null ? money(p.precio_cliente, lang) : "—"}</td>
                    <td data-label={tr(C.fStatus, lang)}><StatusPill options={PEDIDO_ESTADOS} value={p.estado} lang={lang} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {itemDrawer && (
        <ItemDrawer lang={lang} fixedCliente={cliente} pedido={itemDrawer === "new" ? undefined : itemDrawer}
          onClose={() => setItemDrawer(null)} onSaved={() => { setItemDrawer(null); reload(); }} />
      )}
    </section>
  );
}

/* ---------------- Ficha de una referencia ---------------- */

function ItemDetail({
  lang, isAdmin, pedido, onEdit, onDeleted, onChanged,
}: {
  lang: Lang; isAdmin: boolean; pedido: Pedido; onEdit: () => void; onDeleted: () => void; onChanged: () => void;
}) {
  const [offerFor, setOfferFor] = useState<Oferta | null | "new">(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const bc = bestCost(pedido);

  return (
    <>
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">01</span>{tr(C.client, lang)}</span>
          <h1 className="sec-title item-title">{text(pedido.mpn)}</h1>
          {pedido.descripcion && <p className="sec-intro">{pedido.descripcion}</p>}
        </div>
        <div className="item-detail__actions">
          <StatusPill options={PEDIDO_ESTADOS} value={pedido.estado} lang={lang} />
          <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit}>{tr(C.edit, lang)}</button>
          {isAdmin && (confirmDel ? (
            <span className="delconfirm">
              <button type="button" className="btn btn--danger btn--sm" onClick={async () => { await deletePedido(pedido.id); onDeleted(); }}>{tr(C.yes, lang)}</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmDel(false)}>{tr(C.cancel, lang)}</button>
            </span>
          ) : (
            <button type="button" className="btn btn--ghost btn--sm btn--del" onClick={() => setConfirmDel(true)}>{tr(C.del, lang)}</button>
          ))}
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-col">
          <div className="item__facts">
            <div className="fact"><span className="fact__k">{tr(C.units, lang)}</span><span className="fact__v">{text(pedido.unidades)}</span></div>
            <div className="fact"><span className="fact__k">{tr(C.target, lang)}</span><span className="fact__v">{pedido.precio_objetivo != null ? money(pedido.precio_objetivo, lang) : "—"}</span></div>
          </div>

          <PriceBox lang={lang} pedido={pedido} bestCost={bc} onSaved={onChanged} />

          {pedido.notas && <p className="item__notes"><span className="note__tag">INT</span> {pedido.notas}</p>}
        </div>

        <div className="detail-col">
          <div className="offers offers--card">
            <div className="offers__head">
              <span className="offers__title">{tr(C.offers, lang)} · {pedido.ofertas.length}</span>
              <button type="button" className="linkbtn" onClick={() => setOfferFor("new")}>+ {tr(C.addOffer, lang)}</button>
            </div>
            {pedido.ofertas.length === 0 ? (
              <p className="offers__empty">{tr(C.noOffers, lang)}</p>
            ) : (
              <ul className="offer-list">
                {pedido.ofertas.map((o) => (
                  <li key={o.id} className={"offer" + (o.elegida ? " is-chosen" : "")}>
                    <div className="offer__main">
                      <span className="offer__name">
                        {o.elegida && <span className="offer__star" title={tr(C.chosen, lang)}>★</span>}
                        {text(o.proveedor)}
                        {o.pais && <span className="offer__country">{o.pais}</span>}
                      </span>
                      <span className="offer__avail"><EstadoPill estado={o.estado} lang={lang} />{o.disponibilidad ? " " + o.disponibilidad : ""}</span>
                    </div>
                    <div className="offer__price"><span className="offer__eur">{moneyCur(o.precio, o.moneda, lang)}</span></div>
                    <div className="offer__actions">
                      {o.email && <a className="chipbtn" href={"mailto:" + o.email} title={o.email}>✉ {tr(C.write, lang)}</a>}
                      {o.enlace && <a className="chipbtn" href={o.enlace.startsWith("http") ? o.enlace : "https://" + o.enlace} target="_blank" rel="noopener noreferrer">↗ {tr(C.visit, lang)}</a>}
                      {!o.elegida && <button type="button" className="chipbtn" onClick={async () => { await setElegida(pedido.id, o.id); onChanged(); }}>{tr(C.choose, lang)}</button>}
                      <button type="button" className="chipbtn" onClick={() => setOfferFor(o)}>{tr(C.edit, lang)}</button>
                      <button type="button" className="chipbtn chipbtn--danger" onClick={async () => { await deleteOferta(o.id); onChanged(); }}>{tr(C.del, lang)}</button>
                    </div>
                    {o.notas && <span className="offer__notes">{o.notas}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {offerFor && (
        <OfferEditor lang={lang} pedidoId={pedido.id} oferta={offerFor === "new" ? null : offerFor}
          onClose={() => setOfferFor(null)} onSaved={() => { setOfferFor(null); onChanged(); }} />
      )}
    </>
  );
}

/* ---------------- Recomendador de precio ---------------- */

function markupFor(orderCost: number): number {
  return orderCost < 1000 ? 0.35 : orderCost < 5000 ? 0.28 : orderCost < 20000 ? 0.22 : orderCost < 50000 ? 0.18 : 0.15;
}

function PriceBox({ lang, pedido, bestCost, onSaved }: { lang: Lang; pedido: Pedido; bestCost: { cost: number; name: string } | null; onSaved: () => void }) {
  const defaultQty = pedido.cantidad ?? firstNum(pedido.unidades) ?? 100;
  const [qty, setQty] = useState(String(defaultQty));
  const [costStr, setCostStr] = useState(bestCost ? String(bestCost.cost).replace(".", ",") : "");
  const [priceStr, setPriceStr] = useState(pedido.precio_cliente != null ? String(pedido.precio_cliente).replace(".", ",") : "");
  const [savedOk, setSavedOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const n = (s: string) => {
    const v = s.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const x = Number(v);
    return v === "" || !Number.isFinite(x) ? null : x;
  };
  const qtyN = n(qty) ?? 0;
  const cost = n(costStr);

  const reco = useMemo(() => {
    if (cost == null || cost <= 0 || qtyN <= 0) return null;
    const orderCost = cost * qtyN;
    const suggested = cost * (1 + markupFor(orderCost));
    const target = pedido.precio_objetivo ?? null;
    let price = suggested;
    let verdict: "great" | "tight" | "ok" | "loss" = "ok";
    if (target != null && target > 0) {
      if (target < cost) verdict = "loss";
      else if (target < suggested) { price = target; verdict = "tight"; }
      else { price = target; verdict = "great"; }
    }
    return { price: Math.round(price * 100) / 100, verdict };
  }, [cost, qtyN, pedido.precio_objetivo]);

  // Totales con el precio que escribe el usuario (o el recomendado)
  const price = n(priceStr) ?? reco?.price ?? null;
  const totals = cost != null && price != null && qtyN > 0 ? {
    venta: price * qtyN,
    coste: cost * qtyN,
    beneficio: (price - cost) * qtyN,
    margen: price > 0 ? ((price - cost) / price) * 100 : 0,
  } : null;

  // Veredicto según el precio que se va a dar de verdad
  const target = pedido.precio_objetivo ?? null;
  let verdict: "great" | "tight" | "ok" | "loss" | "above" = "ok";
  if (cost != null && price != null) {
    const m = price > 0 ? (price - cost) / price : -1;
    if (price < cost) verdict = "loss";
    else if (target != null && target > 0 && price > target * 1.005) verdict = "above";
    else if (m < 0.08) verdict = "tight";
    else if (m >= 0.15) verdict = "great";
    else verdict = "ok";
  }
  const verdictText = cost != null && price != null
    ? (verdict === "great" ? C.vGreat : verdict === "tight" ? C.vTight : verdict === "loss" ? C.vLoss : verdict === "above" ? C.vAbove : C.vOk)
    : null;
  const targetWarn = target != null && target > 0 && cost != null && target < cost;

  async function save() {
    const p = n(priceStr) ?? reco?.price ?? null;
    setBusy(true);
    await setPrecioCliente(pedido.id, p, qtyN || null);
    setBusy(false);
    setSavedOk(true);
    onSaved();
  }

  return (
    <div className="pricebox">
      <div className="pricebox__head">
        <span className="offers__title">{tr(C.calc, lang)}</span>
      </div>

      {!bestCost && cost == null ? (
        <p className="offers__empty">{tr(C.noCost, lang)}</p>
      ) : null}

      <div className="price-inputs">
        <label className="price-field">
          <span>{tr(C.qty, lang)}</span>
          <input className="input input--sm" inputMode="numeric" value={qty} onChange={(e) => { setQty(e.target.value); setSavedOk(false); }} />
        </label>
        <label className="price-field">
          <span>{tr(C.cost, lang)}</span>
          <input className="input input--sm" inputMode="decimal" value={costStr} onChange={(e) => { setCostStr(e.target.value); setSavedOk(false); }} placeholder="0,00" />
          {bestCost && <small className="fhint">{tr(C.costFrom(bestCost.name), lang)}</small>}
        </label>
      </div>

      {reco && (
        <button type="button" className="reco" onClick={() => { setPriceStr(String(reco.price).replace(".", ",")); setSavedOk(false); }}>
          <span className="reco__k">{tr(C.reco, lang)}</span>
          <span className="reco__v">{money(reco.price, lang)}<small>/{lang === "es" ? "ud." : "unit"}</small></span>
          <span className="reco__use">{tr(C.useReco, lang)} →</span>
        </button>
      )}

      <label className="price-field price-field--your">
        <span>{tr(C.yourQuote, lang)}</span>
        <input className="input input--sm" inputMode="decimal" value={priceStr} onChange={(e) => { setPriceStr(e.target.value); setSavedOk(false); }} placeholder={reco ? String(reco.price).replace(".", ",") : "0,00"} />
      </label>

      {totals && (
        <>
          <div className="totals">
            <div className="total"><span className="total__k">{tr(C.totalSale, lang)}</span><span className="total__v">{money(totals.venta, lang)}</span></div>
            <div className="total"><span className="total__k">{tr(C.totalCost, lang)}</span><span className="total__v">{money(totals.coste, lang)}</span></div>
            <div className="total total--profit"><span className="total__k">{tr(C.profit, lang)}</span><span className="total__v">{money(totals.beneficio, lang)}</span></div>
            <div className="total"><span className="total__k">{tr(C.marginPct, lang)}</span><span className={"total__v " + (totals.margen < 0 ? "is-neg" : "")}>{totals.margen.toFixed(1)}%</span></div>
          </div>
          {verdictText && <p className={"verdict verdict--" + verdict}>{tr(verdictText, lang)}</p>}
          {targetWarn && cost != null && <p className="verdict verdict--tight">{tr(C.targetBelow(money(cost, lang)), lang)}</p>}
          <div className="pricebox__foot">
            <button type="button" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")} onClick={save} aria-busy={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}{tr(savedOk ? C.saved : C.savePrice, lang)}
            </button>
          </div>
        </>
      )}

      <details className="factors">
        <summary>{tr(C.factorsT, lang)}</summary>
        <ul>{C.factors.map((f, i) => <li key={i}>{tr(f, lang)}</li>)}</ul>
      </details>
    </div>
  );
}

/* ---------------- Fichas de edición ---------------- */

function moneyToNum(s: string): number | null {
  const v = s.trim();
  if (!v) return null;
  const x = Number(v.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(x) ? x : (NaN as unknown as number);
}
const numToForm = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

function Drawer({ title, eyebrow, lang, onClose, children, foot }: {
  title: string; eyebrow: Tr; lang: Lang; onClose: () => void; children: React.ReactNode; foot: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="drawer" role="dialog" aria-modal="true">
      <div className="drawer__scrim" onClick={onClose} />
      <div className="drawer__panel">
        <div className="drawer__head">
          <div>
            <span className="sec-eyebrow"><span className="sec-eyebrow__code">01</span>{tr(eyebrow, lang)}</span>
            <h2 className="drawer__title">{title}</h2>
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label={tr(C.close, lang)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        {children}
        {foot}
      </div>
    </div>
  );
}

function ItemDrawer({ lang, fixedCliente, pedido, onClose, onSaved }: {
  lang: Lang; fixedCliente?: Cliente; pedido?: Pedido; onClose: () => void; onSaved: (clienteId: string) => void;
}) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState(fixedCliente?.id ?? pedido?.cliente_id ?? "");
  const [newClient, setNewClient] = useState(false);
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [mpn, setMpn] = useState(pedido?.mpn ?? "");
  const [desc, setDesc] = useState(pedido?.descripcion ?? "");
  const [unidades, setUnidades] = useState(pedido?.unidades ?? "");
  const [cantidad, setCantidad] = useState(pedido?.cantidad != null ? String(pedido.cantidad) : "");
  const [objetivo, setObjetivo] = useState(numToForm(pedido?.precio_objetivo));
  const [estado, setEstado] = useState(pedido?.estado ?? "nuevo");
  const [notas, setNotas] = useState(pedido?.notas ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"req" | "save" | null>(null);

  useEffect(() => {
    if (!fixedCliente) supabase.from("clientes").select("*").order("nombre").limit(5000).then(({ data }) => setClientes((data ?? []) as Cliente[]));
  }, [fixedCliente]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    let cid = clienteId;
    if (!fixedCliente && newClient) { if (!cName.trim()) return setError("req"); }
    else if (!cid) return setError("req");
    if (!mpn.trim() && !desc.trim()) return setError("req");
    setError(null);
    setBusy(true);
    if (!fixedCliente && newClient) {
      const r = await clienteNuevo(cName, cEmail);
      if (!r.ok) { setBusy(false); return setError("save"); }
      cid = r.data.id;
    }
    const qn = cantidad.trim() ? Number(cantidad.replace(/\./g, "")) : null;
    const input: PedidoInput = {
      cliente_id: cid, mpn, descripcion: desc, unidades,
      cantidad: qn != null && Number.isFinite(qn) ? qn : null,
      precio_objetivo: objetivo.trim() ? moneyToNum(objetivo) : null,
      precio_cliente: pedido?.precio_cliente ?? null,
      estado, notas,
    };
    if (Number.isNaN(input.precio_objetivo)) { setBusy(false); return setError("req"); }
    const r = await savePedido(input, pedido?.id);
    setBusy(false);
    if (!r.ok) return setError("save");
    onSaved(cid);
  }

  return (
    <form onSubmit={submit} noValidate>
      <Drawer lang={lang} eyebrow={pedido ? C.edit : C.newItem} title={pedido ? text(pedido.mpn) : tr(C.newItem, lang)} onClose={onClose}
        foot={<div className="drawer__foot"><span className="drawer__spacer" /><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tr(C.cancel, lang)}</button><button type="submit" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")} aria-busy={busy}>{busy && <span className="spinner" aria-hidden="true" />}{tr(busy ? C.saving : C.save, lang)}</button></div>}>
        <div className="drawer__body">
          <div className="fgrid">
            {!fixedCliente && (
              <div className="fcell fcell--wide">
                <label className="field__label">{tr(C.pickClient, lang)}<span className="req"> *</span></label>
                {newClient ? (
                  <>
                    <input className="input input--sm" value={cName} onChange={(e) => { setCName(e.target.value); setError(null); }} placeholder={tr(C.clientName, lang)} />
                    <input className="input input--sm" style={{ marginTop: 8 }} type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} placeholder={tr(C.clientEmail, lang)} />
                    <button type="button" className="linkbtn" style={{ marginTop: 6 }} onClick={() => setNewClient(false)}>← {tr(C.pickClient, lang)}</button>
                  </>
                ) : (
                  <select className="input input--sm" value={clienteId} onChange={(e) => { if (e.target.value === "__new") setNewClient(true); else setClienteId(e.target.value); setError(null); }}>
                    <option value="">—</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    <option value="__new">{tr(C.newClient, lang)}</option>
                  </select>
                )}
              </div>
            )}
            <div className="fcell"><label className="field__label">{tr(C.fFind, lang)}</label><input className="input input--sm is-mono" value={mpn} onChange={(e) => { setMpn(e.target.value); setError(null); }} placeholder="TS512MSK64V6N-I" /></div>
            <div className="fcell"><label className="field__label">{tr(C.fStatus, lang)}</label><select className="input input--sm" value={estado} onChange={(e) => setEstado(e.target.value)}>{PEDIDO_ESTADOS.map((s) => <option key={s.value} value={s.value}>{estadoOf(s.value, lang)}</option>)}</select></div>
            <div className="fcell fcell--wide"><label className="field__label">{tr(C.fDesc, lang)}</label><input className="input input--sm" value={desc} onChange={(e) => { setDesc(e.target.value); setError(null); }} placeholder="Memoria Transcend 4 GB SO-DIMM 1600" /></div>
            <div className="fcell"><label className="field__label">{tr(C.fUnits, lang)}</label><input className="input input--sm" value={unidades} onChange={(e) => setUnidades(e.target.value)} placeholder="150 y 200 uds." /><span className="fhint">{tr(C.fUnitsHint, lang)}</span></div>
            <div className="fcell"><label className="field__label">{tr(C.fQty, lang)}</label><input className="input input--sm" inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="800" /></div>
            <div className="fcell"><label className="field__label">{tr(C.fTarget, lang)}</label><input className="input input--sm" inputMode="decimal" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} placeholder="60,00" /></div>
            <div className="fcell fcell--wide"><label className="field__label">{tr(C.fNotes, lang)}</label><textarea className="input input--sm input--area" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} /></div>
          </div>
          {error && <div className="note note--error" role="alert"><span className="note__tag">ERR</span><span className="note__text">{tr(error === "req" ? C.reqErr : C.saveErr, lang)}</span></div>}
        </div>
      </Drawer>
    </form>
  );
}
