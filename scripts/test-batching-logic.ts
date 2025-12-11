/**
 * Script de teste local para validar a lógica de batching V4
 * 
 * Este script simula o comportamento do batching sem precisar de deploy
 * 
 * Uso:
 *   npx tsx scripts/test-batching-logic.ts
 */

// Constantes do batching V4 (mesmo valores do edge function)
const INITIAL_WAIT_MS = 3000; // Espera inicial de 3s
const STABILITY_WAIT_MS = 4000; // Considerar estável após 4s sem novas mensagens
const MAX_TOTAL_WAIT_MS = 60000; // Máximo 60s total
const CHECK_INTERVAL_MS = 2000; // Verificar a cada 2s

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

// Simular lógica de batching V4 do edge function
async function simulateBatchingV4(db: MockDatabase, myMessage: Message): Promise<{
  shouldProcess: boolean;
  totalWaitTime: number;
  reason: string;
}> {
  console.log(`\n🔄 [WEBHOOK ${myMessage.id}] Iniciando batching V4...`);
  
  // PASSO 1: Espera inicial
  console.log(`⏳ [WEBHOOK ${myMessage.id}] Aguardando ${INITIAL_WAIT_MS}ms inicial...`);
  await new Promise(resolve => setTimeout(resolve, INITIAL_WAIT_MS));
  
  // PASSO 2: Verificar se sou a mensagem mais recente
  const latestAfterWait = db.getLatestMessage();
  if (latestAfterWait && latestAfterWait.id !== myMessage.id) {
    console.log(`📭 [WEBHOOK ${myMessage.id}] Não sou a mais recente. Encerrando.`);
    return {
      shouldProcess: false,
      totalWaitTime: INITIAL_WAIT_MS,
      reason: `Mensagem ${latestAfterWait.id} é mais nova`
    };
  }
  
  console.log(`✅ [WEBHOOK ${myMessage.id}] Sou a mais recente! Aguardando estabilização...`);
  
  // PASSO 3: Loop de estabilização
  const startTime = Date.now();
  let lastSeenMsgId = myMessage.id;
  let lastNewMsgTime = Date.now();
  
  while (Date.now() - startTime < MAX_TOTAL_WAIT_MS) {
    const checkMsg = db.getLatestMessage();
    
    if (checkMsg && checkMsg.id !== lastSeenMsgId) {
      // Nova mensagem chegou
      console.log(`📨 [WEBHOOK ${myMessage.id}] Nova mensagem: ${checkMsg.id}`);
      
      if (checkMsg.id !== myMessage.id) {
        // Não sou mais a mais recente - encerrar
        console.log(`🚪 [WEBHOOK ${myMessage.id}] Encerrando - ${checkMsg.id} vai processar`);
        return {
          shouldProcess: false,
          totalWaitTime: INITIAL_WAIT_MS + (Date.now() - startTime),
          reason: `Mensagem ${checkMsg.id} chegou e vai processar`
        };
      }
      
      lastSeenMsgId = checkMsg.id;
      lastNewMsgTime = Date.now();
    }
    
    // Verificar se estabilizou
    if (Date.now() - lastNewMsgTime >= STABILITY_WAIT_MS) {
      console.log(`✅ [WEBHOOK ${myMessage.id}] Estabilizado após ${Math.round((Date.now() - lastNewMsgTime) / 1000)}s`);
      break;
    }
    
    console.log(`⏳ [WEBHOOK ${myMessage.id}] Aguardando... (${Math.round((Date.now() - startTime) / 1000)}s)`);
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));
  }
  
  // PASSO 4: Verificação final
  const finalCheck = db.getLatestMessage();
  if (finalCheck && finalCheck.id !== myMessage.id) {
    console.log(`🚫 [WEBHOOK ${myMessage.id}] Verificação final falhou`);
    return {
      shouldProcess: false,
      totalWaitTime: INITIAL_WAIT_MS + (Date.now() - startTime),
      reason: "Outra mensagem chegou durante estabilização"
    };
  }
  
  console.log(`🎯 [WEBHOOK ${myMessage.id}] Sou o vencedor! Processando...`);
  return {
    shouldProcess: true,
    totalWaitTime: INITIAL_WAIT_MS + (Date.now() - startTime),
    reason: "Webhook vencedor - processando todas as mensagens"
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
  
  // Primeira mensagem chega e dispara o webhook
  const firstMessage = db.addMessage(clientMessages[0]);
  
  // Array para armazenar resultados de todos os webhooks
  const webhookResults: Promise<{ msgId: string; result: Awaited<ReturnType<typeof simulateBatchingV4>> }>[] = [];
  
  // Primeiro webhook inicia
  webhookResults.push(
    simulateBatchingV4(db, firstMessage).then(result => ({ msgId: firstMessage.id, result }))
  );
  
  // Simular cliente enviando mais mensagens e webhooks correspondentes
  for (let i = 1; i < clientMessages.length; i++) {
    await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
    const newMsg = db.addMessage(clientMessages[i]);
    // Cada mensagem dispara seu próprio webhook
    webhookResults.push(
      simulateBatchingV4(db, newMsg).then(result => ({ msgId: newMsg.id, result }))
    );
  }
  
  // Aguardar todos os webhooks terminarem
  const allResults = await Promise.all(webhookResults);
  
  // Analisar resultados
  const winners = allResults.filter(r => r.result.shouldProcess);
  const losers = allResults.filter(r => !r.result.shouldProcess);
  
  console.log(`\n=== RESULTADO DO BATCHING V4 ===`);
  console.log(`   Total de webhooks: ${allResults.length}`);
  console.log(`   Vencedores: ${winners.length}`);
  console.log(`   Encerraram: ${losers.length}`);
  console.log(`   Mensagens no DB: ${db.getMessageCount()}`);
  
  if (winners.length > 0) {
    console.log(`   Webhook vencedor: ${winners[0].msgId}`);
    console.log(`   Tempo de espera: ${Math.round(winners[0].result.totalWaitTime / 1000)}s`);
  }
  
  // Critério de sucesso: exatamente 1 webhook processou
  const success = winners.length === 1;
  
  console.log(`\n${'='.repeat(60)}`);
  if (success) {
    console.log(`✅ TESTE PASSOU: Exatamente 1 webhook processou!`);
  } else {
    console.log(`❌ TESTE FALHOU: ${winners.length} webhooks processaram (esperado: 1)`);
  }
  console.log(`${'='.repeat(60)}\n`);
  
  return success;
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║        TESTE LOCAL DA LÓGICA DE BATCHING V4                        ║
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
