/**
 * TEST V5 BATCHING - Simula 6 webhooks paralelos do W-API
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "https://jufguvfzieysywthbafu.supabase.co";
const TEST_CLIENT_NUMBER = "17991956944";
const TEST_TIMESTAMP = Date.now();
const TEST_MESSAGE_BASE = `Teste V5 ${TEST_TIMESTAMP}`;

async function sendWebhook(webhookIndex, messageIndex) {
  const payload = {
    event: "webhookReceived",
    chat: { id: TEST_CLIENT_NUMBER },
    instanceId: "default",
    to: TEST_CLIENT_NUMBER,
    messageId: `msg-${TEST_TIMESTAMP}-${webhookIndex}-${messageIndex}`,
    body: `${TEST_MESSAGE_BASE} - Webhook #${webhookIndex}`,
    senderName: "Test User",
    sender: TEST_CLIENT_NUMBER,
    timestamp: Math.floor(Date.now() / 1000),
  };

  console.log(`[${new Date().toISOString()}] 📤 Webhook #${webhookIndex}`);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/receive-whatsapp-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (response.ok && data.success) {
      if (data.batched) {
        console.log(`  ✅ Batched (${data.clientMessageId})`);
      } else {
        console.log(`  🎯 PROCESSOU! (${data.agentMessageId})`);
      }
    } else {
      console.log(`  ❌ Erro ${response.status}`);
    }
  } catch (error) {
    console.log(`  ❌ Conexão: ${error.message}`);
  }
}

async function main() {
  console.log("🧪 TEST V5 BATCHING - 6 webhooks paralelos\n");
  
  const webhookPromises = [];
  for (let i = 1; i <= 6; i++) {
    await new Promise(resolve => setTimeout(resolve, 50));
    webhookPromises.push(sendWebhook(i, i));
  }

  await Promise.all(webhookPromises);

  console.log("\n✅ Teste enviado!");
  console.log("⏳ Aguarde 70s e verifique logs em:");
  console.log("   https://supabase.com/dashboard/project/jufguvfzieysywthbafu/functions");
}

main().catch(console.error);
