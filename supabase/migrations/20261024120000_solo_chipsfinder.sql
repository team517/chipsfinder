-- Solo se admiten cuentas @chipsfinder.es, también si se crean desde el panel o la API de admin.
create or replace function public.chf_solo_dominio_equipo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or lower(new.email) !~ '@chipsfinder\.es$' then
    raise exception 'Solo se admiten cuentas @chipsfinder.es (%).', coalesce(new.email, 'sin email')
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.chf_solo_dominio_equipo() from public, anon, authenticated;

drop trigger if exists chf_solo_dominio_equipo on auth.users;
create trigger chf_solo_dominio_equipo
  before insert or update of email on auth.users
  for each row execute function public.chf_solo_dominio_equipo();
