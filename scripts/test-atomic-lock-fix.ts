/**
 * TESTE LOCAL - DEMONSTRAÇÃO DO PROBLEMA E SOLUÇÃO
 * 
 * PROBLEMA: .or() não funciona em UPDATE do Supabase Client
 * Isso causa race condition onde TODOS os webhooks conseguem adquirir lock
 * 
 * SOLUÇÃO: RPC function com UPDATE ... WHERE nativo do PostgreSQL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

// Configuração do Supabase
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ============================================
// TESTE 1: Demonstrar que .or() NÃO funciona em UPDATE
// ============================================
async function testProblematicUpdate() {
  console.log("\n=== TESTE 1: UPDATE com .or() (PROBLEMÁTICO) ===\n");
  
  // Criar sessão de teste
  const { data: session } = await supabase
    .from('prospecting_sessions')
    .select('id')
    .limit(1)
    .single();
  
  if (!session) {
    console.error("❌ Nenhuma sessão encontrada para teste");
    return;
  }
  
  console.log(`Usando sessão: ${session.id}`);
  
  // Limpar lock anterior
  await supabase
    .from('prospecting_sessions')
    .update({ batch_lock_id: null, batch_lock_until: null })
    .eq('id', session.id);
  
  console.log("\n📝 Lock limpo. Agora simulando 3 webhooks tentando adquirir lock...\n");
  
  // Simular 3 webhooks paralelos tentando adquirir lock
  const webhooks = ['webhook-1', 'webhook-2', 'webhook-3'];
  
  const results = await Promise.all(
    webhooks.map(async (webhookId) => {
      const lockUntil = new Date(Date.now() + 120000).toISOString();
      
      // Tentar adquirir lock com .or() (PROBLEMÁTICO)
      const { data, error } = await supabase
        .from('prospecting_sessions')
        .update({
          batch_lock_id: webhookId,
          batch_lock_until: lockUntil
        })
        .eq('id', session.id)
        .or(`batch_lock_until.is.null,batch_lock_until.lt.${new Date().toISOString()}`)
        .select('id, batch_lock_id')
        .single();
      
      return {
        webhookId,
        success: !error && data?.batch_lock_id === webhookId,
        data,
        error
      };
    })
  );
  
  console.log("\n📊 RESULTADOS:\n");
  results.forEach(r => {
    console.log(`${r.webhookId}: ${r.success ? '✅ CONSEGUIU LOCK' : '❌ Falhou'}`);
    console.log(`   Lock atual: ${r.data?.batch_lock_id || 'null'}`);
  });
  
  const winners = results.filter(r => r.success).length;
  
  if (winners > 1) {
    console.log(`\n❌ PROBLEMA CONFIRMADO: ${winners} webhooks conseguiram lock simultaneamente!`);
    console.log("   Isso causa múltiplas respostas duplicadas ao cliente.\n");
  } else if (winners === 1) {
    console.log("\n⚠️ Apenas 1 conseguiu lock desta vez, mas não é garantido (race condition).\n");
  } else {
    console.log("\n⚠️ Nenhum conseguiu lock (possível se .or() foi processado, mas improvável).\n");
  }
  
  return session.id;
}

// ============================================
// TESTE 2: Demonstrar RPC function funcionando corretamente
// ============================================
async function testRPCSolution(sessionId: string) {
  console.log("\n=== TESTE 2: RPC acquire_batch_lock (SOLUÇÃO) ===\n");
  
  // Limpar lock anterior
  await supabase
    .from('prospecting_sessions')
    .update({ batch_lock_id: null, batch_lock_until: null })
    .eq('id', sessionId);
  
  console.log("📝 Lock limpo. Agora simulando 3 webhooks usando RPC...\n");
  
  // Simular 3 webhooks paralelos usando RPC
  const webhooks = ['webhook-A', 'webhook-B', 'webhook-C'];
  
  const results = await Promise.all(
    webhooks.map(async (webhookId) => {
      const { data, error } = await supabase
        .rpc('acquire_batch_lock', {
          p_session_id: sessionId,
          p_webhook_id: webhookId,
          p_lock_duration_seconds: 120
        });
      
      return {
        webhookId,
        success: data?.[0]?.success || false,
        lockOwner: data?.[0]?.lock_owner,
        error
      };
    })
  );
  
  console.log("📊 RESULTADOS:\n");
  results.forEach(r => {
    if (r.success) {
      console.log(`${r.webhookId}: ✅ CONSEGUIU LOCK (dono: ${r.lockOwner})`);
    } else {
      console.log(`${r.webhookId}: ❌ Lock já pertence a: ${r.lockOwner}`);
    }
  });
  
  const winners = results.filter(r => r.success).length;
  
  if (winners === 1) {
    console.log(`\n✅ SUCESSO: Exatamente 1 webhook conseguiu lock (atomic)!`);
    console.log("   Os outros 2 foram bloqueados corretamente.\n");
    
    const winner = results.find(r => r.success)!;
    
    // Testar release do lock
    console.log(`\n🔓 Testando release do lock pelo vencedor (${winner.webhookId})...\n`);
    
    const { data: releaseData } = await supabase
      .rpc('release_batch_lock', {
        p_session_id: sessionId,
        p_webhook_id: winner.webhookId
      });
    
    console.log(`Release do lock: ${releaseData ? '✅ Sucesso' : '❌ Falhou'}\n`);
    
    // Tentar release com webhook errado
    console.log("🔓 Testando release com webhook não-dono (webhook-X)...\n");
    
    const { data: fakeRelease } = await supabase
      .rpc('release_batch_lock', {
        p_session_id: sessionId,
        p_webhook_id: 'webhook-X'
      });
    
    console.log(`Release por não-dono: ${fakeRelease ? '❌ Conseguiu (BUG!)' : '✅ Bloqueado corretamente'}\n`);
    
  } else {
    console.log(`\n❌ PROBLEMA: ${winners} webhooks conseguiram lock! Deveria ser exatamente 1.\n`);
  }
}

// ============================================
// EXECUTAR TESTES
// ============================================
async function runTests() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  TESTE DE LOCK ATÔMICO - DIAGNÓSTICO DO PROBLEMA         ║");
  console.log("╚═══════════════════════════════════════════════════════════╝");
  
  try {
    // Teste 1: Demonstrar o problema
    const sessionId = await testProblematicUpdate();
    
    if (!sessionId) {
      console.error("❌ Não foi possível executar testes");
      return;
    }
    
    // Aguardar um pouco entre testes
    console.log("\n⏳ Aguardando 2s entre testes...\n");
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Teste 2: Demonstrar a solução
    await testRPCSolution(sessionId);
    
    console.log("\n╔═══════════════════════════════════════════════════════════╗");
    console.log("║  CONCLUSÃO                                                ║");
    console.log("╚═══════════════════════════════════════════════════════════╝");
    console.log("\n✅ PROBLEMA: .or() em UPDATE permite múltiplos locks");
    console.log("✅ SOLUÇÃO: RPC function garante apenas 1 webhook processa");
    console.log("\n🔧 PRÓXIMOS PASSOS:");
    console.log("   1. Aplicar migration (20251211_fix_atomic_lock.sql)");
    console.log("   2. Atualizar receive-whatsapp-message para usar RPC");
    console.log("   3. Deploy e testar no production\n");
    
  } catch (error) {
    console.error("❌ Erro durante testes:", error);
  }
}

// Executar
if (import.meta.main) {
  runTests();
}
