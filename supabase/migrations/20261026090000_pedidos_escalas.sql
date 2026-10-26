-- Precios por cantidad de cada pedido: [{ "cantidad": 150, "coste": 132, "precio": 151.8 }, ...]
alter table public.pedidos add column if not exists escalas jsonb not null default '[]'::jsonb;
