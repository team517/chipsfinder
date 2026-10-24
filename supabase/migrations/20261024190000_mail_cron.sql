-- Sincronizador automático del Unibox: cada 2 minutos llama a la función "mail" (acción sync).
-- El secreto NO está aquí: se lee de Supabase Vault (nombre 'chf_cron_secret').
-- Si no hay correo conectado, la función responde "not_connected" y no hace nada.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'chf-mail-sync';

select cron.schedule(
  'chf-mail-sync',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := 'https://vwybcwidffcnpcjlehxv.supabase.co/functions/v1/mail',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'chf_cron_secret' limit 1)
    ),
    body := '{"action":"sync","limit":5}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
