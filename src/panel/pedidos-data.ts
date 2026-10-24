// Datos de Pedidos (cotizaciones) organizados por cliente.
// Al guardar, la referencia y el proveedor se crean solos si no existían,
// así aparecen también en sus secciones.

import { supabase } from "../auth";

export type Oferta = {
  id: string;
  pedido_id: string;
  proveedor_id: string | null;
  proveedor: string | null;
  email: string | null;
  enlace: string | null;
  pais: string | null;
  precio: number | null;
  disponibilidad: string | null;
  elegida: boolean;
  notas: string | null;
};

export type Pedido = {
  id: string;
  numero: number;
  cliente_id: string;
  mpn: string | null;
  descripcion: string | null;
  unidades: string | null;
  precio_objetivo: number | null;
  precio_cliente: number | null;
  estado: string;
  notas: string | null;
  created_at: string;
  ofertas: Oferta[];
};

export type Cliente = {
  id: string;
  nombre: string;
  contacto: string | null;
  email: string | null;
  telefono: string | null;
  pais: string | null;
  sector: string | null;
  notas: string | null;
};

export type ClienteResumen = Cliente & { articulos: number; ofertas: number; abiertos: number };

export type Res<T> = { ok: true; data: T } | { ok: false };

const ok = <T>(data: T): Res<T> => ({ ok: true, data });
const fail = <T>(): Res<T> => ({ ok: false });

/** Clientes que tienen al menos un pedido, con sus contadores. */
export async function fetchClientesConPedidos(): Promise<Res<ClienteResumen[]>> {
  const { data, error } = await supabase
    .from("pedidos")
    .select("estado, cliente:clientes(id, nombre, contacto, email, telefono, pais, sector, notas), ofertas(id)")
    .limit(5000);
  if (error) return fail();
  const map = new Map<string, ClienteResumen>();
  for (const row of (data ?? []) as unknown as {
    estado: string;
    cliente: Cliente | null;
    ofertas: { id: string }[];
  }[]) {
    const c = row.cliente;
    if (!c) continue;
    let r = map.get(c.id);
    if (!r) {
      r = { ...c, articulos: 0, ofertas: 0, abiertos: 0 };
      map.set(c.id, r);
    }
    r.articulos += 1;
    r.ofertas += row.ofertas?.length ?? 0;
    if (["nuevo", "cotizado", "confirmado"].includes(row.estado)) r.abiertos += 1;
  }
  return ok([...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)));
}

export async function fetchAllClientes(): Promise<Res<Cliente[]>> {
  const { data, error } = await supabase.from("clientes").select("*").order("nombre").limit(5000);
  return error ? fail() : ok((data ?? []) as Cliente[]);
}

export async function fetchCliente(id: string): Promise<Res<{ cliente: Cliente; pedidos: Pedido[] }>> {
  const [c, p] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", id).single(),
    supabase
      .from("pedidos")
      .select("*, ofertas(*)")
      .eq("cliente_id", id)
      .order("numero", { ascending: false })
      .limit(2000),
  ]);
  if (c.error || p.error || !c.data) return fail();
  const pedidos = ((p.data ?? []) as unknown as Pedido[]).map((pe) => ({
    ...pe,
    ofertas: (pe.ofertas ?? []).sort((a, b) => Number(b.elegida) - Number(a.elegida)),
  }));
  return ok({ cliente: c.data as Cliente, pedidos });
}

export type PedidoInput = {
  cliente_id: string;
  mpn: string;
  descripcion: string;
  unidades: string;
  precio_objetivo: number | null;
  precio_cliente: number | null;
  estado: string;
  notas: string;
};

