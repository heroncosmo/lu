#!/usr/bin/env node
/**
 * Desabilitar JWT verification via body JSON
 */

const PROJECT_REF = "jufguvfzieysywthbafu";
const FUNCTION_SLUG = "receive-whatsapp-message";
const SUPABASE_API_BASE = "https://api.supabase.com";

async function disableJwtVerification() {
  const pat = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;

  if (!pat) {
    console.error("❌ SUPABASE_PAT não configurado");
    process.exit(1);
  }

  console.log('\n🔄 Tentando desabilitar JWT via body JSON...\n');

  try {
    const response = await fetch(
      `${SUPABASE_API_BASE}/v1/projects/${PROJECT_REF}/functions/${FUNCTION_SLUG}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${pat}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          verify_jwt: false
        }),
      }
    );

    const responseText = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', responseText);

    if (response.ok) {
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.log('Resposta não é JSON');
        return;
      }

      console.log('\n✅ Resposta recebida:');
      console.log('   verify_jwt:', data.verify_jwt);
      
      if (data.verify_jwt === false) {
        console.log('\n🎉 JWT verification foi DESABILITADO com sucesso!');
      }
    } else {
      console.error('\n❌ Erro:', response.status);
    }
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

disableJwtVerification();
