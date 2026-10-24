// Qué tiene cada sección del panel: tabla de Supabase, campos de la ficha y columnas del listado.

import type { Lang } from "../i18n";
import { date, money, num, pedidoCode, text, type Tr } from "./format";

export type SectionId = "inicio" | "pedidos" | "lotes" | "referencias" | "proveedores" | "clientes";
export type EntityId = Exclude<SectionId, "inicio">;

export type Tone = "accent" | "ok" | "warn" | "bad" | "info" | "muted";

export type Option = { value: string; label: Tr; tone?: Tone };

export type Field = {
  key: string;
  label: Tr;
  type: "text" | "email" | "tel" | "number" | "money" | "date" | "textarea" | "select" | "fk" | "rating";
  required?: boolean;
  options?: Option[];
  fk?: { table: string; labelKey: string; extra?: string };
  placeholder?: string;
  wide?: boolean;
  mono?: boolean;
  hint?: Tr;
};

export type Row = Record<string, unknown> & { id: string };

export type Column = {
  key: string;
  label: Tr;
  value: (r: Row, lang: Lang) => string;
  mono?: boolean;
  strong?: boolean;
  align?: "right";
  status?: boolean;
  hideOnMobile?: boolean;
};

export type Entity = {
  id: EntityId;
  table: string;
  code: string;
  title: Tr;
  eyebrow: Tr;
  intro: Tr;
  singular: Tr;
  newLabel: Tr;
  empty: Tr;
  select: string;
  order: { column: string; ascending: boolean };
  fields: Field[];
  columns: Column[];
  statusKey?: string;
  statuses?: Option[];
  titleOf: (r: Row) => string;
  searchText: (r: Row) => string;
};

const rel = (r: Row, k: string, f: string): unknown => {
  const v = r[k] as Record<string, unknown> | null | undefined;
  return v ? v[f] : null;
};

export const PEDIDO_ESTADOS: Option[] = [
  { value: "nuevo", label: ["Nuevo", "New"], tone: "accent" },
  { value: "cotizado", label: ["Cotizado", "Quoted"], tone: "info" },
  { value: "confirmado", label: ["Confirmado", "Confirmed"], tone: "warn" },
  { value: "enviado", label: ["Enviado", "Shipped"], tone: "ok" },
  { value: "cerrado", label: ["Cerrado", "Closed"], tone: "muted" },
  { value: "perdido", label: ["Perdido", "Lost"], tone: "bad" },
];
export const PEDIDOS_ABIERTOS = ["nuevo", "cotizado", "confirmado"];

export const LOTE_ESTADOS: Option[] = [
  { value: "pendiente", label: ["Pendiente", "Pending"], tone: "accent" },
  { value: "inspeccion", label: ["En inspección", "Inspecting"], tone: "warn" },
  { value: "aprobado", label: ["Aprobado", "Approved"], tone: "ok" },
  { value: "rechazado", label: ["Rechazado", "Rejected"], tone: "bad" },
];

const PROVEEDOR_TIPOS: Option[] = [
  { value: "fabricante", label: ["Fabricante", "Manufacturer"] },
  { value: "distribuidor", label: ["Distribuidor", "Distributor"] },
  { value: "broker", label: ["Broker", "Broker"] },
];

export const optionLabel = (opts: Option[] | undefined, v: unknown, lang: Lang) => {
  const o = opts?.find((x) => x.value === v);
  return o ? (lang === "es" ? o.label[0] : o.label[1]) : text(v);
};

const L = {
  notas: ["Notas", "Notes"] as Tr,
  pais: ["País", "Country"] as Tr,
  contacto: ["Persona de contacto", "Contact person"] as Tr,
  email: ["Email", "Email"] as Tr,
  telefono: ["Teléfono", "Phone"] as Tr,
};

