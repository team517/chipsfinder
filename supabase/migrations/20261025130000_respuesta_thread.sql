-- Guardar en la oferta el hilo de la respuesta del proveedor (para el botón "Ver respuesta")
alter table public.ofertas add column if not exists respuesta_thread text;

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
  set estado = 'respondido', respuesta_thread = coalesce(new.thread_id, new.message_id)
  where o.estado = 'contactado'
    and coalesce(new.fecha, now()) >= o.updated_at - interval '5 minutes'
    and (lower(o.email) = remitente
         or exists (select 1 from public.proveedores p where p.id = o.proveedor_id and lower(p.email) = remitente));
  get diagnostics n = row_count;

  if n = 0 and dom <> '' and not (dom = any (genericos)) then
    update public.ofertas o
    set estado = 'respondido', respuesta_thread = coalesce(new.thread_id, new.message_id)
    where o.estado = 'contactado'
      and coalesce(new.fecha, now()) >= o.updated_at - interval '5 minutes'
      and (lower(split_part(coalesce(o.email, ''), '@', 2)) = dom
           or exists (select 1 from public.proveedores p where p.id = o.proveedor_id and lower(split_part(coalesce(p.email, ''), '@', 2)) = dom));
  end if;
  return new;
end;
$$;


-- Rellenar las ofertas que ya estaban respondidas con el último correo recibido de ese proveedor
update public.ofertas o
set respuesta_thread = m.hilo
from (
  select distinct on (o2.id) o2.id as oferta_id, coalesce(mm.thread_id, mm.message_id) as hilo
  from public.ofertas o2
  left join public.proveedores p on p.id = o2.proveedor_id
  join public.mensajes mm on mm.direction = 'in'
    and (lower(mm.from_email) = lower(coalesce(p.email, o2.email))
         or lower(split_part(mm.from_email, '@', 2)) = lower(split_part(coalesce(p.email, o2.email, ''), '@', 2)))
  where o2.estado in ('respondido', 'oferta') and o2.respuesta_thread is null and coalesce(p.email, o2.email) is not null
  order by o2.id, mm.fecha desc nulls last
) m
where o.id = m.oferta_id;
