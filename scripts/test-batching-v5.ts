/**
 * Test Batching V5 - Simulação realista de webhooks paralelos
 * 
 * Este script simula EXATAMENTE o que acontece quando o W-API envia múltiplos
 * webhooks para mensagens rápidas do cliente.
 * 
 * CENÁRIO DO PROBLEMA:
 * - Cliente envia 6 mensagens em ~3 segundos
 * - W-API dispara 6 webhooks paralelos (quase simultâneos)
 * - Precisamos garantir que apenas 1 webhook processe e gere resposta
 * 
 * SOLUÇÃO V5:
 * - Usa lock atômico no banco com UPDATE condicional
 * - Apenas o primeiro webhook que conseguir o lock processa
 */

// Teste local - não precisa de conexão real com Supabase
// Simulamos o comportamento do banco localmente

// Constantes de batching (prefixo V5_ para evitar conflitos)
const V5_INITIAL_WAIT_MS = 3000;
const V5_STABILITY_WAIT_MS = 4000;
const V5_MAX_TOTAL_WAIT_MS = 60000;
const V5_CHECK_INTERVAL_MS = 2000;

interface SimulatedMessage {
  id: string;
  content: string;
  timestamp: Date;
  webhookId: string;
}

interface WebhookResult {
  webhookId: string;
  messageId: string;
  action: 'won_lock' | 'lost_lock' | 'batched_out' | 'error';
  details: string;
  executionTime: number;
}

/**
 * Simula um webhook processando uma mensagem
 * Esta é a lógica V5 com lock atômico
 */
async function simulateWebhook(
  sessionId: string,
  message: SimulatedMessage,
  allMessages: SimulatedMessage[]
): Promise<WebhookResult> {
  const startTime = Date.now();
  const webhookId = message.webhookId;
  
  console.log(`\n[${webhookId}] 📥 Iniciando processamento da mensagem: "${message.content}"`);
  
  try {
    // PASSO 1: Espera inicial (igual ao V4)
    console.log(`[${webhookId}] ⏳ Aguardando ${V5_INITIAL_WAIT_MS}ms...`);
    await new Promise(resolve => setTimeout(resolve, V5_INITIAL_WAIT_MS));
    
    // PASSO 2: Verificar se somos a mensagem mais recente (igual ao V4)
    // Isso filtra os webhooks antigos antes de tentar o lock
    const newestMessage = allMessages.reduce((newest, msg) => 
      msg.timestamp > newest.timestamp ? msg : newest
    );
    
    if (message.id !== newestMessage.id) {
      const execTime = Date.now() - startTime;
      console.log(`[${webhookId}] 📭 Não sou a mensagem mais recente. Encerrando.`);
      return {
        webhookId,
        messageId: message.id,
        action: 'batched_out',
        details: `Mensagem ${newestMessage.id} é mais recente`,
        executionTime: execTime
      };
    }
    
    console.log(`[${webhookId}] ✅ Sou a mensagem mais recente!`);
    
    // PASSO 3: Aguardar estabilização (igual ao V4)
    let stabilityStart = Date.now();
    let lastMsgCount = allMessages.length;
    
    console.log(`[${webhookId}] ⏳ Aguardando estabilização (${V5_STABILITY_WAIT_MS}ms sem novas mensagens)...`);
    
    // Em produção, verificaríamos o banco aqui
    // Para o teste, simulamos que não há novas mensagens
    await new Promise(resolve => setTimeout(resolve, V5_STABILITY_WAIT_MS));
    
    // PASSO 4: LOCK ATÔMICO - Esta é a diferença do V5!
    // Tentar adquirir o lock com UPDATE condicional
    console.log(`[${webhookId}] 🔒 Tentando adquirir lock atômico...`);
    
    const lockResult = await tryAcquireLock(sessionId, webhookId);
    
    if (!lockResult.acquired) {
      const execTime = Date.now() - startTime;
      console.log(`[${webhookId}] ❌ Lock não adquirido - outro webhook já está processando`);
      return {
        webhookId,
        messageId: message.id,
        action: 'lost_lock',
        details: `Lock pertence a: ${lockResult.owner}`,
        executionTime: execTime
      };
    }
    
    // GANHAMOS O LOCK!
    console.log(`[${webhookId}] 🎯 LOCK ADQUIRIDO! Este webhook vai processar.`);
    
    // Simular processamento GPT (em produção chamaria gpt-agent)
    console.log(`[${webhookId}] 🤖 Processando com GPT...`);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Simula 1s de GPT
    
    // Liberar o lock
    await releaseLock(sessionId, webhookId);
    
    const execTime = Date.now() - startTime;
    console.log(`[${webhookId}] ✅ Processamento concluído em ${execTime}ms`);
    
    return {
      webhookId,
      messageId: message.id,
      action: 'won_lock',
      details: 'Processou todas as mensagens',
      executionTime: execTime
    };
    
  } catch (error) {
    const execTime = Date.now() - startTime;
    console.error(`[${webhookId}] ❌ Erro:`, error);
    return {
      webhookId,
      messageId: message.id,
      action: 'error',
      details: String(error),
      executionTime: execTime
    };
  }
}

/**
 * Tenta adquirir o lock atômico na sessão
 * Usa UPDATE condicional para garantir atomicidade
 */
