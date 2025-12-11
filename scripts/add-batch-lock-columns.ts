// Script para adicionar colunas de lock para batching
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jufguvfzieysywthbafu.supabase.co';

async function addBatchLockColumns() {
  // Tentar carregar do .env.local ou usar variáveis de ambiente
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!SERVICE_ROLE_KEY) {
    console.log('=== INSTRUÇÕES MANUAIS ===');
    console.log('Execute o seguinte SQL no Supabase Dashboard:');
    console.log('URL: https://supabase.com/dashboard/project/jufguvfzieysywthbafu/sql');
    console.log('');
    console.log('--- COPIE E EXECUTE ---');
    console.log(`
ALTER TABLE prospecting_sessions 
ADD COLUMN IF NOT EXISTS batch_lock_until TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS batch_lock_id TEXT DEFAULT NULL;

-- Índice para verificação rápida de locks ativos
CREATE INDEX IF NOT EXISTS idx_sessions_batch_lock 
ON prospecting_sessions(batch_lock_until) 
WHERE batch_lock_until IS NOT NULL;
    `);
    console.log('--- FIM DO SQL ---');
    return;
  }
  
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  
  try {
    // Tentar executar via RPC exec_sql se existir
    const { error } = await supabase.rpc('exec_sql', {
      query: `
        ALTER TABLE prospecting_sessions 
        ADD COLUMN IF NOT EXISTS batch_lock_until TIMESTAMPTZ DEFAULT NULL;
        
        ALTER TABLE prospecting_sessions 
        ADD COLUMN IF NOT EXISTS batch_lock_id TEXT DEFAULT NULL;
      `
    });
    
    if (error) {
      console.error('Erro ao executar SQL:', error);
      console.log('Tente executar manualmente no dashboard do Supabase');
    } else {
      console.log('✅ Colunas adicionadas com sucesso!');
    }
  } catch (e) {
    console.error('Erro:', e);
  }
}

addBatchLockColumns();
