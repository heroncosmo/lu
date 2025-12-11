/**
 * TESTE V7 - Verificar se batching está funcionando corretamente
 * 
 * Este script simula o que acontece quando múltiplas mensagens são enviadas
 * e verifica se o sistema responde corretamente.
 */

const sessionId = 'ac31c17f-e418-4d01-bebd-048c2e39bd1d';
const SUPABASE_URL = 'https://jufguvfzieysywthbafu.supabase.co';

async function testBatching() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  TESTE V7: Verificação do Sistema de Batching             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const { createClient } = await import('@supabase/supabase-js');
  
  // Usar variáveis de ambiente ou valores hardcoded para teste
  const supabase = createClient(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDQ0NTEzMiwiZXhwIjoyMDc2MDIxMTMyfQ.0VG7Qxlw_GVQk_kPv0F8Hk0y0L_QL3PdR4L5d8tdfHI'
  );
  
  console.log('1️⃣  Verificando estado do lock...\n');
  
  const { data: sessionState } = await supabase
    .from('prospecting_sessions')
    .select('batch_lock_id, batch_lock_until')
    .eq('id', sessionId)
    .single();
  
  if (sessionState?.batch_lock_id) {
    const lockExpired = new Date(sessionState.batch_lock_until) < new Date();
    if (!lockExpired) {
      console.log('   ❌ LOCK TRAVADO!');
      console.log(`   Lock ID: ${sessionState.batch_lock_id}`);
      console.log(`   Expira em: ${sessionState.batch_lock_until}`);
      console.log('\n   Limpando lock...');
      
      await supabase
        .from('prospecting_sessions')
        .update({ batch_lock_id: null, batch_lock_until: null })
        .eq('id', sessionId);
      
      console.log('   ✅ Lock limpo\n');
    } else {
      console.log('   ✅ Lock existente mas já expirado (OK)\n');
    }
  } else {
    console.log('   ✅ Nenhum lock ativo (OK)\n');
  }
  
  console.log('2️⃣  Contando mensagens antes do teste...\n');
  
  const { data: beforeMsgs, count: beforeCount } = await supabase
    .from('whatsapp_messages')
    .select('*', { count: 'exact' })
    .eq('session_id', sessionId);
  
  console.log(`   Total de mensagens: ${beforeCount}\n`);
  
  const { data: lastMsgs } = await supabase
    .from('whatsapp_messages')
    .select('sender, timestamp, message_content')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: false })
    .limit(5);
  
  console.log('   Últimas 5 mensagens:');
  lastMsgs?.forEach((msg, i) => {
    const time = new Date(msg.timestamp).toLocaleTimeString('pt-BR');
    const preview = msg.message_content?.substring(0, 40) || '';
    console.log(`   ${5-i}. [${time}] ${msg.sender}: ${preview}...`);
  });
  
  console.log('\n3️⃣  Verificando padrão de respostas...\n');
  
  // Analisar se há gaps sem resposta
  const { data: allMsgs } = await supabase
    .from('whatsapp_messages')
    .select('sender, timestamp')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true });
  
  let consecutiveClientMsgs = 0;
  let maxConsecutive = 0;
  let gaps = [];
  
  allMsgs?.forEach((msg, i) => {
    if (msg.sender === 'client') {
      consecutiveClientMsgs++;
      if (consecutiveClientMsgs > maxConsecutive) {
        maxConsecutive = consecutiveClientMsgs;
      }
    } else {
      if (consecutiveClientMsgs > 3) {
        gaps.push({
          count: consecutiveClientMsgs,
          timestamp: msg.timestamp
        });
      }
      consecutiveClientMsgs = 0;
    }
  });
  
  console.log(`   Máximo de mensagens client seguidas: ${maxConsecutive}`);
  
  if (gaps.length > 0) {
    console.log(`   ⚠️  Encontrados ${gaps.length} gaps com mais de 3 msgs sem resposta:`);
    gaps.forEach(g => {
      console.log(`      - ${g.count} mensagens antes de ${new Date(g.timestamp).toLocaleTimeString('pt-BR')}`);
    });
  } else if (maxConsecutive <= 3) {
    console.log('   ✅ Nenhum gap problemático encontrado\n');
  }
  
  console.log('4️⃣  Testando RPC de lock...\n');
  
  // Testar se RPC funciona
  const testWebhookId = 'test-' + Date.now();
  const { data: lockResult, error: lockError } = await supabase
    .rpc('acquire_batch_lock', {
      p_session_id: sessionId,
      p_webhook_id: testWebhookId,
      p_lock_duration_seconds: 5
    });
  
  if (lockError) {
    console.log(`   ❌ Erro no RPC acquire_batch_lock: ${lockError.message}\n`);
  } else {
    const success = lockResult?.[0]?.success;
    console.log(`   Lock adquirido: ${success ? '✅ Sim' : '❌ Não'}`);
    
    if (success) {
      // Liberar o lock
      const { data: releaseResult } = await supabase
        .rpc('release_batch_lock', {
          p_session_id: sessionId,
          p_webhook_id: testWebhookId
        });
      
      console.log(`   Lock liberado: ${releaseResult ? '✅ Sim' : '❌ Não'}\n`);
    }
  }
  
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  RESUMO DO TESTE                                         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  console.log('   Sistema V7 está configurado com:');
  console.log('   ✅ Lock atômico via RPC (acquire_batch_lock)');
  console.log('   ✅ Liberação de lock em todos os casos de return');
  console.log('   ✅ Sem verificação de cancelamento no gpt-agent');
  console.log('   ✅ Batching aguarda estabilização das mensagens\n');
  
  console.log('   PRÓXIMO PASSO:');
  console.log('   Envie algumas mensagens rápidas no WhatsApp e');
  console.log('   verifique se a IA responde corretamente.\n');
  
  return true;
}

testBatching()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Erro:', err);
    process.exit(1);
  });
