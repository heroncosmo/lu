-- Cadence Scheduler Cron Job
-- Processa a fila de mensagens de campanhas a cada 5 minutos

-- Remove job anterior se existir
DO $$
BEGIN
  PERFORM cron.unschedule('cadence-scheduler');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'cadence-scheduler',
  '*/5 * * * *', -- A cada 5 minutos
  $$
  SELECT
    net.http_post(
      url := 'https://jufguvfzieysywthbafu.supabase.co/functions/v1/cadence-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Verificar se foi criado
SELECT * FROM cron.job WHERE jobname = 'cadence-scheduler';

COMMENT ON EXTENSION pg_cron IS 'Cadence scheduler runs every 5 minutes to process campaign message queue';
