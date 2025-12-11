-- Migration: Configurar execução periódica do worker de agendamentos
-- NOTA: Esta migration documenta como configurar a execução automática do worker
-- Data: 2025-12-11

-- ====================================================================
-- OPÇÃO 1: Usando serviço externo (RECOMENDADO para Supabase hosted)
-- ====================================================================
-- Configure um serviço como GitHub Actions, Vercel Cron, ou similar para
-- chamar a edge function scheduled-contact-worker a cada 1-5 minutos:
--
-- curl -X POST \
--   'https://[SEU-PROJETO].supabase.co/functions/v1/scheduled-contact-worker' \
--   -H 'Authorization: Bearer [SUA-SERVICE-ROLE-KEY]'
--
-- Exemplo de GitHub Action (.github/workflows/scheduled-contacts.yml):
-- 
-- name: Execute Scheduled Contacts
-- on:
--   schedule:
--     - cron: '*/2 * * * *'  # A cada 2 minutos
-- jobs:
--   run:
--     runs-on: ubuntu-latest
--     steps:
--       - name: Call Supabase Edge Function
--         run: |
--           curl -X POST \
--             '${{ secrets.SUPABASE_URL }}/functions/v1/scheduled-contact-worker' \
--             -H 'Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}'
--
-- ====================================================================

-- ====================================================================
-- OPÇÃO 2: Webhook Manual (para testes e desenvolvimento)
-- ====================================================================
-- Você pode chamar a função manualmente via curl para testes:
--
-- curl -X POST \
--   'http://localhost:54321/functions/v1/scheduled-contact-worker' \
--   -H 'Authorization: Bearer [SERVICE-ROLE-KEY]'
--
-- ====================================================================

-- ====================================================================
-- OPÇÃO 3: pg_cron (apenas para self-hosted Supabase)
-- ====================================================================
-- Se você estiver rodando Supabase self-hosted com pg_cron instalado:
--
-- -- Habilitar a extensão pg_cron
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- 
-- -- Agendar execução a cada 2 minutos
-- SELECT cron.schedule(
--   'scheduled-contacts-worker',
--   '*/2 * * * *', -- A cada 2 minutos
--   $$
--   SELECT 
--     net.http_post(
--       url := 'http://kong:8000/functions/v1/scheduled-contact-worker',
--       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'))
--     ) AS request_id;
--   $$
-- );
-- 
-- -- Para visualizar jobs agendados:
-- -- SELECT * FROM cron.job;
-- 
-- -- Para remover o job:
-- -- SELECT cron.unschedule('scheduled-contacts-worker');
--
-- ====================================================================

-- Criar uma view helper para monitorar agendamentos pendentes
CREATE OR REPLACE VIEW pending_scheduled_contacts AS
SELECT 
  sc.id,
  sc.session_id,
  sc.client_name,
  sc.client_whatsapp_number,
  sc.scheduled_for,
  sc.reason,
  sc.requested_at,
  EXTRACT(EPOCH FROM (sc.scheduled_for - NOW())) / 60 AS minutes_until_due,
  ps.status AS session_status,
  ps.agent_id
FROM scheduled_contacts sc
JOIN prospecting_sessions ps ON ps.id = sc.session_id
WHERE sc.status = 'pending'
  AND sc.scheduled_for <= NOW() + INTERVAL '15 minutes' -- Mostrar próximos 15 minutos
ORDER BY sc.scheduled_for ASC;

COMMENT ON VIEW pending_scheduled_contacts IS 'View helper para monitorar agendamentos pendentes nas próximas 15 minutos';

-- Função helper para teste manual
CREATE OR REPLACE FUNCTION test_scheduled_contact_worker()
RETURNS TEXT AS $$
DECLARE
  due_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO due_count
  FROM scheduled_contacts
  WHERE status = 'pending' AND scheduled_for <= NOW();
  
  RETURN format('Agendamentos pendentes para execução: %s', due_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION test_scheduled_contact_worker IS 'Função de teste para verificar quantos agendamentos estão prontos para execução';