export const ENTITIES: Record<EntityId, Entity> = {
  pedidos: {
    id: "pedidos",
    table: "pedidos",
    code: "01",
    title: ["Pedidos", "Orders"],
    eyebrow: ["Pedidos entrantes", "Incoming orders"],
    intro: [
      "Peticiones de clientes: qué piden, cuánto y en qué punto está cada una.",
      "Client requests: what they need, how many and where each one stands.",
    ],
    singular: ["pedido", "order"],
    newLabel: ["Nuevo pedido", "New order"],
    empty: ["Todavía no hay pedidos.", "No orders yet."],
    select: "*, cliente:clientes(nombre), referencia:referencias(mpn, fabricante)",
    order: { column: "numero", ascending: false },
    statusKey: "estado",
    statuses: PEDIDO_ESTADOS,
    fields: [
      { key: "cliente_id", label: ["Cliente", "Client"], type: "fk", fk: { table: "clientes", labelKey: "nombre" }, required: true },
      { key: "estado", label: ["Estado", "Status"], type: "select", options: PEDIDO_ESTADOS, required: true },
      {
        key: "referencia_id",
        label: ["Referencia del catálogo", "Catalogue part"],
        type: "fk",
        fk: { table: "referencias", labelKey: "mpn", extra: "fabricante" },
      },
      {
        key: "mpn",
        label: ["MPN pedido", "Requested MPN"],
        type: "text",
        mono: true,
        placeholder: "STM32F407VGT6",
        hint: ["Si no está en el catálogo, escríbelo aquí.", "If it is not in the catalogue, type it here."],
      },
      { key: "cantidad", label: ["Cantidad", "Quantity"], type: "number", placeholder: "1000" },
      { key: "precio_objetivo", label: ["Precio objetivo (€/ud.)", "Target price (€/unit)"], type: "money", placeholder: "0,00" },
      { key: "fecha_limite", label: ["Fecha límite", "Deadline"], type: "date" },
      { key: "notas", label: L.notas, type: "textarea", wide: true },
    ],
    columns: [
      { key: "numero", label: ["Nº", "No."], value: (r) => pedidoCode(r.numero), mono: true, strong: true },
      { key: "cliente", label: ["Cliente", "Client"], value: (r) => text(rel(r, "cliente", "nombre")) },
      { key: "mpn", label: ["Referencia", "Part"], value: (r) => text(rel(r, "referencia", "mpn") ?? r.mpn), mono: true },
      { key: "cantidad", label: ["Cantidad", "Qty"], value: (r, l) => num(r.cantidad, l), align: "right", mono: true },
      { key: "precio_objetivo", label: ["Objetivo", "Target"], value: (r, l) => money(r.precio_objetivo, l), align: "right", mono: true, hideOnMobile: true },
      { key: "fecha_limite", label: ["Límite", "Deadline"], value: (r, l) => date(r.fecha_limite, l), hideOnMobile: true },
      { key: "estado", label: ["Estado", "Status"], value: (r) => String(r.estado ?? ""), status: true },
    ],
    titleOf: (r) => pedidoCode(r.numero),
    searchText: (r) =>
      [pedidoCode(r.numero), rel(r, "cliente", "nombre"), rel(r, "referencia", "mpn"), r.mpn, r.notas].join(" "),
  },

  lotes: {
    id: "lotes",
    table: "lotes",
    code: "02",
    title: ["Lotes", "Batches"],
    eyebrow: ["Control de lotes", "Batch control"],
    intro: [
      "Material que entra: de qué proveedor viene, su date code y el resultado de la inspección.",
      "Incoming material: which supplier it comes from, its date code and the inspection result.",
    ],
    singular: ["lote", "batch"],
    newLabel: ["Nuevo lote", "New batch"],
    empty: ["Todavía no hay lotes registrados.", "No batches recorded yet."],
    select: "*, referencia:referencias(mpn, fabricante), proveedor:proveedores(nombre), pedido:pedidos(numero)",
    order: { column: "recibido_el", ascending: false },
    statusKey: "estado",
    statuses: LOTE_ESTADOS,
    fields: [
      { key: "codigo", label: ["Código de lote", "Batch code"], type: "text", required: true, mono: true, placeholder: "L-2026-0001" },
      { key: "estado", label: ["Estado", "Status"], type: "select", options: LOTE_ESTADOS, required: true },
      { key: "referencia_id", label: ["Referencia", "Part"], type: "fk", fk: { table: "referencias", labelKey: "mpn", extra: "fabricante" } },
      { key: "proveedor_id", label: ["Proveedor", "Supplier"], type: "fk", fk: { table: "proveedores", labelKey: "nombre" } },
      { key: "cantidad", label: ["Cantidad", "Quantity"], type: "number", placeholder: "2500" },
      { key: "date_code", label: ["Date code", "Date code"], type: "text", mono: true, placeholder: "2441" },
      { key: "recibido_el", label: ["Recibido el", "Received on"], type: "date", required: true },
      { key: "pedido_id", label: ["Pedido asociado", "Related order"], type: "fk", fk: { table: "pedidos", labelKey: "numero" } },
      { key: "notas", label: L.notas, type: "textarea", wide: true },
    ],
    columns: [
      { key: "codigo", label: ["Lote", "Batch"], value: (r) => text(r.codigo), mono: true, strong: true },
      { key: "referencia", label: ["Referencia", "Part"], value: (r) => text(rel(r, "referencia", "mpn")), mono: true },
      { key: "proveedor", label: ["Proveedor", "Supplier"], value: (r) => text(rel(r, "proveedor", "nombre")), hideOnMobile: true },
      { key: "cantidad", label: ["Cantidad", "Qty"], value: (r, l) => num(r.cantidad, l), align: "right", mono: true },
      { key: "date_code", label: ["D/C", "D/C"], value: (r) => text(r.date_code), mono: true, hideOnMobile: true },
      { key: "recibido_el", label: ["Recibido", "Received"], value: (r, l) => date(r.recibido_el, l), hideOnMobile: true },
      { key: "estado", label: ["Estado", "Status"], value: (r) => String(r.estado ?? ""), status: true },
    ],
    titleOf: (r) => text(r.codigo),
    searchText: (r) =>
      [r.codigo, rel(r, "referencia", "mpn"), rel(r, "proveedor", "nombre"), r.date_code, r.notas].join(" "),
  },

  referencias: {
    id: "referencias",
    table: "referencias",
    code: "03",
    title: ["Referencias", "Parts"],
    eyebrow: ["Catálogo y stock", "Catalogue and stock"],
    intro: [
      "Cada componente que movemos: fabricante, encapsulado, unidades en stock y precio.",
      "Every component we handle: manufacturer, package, units in stock and price.",
    ],
    singular: ["referencia", "part"],
    newLabel: ["Nueva referencia", "New part"],
    empty: ["Todavía no hay referencias en el catálogo.", "The catalogue is empty."],
    select: "*",
    order: { column: "mpn", ascending: true },
    fields: [
      { key: "mpn", label: ["MPN", "MPN"], type: "text", required: true, mono: true, placeholder: "STM32F407VGT6" },
      { key: "fabricante", label: ["Fabricante", "Manufacturer"], type: "text", placeholder: "STMicroelectronics" },
      { key: "descripcion", label: ["Descripción", "Description"], type: "text", wide: true, placeholder: "MCU ARM Cortex-M4, 1 MB Flash" },
      { key: "encapsulado", label: ["Encapsulado", "Package"], type: "text", mono: true, placeholder: "LQFP-100" },
      { key: "stock", label: ["Stock (uds.)", "Stock (units)"], type: "number", placeholder: "0" },
      { key: "precio", label: ["Precio (€/ud.)", "Price (€/unit)"], type: "money", placeholder: "0,00" },
      { key: "ubicacion", label: ["Ubicación", "Location"], type: "text", placeholder: "A-03-2" },
      { key: "notas", label: L.notas, type: "textarea", wide: true },
    ],
    columns: [
      { key: "mpn", label: ["MPN", "MPN"], value: (r) => text(r.mpn), mono: true, strong: true },
      { key: "fabricante", label: ["Fabricante", "Manufacturer"], value: (r) => text(r.fabricante) },
      { key: "descripcion", label: ["Descripción", "Description"], value: (r) => text(r.descripcion), hideOnMobile: true },
      { key: "encapsulado", label: ["Encaps.", "Package"], value: (r) => text(r.encapsulado), mono: true, hideOnMobile: true },
      { key: "stock", label: ["Stock", "Stock"], value: (r, l) => num(r.stock, l), align: "right", mono: true },
      { key: "precio", label: ["Precio", "Price"], value: (r, l) => money(r.precio, l), align: "right", mono: true },
    ],
    titleOf: (r) => text(r.mpn),
    searchText: (r) => [r.mpn, r.fabricante, r.descripcion, r.encapsulado, r.ubicacion].join(" "),
  },

  proveedores: {
    id: "proveedores",
    table: "proveedores",
    code: "04",
    title: ["Proveedores", "Suppliers"],
    eyebrow: ["Red de suministro", "Supply network"],
    intro: [
      "Fabricantes, distribuidores y brokers con los que trabajamos, y cómo responden.",
      "Manufacturers, distributors and brokers we work with, and how reliable they are.",
    ],
    singular: ["proveedor", "supplier"],
    newLabel: ["Nuevo proveedor", "New supplier"],
    empty: ["Todavía no hay proveedores.", "No suppliers yet."],
    select: "*",
    order: { column: "nombre", ascending: true },
    fields: [
      { key: "nombre", label: ["Nombre", "Name"], type: "text", required: true, wide: true },
      { key: "tipo", label: ["Tipo", "Type"], type: "select", options: PROVEEDOR_TIPOS, required: true },
      { key: "valoracion", label: ["Valoración", "Rating"], type: "rating" },
      { key: "pais", label: L.pais, type: "text" },
      { key: "contacto", label: L.contacto, type: "text" },
      { key: "email", label: L.email, type: "email" },
      { key: "telefono", label: L.telefono, type: "tel" },
      { key: "notas", label: L.notas, type: "textarea", wide: true },
    ],
    columns: [
      { key: "nombre", label: ["Proveedor", "Supplier"], value: (r) => text(r.nombre), strong: true },
      { key: "tipo", label: ["Tipo", "Type"], value: (r, l) => optionLabel(PROVEEDOR_TIPOS, r.tipo, l) },
      { key: "pais", label: L.pais, value: (r) => text(r.pais), hideOnMobile: true },
      { key: "contacto", label: ["Contacto", "Contact"], value: (r) => text(r.contacto ?? r.email), hideOnMobile: true },
      {
        key: "valoracion",
        label: ["Valoración", "Rating"],
        value: (r) => (r.valoracion ? "●".repeat(Number(r.valoracion)) + "○".repeat(5 - Number(r.valoracion)) : "—"),
        mono: true,
      },
    ],
    titleOf: (r) => text(r.nombre),
    searchText: (r) => [r.nombre, r.tipo, r.pais, r.contacto, r.email].join(" "),
  },

  clientes: {
    id: "clientes",
    table: "clientes",
    code: "05",
    title: ["Clientes", "Clients"],
    eyebrow: ["Cartera de clientes", "Client book"],
    intro: [
      "Empresas que nos compran componentes y la persona con la que hablamos en cada una.",
      "Companies that buy components from us and who we talk to at each one.",
    ],
    singular: ["cliente", "client"],
    newLabel: ["Nuevo cliente", "New client"],
    empty: ["Todavía no hay clientes.", "No clients yet."],
    select: "*, pedidos(count)",
    order: { column: "nombre", ascending: true },
    fields: [
      { key: "nombre", label: ["Empresa", "Company"], type: "text", required: true, wide: true },
      { key: "contacto", label: L.contacto, type: "text" },
      { key: "sector", label: ["Sector", "Industry"], type: "text", placeholder: "Automoción" },
      { key: "email", label: L.email, type: "email" },
      { key: "telefono", label: L.telefono, type: "tel" },
      { key: "pais", label: L.pais, type: "text" },
      { key: "notas", label: L.notas, type: "textarea", wide: true },
    ],
    columns: [
      { key: "nombre", label: ["Empresa", "Company"], value: (r) => text(r.nombre), strong: true },
      { key: "contacto", label: ["Contacto", "Contact"], value: (r) => text(r.contacto) },
      { key: "sector", label: ["Sector", "Industry"], value: (r) => text(r.sector), hideOnMobile: true },
      { key: "pais", label: L.pais, value: (r) => text(r.pais), hideOnMobile: true },
      {
        key: "pedidos",
        label: ["Pedidos", "Orders"],
        value: (r, l) => num((r.pedidos as { count: number }[] | undefined)?.[0]?.count ?? 0, l),
        align: "right",
        mono: true,
      },
    ],
    titleOf: (r) => text(r.nombre),
    searchText: (r) => [r.nombre, r.contacto, r.email, r.sector, r.pais].join(" "),
  },
};

export const NAV: { group: Tr; items: SectionId[] }[] = [
  { group: ["Operación", "Operations"], items: ["inicio", "pedidos", "lotes"] },
  { group: ["Catálogo", "Catalogue"], items: ["referencias", "proveedores"] },
  { group: ["Comercial", "Sales"], items: ["clientes"] },
];

export const SECTION_TITLE: Record<SectionId, Tr> = {
  inicio: ["Inicio", "Home"],
  pedidos: ENTITIES.pedidos.title,
  lotes: ENTITIES.lotes.title,
  referencias: ENTITIES.referencias.title,
  proveedores: ENTITIES.proveedores.title,
  clientes: ENTITIES.clientes.title,
};

export const SECTION_CODE: Record<SectionId, string> = {
  inicio: "00",
  pedidos: "01",
  lotes: "02",
  referencias: "03",
  proveedores: "04",
  clientes: "05",
};
