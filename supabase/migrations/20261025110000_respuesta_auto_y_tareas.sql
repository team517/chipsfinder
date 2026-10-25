-- 1) Cuando entra un correo de un proveedor al que esperábamos, su oferta pasa sola a "respondido".
--    Primero por dirección exacta; si no hay ninguna, por dominio (salvo dominios genéricos).
create or replace function public.chf_oferta_respondida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remitente text := lower(trim(coalesce(new.from_email, '')));
  dom text := lower(split_part(coalesce(new.from_email, ''), '@', 2));
  n integer;
  genericos text[] := array['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','icloud.com','qq.com','163.com','126.com','aol.com','gmx.com','gmx.de','proton.me','protonmail.com'];
begin
  if new.direction <> 'in' or remitente = '' then
    return new;
  end if;

  update public.ofertas o
  set estado = 'respondido'
  where o.estado = 'contactado'
    and coalesce(new.fecha, now()) >= o.updated_at - interval '5 minutes'
    and (lower(o.email) = remitente
         or exists (select 1 from public.proveedores p where p.id = o.proveedor_id and lower(p.email) = remitente));
  get diagnostics n = row_count;

  if n = 0 and dom <> '' and not (dom = any (genericos)) then
    update public.ofertas o
    set estado = 'respondido'
    where o.estado = 'contactado'
      and coalesce(new.fecha, now()) >= o.updated_at - interval '5 minutes'
      and (lower(split_part(coalesce(o.email, ''), '@', 2)) = dom
           or exists (select 1 from public.proveedores p where p.id = o.proveedor_id and lower(split_part(coalesce(p.email, ''), '@', 2)) = dom));
  end if;
  return new;
end;
$$;

drop trigger if exists mensajes_oferta_respondida on public.mensajes;
create trigger mensajes_oferta_respondida after insert on public.mensajes
for each row execute function public.chf_oferta_respondida();

-- 2) Tareas automáticas que el usuario quita: se guardan con su clave para no volver a mostrarlas
alter table public.tareas add column if not exists clave text;
create index if not exists tareas_clave_idx on public.tareas (clave);
