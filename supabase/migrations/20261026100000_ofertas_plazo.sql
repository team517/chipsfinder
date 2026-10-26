-- Plazo de entrega que da el proveedor (p. ej. "En stock, 3-5 días", "8 semanas")
alter table public.ofertas add column if not exists plazo text;
