-- Panel interno: clientes, proveedores, referencias, pedidos y lotes.
-- Solo cuentas @chipsfinder.es pueden leer y escribir; borrar, solo administradores.

create or replace function public.chf_es_equipo()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@chipsfinder.es', false)
$$;

create or replace function public.chf_es_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.chf_es_equipo() and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

create or replace function public.chf_tocar_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Clientes ----------
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  contacto text,
  email text,
  telefono text,
  pais text,
  sector text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- ---------- Proveedores ----------
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  tipo text not null default 'distribuidor'
    check (tipo in ('fabricante', 'distribuidor', 'broker')),
  pais text,
  contacto text,
  email text,
  telefono text,
  valoracion smallint check (valoracion between 1 and 5),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);

-- ---------- Referencias (part numbers) ----------
create table public.referencias (
  id uuid primary key default gen_random_uuid(),
  mpn text not null check (length(trim(mpn)) > 0),
  fabricante text,
  descripcion text,
  encapsulado text,
  stock integer not null default 0 check (stock >= 0),
  precio numeric(14, 4) check (precio >= 0),
  ubicacion text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create unique index referencias_mpn_fabricante_key
  on public.referencias (upper(mpn), upper(coalesce(fabricante, '')));

-- ---------- Pedidos entrantes ----------
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  cliente_id uuid references public.clientes (id) on delete restrict,
  referencia_id uuid references public.referencias (id) on delete set null,
  mpn text,
  cantidad integer check (cantidad > 0),
  precio_objetivo numeric(14, 4) check (precio_objetivo >= 0),
  estado text not null default 'nuevo'
    check (estado in ('nuevo', 'cotizado', 'confirmado', 'enviado', 'cerrado', 'perdido')),
  fecha_limite date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index pedidos_cliente_idx on public.pedidos (cliente_id);
create index pedidos_estado_idx on public.pedidos (estado);

-- ---------- Lotes (control de entrada) ----------
create table public.lotes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null check (length(trim(codigo)) > 0),
  referencia_id uuid references public.referencias (id) on delete set null,
  proveedor_id uuid references public.proveedores (id) on delete set null,
  pedido_id uuid references public.pedidos (id) on delete set null,
  cantidad integer check (cantidad > 0),
  date_code text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'inspeccion', 'aprobado', 'rechazado')),
  recibido_el date not null default current_date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create unique index lotes_codigo_key on public.lotes (upper(codigo));
create index lotes_estado_idx on public.lotes (estado);

-- ---------- Triggers y permisos comunes ----------
do $$
declare
  t text;
begin
  foreach t in array array['clientes', 'proveedores', 'referencias', 'pedidos', 'lotes'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.chf_tocar_updated_at()', t || '_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.chf_es_equipo())', t || '_leer', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.chf_es_equipo())', t || '_crear', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.chf_es_equipo()) with check (public.chf_es_equipo())', t || '_editar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.chf_es_admin())', t || '_borrar', t);
  end loop;
end;
$$;
