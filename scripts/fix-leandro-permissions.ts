/**
 * Script para verificar e corrigir permissões do usuário Leandro
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jufguvfzieysywthbafu.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w'
);

async function checkAndFixPermissions() {
  console.log('🔍 Verificando permissões dos usuários\n');
  
  // 1. Buscar todos os user_profiles
  const { data: profiles } = await supabase.from('user_profiles').select('*');
  
  console.log('Usuários cadastrados:');
  for (const profile of profiles || []) {
    console.log(`\n📋 ${profile.email}`);
    console.log(`   Papel: ${profile.role}`);
    console.log(`   Ativo: ${profile.is_active}`);
    console.log(`   Permissões: ${profile.permissions ? 'Custom' : 'Default'}`);
  }
  
  // 2. Atualizar Leandro para admin com permissões completas
  console.log('\n\n🔧 Corrigindo permissões...\n');
  
  const { error } = await supabase
    .from('user_profiles')
    .update({
      role: 'admin',
      permissions: {
        dashboard: true,
        crm_contacts: true,
        contact_lists: true,
        crm_chat: true,
        campaigns: true,
        kanban: true,
        whatsapp: true,
        playground: true,
        create_prospecting: true,
        agents: true,
        webhooks: true,
        redsis: true,
        email_smtp: true,
        sms_twilio: true,
        inventory: true,
        reports: true,
        user_management: true
      }
    })
    .eq('email', 'leandro@luchoacorp.com');
  
  if (error) {
    console.error('❌ Erro:', error.message);
  } else {
    console.log('✅ leandro@luchoacorp.com agora é admin com permissões completas!');
  }
  
  // 3. Verificar novamente
  const { data: updated } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('email', 'leandro@luchoacorp.com')
    .single();
  
  console.log('\n📊 Perfil atualizado:');
  console.log(`   Email: ${updated?.email}`);
  console.log(`   Papel: ${updated?.role}`);
  console.log(`   Permissões: ${JSON.stringify(updated?.permissions, null, 2)}`);
}

checkAndFixPermissions();
