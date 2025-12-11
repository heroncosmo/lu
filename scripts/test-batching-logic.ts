/**
 * Script de teste local para validar a lógica de batching V3
 * 
 * Este script simula o comportamento do batching sem precisar de deploy
 * 
 * Uso:
 *   npx ts-node scripts/test-batching-logic.ts
 */

// Constantes do batching V3 (mesmo valores do edge function)
const INITIAL_WAIT_MS = 3000; // Espera inicial de 3s
const MIN_CHECK_INTERVAL_MS = 3000; // Mínimo entre verificações: 3s
const MAX_CHECK_INTERVAL_MS = 8000; // Máximo entre verificações: 8s
const STABILITY_THRESHOLD = 2; // Quantas verificações sem mudança = estabilizado
const ABSOLUTE_MAX_WAIT_MS = 300000; // Máximo absoluto: 5 minutos (segurança)

// Simular banco de dados com mensagens
interface Message {
  id: string;
  timestamp: Date;
  content: string;
}

class MockDatabase {
  private messages: Message[] = [];
  private messageCounter = 0;

  addMessage(content: string): Message {
    this.messageCounter++;
    const msg: Message = {
      id: `msg-${this.messageCounter}`,
      timestamp: new Date(),
      content
    };
    this.messages.push(msg);
    console.log(`  [DB] 📨 Nova mensagem adicionada: "${content}" (ID: ${msg.id})`);
    return msg;
  }

  getLatestMessage(): Message | undefined {
    return this.messages[this.messages.length - 1];
  }

  getAllMessages(): Message[] {
    return [...this.messages];
  }

  getMessagesAfter(timestampStr: string): Message[] {
    const timestamp = new Date(timestampStr);
    return this.messages.filter(m => m.timestamp > timestamp);
  }

  getMessageCount(): number {
    return this.messages.length;
  }
}

// Simular cliente enviando mensagens
async function simulateClientTyping(
  db: MockDatabase,
  messages: string[],
  delayBetweenMessages: number = 1500 // 1.5s entre mensagens por padrão
): Promise<void> {
  console.log(`\n📱 [CLIENTE] Iniciando envio de ${messages.length} mensagens (delay: ${delayBetweenMessages}ms)`);
  
  for (let i = 0; i < messages.length; i++) {
    await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
    db.addMessage(messages[i]);
  }
  
  console.log(`📱 [CLIENTE] Todas as mensagens enviadas!\n`);
}

