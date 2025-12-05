# 🚀 Luchoa-IA Implementation Guide

## ✅ COMPLETED (Phase 1)

### 1. Integration Foundations ✓
- [x] Created Redsis API client (`src/integrations/redsis/client.ts`)
- [x] Token caching with auto-refresh
- [x] Retry logic with exponential backoff
- [x] TypeScript types for all Redsis entities
- [x] Environment variable configuration

### 2. Data Layer ✓
- [x] Created comprehensive database schema
  - `campaigns` - Campaign configuration
  - `campaign_participants` - Leads in campaigns
  - `lead_states` - State machine tracking
  - `cadence_queue` - Scheduled messages
  - `handoff_log` - Human intervention tracking
  - `blocklist_entries` - Reported phrases
  - `product_updates` - Auto product news
  - `message_feedback` - Thumbs up/down
- [x] Row Level Security (RLS) policies
- [x] Database triggers for updated_at

### 3. State Machine Engine ✓
- [x] Intent classification (pattern + GPT fallback)
- [x] Hot lead detection heuristics
- [x] State transition logic
- [x] Action execution framework
- [x] Integration with Redsis API
- [x] Edge function (`state-machine`)

### 4. UI - Campaign Management ✓
- [x] Campaign list page with status badges
- [x] Campaign builder with full config
- [x] Cadence rules configuration
- [x] Channel fallback settings
- [x] Routes added to App.tsx
- [x] Navigation from Index page

### 5. Webhook Integration ✓
- [x] State machine call in receive-whatsapp-message
- [x] Non-blocking processing
- [x] Error handling

## 🔨 TODO (Phase 2)

### 6. Cadence Scheduler Service
- [ ] Create Supabase cron function
  ```sql
  SELECT cron.schedule(
    'process-cadence-queue',
    '*/5 * * * *', -- Every 5 minutes
    $$SELECT net.http_post(...)$$
  );
  ```
- [ ] Process `cadence_queue` table
- [ ] Respect quiet hours per timezone
- [ ] Apply message limits (3/week, 24h min)
- [ ] Channel stickiness logic
- [ ] Fallback channel switching

### 7. Perfil Triplo (Triple Profile)
- [ ] Load persona from agent config
- [ ] Fetch client profile from Redsis
- [ ] Build campaign profile context
- [ ] Merge into GPT prompt
- [ ] Store context snapshot in `cadence_queue`

### 8. Inventory Integration
- [ ] Create inventory service wrapper
- [ ] Cache chapas/cavaletes queries
- [ ] Generate deep links to inventory
- [ ] Attach media URLs to offers
- [ ] Record item IDs in CRM notes

### 9. Negotiation Module
- [ ] CRUD for quotations table
- [ ] Playbook templates
- [ ] "Assumir/Devolver" buttons in UI
- [ ] Owner lock logic
- [ ] Auto-create "faturar" task on close

### 10. SLA Engine
- [ ] Read `data_prazo` from activities
- [ ] Calculate urgency scores
- [ ] Reprioritize cadence queue
- [ ] Send alerts when < 12h
- [ ] Dashboard widget

### 11. Kanban View
- [ ] Real-time board from Redsis
- [ ] Drag-and-drop cards
- [ ] Filter by stage/temperature
- [ ] Lead detail sidebar
- [ ] Conversation history link

### 12. Feedback & Blocklist
- [ ] Thumbs up/down UI per message
- [ ] Save to `message_feedback`
- [ ] Update `blocklist_entries`
- [ ] Apply pre-send filter
- [ ] Quality report page

### 13. Notifications & Alerts
- [ ] Hot lead alerts (Slack/WhatsApp interno)
- [ ] SLA breach warnings
- [ ] AI pause notifications
- [ ] Supabase Realtime channel

### 14. Multi-language Support
- [ ] Auto-detect client language
- [ ] Store in `campaign_participants`
- [ ] Use in GPT prompt
- [ ] Translate system messages

### 15. Product News Auto-Send
- [ ] Create product_updates form
- [ ] Target campaigns selector
- [ ] Batch send respecting limits
- [ ] Track sent_to_count

## 🧪 Testing & QA

### Unit Tests
- [ ] Intent classifier patterns
- [ ] Cadence calculations
- [ ] State machine transitions
- [ ] Redsis client methods

### Integration Tests
- [ ] Redsis API contract tests (sandbox)
- [ ] Supabase RLS policies
- [ ] Edge function e2e

### E2E Tests
- [ ] Campaign creation flow
- [ ] Message receive → state machine → Redsis update
- [ ] Owner lock/unlock cycle

## 📊 Observability

### Logging
- [ ] Structured logs (JSON)
- [ ] Trace IDs per message
- [ ] Error aggregation

### Metrics
- [ ] Cadence queue backlog
- [ ] GPT token usage
- [ ] Redsis API latency/errors
- [ ] Hot leads per day

### Alerting
- [ ] State machine failures
- [ ] Redsis auth failures
- [ ] Cadence queue buildup

## 🚢 Deployment Checklist

### Environment Setup
- [ ] Configure Redsis credentials in Supabase Secrets
- [ ] Set WhatsApp API keys
- [ ] Enable Supabase Realtime
- [ ] Deploy edge functions
- [ ] Run migrations

### Initial Data
- [ ] Seed Kanban mapping (funil/subfunil IDs)
- [ ] Create default agent
- [ ] Import initial leads from Redsis

### Production Readiness
- [ ] SSL/TLS for all APIs
- [ ] Rate limiting
- [ ] Backup strategy
- [ ] Monitoring dashboards
- [ ] Runbook documentation

## 📖 Documentation

### For Developers
- [x] Integration blueprint (`docs/luchoa-integration-plan.md`)
- [x] Redsis API reference
- [x] Database schema
- [ ] State machine DSL guide
- [ ] Deployment guide

### For Users
- [ ] Campaign setup tutorial
- [ ] How to interpret lead temperature
- [ ] Owner lock best practices
- [ ] Troubleshooting guide

## 🎯 Success Metrics

Track these KPIs after launch:
- Lead progression rate (A Trabalhar → Negociação)
- Hot lead detection accuracy
- Average time to response
- Messages sent vs limits
- Human intervention frequency
- Conversion rate per campaign

---

## Next Immediate Steps

1. **Run migrations**: Apply the schema to Supabase
   ```bash
   supabase db push
   ```

2. **Deploy edge functions**:
   ```bash
   supabase functions deploy state-machine
   ```

3. **Configure environment**:
   - Copy `.env.example` to `.env`
   - Fill in Redsis credentials
   - Test connection

4. **Create first campaign**:
   - Navigate to `/campaigns`
   - Create test campaign
   - Configure cadence rules

5. **Test state machine**:
   - Send test message via WhatsApp
   - Check logs for intent classification
   - Verify Redsis note creation

---

**Ready to proceed with Phase 2!** 🚀
