# Sistema de Agendamento de Contatos - Documentação Completa

## 📋 Visão Geral

Sistema completo que permite à IA detectar e agendar automaticamente contatos futuros quando solicitado pelo cliente durante conversas no playground de prospecção.

## 🎯 Funcionalidades

### 1. Detecção Automática de Agendamento
- A IA analisa cada mensagem do cliente usando GPT-3.5-turbo
- Detecta solicitações como:
  - "fala comigo daqui 2 horas"
  - "me chama amanhã"
  - "volta a falar comigo em 30 minutos"
  - "pode me ligar daqui 3 dias"
- Extrai automaticamente:
  - Tempo (valor numérico)
  - Unidade (minutos/horas/dias)
  - Motivo do agendamento
  - Contexto da conversa

### 2. Armazenamento de Agendamentos
Tabela `scheduled_contacts` com:
- Informações do cliente (nome, WhatsApp)
- Data/hora agendada (calculada automaticamente)
- Status (pending, executed, cancelled, failed)
- Contexto da conversa para retomar o contato
- Timestamps de execução/cancelamento

### 3. Execução Automática de Contatos
Edge Function `scheduled-contact-worker` que:
- Busca agendamentos vencidos
- Gera mensagem contextualizada usando a IA
- Envia mensagem via WhatsApp automaticamente
- Registra mensagem no histórico da sessão
- Atualiza status do agendamento

### 4. Interface de Calendário
Componente visual completo com:
- Lista de todos os agendamentos
- Filtros por status (pendente/executado/falho)
- Estatísticas em tempo real
- Indicador de agendamentos atrasados
- Capacidade de cancelar agendamentos pendentes
- Atualização em tempo real via Realtime

## 🗃️ Estrutura do Banco de Dados

### Tabela: `scheduled_contacts`

```sql
CREATE TABLE scheduled_contacts (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES prospecting_sessions(id),
  client_name TEXT NOT NULL,
  client_whatsapp_number TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT CHECK (status IN ('pending', 'executed', 'cancelled', 'failed')),
  reason TEXT,
  context TEXT,
  executed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Funções Helper

#### `get_due_scheduled_contacts()`
Retorna agendamentos pendentes que já venceram.

#### `mark_scheduled_contact_executed(contact_id, error_msg)`
Marca um agendamento como executado ou falho.

#### `test_scheduled_contact_worker()`
Função de teste para verificar agendamentos prontos.

### View: `pending_scheduled_contacts`
Mostra agendamentos pendentes nos próximos 15 minutos com informações da sessão.

## 🔄 Fluxo de Funcionamento

### 1. Cliente Solicita Agendamento
```
Cliente: "Fala comigo daqui 2 horas"
```

### 2. IA Detecta e Responde
```typescript
// Em gpt-agent/index.ts
- Envia última mensagem para análise GPT-3.5
- Extrai: time_value=2, time_unit="hours"
- Calcula: scheduled_for = NOW() + 2 horas
- Salva no banco: scheduled_contacts
```

### 3. IA Confirma para o Cliente
```
IA: "Beleza! Eu entro em contato com você daqui 2 horas então."
```

### 4. Worker Executa no Horário
```typescript
// scheduled-contact-worker executado periodicamente
- Busca agendamentos vencidos
- Para cada agendamento:
  - Gera mensagem contextualizada
  - Envia via WhatsApp
  - Salva no histórico
  - Marca como executado
```

### 5. Cliente Recebe Contato
```
IA (2 horas depois): "E aí João, tudo certo? Como combinamos, 
tô voltando aqui pra gente continuar nossa conversa. Conseguiu 
dar uma pensada no que conversamos?"
```

## ⚙️ Configuração e Deploy

### 1. Aplicar Migrations

```bash
# No Supabase Studio ou via CLI
supabase db push

# Migrations aplicadas:
# - 20251211_scheduled_contacts.sql
# - 20251211_scheduled_contacts_worker_config.sql
```

### 2. Deploy da Edge Function

```bash
# Deploy do worker
supabase functions deploy scheduled-contact-worker

# Testar localmente
supabase functions serve scheduled-contact-worker
```

### 3. Configurar Execução Periódica

**Opção A: GitHub Actions (Recomendado)**

Criar `.github/workflows/scheduled-contacts.yml`:

```yaml
name: Execute Scheduled Contacts
on:
  schedule:
    - cron: '*/2 * * * *'  # A cada 2 minutos

jobs:
  run-worker:
    runs-on: ubuntu-latest
    steps:
      - name: Call Supabase Edge Function
        run: |
          curl -X POST \
            '${{ secrets.SUPABASE_URL }}/functions/v1/scheduled-contact-worker' \
            -H 'Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}'
```

**Opção B: Vercel Cron**

Criar `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/scheduled-contacts",
    "schedule": "*/2 * * * *"
  }]
}
```

**Opção C: Webhook Externo**
- Configurar em cron-job.org, EasyCron, etc.
- URL: `https://[projeto].supabase.co/functions/v1/scheduled-contact-worker`
- Header: `Authorization: Bearer [SERVICE-ROLE-KEY]`

### 4. Instalar Dependências Frontend

```bash
pnpm install date-fns
```

## 🧪 Testes

### Teste Manual de Detecção

