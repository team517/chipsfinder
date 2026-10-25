-- Tareas manuales del equipo (las automáticas se calculan en el panel a partir de pedidos y ofertas).

create table if not exists public.tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) > 0),
  notas text,
  pedido_id uuid references public.pedidos (id) on delete cascade,
  vence date,
  hecha boolean not null default false,
  hecha_el timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null
);
create index if not exists tareas_hecha_idx on public.tareas (hecha, vence);

create trigger tareas_updated_at before update on public.tareas for each row execute function public.chf_tocar_updated_at();
alter table public.tareas enable row level security;
revoke all on public.tareas from anon;
grant select, insert, update, delete on public.tareas to authenticated;
create policy tareas_leer on public.tareas for select to authenticated using (public.chf_es_equipo());
create policy tareas_crear on public.tareas for insert to authenticated with check (public.chf_es_equipo());
create policy tareas_editar on public.tareas for update to authenticated using (public.chf_es_equipo()) with check (public.chf_es_equipo());
create policy tareas_borrar on public.tareas for delete to authenticated using (public.chf_es_equipo());
