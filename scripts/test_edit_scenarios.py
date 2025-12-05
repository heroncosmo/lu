#!/usr/bin/env python3
"""
Teste de cenários de edição de prompt via GPT
Valida que o GPT escolhe corretamente entre:
- ADICIONAR nova linha
- ATUALIZAR linha existente
- REMOVER conteúdo
"""

import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("OPENAI_API_KEY")
MODEL = "gpt-4o"  # Usar 4o para testes (mais rápido)

# Prompt master de exemplo (simplificado)
MASTER_PROMPT = """# Agente de Atendimento

## 1) Identidade
Você é um assistente de vendas chamado Lucas.

## 2) Comportamento
* Seja sempre educado e profissional
* Responda em português brasileiro
* Use emojis moderadamente

## 3) Tecnologias
* WhatsApp Business API
* Integração com CRM

## 4) Regras de Negócio
* Horário de atendimento: 8h às 18h
* Não fornecer dados sensíveis
"""

# Cenários de teste
TEST_SCENARIOS = [
    {
        "name": "ADICIONAR nova linha",
        "instruction": "Adicione uma regra para sempre perguntar o nome do cliente",
        "expected_action": "add",
        "expected_section": "Comportamento"
    },
    {
        "name": "ATUALIZAR linha existente", 
        "instruction": "Mude o nome do assistente de Lucas para Pedro",
        "expected_action": "update",
        "expected_section": "Identidade"
    },
    {
        "name": "ADICIONAR tecnologia",
        "instruction": "Adicione suporte a Telegram na lista de tecnologias",
        "expected_action": "add",
        "expected_section": "Tecnologias"
    },
    {
        "name": "ATUALIZAR horário",
        "instruction": "Altere o horário de atendimento para 9h às 20h",
        "expected_action": "update",
        "expected_section": "Regras de Negócio"
    },
    {
        "name": "ADICIONAR regra nova seção",
        "instruction": "Adicione uma seção de Proibições com: nunca falar de concorrentes",
        "expected_action": "add",
        "expected_section": "nova seção"
    }
]

def call_gpt_for_edit(instruction: str) -> dict:
    """Chama GPT para analisar e retornar mudança em JSON"""
    
    system_prompt = """Você é um editor de prompts de IA. Analise a instrução do usuário e retorne APENAS um JSON indicando a mudança necessária.

IMPORTANTE: Você deve ANALISAR o que precisa ser feito:
- Se é ADICIONAR algo novo → position: "after"
- Se é MODIFICAR algo existente → position: "replace"
- Se é REMOVER algo → position: "replace" com lineToAdd vazio

Retorne APENAS JSON no formato:
{
  "section": "nome da seção onde fazer a mudança",
  "lineToAdd": "texto exato a adicionar ou novo texto para substituição",
  "position": "after" | "before" | "replace",
  "explanation": "breve explicação do que foi feito"
}"""

    user_message = f"""PROMPT ATUAL:
{MASTER_PROMPT}

INSTRUÇÃO DO USUÁRIO:
{instruction}

Analise e retorne o JSON com a mudança necessária."""

    response = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        },
        json={
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "PromptEditChange",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "section": {"type": "string"},
                            "lineToAdd": {"type": "string"},
                            "position": {"type": "string", "enum": ["after", "before", "replace"]},
                            "explanation": {"type": "string"}
                        },
                        "required": ["section", "lineToAdd", "position", "explanation"],
                        "additionalProperties": False
                    }
                }
            },
            "temperature": 0.3
        },
        timeout=30.0
    )
    
    data = response.json()
    content = data["choices"][0]["message"]["content"]
    return json.loads(content)


