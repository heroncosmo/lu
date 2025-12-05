-- CRM Contacts Sync Cron Job
-- Executa diariamente para manter contatos atualizados

SELECT cron.unschedule('crm-contacts-sync');

SELECT cron.schedule(
  'crm-contacts-sync',
  '0 3 * * *', -- Todos os dias às 03:00
  $$
  SELECT
    net.http_post(
      url := (SELECT concat(current_setting('app.supabase_url'), '/functions/v1/sync-crm-contacts')),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', concat('Bearer ', current_setting('app.supabase_service_role_key'))
      ),
      body := jsonb_build_object(
        'run_type', 'scheduled'
      )
    );
  $$
);

SELECT * FROM cron.job WHERE jobname = 'crm-contacts-sync';
