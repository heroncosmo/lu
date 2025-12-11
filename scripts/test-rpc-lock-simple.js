/**
 * TESTE LOCAL SIMPLIFICADO - VERIFICA SE RPC FUNCTION EXISTE E FUNCIONA
 * Não precisa de sessão real ou dados reais
 */

// Simular ambiente Deno para teste local
const Deno = {
  env: {
    get(key) {
      const env = {
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      };
      return env[key];
    }
  }
};

async function testRPCFunction() {
  console.log("\n╔═════════════════════════════════════════════════════════╗");
  console.log("║  TESTE: Verificar se RPC acquire_batch_lock funciona  ║");
  console.log("╚═════════════════════════════════════════════════════════╝\n");
  
  const { createClient } = await import('@supabase/supabase-js');
  
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  );
  
  // 1. Buscar uma sessão qualquer para teste
  console.log("1️⃣ Buscando uma sessão para teste...\n");
  
  const { data: sessions, error: sessionError } = await supabase
    .from('prospecting_sessions')
    .select('id')
    .limit(1);
  
  if (sessionError || !sessions || sessions.length === 0) {
    console.error("❌ Erro ao buscar sessão:", sessionError?.message || "Nenhuma sessão encontrada");
    return;
  }
  
  const sessionId = sessions[0].id;
  console.log(`✅ Sessão encontrada: ${sessionId}\n`);
  
  // 2. Limpar lock anterior (se houver)
  console.log("2️⃣ Limpando lock anterior...\n");
  
  await supabase
    .from('prospecting_sessions')
    .update({ batch_lock_id: null, batch_lock_until: null })
    .eq('id', sessionId);
  
  console.log("✅ Lock limpo\n");
  
  // 3. Simular 5 webhooks paralelos tentando adquirir lock
  console.log("3️⃣ Simulando 5 webhooks paralelos...\n");
  
  const webhookIds = Array.from({ length: 5 }, (_, i) => `webhook-${i + 1}`);
  
  const startTime = Date.now();
  
  const results = await Promise.all(
    webhookIds.map(async (webhookId) => {
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
        error: error?.message
      };
    })
  );
  
  const duration = Date.now() - startTime;
  
  // 4. Analisar resultados
  console.log("📊 RESULTADOS:\n");
  console.log(`   Tempo total: ${duration}ms\n`);
  
  let winners = 0;
  let losers = 0;
  
  results.forEach((r, i) => {
    if (r.success) {
      console.log(`   ${r.webhookId}: ✅ CONSEGUIU LOCK`);
      winners++;
    } else {
      console.log(`   ${r.webhookId}: ❌ Bloqueado (dono: ${r.lockOwner})`);
      losers++;
    }
    
    if (r.error) {
      console.log(`      Erro: ${r.error}`);
    }
  });
  
  console.log(`\n📈 RESUMO:`);
  console.log(`   ✅ Conseguiram lock: ${winners}`);
  console.log(`   ❌ Foram bloqueados: ${losers}`);
  
  // 5. Verificar se funcionou corretamente
  console.log(`\n🔍 ANÁLISE:\n`);
  
  if (winners === 1 && losers === 4) {
    console.log("   ✅ SUCESSO! Exatamente 1 webhook conseguiu lock");
    console.log("   ✅ Os outros 4 foram bloqueados atomicamente");
    console.log("   ✅ Lock atômico está funcionando perfeitamente!\n");
    
    // 6. Testar release do lock
    const winner = results.find(r => r.success);
    if (winner) {
      console.log("4️⃣ Testando release do lock...\n");
      
      const { data: releaseData } = await supabase
        .rpc('release_batch_lock', {
          p_session_id: sessionId,
          p_webhook_id: winner.webhookId
        });
      
      if (releaseData) {
        console.log(`   ✅ Lock liberado com sucesso pelo ${winner.webhookId}\n`);
        
        // 7. Tentar adquirir novamente após release
        console.log("5️⃣ Tentando adquirir lock após release...\n");
        
        const { data: reacquire } = await supabase
          .rpc('acquire_batch_lock', {
            p_session_id: sessionId,
            p_webhook_id: 'webhook-reacquire',
            p_lock_duration_seconds: 120
          });
        
        if (reacquire?.[0]?.success) {
          console.log("   ✅ Lock adquirido novamente após release\n");
        } else {
          console.log("   ❌ Não conseguiu readquirir lock\n");
        }
      } else {
        console.log("   ❌ Falha ao liberar lock\n");
      }
    }
    
  } else {
    console.log(`   ❌ PROBLEMA! Deveria ter exatamente 1 winner e 4 losers`);
    console.log(`   ❌ Resultado: ${winners} winners, ${losers} losers\n`);
    
    if (winners > 1) {
      console.log("   🐛 BUG: Múltiplos webhooks conseguiram lock simultaneamente!");
      console.log("   🐛 Isso causaria respostas duplicadas ao cliente.\n");
    }
  }
  
  // Cleanup
  console.log("6️⃣ Limpando...\n");
  await supabase
    .from('prospecting_sessions')
    .update({ batch_lock_id: null, batch_lock_until: null })
    .eq('id', sessionId);
  
  console.log("✅ Teste concluído!\n");
  
  console.log("╔═════════════════════════════════════════════════════════╗");
  console.log("║  CONCLUSÃO                                              ║");
  console.log("╚═════════════════════════════════════════════════════════╝\n");
  
  if (winners === 1 && losers === 4) {
    console.log("✅ RPC function acquire_batch_lock está funcionando!");
    console.log("✅ Atomicidade garantida - apenas 1 webhook processa");
    console.log("✅ PRONTO PARA DEPLOY\n");
    return true;
  } else {
    console.log("❌ RPC function NÃO está funcionando corretamente");
    console.log("❌ NÃO FAZER DEPLOY até resolver o problema\n");
    return false;
  }
}

// Executar teste
testRPCFunction()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("\n❌ ERRO NO TESTE:", error);
    process.exit(1);
  });
