import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Lang } from "../i18n";
import { supabase } from "../auth";
import { moneyCur, num, text, tr, type Tr } from "./format";
import { Drawer, EstadoPill, OfferEditor } from "./sourcing";
import { ContactBtn, ContactDrawer, type ContactPart } from "./contact";
import { TaskPanel } from "./Tareas";
import { findReplyThread } from "./mail-data";
import type { Oferta } from "./pedidos-data";

const C = {
  eyebrow: ["Red de suministro", "Supply network"] as Tr,
  title: ["Proveedores", "Suppliers"] as Tr,
  intro: ["Empresas que nos venden componentes. Entra en una para ver sus datos y qué chips nos ofrece.", "Companies that sell us components. Open one to see their details and which chips they offer."] as Tr,
  newSup: ["Nuevo proveedor", "New supplier"] as Tr,
  search: ["Buscar proveedor…", "Search supplier…"] as Tr,
  count: (n: number): Tr => [n === 1 ? "1 proveedor" : n + " proveedores", n === 1 ? "1 supplier" : n + " suppliers"],
  loading: ["Cargando…", "Loading…"] as Tr,
  empty: ["Todavía no hay proveedores.", "No suppliers yet."] as Tr,
  noMatch: ["Ningún proveedor coincide.", "No supplier matches."] as Tr,
  refs: ["ref.", "parts"] as Tr,
  clients: ["clientes", "clients"] as Tr,
  replied: ["respondidos", "replied"] as Tr,
  back: ["Proveedores", "Suppliers"] as Tr,
  supplier: ["Proveedor", "Supplier"] as Tr,
  edit: ["Editar", "Edit"] as Tr,
  del: ["Borrar", "Delete"] as Tr,
  delQ: ["¿Borrar este proveedor y sus ofertas?", "Delete this supplier and its offers?"] as Tr,
  yes: ["Sí, borrar", "Yes, delete"] as Tr,
  cancel: ["Cancelar", "Cancel"] as Tr,
  write: ["Escribir", "Email"] as Tr,
  open: ["Abrir web", "Open site"] as Tr,
  chips: ["Chips que ofrece", "Chips they offer"] as Tr,
  assign: ["Asignar referencia", "Assign part"] as Tr,
  noChips: ["Este proveedor aún no tiene referencias asignadas.", "This supplier has no parts assigned yet."] as Tr,
  colRef: ["Referencia", "Part"] as Tr,
  colClient: ["Cliente", "Client"] as Tr,
  colUnits: ["Unidades", "Units"] as Tr,
  colPrice: ["Precio", "Price"] as Tr,
  colAvail: ["Disponibilidad", "Availability"] as Tr,
  colState: ["Estado", "Status"] as Tr,
  colNotes: ["Observaciones", "Notes"] as Tr,
  catalogue: ["Catálogo", "Catalogue"] as Tr,
  goClient: ["Ver pedido", "View order"] as Tr,
  // ficha
  fName: ["Nombre", "Name"] as Tr,
  fType: ["Tipo", "Type"] as Tr,
  fCountry: ["País", "Country"] as Tr,
  fContact: ["Persona de contacto", "Contact person"] as Tr,
  fEmail: ["Correo", "Email"] as Tr,
  fPhone: ["Teléfono", "Phone"] as Tr,
  fWeb: ["Web", "Website"] as Tr,
  fRating: ["Valoración", "Rating"] as Tr,
  fNotes: ["Notas", "Notes"] as Tr,
  save: ["Guardar", "Save"] as Tr,
  saving: ["Guardando…", "Saving…"] as Tr,
  errReq: ["Falta el nombre.", "The name is missing."] as Tr,
  errSave: ["No se pudo guardar.", "Could not save."] as Tr,
};

const TIPOS: { value: string; label: Tr }[] = [
  { value: "fabricante", label: ["Fabricante", "Manufacturer"] },
  { value: "distribuidor", label: ["Distribuidor", "Distributor"] },
  { value: "broker", label: ["Broker", "Broker"] },
];
const tipoLabel = (v: string, lang: Lang) => tr(TIPOS.find((t) => t.value === v)?.label ?? [v, v], lang);
const webHref = (w: string) => (w.startsWith("http") ? w : "https://" + w);

type Prov = {
  id: string; nombre: string; tipo: string; pais: string | null; contacto: string | null; email: string | null;
  telefono: string | null; web: string | null; valoracion: number | null; notas: string | null;
};
type ProvResumen = Prov & { ofertas: { id: string; estado: string; referencia_id: string | null; pedido: { cliente_id: string } | null }[] };
type OfertaFull = Oferta & {
  referencia: { id: string; mpn: string; fabricante: string | null; descripcion: string | null } | null;
  pedido: { id: string; cliente_id: string; unidades: string | null; cliente: { nombre: string } | null } | null;
};