1. Abrir playground: https://lu-ebon.vercel.app/prospecting
2. Iniciar conversa com um cliente
3. Cliente diz: "me chama daqui 10 minutos"
4. Verificar no banco:

```sql
SELECT * FROM scheduled_contacts 
WHERE status = 'pending' 
ORDER BY created_at DESC 
LIMIT 1;
```

### Teste do Worker

```bash
# Executar worker manualmente
curl -X POST \
  'http://localhost:54321/functions/v1/scheduled-contact-worker' \
  -H 'Authorization: Bearer [SERVICE-ROLE-KEY]'

# Ou via SQL
SELECT test_scheduled_contact_worker();
```

### Teste da Interface

1. Clicar em "Calendário de Agendamentos" (botão flutuante)
2. Verificar lista de agendamentos
3. Testar filtros (pendente/executado/falho)
4. Cancelar um agendamento pendente
5. Verificar atualização em tempo real

## 📊 Monitoramento

### Verificar Agendamentos Atrasados

```sql
SELECT * FROM pending_scheduled_contacts
WHERE minutes_until_due < 0;
```

### Estatísticas

```sql
SELECT 
  status,
  COUNT(*) as total,
  MIN(scheduled_for) as oldest,
  MAX(scheduled_for) as newest
FROM scheduled_contacts
GROUP BY status;
```

### Logs do Worker

Ver logs no Supabase Dashboard > Edge Functions > scheduled-contact-worker > Logs

## 🔐 Segurança

### RLS Policies
- Todos os usuários ativos podem ver agendamentos (sistema compartilhado)
- Apenas usuários ativos podem criar/editar agendamentos
- Service role key necessária para executar o worker

### Permissões

O sistema respeita as permissões existentes:
- `playground`: Ver interface de prospecção
- `create_prospecting`: Criar novas sessões

## 🎨 Interface do Usuário

### Calendário de Agendamentos

**Localização**: Botão flutuante no canto superior direito da página de prospecção

**Recursos**:
- ✅ Cards visuais com informações completas
- ✅ Status com badges coloridos
- ✅ Indicador de tempo (quanto falta/atrasado)
- ✅ Estatísticas resumidas (total/pendentes/executados/falhas)
- ✅ Filtros por status
- ✅ Ver contexto da conversa (expansível)
- ✅ Cancelar agendamentos pendentes
- ✅ Atualização em tempo real

**Cores de Status**:
- 🟡 Amarelo: Pendente
- 🟢 Verde: Executado
- 🔴 Vermelho: Falhou
- ⚫ Cinza: Cancelado

## 🚨 Tratamento de Erros

### Erros Comuns e Soluções

**1. Agendamento não é salvo**
- Verificar logs do gpt-agent
- Verificar se GPT-3.5 está retornando JSON válido
- Testar detecção manualmente

**2. Worker não executa**
- Verificar se cron está configurado
- Testar worker manualmente via curl
- Verificar logs de erro no Supabase

**3. Mensagem não é enviada**
- Verificar instância WhatsApp está conectada
- Verificar número do cliente é válido
- Ver logs da função send-whatsapp-message

## 📝 Exemplos de Uso

### Exemplo 1: Agendamento Simples
```
Cliente: "pode me chamar daqui 1 hora?"
IA: "Claro! Vou entrar em contato daqui 1 hora."
[Agendamento criado para NOW() + 1h]
[Worker executa após 1h]
IA: "E aí João, como combinamos, voltei aqui..."
```

### Exemplo 2: Agendamento em Dias
```
Cliente: "me liga segunda-feira"
IA: "Tranquilo! Te ligo na segunda então."
[Agendamento criado para próxima segunda]
```

### Exemplo 3: Cancelamento
```
[Usuário abre calendário]
[Clica em "Cancelar" no agendamento]
[Status muda para "cancelled"]
[Worker ignora agendamentos cancelados]
```

## 🔧 Manutenção

### Limpeza de Agendamentos Antigos

```sql
-- Arquivar agendamentos executados há mais de 30 dias
DELETE FROM scheduled_contacts
WHERE status IN ('executed', 'cancelled')
  AND updated_at < NOW() - INTERVAL '30 days';
```

### Reprocessar Agendamento Falho

```sql
-- Marcar como pendente novamente
UPDATE scheduled_contacts
SET 
  status = 'pending',
  error_message = NULL,
  executed_at = NULL
WHERE id = 'UUID-DO-AGENDAMENTO';
```

## 📞 Suporte

### Problemas Conhecidos

1. **Detecção imprecisa**: A IA pode não detectar solicitações muito complexas
   - Solução: Melhorar o prompt de detecção

2. **Timezone**: Certifique-se que o servidor está em UTC
   - Conversões são feitas automaticamente

3. **Rate limits**: OpenAI pode limitar chamadas
   - Worker processa agendamentos sequencialmente para evitar limites

## 🚀 Melhorias Futuras

- [ ] Suporte a agendamentos recorrentes
- [ ] Notificações push quando agendamento for executado
- [ ] Editar data/hora de agendamentos pendentes
- [ ] Agendamentos com horário específico ("me chama às 15h")
- [ ] Timezone do cliente (detectar automaticamente)
- [ ] Reagendar automaticamente falhas com backoff
- [ ] Dashboard analytics de agendamentos

## 📄 Licença

Este sistema é parte do projeto Luchoa IA.
