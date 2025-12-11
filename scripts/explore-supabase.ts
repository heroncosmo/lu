import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jufguvfzieysywthbafu.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w";

const supabase = createClient(supabaseUrl, supabaseKey);

async function exploreTables() {
  console.log("🔍 Explorando tabelas do Supabase...\n");

  // Tentar várias tabelas comuns
  const possibleTables = [
    "agents",
    "agent",
    "bots",
    "bot",
    "assistants",
    "assistant",
    "configs",
    "config",
    "settings",
    "profiles",
    "users",
    "user",
    "api_keys",
    "apikeys",
    "prompts",
    "prompt",
    "instructions",
    "gpt_config",
    "gpt_settings",
    "openai_config",
    "ai_agents",
    "ai_config",
    "whatsapp_agents",
    "whatsapp_config",
    "chatbots",
    "chatbot",
    "conversations",
    "messages",
    "chats",
    "chat",
    "sessions",
    "session",
    "leads",
    "lead",
    "contacts",
    "contact",
    "crm",
    "campaigns",
    "campaign",
    "templates",
    "template",
    "flows",
    "flow",
    "integrations",
    "integration",
    "credentials",
    "credential",
    "keys",
    "key",
    "tokens",
    "token",
    "instances",
    "instance",
    "whatsapp_instances",
    "whatsapp_instance",
    "wapi_instances",
    "wapi_instance",
    "w_api",
    "wapi",
    "evolution",
    "evolution_instances",
    "baileys",
    "baileys_instances",
    "z_api",
    "zapi",
    "chat_messages",
    "chat_history",
    "history",
    "logs",
    "log",
    "analytics",
    "metrics",
    "stats",
    "responses",
    "response",
    "answers",
    "answer",
    "knowledge",
    "knowledge_base",
    "documents",
    "document",
    "files",
    "file",
    "attachments",
    "attachment",
    "media",
    "agent_configs",
    "agent_settings",
    "bot_configs",
    "bot_settings",
    "gpt_agents",
    "openai_agents",
    "llm_config",
    "llm_settings",
    "model_config",
    "model_settings",
  ];

  for (const table of possibleTables) {
    const { data, error } = await supabase.from(table).select("*").limit(3);

    if (!error && data) {
      console.log(`✅ Tabela encontrada: ${table} (${data.length} registros)`);
      if (data.length > 0) {
        console.log(`   Colunas: ${Object.keys(data[0] || {}).join(", ")}`);
        console.log(`   Dados: ${JSON.stringify(data[0]).substring(0, 200)}...\n`);
      } else {
        console.log(`   (vazia)\n`);
      }
    }
  }

  console.log("\n✅ Exploração completa!");
}

exploreTables().catch(console.error);