export async function savePedido(input: PedidoInput, id?: string): Promise<Res<{ id: string }>> {
  const payload = {
    cliente_id: input.cliente_id,
    mpn: input.mpn.trim() || null,
    descripcion: input.descripcion.trim() || null,
    unidades: input.unidades.trim() || null,
    precio_objetivo: input.precio_objetivo,
    precio_cliente: input.precio_cliente,
    estado: input.estado,
    notas: input.notas.trim() || null,
  };
  const q = id
    ? supabase.from("pedidos").update(payload).eq("id", id).select("id").single()
    : supabase.from("pedidos").insert(payload).select("id").single();
  const { data, error } = await q;
  if (error || !data) return fail();
  // La referencia aparece sola en el catálogo
  if (payload.mpn) await ensureReferencia(payload.mpn, payload.descripcion);
  return ok({ id: (data as { id: string }).id });
}

export async function deletePedido(id: string): Promise<Res<null>> {
  const { error } = await supabase.from("pedidos").delete().eq("id", id);
  return error ? fail() : ok(null);
}

export type OfertaInput = {
  pedido_id: string;
  proveedor_id: string | null;
  proveedor: string;
  email: string;
  enlace: string;
  pais: string;
  precio: number | null;
  disponibilidad: string;
  elegida: boolean;
  notas: string;
};

export async function saveOferta(input: OfertaInput, id?: string): Promise<Res<{ id: string }>> {
  // El proveedor aparece solo en Proveedores (se enlaza o se crea)
  let proveedorId = input.proveedor_id;
  if (!proveedorId && input.proveedor.trim()) {
    proveedorId = await ensureProveedor(input.proveedor, input.email, input.pais, input.enlace);
  }
  const payload = {
    pedido_id: input.pedido_id,
    proveedor_id: proveedorId,
    proveedor: input.proveedor.trim() || null,
    email: input.email.trim() || null,
    enlace: input.enlace.trim() || null,
    pais: input.pais.trim() || null,
    precio: input.precio,
    disponibilidad: input.disponibilidad.trim() || null,
    elegida: input.elegida,
    notas: input.notas.trim() || null,
  };
  const q = id
    ? supabase.from("ofertas").update(payload).eq("id", id).select("id").single()
    : supabase.from("ofertas").insert(payload).select("id").single();
  const { data, error } = await q;
  if (error || !data) return fail();
  // Solo un proveedor elegido por artículo
  if (payload.elegida) {
    await supabase.from("ofertas").update({ elegida: false }).eq("pedido_id", input.pedido_id).neq("id", (data as { id: string }).id);
  }
  return ok({ id: (data as { id: string }).id });
}

export async function deleteOferta(id: string): Promise<Res<null>> {
  const { error } = await supabase.from("ofertas").delete().eq("id", id);
  return error ? fail() : ok(null);
}

export async function setElegida(pedidoId: string, ofertaId: string): Promise<Res<null>> {
  const a = await supabase.from("ofertas").update({ elegida: false }).eq("pedido_id", pedidoId);
  const b = await supabase.from("ofertas").update({ elegida: true }).eq("id", ofertaId);
  return a.error || b.error ? fail() : ok(null);
}

// ---------- Crear referencia / proveedor si no existen ----------

async function ensureReferencia(mpn: string, descripcion: string | null) {
  const { data } = await supabase.from("referencias").select("id").ilike("mpn", mpn).limit(1);
  if (data && data.length) return;
  await supabase.from("referencias").insert({ mpn, descripcion: descripcion || null });
}

async function ensureProveedor(nombre: string, email: string, pais: string, web: string): Promise<string | null> {
  const n = nombre.trim();
  const { data } = await supabase.from("proveedores").select("id").ilike("nombre", n).limit(1);
  if (data && data.length) return (data[0] as { id: string }).id;
  const { data: nuevo } = await supabase
    .from("proveedores")
    .insert({ nombre: n, email: email.trim() || null, pais: pais.trim() || null, web: web.trim() || null, tipo: "distribuidor" })
    .select("id")
    .single();
  return (nuevo as { id: string } | null)?.id ?? null;
}

export async function clienteNuevo(nombre: string, email: string): Promise<Res<{ id: string }>> {
  const { data, error } = await supabase
    .from("clientes")
    .insert({ nombre: nombre.trim(), email: email.trim() || null })
    .select("id")
    .single();
  return error || !data ? fail() : ok({ id: (data as { id: string }).id });
}
