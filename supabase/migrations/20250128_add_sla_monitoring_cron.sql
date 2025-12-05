-- SLA Monitoring Cron Job
-- Runs every 30 minutes to check deadlines and reprioritize

-- Remove existing job if any
SELECT cron.unschedule('sla-auto-update');

-- Create cron job for SLA monitoring
SELECT cron.schedule(
  'sla-auto-update',
  '*/30 * * * *', -- Every 30 minutes
  $$
  SELECT
    net.http_post(
      url := (SELECT concat(current_setting('app.supabase_url'), '/functions/v1/sla-monitoring')),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', concat('Bearer ', current_setting('app.supabase_service_role_key'))
      ),
      body := jsonb_build_object(
        'action', 'auto_update'
      )
    );
  $$
);

-- Verify job created
SELECT * FROM cron.job WHERE jobname = 'sla-auto-update';

COMMENT ON EXTENSION pg_cron IS 'SLA monitoring runs every 30 minutes to check deadlines';
