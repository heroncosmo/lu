# 🕐 Configuração do Sistema de Agendamento de Contatos

## ⚠️ IMPORTANTE: Configuração Necessária

Para que o sistema de agendamento funcione completamente, você precisa configurar a execução automática do worker.

## 🔑 Passo 1: Configurar Secrets no GitHub

1. Vá para o repositório no GitHub
2. Acesse: **Settings** → **Secrets and variables** → **Actions**
3. Clique em **New repository secret**
4. Adicione os seguintes secrets:

### `SUPABASE_URL`
```
https://seu-projeto.supabase.co
```
*Encontre em: Supabase Dashboard → Settings → API → Project URL*

### `SUPABASE_SERVICE_ROLE_KEY`
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
*Encontre em: Supabase Dashboard → Settings → API → Service Role Key (secret)*

⚠️ **CUIDADO**: Nunca compartilhe ou commite a service role key!

## 🚀 Passo 2: Habilitar GitHub Actions

1. Vá para a aba **Actions** no repositório
2. Se necessário, clique em **I understand my workflows, go ahead and enable them**
3. Procure pelo workflow **"Execute Scheduled Contacts Worker"**
4. O workflow deve executar automaticamente a cada 2 minutos

## 🧪 Passo 3: Testar Execução Manual

1. Vá para **Actions** → **Execute Scheduled Contacts Worker**
2. Clique em **Run workflow** → **Run workflow**
3. Aguarde alguns segundos e verifique o resultado
4. Se bem-sucedido, você verá "✅ Worker executed successfully"

## 📊 Passo 4: Monitorar Execuções

### Ver Logs do GitHub Actions
1. **Actions** → Clique em qualquer execução
2. Clique em **execute-scheduled-contacts**
3. Veja os logs detalhados

### Ver Logs no Supabase
1. **Supabase Dashboard** → **Edge Functions**
2. Clique em **scheduled-contact-worker**
3. Veja a tab **Logs**

## 🔍 Verificação do Sistema

### Teste Completo End-to-End

1. **Criar um agendamento de teste**:
   ```sql
   -- Execute no Supabase SQL Editor
   INSERT INTO scheduled_contacts (
     session_id,
     client_name,
     client_whatsapp_number,
     scheduled_for,
     reason,
     context,
     status
   )
   SELECT 
     id as session_id,
     client_name,
     client_whatsapp_number,
     NOW() + INTERVAL '1 minute' as scheduled_for,
     'Teste de agendamento automático' as reason,
     'Contexto de teste' as context,
     'pending' as status
   FROM prospecting_sessions
   WHERE status = 'active'
   LIMIT 1;
   ```

2. **Aguarde 2-3 minutos** (o worker executa a cada 2 minutos)

3. **Verifique se foi executado**:
   ```sql
   SELECT * FROM scheduled_contacts 
   WHERE reason LIKE '%Teste de agendamento%'
   ORDER BY created_at DESC;
   ```
   
   O status deve mudar de `pending` → `executed`

4. **Verifique a mensagem enviada**:
   ```sql
   SELECT * FROM whatsapp_messages
   WHERE session_id = (
     SELECT session_id FROM scheduled_contacts 
     WHERE reason LIKE '%Teste de agendamento%'
     LIMIT 1
   )
   ORDER BY timestamp DESC
   LIMIT 3;
   ```

## 🎯 Teste de Detecção Automática

1. Acesse https://lu-ebon.vercel.app/prospecting
2. Inicie uma conversa com um cliente teste
3. Faça o cliente dizer: "me chama daqui 5 minutos"
4. Veja a resposta da IA confirmando o agendamento
5. Abra o "Calendário de Agendamentos" (botão flutuante)
6. Verifique se o agendamento aparece na lista
7. Aguarde 5-7 minutos
8. A IA deve enviar uma mensagem automaticamente retomando a conversa

## ⚙️ Alternativas de Execução (se GitHub Actions não estiver disponível)

### Opção A: Vercel Cron (se usando Vercel)

1. Criar `api/scheduled-contacts.ts`:
   ```typescript
   import { NextRequest, NextResponse } from 'next/server';

   export async function GET(request: NextRequest) {
     const authHeader = request.headers.get('authorization');
     
     // Verificar CRON_SECRET
     if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
     }

     const response = await fetch(
       `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/scheduled-contact-worker`,
       {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
         },
       }
     );

     const data = await response.json();
     return NextResponse.json(data);
   }
   ```

2. Configurar em `vercel.json`:
   ```json
   {
     "crons": [{
       "path": "/api/scheduled-contacts",
       "schedule": "*/2 * * * *"
     }]
   }
   ```

### Opção B: Serviço Externo (cron-job.org, EasyCron, etc.)

1. Criar conta em https://cron-job.org
2. Criar novo cron job:
   - **URL**: `https://seu-projeto.supabase.co/functions/v1/scheduled-contact-worker`
   - **HTTP Method**: POST
   - **Schedule**: Cada 2 minutos (`*/2 * * * *`)
   - **Headers**: 
     - `Authorization: Bearer [SUA-SERVICE-ROLE-KEY]`
     - `Content-Type: application/json`

### Opção C: Self-hosted com pg_cron (avançado)

Se você tem Supabase self-hosted:

```sql
-- Habilitar extensão
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Agendar execução
SELECT cron.schedule(
  'scheduled-contacts-worker',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'http://kong:8000/functions/v1/scheduled-contact-worker',
    headers := jsonb_build_object(
      'Authorization', 
      'Bearer ' || current_setting('app.settings.service_role_key')
    )
  );
  $$
);
```

## 📈 Métricas e Monitoramento

### Queries Úteis

**Agendamentos por Status**:
```sql
SELECT 
  status,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE scheduled_for > NOW()) as futuros,
  COUNT(*) FILTER (WHERE scheduled_for <= NOW()) as vencidos
FROM scheduled_contacts
GROUP BY status;
```

**Taxa de Sucesso**:
```sql
SELECT 
  COUNT(*) FILTER (WHERE status = 'executed') * 100.0 / 
  COUNT(*) FILTER (WHERE status IN ('executed', 'failed')) as taxa_sucesso
FROM scheduled_contacts;
```

**Próximos Agendamentos**:
```sql
SELECT * FROM pending_scheduled_contacts
ORDER BY scheduled_for ASC
LIMIT 10;
```

## 🆘 Troubleshooting

### Problema: Worker não está executando

**Verificar**:
1. GitHub Actions está habilitado?
2. Secrets estão configurados corretamente?
3. Workflow tem permissões de execução?

**Solução**: Execute manualmente e verifique os logs

### Problema: Agendamentos não são detectados

**Verificar**:
1. Cliente está usando frases claras? ("daqui X horas/minutos/dias")
2. Logs do gpt-agent mostram a detecção?
3. GPT-3.5 API key é válida?

**Solução**: Teste com frases mais explícitas primeiro

### Problema: Mensagens não são enviadas

**Verificar**:
1. Instância WhatsApp está conectada?
2. Número do cliente é válido?
3. Logs do send-whatsapp-message?

**Solução**: Testar envio manual de mensagem para o cliente

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs (GitHub Actions + Supabase Edge Functions)
2. Consulte a documentação completa em `docs/SISTEMA_AGENDAMENTO_CONTATOS.md`
3. Execute as queries de verificação acima
4. Entre em contato com o time de desenvolvimento

---

✅ **Sistema Configurado com Sucesso!** Os agendamentos agora funcionarão automaticamente. 🎉
