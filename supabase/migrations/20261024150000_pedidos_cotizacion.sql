-- Pedidos como cotización: cada pedido es un artículo que pide un cliente,
-- con varias OFERTAS de proveedores (precio, email, enlace, disponibilidad).

-- Enlace web del proveedor (para verlo también en Proveedores)
alter table public.proveedores add column if not exists web text;

-- Campos nuevos del pedido
alter table public.pedidos add column if not exists descripcion text;      -- descripción del artículo
alter table public.pedidos add column if not exists unidades text;         -- cantidad libre: "150 y 200 uds."
alter table public.pedidos add column if not exists precio_cliente numeric(14, 4) check (precio_cliente >= 0);

-- Ofertas de proveedores para cada pedido
create table if not exists public.ofertas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  proveedor_id uuid references public.proveedores (id) on delete set null,
  proveedor text,        -- nombre mostrado (copia, por si se borra el proveedor)
  email text,
  enlace text,           -- enlace del proveedor o de la oferta
  pais text,
  precio numeric(14, 4) check (precio >= 0),   -- €/ud. del proveedor
  disponibilidad text,   -- "Anuncia 8.163 unidades", "Bajo pedido…"
  elegida boolean not null default false,       -- proveedor elegido
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index if not exists ofertas_pedido_idx on public.ofertas (pedido_id);

create trigger ofertas_updated_at before update on public.ofertas
  for each row execute function public.chf_tocar_updated_at();

alter table public.ofertas enable row level security;
revoke all on public.ofertas from anon;
grant select, insert, update, delete on public.ofertas to authenticated;
create policy ofertas_leer on public.ofertas for select to authenticated using (public.chf_es_equipo());
create policy ofertas_crear on public.ofertas for insert to authenticated with check (public.chf_es_equipo());
create policy ofertas_editar on public.ofertas for update to authenticated using (public.chf_es_equipo()) with check (public.chf_es_equipo());
create policy ofertas_borrar on public.ofertas for delete to authenticated using (public.chf_es_equipo());