/*
 * Rutas dentro de Proveedores (un solo segmento en la URL):
 *   (nada)          → empresas cliente
 *   c~<cliente>     → referencias que pide ese cliente
 *   c~<cliente>~<pedido> → proveedores de esa referencia
 *   dir             → directorio de proveedores
 *   p~<proveedor>   → ficha de un proveedor
 */
export default function Proveedores({ lang, isAdmin, openId, onOpen, onOpenClient, onOpenThread, onChanged }: {
  lang: Lang; isAdmin: boolean; onOpenThread: (threadId: string) => void; openId: string | null; onOpen: (id: string | null) => void; onOpenClient: (id: string) => void; onChanged: () => void;
}) {
  const parts = (openId ?? "").split("~");
  const openProv = (id: string) => onOpen("p~" + id);
  if (parts[0] === "c" && parts[1] && parts[2])
    return <RefSuppliers key={openId} lang={lang} onOpenThread={onOpenThread} pedidoId={parts[2]} onBack={() => onOpen("c~" + parts[1])} onOpenProv={openProv} onChanged={onChanged} />;
  if (parts[0] === "c" && parts[1])
    return <ClientRefs key={openId} lang={lang} clienteId={parts[1]} onBack={() => onOpen(null)} onOpenRef={(pid) => onOpen("c~" + parts[1] + "~" + pid)} onOpenClient={onOpenClient} />;
  if (parts[0] === "dir")
    return <ProvGrid lang={lang} startNew={false} onBack={() => onOpen(null)} onOpen={(id) => (id ? openProv(id) : onOpen("dir"))} onChanged={onChanged} />;
  if (parts[0] === "p" && parts[1])
    return <ProvDetail key={openId} lang={lang} isAdmin={isAdmin} id={parts[1]} onBack={() => onOpen("dir")} onOpenClient={onOpenClient} onChanged={onChanged} />;
  if (openId && /^[0-9a-f-]{36}$/.test(openId))
    return <ProvDetail key={openId} lang={lang} isAdmin={isAdmin} id={openId} onBack={() => onOpen("dir")} onOpenClient={onOpenClient} onChanged={onChanged} />;
  return <ClientGrid lang={lang} onOpen={(cid) => onOpen("c~" + cid)} onDirectory={() => onOpen("dir")} />;
}

/* ---------- 1. Empresas cliente ---------- */

const K = {
  eyebrow: ["Proveedores por cliente", "Suppliers by client"] as Tr,
  intro: ["Elige la empresa que te pide los chips, luego la referencia, y dentro verás sus proveedores.", "Pick the company asking for chips, then the part, and inside you'll see its suppliers."] as Tr,
  directory: ["Directorio de proveedores", "Supplier directory"] as Tr,
  search: ["Buscar empresa…", "Search company…"] as Tr,
  count: (n: number): Tr => [n === 1 ? "1 empresa" : n + " empresas", n === 1 ? "1 company" : n + " companies"],
  empty: ["Todavía no hay clientes con pedidos.", "No clients with orders yet."] as Tr,
  refs: ["referencias", "parts"] as Tr,
  sups: ["proveedores", "suppliers"] as Tr,
  noSup: ["sin proveedor", "no supplier"] as Tr,
  back: ["Empresas", "Companies"] as Tr,
  client: ["Cliente", "Client"] as Tr,
  partsOf: ["Referencias que pide", "Parts requested"] as Tr,
  colRef: ["Referencia", "Part"] as Tr,
  colUnits: ["Unidades", "Units"] as Tr,
  colSup: ["Proveedores", "Suppliers"] as Tr,
  colStatus: ["Estado", "Status"] as Tr,
  colBest: ["Mejor precio", "Best price"] as Tr,
  noParts: ["Este cliente aún no tiene referencias.", "This client has no parts yet."] as Tr,
  viewOrder: ["Ver en Pedidos", "View in Orders"] as Tr,
  suppliersOf: ["Proveedores de esta referencia", "Suppliers for this part"] as Tr,
  assign: ["Asignar proveedor", "Assign supplier"] as Tr,
  none: ["Aún no tiene proveedores. Asigna uno.", "No suppliers yet. Assign one."] as Tr,
  colProv: ["Proveedor", "Supplier"] as Tr,
  colContact: ["Contacto", "Contact"] as Tr,
  colPrice: ["Precio", "Price"] as Tr,
  colAvail: ["Disponibilidad", "Availability"] as Tr,
  chosen: ["elegido", "chosen"] as Tr,
};

const ESTADO_ORDER = ["oferta", "respondido", "contactado", "por_contactar", "descartado"];

