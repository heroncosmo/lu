# Tech Stack

- You are building a React application.
- Use TypeScript.
- Use React Router. KEEP the routes in src/App.tsx
- Always put source code in the src folder.
- Put pages into src/pages/
- Put components into src/components/
- The main page (default page) is src/pages/Index.tsx
- UPDATE the main page to include the new components. OTHERWISE, the user can NOT see any components!
- ALWAYS try to use the shadcn/ui library.
- Tailwind CSS: always use Tailwind CSS for styling components. Utilize Tailwind classes extensively for layout, spacing, colors, and other design aspects.

---

# 🏗️ ARQUITETURA LUCHOA-IA (IMPORTANTE!)

## O QUE É ESTE SISTEMA?

**Luchoa-IA é uma CAMADA DE PROSPECÇÃO INTELIGENTE que se integra ao CRM Redsis.**

### ❗ REGRAS FUNDAMENTAIS (NUNCA ESQUECER)

1. **CRM REDSIS É O MASTER** → Todos os dados de clientes, kanban, atividades e orçamentos residem no Redsis
2. **LUCHOA-IA É O PROSPECTOR** → Automatiza comunicação e prospecção, mas REFLETE no CRM
3. **SUPABASE É ESPELHO** → Mantém cópia sincronizada para operação rápida da IA
4. **AÇÕES AQUI → REFLETEM NO CRM** → Movimentações de kanban, anotações, atividades

### 📊 KANBAN ESPELHADO

O Kanban no Luchoa-IA **NÃO é um Kanban separado**. Ele **ESPELHA** o Kanban do CRM Redsis.
- **Leitura**: Dados vêm da API Redsis
- **Escrita**: Movimentar card chama API Redsis para atualizar
- **NÃO ALTERAR kanban aqui** → Alterar no CRM via API

### 🤖 COMO A IA AGE

A IA age **como se fosse um funcionário da Luchoa** trabalhando no CRM:
- Prospecta clientes
- Envia mensagens personalizadas (WhatsApp/Email/SMS)
- Classifica leads (cold/warm/hot)
- Move leads no Kanban do CRM
- Registra atividades no CRM
- Passa para humano quando necessário (Owner Lock)

### 📚 DOCUMENTAÇÃO COMPLETA

Consulte `docs/ARQUITETURA_LUCHOA_IA.md` para detalhes completos da arquitetura.

---

Available packages and libraries:

- The lucide-react package is installed for icons.
- You ALREADY have ALL the shadcn/ui components and their dependencies installed. So you don't need to install them again.
- You have ALL the necessary Radix UI components installed.
- Use prebuilt components from the shadcn/ui library after importing them. Note that these files shouldn't be edited, so make new components if you need to change them.
