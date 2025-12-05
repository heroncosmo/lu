# 🚀 Quick Start Guide - Luchoa-IA

## Prerequisites
- Node.js 18+ installed
- Supabase project created
- WhatsApp Business API (W-API) account
- Redsis CRM credentials

## Step 1: Environment Setup

1. Copy environment template:
```powershell
Copy-Item .env.example .env
```

2. Fill in `.env` with your credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_WHATSAPP_INSTANCE_ID=your-instance-id
VITE_WHATSAPP_TOKEN=your-token
VITE_REDSIS_USUARIO=REDSIS
VITE_REDSIS_SENHA=1010
VITE_REDSIS_SERVIDOR=10.1.1.200
VITE_REDSIS_PORTA=8084
```

## Step 2: Database Setup

1. Link to your Supabase project:
```powershell
supabase link --project-ref your-project-ref
```

2. Run migrations:
```powershell
supabase db push
```

3. Verify tables created:
```powershell
supabase db diff
```

## Step 3: Deploy Edge Functions

```powershell
supabase functions deploy gpt-agent
supabase functions deploy receive-whatsapp-message
supabase functions deploy send-whatsapp-message
supabase functions deploy state-machine
```

## Step 4: Install Dependencies

```powershell
pnpm install
```

## Step 5: Run Development Server

```powershell
pnpm dev
```

Open http://localhost:5173

## Step 6: Initial Configuration

### 6.1 Create an Agent
1. Navigate to `/agent-configuration`
2. Click "Criar Novo Agente"
3. Configure:
   - Name: "Leandro"
   - Instructions: Paste your persona
   - GPT Model: gpt-4o
   - API Key: Your OpenAI key
   - Response delay: 30s
   - Word delay: 1.6s
4. Save

### 6.2 Create a Campaign
1. Navigate to `/campaigns`
2. Click "Nova Campanha"
3. Configure:
   - Name: "Patagonia Granite Q4"
   - Product: "Patagonia Granite"
   - Segment: Arquitetos
   - Messages/week: 3
   - Min interval: 24h
   - Cold followup: 5 days
   - Hot followup: 3 days
4. Save

### 6.3 Configure Webhook
1. Navigate to `/webhook-config`
2. Copy the webhook URL
3. In W-API dashboard, set webhook to:
   ```
   https://your-project.supabase.co/functions/v1/receive-whatsapp-message
   ```
4. Test with `/webhook-test`

## Step 7: Test the System

### Test Message Flow
1. Navigate to `/prospecting`
2. Select your agent
3. Enter test client:
   - Name: "Test Client"
   - WhatsApp: "+5511999999999"
4. Click "Iniciar Prospecção"
5. Send message from client number
6. Verify:
   - Message appears in UI
   - State machine logs (check Supabase logs)
   - AI response sent

### Test State Machine
Send these test messages:
- "Quanto custa?" → Should detect `pedido_orcamento`
- "Tem foto?" → Should detect `pedido_midia`
- "Quero reservar" → Should detect `interesse_reserva` (hot)

## Step 8: Production Deployment

### Vercel (Frontend)
```powershell
vercel --prod
```

### Supabase (Backend)
Already deployed via `supabase functions deploy`

### Environment Variables
Set in Vercel dashboard:
- All VITE_* variables from .env

## Troubleshooting

### Token Authentication Issues
```powershell
# Test Redsis connection
curl -X POST https://api.redsis.com.br/token `
  -H "Content-Type: application/json" `
  -d '{"usuario":"REDSIS","senha":"1010","app":"web","servidor":"10.1.1.200","porta":"8084"}'
```

### Edge Function Logs
```powershell
supabase functions logs state-machine
supabase functions logs receive-whatsapp-message
```

### Database Issues
```powershell
# Check RLS policies
supabase db inspect
```

## Next Steps

1. **Import Leads from Redsis**:
   - Fetch clientes via API
   - Insert into `campaign_participants`

2. **Configure Kanban Mapping**:
   - Get funil/subfunil IDs from Redsis
   - Update `campaigns.stage_mapping`

3. **Enable Cadence Scheduler**:
   - Create cron job (see implementation guide)
   - Test with sample queue items

4. **Set Up Monitoring**:
   - Enable Supabase logs
   - Configure alerts
   - Create dashboard

## Support

- Documentation: `/docs/`
- API Reference: `/docs/luchoa-integration-plan.md`
- Implementation Status: `/docs/implementation-status.md`

---

**You're ready to go! 🎉**