type OfMini = { id: string; proveedor_id: string | null; estado: string; precio: number | null; moneda: string };
type ClienteCard = { id: string; nombre: string; pais: string | null; email: string | null; contacto: string | null; pedidos: { id: string; ofertas: OfMini[] }[] };

function ClientGrid({ lang, onOpen, onDirectory }: { lang: Lang; onOpen: (id: string) => void; onDirectory: () => void }) {
  const [rows, setRows] = useState<ClienteCard[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    supabase.from("clientes").select("id, nombre, pais, email, contacto, pedidos(id, ofertas(id, proveedor_id, estado, precio, moneda))").order("nombre").limit(5000)
      .then(({ data }) => setRows(((data ?? []) as unknown as ClienteCard[]).filter((c) => c.pedidos.length > 0)));
  }, []);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !n || [r.nombre, r.email, r.pais, r.contacto].some((v) => (v ?? "").toLowerCase().includes(n)));
  }, [rows, q]);

  return (
    <section className="page-sec">
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">03</span>{tr(K.eyebrow, lang)}</span>
          <h1 className="sec-title">{tr(C.title, lang)}</h1>
          <p className="sec-intro">{tr(K.intro, lang)}</p>
        </div>
        <button type="button" className="btn btn--ghost btn--new" onClick={onDirectory}>{tr(K.directory, lang)} →</button>
      </header>
      <div className="toolbar">
        <label className="search">
          <span className="sr-only">{tr(K.search, lang)}</span>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(K.search, lang)} className="search__input" />
        </label>
        {rows && <span className="toolbar__count">{tr(K.count(filtered.length), lang)}</span>}
      </div>
      {rows === null ? (
        <div className="state">{tr(C.loading, lang)}</div>
      ) : filtered.length === 0 ? (
        <div className="state state--empty"><span className="state__code">03</span><p className="state__text">{tr(K.empty, lang)}</p></div>
      ) : (
        <div className="client-grid">
          {filtered.map((c) => {
            const sups = new Set(c.pedidos.flatMap((p) => p.ofertas.filter((o) => o.estado !== "descartado").map((o) => o.proveedor_id)).filter(Boolean)).size;
            const sinProv = c.pedidos.filter((p) => !p.ofertas.some((o) => o.estado !== "descartado")).length;
            return (
              <button key={c.id} type="button" className="client-card" onClick={() => onOpen(c.id)}>
                <div className="client-card__top">
                  <span className="client-card__avatar" aria-hidden="true">{c.nombre.slice(0, 1).toUpperCase()}</span>
                  <span className="client-card__name">{c.nombre}</span>
                </div>
                <span className="client-card__meta">{[c.pais, c.contacto, c.email].filter(Boolean).join(" · ") || "—"}</span>
                <div className="client-card__stats">
                  <span className="cstat"><b>{num(c.pedidos.length, lang)}</b> {tr(K.refs, lang)}</span>
                  <span className="cstat"><b>{num(sups, lang)}</b> {tr(K.sups, lang)}</span>
                  {sinProv > 0 && <span className="cstat cstat--open"><b>{num(sinProv, lang)}</b> {tr(K.noSup, lang)}</span>}
                  <span className="client-card__arrow" aria-hidden="true">→</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ---------- 2. Referencias de un cliente ---------- */

type PedRow = {
  id: string; mpn: string | null; descripcion: string | null; unidades: string | null;
  referencia: { mpn: string; fabricante: string | null; descripcion: string | null } | null; ofertas: OfMini[];
};

function ClientRefs({ lang, clienteId, onBack, onOpenRef, onOpenClient }: {
  lang: Lang; clienteId: string; onBack: () => void; onOpenRef: (pedidoId: string) => void; onOpenClient: (id: string) => void;
}) {
  const [cli, setCli] = useState<{ nombre: string; pais: string | null; contacto: string | null; email: string | null } | null>(null);
  const [peds, setPeds] = useState<PedRow[] | null>(null);
  useEffect(() => {
    Promise.all([
      supabase.from("clientes").select("nombre, pais, contacto, email").eq("id", clienteId).single(),
      supabase.from("pedidos").select("id, mpn, descripcion, unidades, referencia:referencias(mpn, fabricante, descripcion), ofertas(id, proveedor_id, estado, precio, moneda)").eq("cliente_id", clienteId).order("mpn").limit(2000),
    ]).then(([c, p]) => { setCli(c.data as typeof cli); setPeds((p.data ?? []) as unknown as PedRow[]); });
  }, [clienteId]);

  if (!cli || peds === null) return <div className="state" style={{ marginTop: 24 }}>{tr(C.loading, lang)}</div>;

  return (
    <section className="page-sec">
      <button type="button" className="backlink" onClick={onBack}>← {tr(K.back, lang)}</button>
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">03</span>{tr(K.client, lang)}</span>
          <h1 className="sec-title">{cli.nombre}</h1>
          <p className="sec-intro">{[cli.pais, cli.contacto, cli.email].filter(Boolean).join(" · ")}</p>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onOpenClient(clienteId)}>{tr(K.viewOrder, lang)} →</button>
      </header>
      <div className="offers offers--card">
        <div className="offers__head"><span className="offers__title">{tr(K.partsOf, lang)} · {peds.length}</span></div>
        {peds.length === 0 ? <p className="offers__empty">{tr(K.noParts, lang)}</p> : (
          <div className="table-wrap table-wrap--flat">
            <table className="tbl">
              <thead><tr>
                <th>{tr(K.colRef, lang)}</th>
                <th className="is-optional">{tr(K.colUnits, lang)}</th>
                <th>{tr(K.colSup, lang)}</th>
                <th className="is-optional">{tr(K.colStatus, lang)}</th>
                <th className="is-right">{tr(K.colBest, lang)}</th>
              </tr></thead>
              <tbody>
                {peds.map((p) => {
                  const live = p.ofertas.filter((o) => o.estado !== "descartado");
                  const top = [...p.ofertas].sort((a, b) => ESTADO_ORDER.indexOf(a.estado) - ESTADO_ORDER.indexOf(b.estado))[0];
                  const eur = live.filter((o) => o.precio != null && o.moneda === "EUR").sort((a, b) => Number(a.precio) - Number(b.precio));
                  const best = eur[0] ?? live.find((o) => o.precio != null);
                  return (
                    <tr key={p.id} tabIndex={0} onClick={() => onOpenRef(p.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpenRef(p.id); }}>
                      <td data-label={tr(K.colRef, lang)} className="is-strong">
                        <span className="ref-mpn">{text(p.referencia?.mpn ?? p.mpn)}</span>
                        <span className="ref-desc">{[p.referencia?.fabricante, p.descripcion ?? p.referencia?.descripcion].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td data-label={tr(K.colUnits, lang)} className="is-optional">{text(p.unidades)}</td>
                      <td data-label={tr(K.colSup, lang)}>{live.length ? num(live.length, lang) : <span className="pill pill--warn">{tr(K.noSup, lang)}</span>}</td>
                      <td data-label={tr(K.colStatus, lang)} className="is-optional">{top ? <EstadoPill estado={top.estado} lang={lang} /> : "—"}</td>
                      <td data-label={tr(K.colBest, lang)} className="is-right is-mono">{best ? moneyCur(best.precio, best.moneda, lang) : "—"}</td>
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

/* ---------- 3. Proveedores de una referencia ---------- */

function waitText(iso: string, lang: Lang) {
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return lang === "es" ? (d === 0 ? "desde hoy" : d === 1 ? "desde hace 1 día" : `desde hace ${d} días`) : d === 0 ? "since today" : d === 1 ? "for 1 day" : `for ${d} days`;
}

type OfProv = Oferta & { updated_at?: string; respuesta_thread?: string | null; prov: { id: string; nombre: string; email: string | null; web: string | null; pais: string | null; telefono: string | null } | null };

function RefSuppliers({ lang, onOpenThread, pedidoId, onBack, onOpenProv, onChanged }: {
  lang: Lang; onOpenThread: (threadId: string) => void; pedidoId: string; onBack: () => void; onOpenProv: (id: string) => void; onChanged: () => void;
}) {
  const [ped, setPed] = useState<{ mpn: string | null; descripcion: string | null; unidades: string | null; notas: string | null; cliente: { nombre: string } | null; referencia: { mpn: string; fabricante: string | null } | null } | null>(null);
  const [ofs, setOfs] = useState<OfProv[] | null>(null);
  const [offer, setOffer] = useState<OfProv | "new" | null>(null);
  const [contact, setContact] = useState<OfProv | null>(null);
  const [tick, setTick] = useState(0);
  const [missing, setMissing] = useState<string | null>(null);
  async function viewReply(o: OfProv) {
    setMissing(null);
    const th = await findReplyThread({ respuesta_thread: o.respuesta_thread, email: o.email, provEmail: o.prov?.email });
    if (th) onOpenThread(th); else setMissing(o.id);
  }

  const load = useCallback(async () => {
    setTick((t) => t + 1);
    const [p, o] = await Promise.all([
      supabase.from("pedidos").select("mpn, descripcion, unidades, notas, cliente:clientes(nombre), referencia:referencias(mpn, fabricante)").eq("id", pedidoId).single(),
      supabase.from("ofertas").select("*, prov:proveedores(id, nombre, email, web, pais, telefono)").eq("pedido_id", pedidoId).limit(500),
    ]);
    setPed(p.data as unknown as typeof ped);
    setOfs(((o.data ?? []) as unknown as OfProv[]).sort((a, b) => ESTADO_ORDER.indexOf(a.estado) - ESTADO_ORDER.indexOf(b.estado)));
  }, [pedidoId]);
  useEffect(() => { load(); }, [load]);

  if (!ped || ofs === null) return <div className="state" style={{ marginTop: 24 }}>{tr(C.loading, lang)}</div>;

  return (
    <section className="page-sec">
      <button type="button" className="backlink" onClick={onBack}>← {ped.cliente?.nombre ?? tr(K.back, lang)}</button>
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">03</span>{ped.cliente?.nombre}{ped.unidades ? " · " + ped.unidades : ""}</span>
          <h1 className="sec-title is-mono">{text(ped.referencia?.mpn ?? ped.mpn)}</h1>
          <p className="sec-intro">{[ped.referencia?.fabricante, ped.descripcion].filter(Boolean).join(" · ")}</p>
        </div>
      </header>
      {ped.notas && <p className="item__notes"><span className="note__tag">INT</span> {ped.notas}</p>}
      <div className="offers offers--card">
        <div className="offers__head">
          <span className="offers__title">{tr(K.suppliersOf, lang)} · {ofs.length}</span>
          <button type="button" className="linkbtn" onClick={() => setOffer("new")}>+ {tr(K.assign, lang)}</button>
        </div>
        {ofs.length === 0 ? <p className="offers__empty">{tr(K.none, lang)}</p> : (
          <div className="table-wrap table-wrap--flat">
            <table className="tbl">
              <thead><tr>
                <th>{tr(K.colProv, lang)}</th>
                <th>{tr(K.colContact, lang)}</th>
                <th className="is-right">{tr(K.colPrice, lang)}</th>
                <th className="is-optional">{tr(K.colAvail, lang)}</th>
                <th>{tr(K.colStatus, lang)}</th>
                <th aria-label="✉" />
              </tr></thead>
              <tbody>
                {ofs.map((o) => {
                  const name = o.prov?.nombre ?? o.proveedor ?? "—";
                  const email = o.prov?.email ?? o.email;
                  const web = o.prov?.web ?? o.enlace;
                  return (
                    <tr key={o.id} tabIndex={0} onClick={() => setOffer(o)} onKeyDown={(e) => { if (e.key === "Enter") setOffer(o); }}>
                      <td data-label={tr(K.colProv, lang)} className="is-strong">
                        {o.proveedor_id ? <button type="button" className="linkbtn" onClick={(e) => { e.stopPropagation(); onOpenProv(o.proveedor_id!); }}>{name} →</button> : name}
                        <span className="ref-desc">{[o.prov?.pais ?? o.pais, o.elegida ? "★ " + tr(K.chosen, lang) : null, o.notas].filter(Boolean).join(" · ")}</span>
                      </td>
                      <td data-label={tr(K.colContact, lang)}>
                        {email && <a className="ref-link" href={"mailto:" + email} onClick={(e) => e.stopPropagation()}>{email}</a>}
                        {web && <a className="ref-link ref-desc" href={webHref(web)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{web.replace(/^https?:\/\//, "").slice(0, 40)}</a>}
                        {!email && !web && "—"}
                      </td>
                      <td data-label={tr(K.colPrice, lang)} className="is-right is-mono">{moneyCur(o.precio, o.moneda, lang)}</td>
                      <td data-label={tr(K.colAvail, lang)} className="is-optional">{text(o.disponibilidad)}</td>
                      <td data-label={tr(K.colStatus, lang)}>
                        <EstadoPill estado={o.estado} lang={lang} />
                        {o.estado === "contactado" && o.updated_at && <span className="ref-desc">{waitText(o.updated_at, lang)}</span>}
                        {(o.estado === "respondido" || o.estado === "oferta") && (
                          <button type="button" className="linkbtn reply-link" onClick={(e) => { e.stopPropagation(); viewReply(o); }}>↩ {lang === "es" ? "Ver respuesta" : "View reply"}</button>
                        )}
                        {missing === o.id && <span className="ref-desc">{lang === "es" ? "No está en el Unibox" : "Not in the Unibox"}</span>}
                      </td>
                      <td className="is-right"><ContactBtn lang={lang} onClick={() => setContact(o)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <TaskPanel lang={lang} pedidoId={pedidoId} reloadKey={tick} goThread={onOpenThread} onChanged={onChanged} />
      {contact && (
        <ContactDrawer lang={lang} part={{ mpn: ped.referencia?.mpn ?? ped.mpn, fabricante: ped.referencia?.fabricante, descripcion: ped.descripcion, unidades: ped.unidades }}
          target={{ ofertaId: contact.id, estado: contact.estado, proveedor: contact.prov?.nombre ?? contact.proveedor ?? "", email: contact.prov?.email ?? contact.email, pais: contact.prov?.pais ?? contact.pais }}
          onClose={() => setContact(null)} onSent={() => { setContact(null); load(); onChanged(); }} />
      )}
      {offer && (
        <OfferEditor lang={lang} pedidoId={pedidoId} oferta={offer === "new" ? null : offer}
          onClose={() => setOffer(null)} onSaved={() => { setOffer(null); load(); onChanged(); }} />
      )}
    </section>
  );
}

/* ---------- Directorio de proveedores ---------- */

function ProvGrid({ lang, startNew, onBack, onOpen, onChanged }: { lang: Lang; startNew: boolean; onBack: () => void; onOpen: (id: string | null) => void; onChanged: () => void }) {
  const [rows, setRows] = useState<ProvResumen[] | null>(null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(startNew);

  const load = useCallback(async () => {
    const { data } = await supabase.from("proveedores").select("*, ofertas(id, estado, referencia_id, pedido:pedidos(cliente_id))").order("nombre").limit(5000);
    setRows((data ?? []) as unknown as ProvResumen[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !n || [r.nombre, r.email, r.pais, r.contacto].some((v) => (v ?? "").toLowerCase().includes(n)));
  }, [rows, q]);

  return (
    <section className="page-sec">
      <button type="button" className="backlink" onClick={onBack}>← {tr(K.back, lang)}</button>
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">03</span>{tr(K.directory, lang)}</span>
          <h1 className="sec-title">{tr(C.title, lang)}</h1>
          <p className="sec-intro">{tr(C.intro, lang)}</p>
        </div>
        <button type="button" className="btn btn--primary btn--new" onClick={() => setCreating(true)}><span aria-hidden="true">+</span> {tr(C.newSup, lang)}</button>
      </header>

      <div className="toolbar">
        <label className="search">
          <span className="sr-only">{tr(C.search, lang)}</span>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr(C.search, lang)} className="search__input" />
        </label>
        {rows && <span className="toolbar__count">{tr(C.count(filtered.length), lang)}</span>}
      </div>

      {rows === null ? (
        <div className="state">{tr(C.loading, lang)}</div>
      ) : rows.length === 0 ? (
        <div className="state state--empty"><span className="state__code">03</span><p className="state__text">{tr(C.empty, lang)}</p></div>
      ) : filtered.length === 0 ? (
        <div className="state">{tr(C.noMatch, lang)}</div>
      ) : (
        <div className="client-grid">
          {filtered.map((p) => {
            const refs = new Set(p.ofertas.map((o) => o.referencia_id).filter(Boolean)).size;
            const clients = new Set(p.ofertas.map((o) => o.pedido?.cliente_id).filter(Boolean)).size;
            const replied = p.ofertas.filter((o) => o.estado === "respondido" || o.estado === "oferta").length;
            return (
              <button key={p.id} type="button" className="client-card" onClick={() => onOpen(p.id)}>
                <div className="client-card__top">
                  <span className="client-card__avatar" aria-hidden="true">{p.nombre.slice(0, 1).toUpperCase()}</span>
                  <span className="client-card__name">{p.nombre}</span>
                  <span className="pill pill--muted">{tipoLabel(p.tipo, lang)}</span>
                </div>
                <span className="client-card__meta">{[p.pais, p.email, p.contacto].filter(Boolean).join(" · ") || "—"}</span>
                <div className="client-card__stats">
                  <span className="cstat"><b>{num(refs, lang)}</b> {tr(C.refs, lang)}</span>
                  <span className="cstat"><b>{num(clients, lang)}</b> {tr(C.clients, lang)}</span>
                  {replied > 0 && <span className="cstat cstat--open"><b>{num(replied, lang)}</b> {tr(C.replied, lang)}</span>}
                  <span className="client-card__arrow" aria-hidden="true">→</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {creating && <ProvDrawer lang={lang} onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); onChanged(); onOpen(id); }} />}
    </section>
  );
}

function ProvDetail({ lang, isAdmin, id, onBack, onOpenClient, onChanged }: {
  lang: Lang; isAdmin: boolean; id: string; onBack: () => void; onOpenClient: (id: string) => void; onChanged: () => void;
}) {
  const [prov, setProv] = useState<Prov | null>(null);
  const [ofertas, setOfertas] = useState<OfertaFull[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [offer, setOffer] = useState<OfertaFull | "new" | null>(null);
  const [contact, setContact] = useState<OfertaFull | null>(null);
  const [askDel, setAskDel] = useState(false);

  const load = useCallback(async () => {
    const [p, o] = await Promise.all([
      supabase.from("proveedores").select("*").eq("id", id).single(),
      supabase.from("ofertas").select("*, referencia:referencias(id, mpn, fabricante, descripcion), pedido:pedidos(id, cliente_id, unidades, cliente:clientes(nombre))").eq("proveedor_id", id).limit(2000),
    ]);
    setProv((p.data ?? null) as Prov | null);
    const list = ((o.data ?? []) as unknown as OfertaFull[]).sort((a, b) => (a.referencia?.mpn ?? "").localeCompare(b.referencia?.mpn ?? ""));
    setOfertas(list);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!prov || ofertas === null) return <div className="state" style={{ marginTop: 24 }}>{tr(C.loading, lang)}</div>;

  return (
    <section className="page-sec">
      <button type="button" className="backlink" onClick={onBack}>← {tr(C.back, lang)}</button>
      <header className="sec-head">
        <div className="sec-head__text">
          <span className="sec-eyebrow"><span className="sec-eyebrow__code">03</span>{tr(C.supplier, lang)} · {tipoLabel(prov.tipo, lang)}</span>
          <h1 className="sec-title">{prov.nombre}</h1>
          <p className="sec-intro">{[prov.pais, prov.contacto].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="item-detail__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>{tr(C.edit, lang)}</button>
          {isAdmin && (askDel ? (
            <span className="delconfirm">
              <button type="button" className="btn btn--danger btn--sm" onClick={async () => { await supabase.from("proveedores").delete().eq("id", id); onChanged(); onBack(); }}>{tr(C.yes, lang)}</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAskDel(false)}>{tr(C.cancel, lang)}</button>
            </span>
          ) : (
            <button type="button" className="btn btn--ghost btn--sm btn--del" onClick={() => setAskDel(true)}>{tr(C.del, lang)}</button>
          ))}
        </div>
      </header>

      <div className="contact-strip">
        {prov.email ? <a className="contact-chip" href={"mailto:" + prov.email}>✉ {prov.email}</a> : <span className="contact-chip is-empty">✉ —</span>}
        {prov.web && <a className="contact-chip" href={webHref(prov.web)} target="_blank" rel="noopener noreferrer">↗ {prov.web.replace(/^https?:\/\//, "")}</a>}
        {prov.telefono && <a className="contact-chip" href={"tel:" + prov.telefono}>☎ {prov.telefono}</a>}
        {prov.valoracion && <span className="contact-chip">{"●".repeat(prov.valoracion)}{"○".repeat(5 - prov.valoracion)}</span>}
      </div>
      {prov.notas && <p className="item__notes"><span className="note__tag">INT</span> {prov.notas}</p>}

      <div className="offers offers--card">
        <div className="offers__head">
          <span className="offers__title">{tr(C.chips, lang)} · {ofertas.length}</span>
          <button type="button" className="linkbtn" onClick={() => setOffer("new")}>+ {tr(C.assign, lang)}</button>
        </div>
        {ofertas.length === 0 ? (
          <p className="offers__empty">{tr(C.noChips, lang)}</p>
        ) : (
          <div className="table-wrap table-wrap--flat">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{tr(C.colRef, lang)}</th>
                  <th>{tr(C.colClient, lang)}</th>
                  <th className="is-optional">{tr(C.colUnits, lang)}</th>
                  <th className="is-right">{tr(C.colPrice, lang)}</th>
                  <th className="is-optional">{tr(C.colAvail, lang)}</th>
                  <th>{tr(C.colState, lang)}</th>
                  <th aria-label="✉" />
                </tr>
              </thead>
              <tbody>
                {ofertas.map((o) => (
                  <tr key={o.id} tabIndex={0} onClick={() => setOffer(o)} onKeyDown={(e) => { if (e.key === "Enter") setOffer(o); }} title={o.notas ?? ""}>
                    <td data-label={tr(C.colRef, lang)} className="is-strong">
                      <span className="ref-mpn">{text(o.referencia?.mpn)}</span>
                      <span className="ref-desc">{[o.referencia?.fabricante, o.notas].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td data-label={tr(C.colClient, lang)}>
                      {o.pedido?.cliente ? (
                        <button type="button" className="linkbtn" onClick={(e) => { e.stopPropagation(); onOpenClient(o.pedido!.cliente_id); }}>{o.pedido.cliente.nombre} →</button>
                      ) : <span className="ref-desc">{tr(C.catalogue, lang)}</span>}
                    </td>
                    <td data-label={tr(C.colUnits, lang)} className="is-optional">{text(o.pedido?.unidades)}</td>
                    <td data-label={tr(C.colPrice, lang)} className="is-right is-mono">{moneyCur(o.precio, o.moneda, lang)}</td>
                    <td data-label={tr(C.colAvail, lang)} className="is-optional">{text(o.disponibilidad)}</td>
                    <td data-label={tr(C.colState, lang)}><EstadoPill estado={o.estado} lang={lang} /></td>
                    <td className="is-right"><ContactBtn lang={lang} onClick={() => setContact(o)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {contact && (
        <ContactDrawer lang={lang} part={{ mpn: contact.referencia?.mpn ?? null, fabricante: contact.referencia?.fabricante, descripcion: contact.referencia?.descripcion, unidades: contact.pedido?.unidades } as ContactPart}
          target={{ ofertaId: contact.id, estado: contact.estado, proveedor: prov.nombre, email: prov.email ?? contact.email, pais: prov.pais }}
          onClose={() => setContact(null)} onSent={() => { setContact(null); load(); onChanged(); }} />
      )}
      {editing && <ProvDrawer lang={lang} prov={prov} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); onChanged(); }} />}
      {offer && (
        <OfferEditor lang={lang} proveedorId={id} oferta={offer === "new" ? null : offer}
          onClose={() => setOffer(null)} onSaved={() => { setOffer(null); load(); onChanged(); }} />
      )}
    </section>
  );
}

function ProvDrawer({ lang, prov, onClose, onSaved }: { lang: Lang; prov?: Prov; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({
    nombre: prov?.nombre ?? "", tipo: prov?.tipo ?? "distribuidor", pais: prov?.pais ?? "", contacto: prov?.contacto ?? "",
    email: prov?.email ?? "", telefono: prov?.telefono ?? "", web: prov?.web ?? "", valoracion: prov?.valoracion ? String(prov.valoracion) : "", notas: prov?.notas ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<"req" | "save" | null>(null);
  const set = (k: keyof typeof f, v: string) => { setF((s) => ({ ...s, [k]: v })); setErr(null); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!f.nombre.trim()) return setErr("req");
    setBusy(true);
    const row = {
      nombre: f.nombre.trim(), tipo: f.tipo, pais: f.pais.trim() || null, contacto: f.contacto.trim() || null,
      email: f.email.trim() || null, telefono: f.telefono.trim() || null, web: f.web.trim() || null,
      valoracion: f.valoracion ? Number(f.valoracion) : null, notas: f.notas.trim() || null,
    };
    const r = prov
      ? await supabase.from("proveedores").update(row).eq("id", prov.id).select("id").single()
      : await supabase.from("proveedores").insert(row).select("id").single();
    setBusy(false);
    if (r.error || !r.data) return setErr("save");
    onSaved((r.data as { id: string }).id);
  }

  const field = (k: keyof typeof f, label: Tr, opts: { type?: string; wide?: boolean } = {}) => (
    <div className={"fcell" + (opts.wide ? " fcell--wide" : "")}>
      <label className="field__label">{tr(label, lang)}</label>
      <input className="input input--sm" type={opts.type ?? "text"} value={f[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <form onSubmit={submit} noValidate>
      <Drawer lang={lang} eyebrow="03" title={prov ? prov.nombre : tr(C.newSup, lang)} onClose={onClose}
        foot={<div className="drawer__foot"><span className="drawer__spacer" /><button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>{tr(C.cancel, lang)}</button><button type="submit" className={"btn btn--primary btn--sm" + (busy ? " btn--busy" : "")}>{busy && <span className="spinner" aria-hidden="true" />}{tr(busy ? C.saving : C.save, lang)}</button></div>}>
        <div className="drawer__body">
          <div className="fgrid">
            {field("nombre", C.fName, { wide: true })}
            <div className="fcell">
              <label className="field__label">{tr(C.fType, lang)}</label>
              <select className="input input--sm" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}>{TIPOS.map((t) => <option key={t.value} value={t.value}>{tr(t.label, lang)}</option>)}</select>
            </div>
            {field("pais", C.fCountry)}
            {field("contacto", C.fContact)}
            {field("telefono", C.fPhone, { type: "tel" })}
            {field("email", C.fEmail, { type: "email", wide: true })}
            {field("web", C.fWeb, { wide: true })}
            <div className="fcell">
              <label className="field__label">{tr(C.fRating, lang)}</label>
              <select className="input input--sm" value={f.valoracion} onChange={(e) => set("valoracion", e.target.value)}>
                <option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"●".repeat(n)}</option>)}
              </select>
            </div>
            <div className="fcell fcell--wide">
              <label className="field__label">{tr(C.fNotes, lang)}</label>
              <textarea className="input input--sm input--area" rows={3} value={f.notas} onChange={(e) => set("notas", e.target.value)} />
            </div>
          </div>
          {err && <div className="note note--error" role="alert"><span className="note__tag">ERR</span><span className="note__text">{tr(err === "req" ? C.errReq : C.errSave, lang)}</span></div>}
        </div>
      </Drawer>
    </form>
  );
}