def apply_change(original: str, change: dict) -> str:
    """Aplica a mudança no documento original"""
    section = change["section"]
    line_to_add = change["lineToAdd"]
    position = change["position"]
    
    lines = original.split("\n")
    result = []
    section_found = False
    
    for i, line in enumerate(lines):
        # Encontrar seção
        if section.lower() in line.lower():
            section_found = True
            
            if position == "before":
                result.append(line_to_add)
                result.append(line)
            elif position == "replace":
                result.append(line_to_add if line_to_add else "")
            else:  # after
                result.append(line)
                # Adicionar após o conteúdo da seção (próxima linha não-vazia)
                continue
        elif section_found and position == "after":
            # Adicionar após primeira linha de conteúdo
            if line.strip() and not line.startswith("#"):
                result.append(line)
                result.append(line_to_add)
                section_found = False
                continue
            result.append(line)
        else:
            result.append(line)
    
    # Se seção não encontrada, adicionar no final
    if not section_found and position == "after":
        result.append("")
        result.append(f"## {section}")
        result.append(line_to_add)
    
    return "\n".join(result)


def run_tests():
    """Executa todos os cenários de teste"""
    print("=" * 70)
    print("🧪 TESTE DE CENÁRIOS DE EDIÇÃO GPT")
    print("=" * 70)
    print(f"Modelo: {MODEL}")
    print(f"Cenários: {len(TEST_SCENARIOS)}")
    print()
    
    results = []
    
    for i, scenario in enumerate(TEST_SCENARIOS, 1):
        print(f"\n{'='*60}")
        print(f"[{i}/{len(TEST_SCENARIOS)}] {scenario['name']}")
        print(f"{'='*60}")
        print(f"📝 Instrução: {scenario['instruction']}")
        print()
        
        try:
            # Chamar GPT
            change = call_gpt_for_edit(scenario["instruction"])
            
            print(f"📋 Resposta GPT:")
            print(f"   section: {change['section']}")
            print(f"   position: {change['position']}")
            print(f"   lineToAdd: {change['lineToAdd'][:60]}..." if len(change['lineToAdd']) > 60 else f"   lineToAdd: {change['lineToAdd']}")
            print(f"   explanation: {change['explanation']}")
            
            # Verificar se ação está correta
            expected = scenario["expected_action"]
            actual = "update" if change["position"] == "replace" else "add"
            
            action_correct = (expected == actual)
            section_correct = scenario["expected_section"].lower() in change["section"].lower()
            
            print()
            if action_correct:
                print(f"   ✅ Ação correta: {actual} (esperado: {expected})")
            else:
                print(f"   ⚠️ Ação diferente: {actual} (esperado: {expected})")
            
            if section_correct:
                print(f"   ✅ Seção correta: {change['section']}")
            else:
                print(f"   ⚠️ Seção diferente: {change['section']} (esperado: {scenario['expected_section']})")
            
            # Aplicar mudança
            updated = apply_change(MASTER_PROMPT, change)
            
            # Mostrar diff resumido
            original_lines = len(MASTER_PROMPT.split("\n"))
            updated_lines = len(updated.split("\n"))
            
            print()
            print(f"   📊 Original: {original_lines} linhas → Atualizado: {updated_lines} linhas")
            
            results.append({
                "scenario": scenario["name"],
                "success": action_correct and section_correct,
                "change": change
            })
            
        except Exception as e:
            print(f"   ❌ ERRO: {e}")
            results.append({
                "scenario": scenario["name"],
                "success": False,
                "error": str(e)
            })
    
    # Resumo final
    print("\n" + "=" * 70)
    print("📊 RESUMO DOS TESTES")
    print("=" * 70)
    
    success_count = sum(1 for r in results if r["success"])
    print(f"✅ Sucesso: {success_count}/{len(results)}")
    
    for r in results:
        status = "✅" if r["success"] else "❌"
        print(f"   {status} {r['scenario']}")
    
    print()
    print("🎯 CONCLUSÃO:")
    if success_count == len(results):
        print("   GPT analisa corretamente ADICIONAR vs ATUALIZAR!")
    elif success_count >= len(results) * 0.8:
        print("   GPT funciona bem na maioria dos casos")
    else:
        print("   Ajustes podem ser necessários no prompt do sistema")


if __name__ == "__main__":
    if not API_KEY:
        print("❌ OPENAI_API_KEY não encontrada no .env")
        exit(1)
    
    run_tests()
