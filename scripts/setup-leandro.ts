/**
 * Script para criar/corrigir o perfil do Leandro
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://jufguvfzieysywthbafu.supabase.co', 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1Zmd1dmZ6aWV5c3l3dGhiYWZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NDUxMzIsImV4cCI6MjA3NjAyMTEzMn0.t36uXDDEQEXdCyHObKypoqR-mMN_EUaSEW5GNeNGv7w'
);

async function setupLeandroPerm() {
  console.log('🔧 Setup do usuário Leandro\n');
  
  // 1. Login
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'leandro@luchoacorp.com',
    password: 'Ibira2019!'
  });
  
  if (authError) {
    console.error('❌ Erro de login:', authError.message);
    return;
  }
  
  const userId = authData.user.id;
  console.log(`✅ Usuário autenticado: ${userId}\n`);
  
  // 2. Buscar perfil
  const { data: profile, error: fetchError } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (fetchError && fetchError.code === 'PGRST116') {
    // Não existe, criar
    console.log('📝 Perfil não existe, criando...');
    const { data: newProfile, error: createError } = await supabase
      .from('user_profiles')
      .insert({
        user_id: userId,
        email: 'leandro@luchoacorp.com',
        full_name: 'Leandro Admin',
        role: 'admin',
        is_active: true,
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
      .select()
      .single();
    
    if (createError) {
      console.error('❌ Erro ao criar:', createError.message);
      return;
    }
    
    console.log('✅ Perfil criado com sucesso!\n');
    console.log('📊 Detalhes:');
    console.log(`   Email: ${newProfile.email}`);
    console.log(`   Papel: ${newProfile.role}`);
    console.log(`   Permissões: Todas habilitadas ✅`);
    
  } else if (!fetchError) {
    // Existe, atualizar se necessário
    console.log('📋 Perfil existe, verificando...');
    
    if (profile.role !== 'admin' || !profile.permissions?.user_management) {
      console.log('   Atualizando para admin completo...');
      
      const { error: updateError } = await supabase
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
        .eq('user_id', userId);
      
      if (updateError) {
        console.error('❌ Erro ao atualizar:', updateError.message);
        return;
      }
      
      console.log('✅ Perfil atualizado!\n');
      console.log('📊 Novo status:');
      console.log(`   Email: ${profile.email}`);
      console.log(`   Papel: admin`);
      console.log(`   Permissões: Todas habilitadas ✅`);
    } else {
      console.log('✅ Perfil já está correto!\n');
      console.log('📊 Status atual:');
      console.log(`   Email: ${profile.email}`);
      console.log(`   Papel: ${profile.role}`);
      console.log(`   Permissões: user_management=${profile.permissions?.user_management}`);
    }
  } else {
    console.error('❌ Erro ao buscar perfil:', fetchError.message);
  }
  
  console.log('\n🎉 Setup concluído! Recarregue a página para ver as alterações.');
}

setupLeandroPerm();
