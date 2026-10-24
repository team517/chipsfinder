-- Unibox: correo del equipo por IMAP/SMTP (Gmail con contraseña de aplicación).

-- Dominio del cliente, para identificar de quién es un correo
alter table public.clientes add column if not exists dominio text;

-- Configuración del buzón (una sola fila). La contraseña NUNCA se expone al navegador:
-- la tabla no tiene políticas, así que solo la lee la función (service_role).
create table if not exists public.mail_config (
  id int primary key default 1 check (id = 1),
  address text not null,
  app_password text not null,
  last_sync timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);
alter table public.mail_config enable row level security;
revoke all on public.mail_config from anon, authenticated;

-- Correos guardados
create table if not exists public.mensajes (
  id uuid primary key default gen_random_uuid(),
  folder text not null default 'inbox',
  uid bigint,
  message_id text,
  thread_id text,
  in_reply_to text,
  referencias text,
  from_email text,
  from_name text,
  to_email text,
  cc text,
  subject text,
  fecha timestamptz,
  snippet text,
  body_html text,
  body_text text,
  adjuntos jsonb not null default '[]',
  seen boolean not null default false,
  direction text not null default 'in' check (direction in ('in', 'out')),
  cliente_id uuid references public.clientes (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists mensajes_folder_uid_key on public.mensajes (folder, uid) where uid is not null;
create index if not exists mensajes_thread_idx on public.mensajes (thread_id);
create index if not exists mensajes_fecha_idx on public.mensajes (fecha desc);
create index if not exists mensajes_cliente_idx on public.mensajes (cliente_id);

alter table public.mensajes enable row level security;
revoke all on public.mensajes from anon;
grant select, update on public.mensajes to authenticated;
create policy mensajes_leer on public.mensajes for select to authenticated using (public.chf_es_equipo());
create policy mensajes_marcar on public.mensajes for update to authenticated using (public.chf_es_equipo()) with check (public.chf_es_equipo());
-- insertar/borrar: solo la función (service_role)
