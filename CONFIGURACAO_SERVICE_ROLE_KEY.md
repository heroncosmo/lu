# 🔑 Configuração do Service Role Key - Cron Job

## ⚠️ AÇÃO MANUAL NECESSÁRIA

O cron job `process-cadence-queue` está **ativo** no Supabase, mas precisa da configuração do `service_role_key` para funcionar.

---

## 📋 Status Atual

✅ **Cron Job Criado:**
- Nome: `process-cadence-queue`
- Schedule: `*/5 * * * *` (a cada 5 minutos)
- Status: **ACTIVE**
- Comando:
```sql
SELECT
  net.http_post(
    url := get_app_setting('supabase_url') || '/functions/v1/cadence-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
```

⚠️ **Problema:**
- O cron job tenta ler `app.supabase_service_role_key` mas ela não está configurada
- Permissão negada para configurar via SQL direto

---

## 🛠️ COMO CONFIGURAR

### Opção 1: Via Dashboard do Supabase (RECOMENDADO)

1. Acesse: https://supabase.com/dashboard/project/jufguvfzieysywthhbafu

2. Vá em **Project Settings** → **API**

3. Copie o **service_role key** (secret):
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1v...
   ```

4. Vá em **Database** → **Database Settings** → **Custom Postgres Config**

5. Adicione:
   ```
   app.supabase_service_role_key = 'SUA_SERVICE_ROLE_KEY_AQUI'
   ```

6. Clique em **Save** e reinicie o banco (se solicitado)

---

### Opção 2: Via Supabase CLI

```bash
# 1. Instalar CLI (se não tiver)
npm install -g supabase

# 2. Login
supabase login

# 3. Link ao projeto
supabase link --project-ref jufguvfzieysywthhbafu

# 4. Executar SQL com privilégios de superuser
supabase db execute --sql "ALTER DATABASE postgres SET app.supabase_service_role_key TO 'SUA_SERVICE_ROLE_KEY_AQUI';"
```

---

### Opção 3: Via SQL Editor (Dashboard)

1. Acesse **SQL Editor** no Dashboard

2. Copie o service_role key de **Project Settings** → **API**

3. Execute como **postgres** user:
   ```sql
   ALTER DATABASE postgres 
   SET app.supabase_service_role_key TO 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
   ```

4. Verifique:
   ```sql
   SELECT name, setting 
   FROM pg_settings 
   WHERE name = 'app.supabase_service_role_key';
   ```

---

## 🧪 Como Testar

### 1. Verificar se a key está configurada:
```sql
SELECT current_setting('app.supabase_service_role_key', true);
```

**Resultado esperado:** A service role key completa

---

### 2. Testar manualmente o cron job:
```sql
SELECT cron.schedule('test-cadence-manual', '* * * * *', $$
  SELECT net.http_post(
    url := get_app_setting('supabase_url') || '/functions/v1/cadence-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
$$);
```

---

### 3. Ver logs do cron:
```sql
SELECT * 
FROM cron.job_run_details 
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-cadence-queue')
ORDER BY start_time DESC 
LIMIT 10;
```

**Resultado esperado:**
- `status = 'succeeded'`
- `return_message` sem erros

---

## 📊 Verificação de Funcionamento

### Status do Cron Job:
```sql
SELECT 
  jobname,
  schedule,
  active,
  last_run_start_time,
  last_run_status
FROM cron.job
WHERE jobname = 'process-cadence-queue';
```

### Últimas Execuções:
```sql
SELECT 
  start_time,
  end_time,
  status,
  return_message,
  EXTRACT(EPOCH FROM (end_time - start_time)) as duration_seconds
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'process-cadence-queue')
ORDER BY start_time DESC
LIMIT 5;
```

---

## 🚨 Troubleshooting

### Erro: "permission denied to set parameter"
**Causa:** Conexão não tem privilégios de superuser  
**Solução:** Use Dashboard ou CLI com credenciais de admin

### Erro: "parameter app.supabase_service_role_key is not set"
**Causa:** Key ainda não foi configurada  
**Solução:** Siga um dos métodos acima

### Erro no cron: "authentication failed"
**Causa:** Service role key incorreta ou expirada  
**Solução:** Copie novamente do Dashboard (Settings → API)

### Cron não executa
**Causa:** Extensão pg_cron não habilitada  
**Solução:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

---

## ✅ Checklist Final

Após configurar, verifique:

- [ ] Service role key configurada no banco
- [ ] Cron job está `active = true`
- [ ] Últimas execuções têm `status = 'succeeded'`
- [ ] Edge function `cadence-scheduler` está deployada
- [ ] Logs não mostram erros de autenticação
- [ ] Cadências estão sendo processadas a cada 5 minutos

---

## 📚 Referências

- **Supabase pg_cron:** https://supabase.com/docs/guides/database/extensions/pg_cron
- **pg_net (HTTP requests):** https://github.com/supabase/pg_net
- **Custom Postgres Config:** https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler

---

## 🎯 Resultado Esperado

Após configuração bem-sucedida:

```
✅ Cron job executa a cada 5 minutos
✅ Chama edge function cadence-scheduler
✅ Processa cadências pendentes
✅ Envia mensagens WhatsApp agendadas
✅ Logs sem erros
```

---

**Documentação Gerada Automaticamente**  
Data: 24/11/2025  
Projeto: cosmic-tardigrade-snap  
Status: Cron job ativo, aguardando configuração manual da key
