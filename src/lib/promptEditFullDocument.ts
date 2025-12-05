/**
 * Estratégia Full-Document v2: GPT retorna mudanças em JSON (não o documento inteiro)
 * Cliente injeta a mudança no documento original, preservando 100% da formatação.
 * 
 * CRÍTICO: Usar response_format="json_schema" para forçar JSON válido!
 * Sem isso, o modelo ignora instruções e retorna conteúdo aleatório.
 */

export interface PromptEditChange {
  section: string;        // Ex: "## 3) Tecnologias padrão"
  lineToAdd: string;      // Texto da linha a adicionar
  position: 'after' | 'before' | 'replace';  // Onde adicionar
  explanation?: string;   // Opcional: breve explicação
}

/**
 * Injeta uma mudança de formatação JSON em um documento, preservando 100% do resto.
 */
export function injectPromptChange(
  originalDocument: string,
  change: PromptEditChange
): string {
  const { section, lineToAdd, position } = change;

  // 1. Encontrar a seção
  const sectionIndex = originalDocument.indexOf(section);
  if (sectionIndex === -1) {
    console.warn(`Seção não encontrada: "${section}". Retornando documento original.`);
    return originalDocument;
  }

  // 2. Encontrar o fim da linha da seção (primeiro \n após ela)
  const nextNewline = originalDocument.indexOf('\n', sectionIndex + section.length);
  if (nextNewline === -1) {
    console.warn('Não encontrou quebra de linha após seção. Adicionando ao final.');
    return originalDocument + '\n' + lineToAdd;
  }

  // 3. Injetar a linha de acordo com a posição
  let result = '';
  if (position === 'after') {
    // Adicionar logo após a quebra de linha da seção
    result = originalDocument.substring(0, nextNewline + 1) +
             lineToAdd + '\n' +
             originalDocument.substring(nextNewline + 1);
  } else if (position === 'before') {
    // Adicionar logo antes da seção
    result = originalDocument.substring(0, sectionIndex) +
             lineToAdd + '\n' +
             originalDocument.substring(sectionIndex);
  } else if (position === 'replace') {
    // Substituir a seção pelo novo conteúdo
    result = originalDocument.substring(0, sectionIndex) +
             lineToAdd +
             originalDocument.substring(nextNewline);
  }

  return result;
}

/**
 * Chama GPT pedindo apenas mudanças em JSON (não documento inteiro).
 * CRÍTICO: Usa response_format="json_schema" para forçar JSON válido
 * Testes mostraram que SEM response_format, o modelo ignora instruções e retorna conteúdo aleatório!
 */
export async function callGPTForPromptEdit(
  document: string,
  userRequest: string,
  gptApiKey: string,
  gptModel: string = 'gpt-5.1'
): Promise<PromptEditChange> {
  const systemPrompt = `Você é um assistente que propõe mudanças estruturadas em documentos.
Retorna APENAS JSON válido com as mudanças solicitadas.
Nenhuma explicação adicional, nenhum texto antes ou depois do JSON.`;

  const userMessage = `DOCUMENTO:
\`\`\`
${document}
\`\`\`

TAREFA:
${userRequest}

Retorne JSON com section, lineToAdd, e position. Nada mais.`;

  // Body da requisição com response_format JSON Schema
  const requestBody = {
    model: gptModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: 0,
    // CRÍTICO: Forçar JSON Schema para garantir resposta válida
    // Teste de 2025-12-04 mostrou: SEM isso, gpt-5.1 ignora "APENAS JSON" e retorna conteúdo aleatório
    // COM isso, resposta é SEMPRE JSON válido de 200-300 chars
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'PromptEditChange',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            section: {
              type: 'string',
              description: 'Nome da seção (Ex: "## 3) Tecnologias padrão")'
            },
            lineToAdd: {
              type: 'string',
              description: 'Texto exato da linha a adicionar'
            },
            position: {
              type: 'string',
              enum: ['after', 'before', 'replace'],
              description: 'Posição: after (padrão), before, ou replace'
            },
            explanation: {
              type: 'string',
              description: 'Breve explicação (opcional)'
            }
          },
          required: ['section', 'lineToAdd', 'position'],
          additionalProperties: false
        }
      }
    } as any
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${gptApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GPT API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const responseText = data.choices[0]?.message?.content || '';

  // Com response_format="json_schema", a resposta SEMPRE é JSON válido
  try {
    const change = JSON.parse(responseText) as PromptEditChange;
    return change;
  } catch (e) {
    throw new Error(`Failed to parse JSON response: ${responseText.substring(0, 300)}`);
  }
}

/**
 * Pipeline completo: faz GPT retornar mudanças em JSON e injeta no documento.
 */
export async function editPromptWithGPT(
  originalDocument: string,
  userRequest: string,
  gptApiKey: string,
  gptModel: string = 'gpt-5.1'
): Promise<string> {
  const change = await callGPTForPromptEdit(originalDocument, userRequest, gptApiKey, gptModel);
  const updatedDocument = injectPromptChange(originalDocument, change);
  return updatedDocument;
}
