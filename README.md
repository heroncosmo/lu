# Luchoa-IA - AI-Powered B2B Prospecting Platform

Intelligent campaign orchestration system for B2B sales of natural stone products, with CRM integration (Redsis), WhatsApp automation, and state machine-driven lead management.

## 🎯 Features

### ✅ Implemented (Phase 1)
- **Agent Configuration**: GPT-4 powered sales agents with customizable personas
- **Campaign Management**: Create and configure multi-channel campaigns
- **State Machine Engine**: Automatic lead classification (cold/warm/hot)
- **Intent Detection**: Pattern + GPT hybrid for intent classification
- **Redsis CRM Integration**: Full API client with auth, retries, caching
- **WhatsApp Automation**: Send/receive messages via W-API
- **Database Layer**: Comprehensive schema with RLS policies
- **Real-time Updates**: Supabase Realtime for live chat

### 🚧 In Progress (Phase 2)
- Cadence Scheduler (cron-based message queue)
- Perfil Triplo (Triple Profile: Persona + Client + Campaign)
- Kanban Board UI (Redsis-synced)
- Negotiation Module with handoff controls
- SLA Engine with urgency alerts
- Inventory Integration (chapas/cavaletes)
- Feedback & Blocklist system

## 🏗️ Architecture

```
Frontend (React + TypeScript)
├── Campaign Management UI
├── Agent Configuration
├── Live Chat Interface
└── Kanban Dashboard

Backend (Supabase Edge Functions)
├── GPT Agent (response generation)
├── WhatsApp Webhook (receive messages)
├── State Machine (intent classification)
└── Cadence Scheduler (cron)

Integrations
├── Redsis CRM API (leads, activities, tasks)
├── W-API (WhatsApp Business)
├── OpenAI GPT-4
└── Supabase (DB + Auth + Realtime)
```

## 📚 Documentation

- [Quick Start Guide](docs/quick-start.md) - Get up and running
- [Integration Blueprint](docs/luchoa-integration-plan.md) - Architecture & design
- [Implementation Status](docs/implementation-status.md) - Roadmap & checklist
- [W-API Documentation](docs/w-api-pro-documentation.md) - WhatsApp API reference

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Supabase account
- W-API (WhatsApp Business API)
- Redsis CRM credentials

### Installation

1. Clone and install:
```bash
git clone <repository>
cd cosmic-tardigrade-snap
pnpm install
```

2. Configure environment:
```bash
cp .env.example .env
# Fill in your credentials
```

3. Setup database:
```bash
supabase link --project-ref your-ref
supabase db push
```

4. Deploy functions:
```bash
supabase functions deploy gpt-agent
supabase functions deploy receive-whatsapp-message
supabase functions deploy state-machine
```

5. Run dev server:
```bash
pnpm dev
```

See [Quick Start Guide](docs/quick-start.md) for detailed instructions.

## 🧪 Testing

### Test State Machine
```bash
# Send test message via WhatsApp
# Check logs:
supabase functions logs state-machine
```

### Test Redsis Connection
```bash
curl -X POST https://api.redsis.com.br/token \
  -H "Content-Type: application/json" \
  -d '{"usuario":"REDSIS","senha":"1010","app":"web","servidor":"10.1.1.200","porta":"8084"}'
```

## 📊 Tech Stack

- **Frontend**: React 18, TypeScript, TailwindCSS, shadcn/ui
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **AI**: OpenAI GPT-4o
- **CRM**: Redsis API
- **Messaging**: W-API (WhatsApp Business)
- **State Management**: TanStack Query
- **Build**: Vite

## 🔐 Security

- Row Level Security (RLS) on all tables
- Bearer token auth for Redsis
- Encrypted secrets in Supabase Vault
- API key rotation support

## 📈 Roadmap

**Q4 2024**
- [x] Basic WhatsApp + GPT integration
- [x] Agent configuration
- [x] Redsis API client
- [x] State machine engine
- [x] Campaign management UI

**Q1 2025**
- [ ] Cadence scheduler
- [ ] Perfil Triplo implementation
- [ ] Kanban board
- [ ] SLA engine
- [ ] Multi-language support

**Q2 2025**
- [ ] Negotiation module
- [ ] Inventory integration
- [ ] Analytics dashboard
- [ ] Mobile app (React Native)

## 🤝 Contributing

See [Implementation Status](docs/implementation-status.md) for current tasks.

## 📝 License

Proprietary - Luchoa Natural Stones

## 🆘 Support

- Issues: GitHub Issues
- Docs: `/docs` folder
- Email: support@luchoa.com

---


**Made with ❤️ by the Luchoa team**
