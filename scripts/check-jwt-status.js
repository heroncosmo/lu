#!/usr/bin/env node
const pat = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;

if (!pat) {
  console.error("❌ SUPABASE_PAT não configurado");
  process.exit(1);
}

fetch('https://api.supabase.com/v1/projects/jufguvfzieysywthbafu/functions/receive-whatsapp-message', {
  headers: { 'Authorization': `Bearer ${pat}` }
})
  .then(r => r.json())
  .then(data => {
    console.log('\n📌 Status atual da função:\n');
    console.log('  Slug:', data.slug);
    console.log('  Version:', data.version);
    console.log('  Status:', data.status);
    console.log('  Verify JWT:', data.verify_jwt);
    console.log('');
    if (data.verify_jwt === false) {
      console.log('✅ JWT verification está DESABILITADO!');
      console.log('\n🎉 Agora a função aceita webhooks SEM Authorization header');
    } else {
      console.log('⚠️ JWT verification ainda está ATIVO (verify_jwt: true)');
      console.log('\nTentando desabilitar novamente...');
    }
  })
  .catch(e => console.error('❌ Erro:', e.message));
