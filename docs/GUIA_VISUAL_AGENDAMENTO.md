# 🎯 Guia Visual Rápido - Sistema de Agendamento

## 📱 Para o Usuário Final

### Como Agendar um Contato

**1. Cliente solicita durante a conversa:**
```
Cliente: "Pode me chamar daqui 2 horas?"
Cliente: "Me liga amanhã"
Cliente: "Volta a falar comigo em 30 minutos"
```

**2. IA confirma automaticamente:**
```
IA: "Claro! Vou entrar em contato com você daqui 2 horas então."
```

**3. Ver agendamentos:**
- Clique no botão **"📅 Calendário de Agendamentos"** (canto superior direito)
- Veja todos os contatos agendados
- Filtre por status (pendente/executado/falha)

### Interface do Calendário

```
┌─────────────────────────────────────────────────────────┐
│  📅 Calendário de Contatos Agendados                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐       │
│  │ Total  │  │Pendentes│  │Executados│  │Falhas │       │
│  │   15   │  │    3    │  │    11    │  │   1   │       │
│  └────────┘  └────────┘  └────────┘  └────────┘       │
│                                                          │
│  🟡 PENDENTE                                            │
│  ┌────────────────────────────────────────────────┐    │
│  │ 👤 João Silva                                   │    │
│  │ 📞 5511999999999                                │    │
│  │ 🕐 11/12/2025 às 16:30                         │    │
│  │ 📅 Agendado para daqui 25 minutos              │    │
│  │ 📝 Cliente pediu para falar daqui 2 horas      │    │
│  │                              [Cancelar]         │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  🟢 EXECUTADO                                           │
│  ┌────────────────────────────────────────────────┐    │
│  │ 👤 Maria Santos                                 │    │
│  │ 📞 5511888888888                                │    │
│  │ 🕐 11/12/2025 às 14:00                         │    │
│  │ ✅ Executado em: 11/12/2025 às 14:00          │    │
│  │ 📝 Cliente pediu para voltar a falar hoje      │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  🔴 ATRASADO ⚠️                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │ 👤 Pedro Costa                                  │    │
│  │ 📞 5511777777777                                │    │
│  │ 🕐 11/12/2025 às 13:00                         │    │
│  │ ⚠️ Atrasado - há 3 horas                       │    │
│  │ 📝 Cliente pediu para ligar de manhã           │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 Para Administradores

### Painel de Controle (Supabase)

**Ver todos os agendamentos:**
```sql
SELECT 
  client_name,
  client_whatsapp_number,
  scheduled_for,
  status,
  reason
FROM scheduled_contacts
ORDER BY scheduled_for DESC;
```

**Ver pendentes próximos:**
```sql
SELECT * FROM pending_scheduled_contacts
ORDER BY scheduled_for ASC;
```

**Estatísticas:**
```sql
SELECT 
  status,
  COUNT(*) as total,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentual
FROM scheduled_contacts
GROUP BY status;
```

### Logs e Monitoramento

**GitHub Actions:**
```
Actions → Execute Scheduled Contacts Worker
  └─ Ver últimas execuções
  └─ Logs detalhados
  └─ Status de cada agendamento processado
```

**Supabase:**
```
Edge Functions → scheduled-contact-worker
  └─ Logs em tempo real
  └─ Erros e avisos
  └─ Performance
```

---

## 🎨 Códigos de Status e Cores

| Status | Cor | Ícone | Significado |
|--------|-----|-------|-------------|
| **pending** | 🟡 Amarelo | ⏰ | Aguardando execução |
| **executed** | 🟢 Verde | ✅ | Executado com sucesso |
| **cancelled** | ⚫ Cinza | ❌ | Cancelado manualmente |
| **failed** | 🔴 Vermelho | ⚠️ | Falhou na execução |

---

## 📊 Dashboard de Métricas

```
╔═══════════════════════════════════════════════════╗
║  📊 ESTATÍSTICAS DE AGENDAMENTOS                  ║
╠═══════════════════════════════════════════════════╣
║                                                    ║
║  Total de Agendamentos:              127          ║
║  Pendentes:                           12  (9%)    ║
║  Executados com Sucesso:             109 (86%)    ║
║  Falhas:                               6  (5%)    ║
║                                                    ║
║  ═══════════════════════════════════════════════  ║
║                                                    ║
║  🎯 Taxa de Sucesso:                 95%          ║
║  ⏱️  Tempo Médio de Resposta:        1.8 min      ║
║  📅 Próximo Agendamento:             em 15 min    ║
║                                                    ║
╚═══════════════════════════════════════════════════╝
```

---

## 🚀 Fluxo de Dados Completo

```
┌─────────────┐
│   Cliente   │
└──────┬──────┘
       │ "me chama daqui 2 horas"
       ▼