// Simular lógica de batching do edge function
async function simulateBatching(db: MockDatabase, initialMessageId: string): Promise<{
  totalMessages: number;
  totalWaitTime: number;
  totalChecks: number;
  finalMessages: Message[];
}> {
  console.log(`\n🔄 [BATCHING] Iniciando estabilização...`);
  console.log(`   Mensagem inicial: ${initialMessageId}`);
  
  const startTime = Date.now();
  
  // PASSO 1: Espera inicial
  console.log(`⏳ [BATCHING] Aguardando janela inicial de ${INITIAL_WAIT_MS}ms...`);
  await new Promise(resolve => setTimeout(resolve, INITIAL_WAIT_MS));
  
  // PASSO 2: Loop de estabilização
  let lastSeenMessageId = initialMessageId;
  let consecutiveStableChecks = 0;
  let totalChecks = 0;
  let currentCheckInterval = MIN_CHECK_INTERVAL_MS;
  
  while (true) {
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs >= ABSOLUTE_MAX_WAIT_MS) {
      console.log(`⏰ [BATCHING] Tempo máximo absoluto atingido (${ABSOLUTE_MAX_WAIT_MS/1000}s). Processando agora.`);
      break;
    }
    
    const newestMsg = db.getLatestMessage();
    if (!newestMsg) {
      console.log(`⚠️ [BATCHING] Nenhuma mensagem encontrada. Continuando...`);
      break;
    }
    
    totalChecks++;
    
    if (newestMsg.id === lastSeenMessageId) {
      consecutiveStableChecks++;
      console.log(`📭 [BATCHING] Check ${totalChecks}: Sem novas mensagens. Estável: ${consecutiveStableChecks}/${STABILITY_THRESHOLD}`);
      
      if (consecutiveStableChecks >= STABILITY_THRESHOLD) {
        const totalWait = Date.now() - startTime;
        console.log(`✅ [BATCHING] ESTABILIZADO após ${totalChecks} verificações (${Math.round(totalWait/1000)}s total).`);
        break;
      }
      
      currentCheckInterval = Math.max(MIN_CHECK_INTERVAL_MS, currentCheckInterval - 1000);
    } else {
      console.log(`📨 [BATCHING] Check ${totalChecks}: NOVA MENSAGEM! ID: ${newestMsg.id}`);
      console.log(`   Conteúdo: "${newestMsg.content.substring(0, 50)}..."`);
      
      lastSeenMessageId = newestMsg.id;
      consecutiveStableChecks = 0;
      
      currentCheckInterval = Math.min(MAX_CHECK_INTERVAL_MS, currentCheckInterval + 1500);
      console.log(`   Próximo check em: ${currentCheckInterval}ms (adaptativo)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, currentCheckInterval));
  }
  
  const totalWaitTime = Date.now() - startTime;
  const allMessages = db.getAllMessages();
  
  console.log(`\n=== RESULTADO DO BATCHING ===`);
  console.log(`   Total de mensagens capturadas: ${allMessages.length}`);
  console.log(`   Tempo total de espera: ${Math.round(totalWaitTime/1000)}s`);
  console.log(`   Total de verificações: ${totalChecks}`);
  console.log(`   Mensagens:`);
  allMessages.forEach((m, i) => {
    console.log(`     ${i+1}. "${m.content}"`);
  });
  
  return {
    totalMessages: allMessages.length,
    totalWaitTime,
    totalChecks,
    finalMessages: allMessages
  };
}

// ===========================================
// CENÁRIOS DE TESTE
// ===========================================

async function runTest(name: string, clientMessages: string[], delayBetweenMessages: number): Promise<boolean> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 TESTE: ${name}`);
  console.log(`   Mensagens: ${clientMessages.length}`);
  console.log(`   Delay entre mensagens: ${delayBetweenMessages}ms`);
  console.log(`${'='.repeat(60)}`);
  
  const db = new MockDatabase();
  
  // Primeira mensagem chega e dispara o batching
  const firstMessage = db.addMessage(clientMessages[0]);
  
  // Iniciar cliente enviando as demais mensagens em paralelo
  const clientPromise = simulateClientTyping(
    db, 
    clientMessages.slice(1), 
    delayBetweenMessages
  );
  
  // Iniciar batching (simula o edge function)
  const batchingPromise = simulateBatching(db, firstMessage.id);
  
  // Aguardar ambos terminarem
  await Promise.all([clientPromise, batchingPromise]);
  const result = await batchingPromise;
  
  // Validar resultado
  const success = result.totalMessages === clientMessages.length;
  
  console.log(`\n${'='.repeat(60)}`);
  if (success) {
    console.log(`✅ TESTE PASSOU: Todas as ${clientMessages.length} mensagens foram capturadas!`);
  } else {
    console.log(`❌ TESTE FALHOU: Capturadas ${result.totalMessages}/${clientMessages.length} mensagens`);
  }
  console.log(`${'='.repeat(60)}\n`);
  
  return success;
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║        TESTE LOCAL DA LÓGICA DE BATCHING V3                        ║
║                                                                    ║
║  Este script simula o comportamento do batching sem precisar       ║
║  de deploy. Use para validar a lógica antes de enviar para prod.   ║
╚════════════════════════════════════════════════════════════════════╝
`);

  const results: { name: string; passed: boolean }[] = [];
  
  // Teste 1: Cliente envia 3 mensagens rápidas (1.5s entre cada)
  results.push({
    name: 'Mensagens rápidas (1.5s)',
    passed: await runTest(
      'Mensagens rápidas (1.5s)',
      ['Oi', 'Tudo bem?', 'Preciso de ajuda'],
      1500
    )
  });
  
  // Teste 2: Cliente envia 5 mensagens muito rápidas (500ms)
  results.push({
    name: 'Mensagens muito rápidas (500ms)',
    passed: await runTest(
      'Mensagens muito rápidas (500ms)',
      ['Oi', 'Tudo bem?', 'Preciso de ajuda', 'É urgente', 'Pode me ajudar?'],
      500
    )
  });
  
  // Teste 3: Cliente digita uma mensagem longa em partes (2s entre cada)
  results.push({
    name: 'Mensagem longa em partes (2s)',
    passed: await runTest(
      'Mensagem longa em partes (2s)',
      [
        'Olá, bom dia!',
        'Estou entrando em contato porque tenho uma dúvida',
        'sobre o produto que vi no seu site',
        'Vocês fazem entrega para São Paulo?'
      ],
      2000
    )
  });
  
  // Teste 4: Cliente envia 1 mensagem só
  results.push({
    name: 'Mensagem única',
    passed: await runTest(
      'Mensagem única',
      ['Olá!'],
      0
    )
  });
  
  // Resumo final
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 RESUMO DOS TESTES`);
  console.log(`${'='.repeat(60)}`);
  
  let allPassed = true;
  results.forEach(r => {
    const status = r.passed ? '✅ PASSOU' : '❌ FALHOU';
    console.log(`   ${status} - ${r.name}`);
    if (!r.passed) allPassed = false;
  });
  
  console.log(`${'='.repeat(60)}`);
  if (allPassed) {
    console.log(`\n🎉 TODOS OS TESTES PASSARAM! A lógica está correta.\n`);
  } else {
    console.log(`\n⚠️ ALGUNS TESTES FALHARAM! Revisar a lógica.\n`);
  }
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
