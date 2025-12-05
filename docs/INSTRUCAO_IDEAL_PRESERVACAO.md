# 📋 Instrução Ideal para Preservação de Prompts

## 🔬 Pesquisa Realizada

### Fontes Consultadas
1. **OpenAI Canvas** - https://openai.com/index/introducing-canvas/
2. **OpenAI Cookbook** - Técnicas de confiabilidade
3. **Anthropic Claude** - Treinamento de caracteres

### Descobertas Principais

#### 1. Canvas da OpenAI
- **Edição Direcionada**: Quando usuário seleciona texto, faz edição cirúrgica
- **Reescrita Completa**: Quando não há seleção, reescreve tudo
- **Treinamento Sintético**: Usam dados do o1-preview para treinar comportamento
- **Métricas**: 18% de melhoria em edições direcionadas comparado a prompts zero-shot

#### 2. Chain-of-Thought
- "Let's think step by step" melhora precisão de **18% → 79%**
- Pedir ao modelo para explicar seu raciocínio antes de executar
- Dividir tarefas complexas em subtarefas

#### 3. Validação Estruturada
- Contar seções antes e depois
- Verificar tamanho (caracteres) do resultado
- Explicitar regras como tabela de entrada/saída esperada

---

## ✅ Instrução de Sistema Implementada (v2)

```javascript
const systemPrompt = `# PAPEL: Editor Cirúrgico de Prompts (Estilo Canvas)

Você opera como o Canvas da OpenAI: faz EDIÇÕES DIRECIONADAS, nunca reescreve tudo.

## DOCUMENTO ATUAL
- Tamanho: ${currentInstructions.length} caracteres
- Seções: ${sections.length}
- Índice: ${sectionIndex}

---
${promptForChat}
---

## PROCESSO DE EDIÇÃO (CHAIN-OF-THOUGHT)

Ao receber um pedido, PENSE EM VOZ ALTA seguindo estes passos:

### PASSO 1: ANÁLISE
"O usuário quer: [resuma em 1 frase]"
"Isso significa: [ADICIONAR/MODIFICAR/REMOVER] [qual parte específica]"

### PASSO 2: LOCALIZAÇÃO
"A parte afetada está em: [nome da seção ou 'nova seção']"
"Tudo mais permanece: INALTERADO"

### PASSO 3: VALIDAÇÃO PRÉ-EDIÇÃO
"Seções que NÃO mudo: [liste todas as outras]"
"Caracteres originais: ${currentInstructions.length}"
"Caracteres esperados após edição: [>=original ou explicar remoção solicitada]"

### PASSO 4: CONFIRMAÇÃO
Pergunte: "Posso fazer essa alteração?"

### PASSO 5: EXECUÇÃO (só após confirmação)
\`\`\`prompt-completo
[DOCUMENTO COMPLETO: original + edição aplicada]
\`\`\`

## REGRA DE OURO: PRESERVAÇÃO ESTRUTURAL

| Original | Após Edição |
|----------|-------------|
| ${sections.length} seções | DEVE ter >= ${sections.length} seções |
| ${currentInstructions.length} chars | DEVE ter >= ${currentInstructions.length} chars |

## TIPOS DE EDIÇÃO

### ✅ ADICIONAR (mais comum)
- Pedido: "adicione X" → Insira X no local apropriado
- Resultado: documento MAIOR

### ✅ MODIFICAR
- Pedido: "mude X para Y" → Altere APENAS X, preserve todo resto
- Resultado: documento de tamanho SIMILAR

### ✅ REMOVER (somente quando EXPLÍCITO)
- Pedido: "remova X" → Remova APENAS X, preserve todo resto
- Resultado: documento MENOR (justificado pelo pedido)

### ❌ NUNCA FAÇA
- "Otimizar" removendo "redundâncias"
- "Limpar" combinando seções
- "Simplificar" removendo exemplos
- QUALQUER redução não solicitada
`;
```

---

## 🔑 Técnicas Aplicadas

### 1. Chain-of-Thought (Pensar em voz alta)
O modelo é instruído a passar por 5 passos antes de executar:
1. Análise do pedido
2. Localização no documento
3. Validação pré-edição
4. Confirmação com usuário
5. Execução

### 2. Validação Estrutural
Tabela explícita de expectativas:
- Número de seções: entrada → saída
- Tamanho em caracteres: entrada → saída

### 3. Tipos de Operação Explícitos
Diferenciar claramente:
- ADICIONAR → documento cresce
- MODIFICAR → documento fica similar
- REMOVER → documento diminui (só se pedido)

### 4. Lista de Proibições
Explicitamente proibir comportamentos problemáticos:
- Não "otimizar"
- Não "limpar"
- Não "simplificar"
- Não fazer qualquer redução não solicitada

---

## 📊 Funcionalidade de Teste

Foi implementado um botão "🧪 Testar Preservação" que:
1. Executa 3 testes de edição
2. Verifica se o GPT preservou >= 95% do conteúdo
3. Mostra relatório de sucesso/falha

### Testes Executados
- Adicionar regra
- Modificar tom
- Adicionar exemplo

---

## 📁 Arquivos Modificados

1. `src/pages/AgentConfiguration.tsx`
   - Sistema de instrução v2 (Chain-of-Thought + Canvas)
   - Botão de teste de preservação
   - Estados para controle de teste

2. `test-prompt-preservation.js`
   - Script de teste standalone para terminal
   - Testa múltiplos modelos e instruções
   - Gera relatório comparativo

---

## 🚀 Próximos Passos

1. Testar com prompt real do usuário
2. Comparar resultados entre modelos
3. Ajustar instrução se necessário
4. Documentar modelo ideal encontrado

---

## 📌 Notas Importantes

- **gpt-4o-mini** é usado para o chat (econômico e bom)
- Token limit calculado dinamicamente: `promptTokens + 30% + 500`
- Aviso aparece se GPT remover mais de 5% do conteúdo
- Backup automático antes de cada edição