┌─────────────────────┐
│  Mensagem WhatsApp  │
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────┐
│  GPT-Agent (IA)          │
│  • Analisa mensagem      │
│  • Detecta agendamento   │
│  • Extrai tempo          │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Banco de Dados          │
│  scheduled_contacts      │
│  • scheduled_for         │
│  • status: pending       │
└──────────┬───────────────┘
           │
           │ [Aguarda tempo...]
           │
           ▼
┌──────────────────────────┐
│  GitHub Actions          │
│  (a cada 2 minutos)      │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Worker Edge Function    │
│  • Busca vencidos        │
│  • Gera mensagem IA      │
│  • Envia WhatsApp        │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│  Cliente recebe          │
│  mensagem automática     │
└──────────────────────────┘
```

---

## 🎯 Casos de Uso

### Caso 1: Cliente Ocupado
```
Cliente: "Estou em reunião, pode me chamar daqui 1 hora?"
IA: "Tranquilo! Te chamo daqui 1 hora."
[1 hora depois]
IA: "E aí João, como combinamos, voltei aqui pra gente 
     continuar nossa conversa. Conseguiu sair da reunião?"
```

### Caso 2: Seguimento de Proposta
```
Cliente: "Me dá até amanhã pra pensar"
IA: "Sem problema! Te dou um toque amanhã então."
[No dia seguinte]
IA: "Bom dia Maria! Passando aqui pra saber se você 
     conseguiu pensar sobre nossa proposta."
```

### Caso 3: Horário Específico
```
Cliente: "Volta a falar comigo em 30 minutos"
IA: "Beleza! Daqui 30 minutos eu volto a falar com você."
[30 minutos depois]
IA: "E aí Pedro, tudo certo? Voltei como prometido!"
```

---

## 📱 Notificações e Alertas

### Para Usuários
- ✅ Confirmação visual no calendário
- ✅ Badge de status atualizado em tempo real
- ✅ Notificação quando agendamento é executado

### Para Administradores
- ⚠️ Alerta de agendamentos atrasados
- 📊 Relatório diário de execuções
- 🔴 Notificação de falhas

---

## 🛠️ Ações Disponíveis

### Para Agendamentos Pendentes
- ✅ **Ver detalhes** - Ver contexto completo
- ❌ **Cancelar** - Cancelar agendamento
- 📝 **Ver conversa** - Abrir histórico completo

### Para Agendamentos Executados
- ✅ **Ver detalhes** - Ver quando foi executado
- 📝 **Ver resposta** - Ver mensagem enviada
- 📊 **Analytics** - Ver métricas de sucesso

### Para Agendamentos Falhos
- 🔄 **Reagendar** - Tentar novamente
- 📋 **Ver erro** - Ver detalhes da falha
- 🔧 **Corrigir** - Ajustar dados e reprocessar

---

## ✨ Dicas de Uso

### Para Melhores Resultados

✅ **Use frases claras:**
- ✔️ "me chama daqui 2 horas"
- ✔️ "volta a falar comigo amanhã"
- ❌ "talvez mais tarde" (muito vago)

✅ **Monitore o calendário:**
- Verifique agendamentos atrasados
- Cancele se não for mais necessário
- Reagende falhas quando necessário

✅ **Mantenha WhatsApp conectado:**
- Instância deve estar ativa
- Número do cliente deve ser válido
- QR Code sempre atualizado

---

## 🆘 Resolução Rápida de Problemas

| Problema | Solução Rápida |
|----------|---------------|
| 🔴 Agendamento não detectado | Use frase mais explícita ("daqui X horas") |
| 🔴 Mensagem não enviada | Verificar instância WhatsApp conectada |
| 🔴 Agendamento atrasado | Worker pode ter delay de até 2 min |
| 🔴 Status não atualiza | Recarregar calendário (F5) |
| 🔴 Erro ao cancelar | Verificar permissões do usuário |

---

**🎉 Sistema funcionando e pronto para uso!**

Para mais detalhes, consulte:
- 📖 `docs/SISTEMA_AGENDAMENTO_CONTATOS.md` - Documentação completa
- ⚙️ `docs/CONFIGURACAO_AGENDAMENTO.md` - Guia de configuração
- 📋 `docs/RESUMO_AGENDAMENTO_IMPLEMENTADO.md` - Resumo executivo
