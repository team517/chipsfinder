-- Ofertas de proveedores: estado del contacto, moneda y enlace directo a la referencia.
-- Una oferta puede ir ligada a un pedido de un cliente o solo a una referencia del catálogo.

alter table public.ofertas add column if not exists referencia_id uuid references public.referencias (id) on delete cascade;
alter table public.ofertas add column if not exists estado text not null default 'por_contactar'
  check (estado in ('por_contactar', 'contactado', 'respondido', 'oferta', 'descartado'));
alter table public.ofertas add column if not exists moneda text not null default 'EUR'
  check (moneda in ('EUR', 'USD', 'GBP', 'JPY', 'CNY'));
alter table public.ofertas alter column pedido_id drop not null;

-- Rellenar la referencia de las ofertas que ya existen
update public.ofertas o
set referencia_id = p.referencia_id
from public.pedidos p
where o.pedido_id = p.id and o.referencia_id is null and p.referencia_id is not null;

create index if not exists ofertas_referencia_idx on public.ofertas (referencia_id);
create index if not exists ofertas_proveedor_idx on public.ofertas (proveedor_id);

-- Contacto del proveedor (persona) ya existe; añadimos fabricante a la referencia si faltaba (ya existe)