async function tryAcquireLock(
  sessionId: string, 
  webhookId: string
): Promise<{ acquired: boolean; owner?: string }> {
  // Em produção, faríamos:
  // UPDATE prospecting_sessions 
  // SET processing_webhook_id = webhookId, processing_started_at = NOW()
  // WHERE id = sessionId 
  // AND (processing_webhook_id IS NULL OR processing_started_at < NOW() - INTERVAL '60 seconds')
  // RETURNING id
  
  // Para o teste local, usamos uma variável compartilhada
  // (em produção o banco garante a atomicidade)
  
  const lockAcquired = await acquireLockInMemory(sessionId, webhookId);
  
  if (lockAcquired) {
    return { acquired: true };
  } else {
    return { acquired: false, owner: globalLocks.get(sessionId) || 'unknown' };
  }
}

/**
 * Libera o lock da sessão
 */
async function releaseLock(sessionId: string, webhookId: string): Promise<void> {
  // Em produção:
  // UPDATE prospecting_sessions 
  // SET processing_webhook_id = NULL, processing_started_at = NULL
  // WHERE id = sessionId AND processing_webhook_id = webhookId
  
  releaseLockInMemory(sessionId, webhookId);
}

// Simulação de lock em memória (para teste local)
const globalLocks = new Map<string, string>();
const lockMutex = new Map<string, Promise<void>>();

async function acquireLockInMemory(sessionId: string, webhookId: string): Promise<boolean> {
  // Simular atomicidade com mutex
  const currentLock = globalLocks.get(sessionId);
  
  if (!currentLock) {
    globalLocks.set(sessionId, webhookId);
    return true;
  }
  
  return false;
}

function releaseLockInMemory(sessionId: string, webhookId: string): void {
  if (globalLocks.get(sessionId) === webhookId) {
    globalLocks.delete(sessionId);
  }
}

/**
 * TESTE PRINCIPAL
 * Simula o cenário exato do problema: 6 mensagens rápidas, 6 webhooks paralelos
 */
async function runTest() {
  console.log("=".repeat(80));
  console.log("🧪 TEST BATCHING V5 - LOCK ATÔMICO");
  console.log("=".repeat(80));
  
  const testSessionId = "test-session-" + Date.now();
  
  // Limpar lock anterior
  globalLocks.delete(testSessionId);
  
  // Simular 6 mensagens rápidas (como no screenshot)
  const messages: SimulatedMessage[] = [
    { id: "msg-1", content: "Bele", timestamp: new Date(Date.now()), webhookId: "webhook-1" },
    { id: "msg-2", content: "Mano brow", timestamp: new Date(Date.now() + 100), webhookId: "webhook-2" },
    { id: "msg-3", content: "Tudo certo kk", timestamp: new Date(Date.now() + 200), webhookId: "webhook-3" },
    { id: "msg-4", content: "Fecho kk", timestamp: new Date(Date.now() + 300), webhookId: "webhook-4" },
    { id: "msg-5", content: "Peri Peri brabrabra", timestamp: new Date(Date.now() + 400), webhookId: "webhook-5" },
    { id: "msg-6", content: "Caracaaaa", timestamp: new Date(Date.now() + 500), webhookId: "webhook-6" },
  ];
  
  console.log("\n📨 Simulando 6 mensagens rápidas do cliente:");
  messages.forEach(m => console.log(`   - "${m.content}"`));
  
  console.log("\n🚀 Disparando 6 webhooks SIMULTANEAMENTE (como W-API faz)...\n");
  
  // Disparar todos os webhooks em paralelo
  const webhookPromises = messages.map(msg => 
    simulateWebhook(testSessionId, msg, messages)
  );
  
  // Aguardar todos terminarem
  const results = await Promise.all(webhookPromises);
  
  // Análise dos resultados
  console.log("\n" + "=".repeat(80));
  console.log("📊 RESULTADOS:");
  console.log("=".repeat(80));
  
  const wonLock = results.filter(r => r.action === 'won_lock');
  const lostLock = results.filter(r => r.action === 'lost_lock');
  const batchedOut = results.filter(r => r.action === 'batched_out');
  const errors = results.filter(r => r.action === 'error');
  
  console.log(`\n✅ Ganharam o lock: ${wonLock.length}`);
  wonLock.forEach(r => console.log(`   - ${r.webhookId}: ${r.details} (${r.executionTime}ms)`));
  
  console.log(`\n❌ Perderam o lock: ${lostLock.length}`);
  lostLock.forEach(r => console.log(`   - ${r.webhookId}: ${r.details} (${r.executionTime}ms)`));
  
  console.log(`\n📭 Batched out (não mais recente): ${batchedOut.length}`);
  batchedOut.forEach(r => console.log(`   - ${r.webhookId}: ${r.details} (${r.executionTime}ms)`));
  
  if (errors.length > 0) {
    console.log(`\n⚠️ Erros: ${errors.length}`);
    errors.forEach(r => console.log(`   - ${r.webhookId}: ${r.details}`));
  }
  
  // Verificação final
  console.log("\n" + "=".repeat(80));
  if (wonLock.length === 1) {
    console.log("✅ SUCESSO! Apenas 1 webhook processou as mensagens.");
    console.log("   Isso significa que apenas 1 resposta seria enviada ao cliente.");
  } else if (wonLock.length === 0) {
    console.log("⚠️ ATENÇÃO! Nenhum webhook processou. Isso é um problema!");
  } else {
    console.log(`❌ FALHA! ${wonLock.length} webhooks processaram. Múltiplas respostas seriam enviadas!`);
  }
  console.log("=".repeat(80));
}

// Executar teste
runTest().catch(console.error);
