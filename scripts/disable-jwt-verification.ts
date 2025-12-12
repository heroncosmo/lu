/**
 * Desabilitar JWT verification na função receive-whatsapp-message
 * 
 * Uso:
 *   pnpm tsx scripts/disable-jwt-verification.ts
 * 
 * Requer variável de ambiente:
 *   SUPABASE_PAT (Personal Access Token gerado em https://supabase.com/dashboard/account/tokens)
 *   OU use com o service role key diretamente
 */

const PROJECT_REF = "jufguvfzieysywthbafu";
const FUNCTION_SLUG = "receive-whatsapp-message";
const SUPABASE_API_BASE = "https://api.supabase.com";

async function disableJwtVerification() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║      Desabilitar JWT Verification - receive-whatsapp-message   ║
╚════════════════════════════════════════════════════════════════╝
`);

  // Tentar obter PAT de variáveis de ambiente
  const pat = process.env.SUPABASE_PAT || process.env.SUPABASE_ACCESS_TOKEN;

  if (!pat) {
    console.error(`
❌ ERRO: Personal Access Token (PAT) não encontrado!

Para gerar um PAT:
1. Acesse: https://supabase.com/dashboard/account/tokens
2. Clique em "Generate new token"
3. Copie o token
4. Execute: set SUPABASE_PAT=seu_token_aqui (Windows)
   ou: export SUPABASE_PAT=seu_token_aqui (Linux/Mac)
5. Depois execute: pnpm tsx scripts/disable-jwt-verification.ts

Alternativa (mais rápido):
Acesse o Dashboard Supabase:
https://supabase.com/dashboard/project/${PROJECT_REF}/functions
- Clique na função "receive-whatsapp-message"
- Vá em Settings
- Desabilite "Enforce JWT verification"
- Salve
`);
    process.exit(1);
  }

  try {
    console.log(`📍 Project: ${PROJECT_REF}`);
    console.log(`📍 Function: ${FUNCTION_SLUG}`);
    console.log(`📍 Using Management API: ${SUPABASE_API_BASE}\n`);

    // Chamar Management API para atualizar a função
    console.log(`🔄 Enviando requisição PATCH para desabilitar JWT verification...`);

    const response = await fetch(
      `${SUPABASE_API_BASE}/v1/projects/${PROJECT_REF}/functions/${FUNCTION_SLUG}?verify_jwt=false`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${pat}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}), // Corpo vazio para apenas alterar o parâmetro de query
      }
    );

    const responseText = await response.text();

    if (response.ok) {
      console.log(`
✅ SUCESSO! JWT verification foi desabilizado.

📝 Detalhes da Resposta:
${responseText ? JSON.stringify(JSON.parse(responseText), null, 2) : "(sem corpo)"}

🎉 A função receive-whatsapp-message agora aceita requisições SEM Authorization header!

Próximos passos:
1. Teste o webhook com: pnpm tsx scripts/test-batching-v5-live.ts
2. Monitore os logs: https://supabase.com/dashboard/project/${PROJECT_REF}/functions
`);
      process.exit(0);
    } else {
      console.error(`
❌ ERRO na requisição (Status: ${response.status})

Resposta:
${responseText}

Possíveis causas:
- Token PAT inválido ou expirado
- Permissões insuficientes
- Função não encontrada

Tente novamente com um novo token ou use o Dashboard manualmente.
`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`
❌ ERRO ao executar:
${error.message}

Stack:
${error.stack}
`);
    process.exit(1);
  }
}

// Executar
disableJwtVerification();
