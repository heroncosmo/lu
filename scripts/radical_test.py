#!/usr/bin/env python3
"""
NOVO TESTE RADICAL: Forçar GPT retornar APENAS JSON com response_format='json_schema'
Isso garante que o modelo retorna apenas JSON válido, não pode cortar.
"""
import os
import requests
import json
import time

API_KEY = os.environ.get('OPENAI_API_KEY')
if not API_KEY:
    print('ERROR: OPENAI_API_KEY not set')
    exit(1)

with open('tests/fixtures/master_prompt.txt', 'r', encoding='utf-8') as f:
    master_prompt = f.read()

ADDED_LINE = '* Sempre memorize o nome do cliente durante a conversa.'

# Schema OBRIGATÓRIO para garantir JSON válido
json_schema = {
    "type": "object",
    "properties": {
        "section": {"type": "string", "description": "Nome da seção onde adicionar"},
        "lineToAdd": {"type": "string", "description": "Texto exato a adicionar"},
        "position": {"type": "string", "enum": ["after", "before", "replace"]},
        "explanation": {"type": "string", "description": "Breve explicação da mudança"}
    },
    "required": ["section", "lineToAdd", "position"],
    "additionalProperties": False
}

system = (
    'Você é um assistente que retorna APENAS JSON estruturado. '
    'Não adicione nada além do JSON. '
    'Retorne as mudanças para um documento em JSON puro.'
)

instruction = (
    f'DOCUMENTO:\n{master_prompt}\n\n'
    f'TAREFA: Adicione esta linha ao final da seção "## 3) Tecnologias padrão":\n{ADDED_LINE}\n'
    f'Retorne APENAS JSON (sem texto antes/depois). Nenhuma explicação adicional.'
)

headers = {
    'Authorization': f'Bearer {API_KEY}',
    'Content-Type': 'application/json'
}

print('=== TESTE RADICAL: response_format JSON Schema ===\n')

# Teste 1: COM response_format='json_schema'
print('[1] Testando com response_format="json_schema" (JSON obrigatório):')

payload = {
    'model': 'gpt-5.1',
    'messages': [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': instruction}
    ],
    'temperature': 0,
    'response_format': {
        'type': 'json_schema',
        'json_schema': {
            'name': 'PromptEditChange',
            'schema': json_schema
        }
    }
}

start = time.time()
try:
    r = requests.post('https://api.openai.com/v1/chat/completions', 
                     headers=headers, 
                     data=json.dumps(payload), 
                     timeout=120)
    r.raise_for_status()
    data = r.json()
    duration = time.time() - start
    
    text = data['choices'][0]['message']['content']
    print(f'✓ Resposta em {duration:.1f}s')
    print(f'  Tamanho: {len(text)} chars')
    print(f'  Tokens: {data["usage"]["total_tokens"]}')
    
    # Parse JSON
    try:
        change = json.loads(text)
        print(f'✓ JSON parseado corretamente')
        print(f'  Section: {change.get("section", "?")}')
        print(f'  LineToAdd: {change.get("lineToAdd", "?")[:50]}...')
        print(f'  Position: {change.get("position", "?")}')
        
        if ADDED_LINE in change.get('lineToAdd', ''):
            print(f'✅ Contém a linha-alvo!')
        else:
            print(f'⚠️ Linha-alvo NOT FOUND')
            
    except json.JSONDecodeError as e:
        print(f'✗ Erro ao parsear JSON: {e}')
        print(f'  Resposta: {text[:300]}')
        
except Exception as e:
    print(f'✗ Erro: {e}')

# Teste 2: SEM response_format (controle)
print('\n[2] Testando SEM response_format (controle - modo tradicional):')

payload2 = {
    'model': 'gpt-5.1',
    'messages': [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': instruction}
    ],
    'temperature': 0,
}

start = time.time()
try:
    r = requests.post('https://api.openai.com/v1/chat/completions', 
                     headers=headers, 
                     data=json.dumps(payload2), 
                     timeout=120)
    r.raise_for_status()
    data = r.json()
    duration = time.time() - start
    
    text = data['choices'][0]['message']['content']
    print(f'✓ Resposta em {duration:.1f}s')
    print(f'  Tamanho: {len(text)} chars')
    print(f'  Tokens: {data["usage"]["total_tokens"]}')
    
    # Tentar extrair JSON
    import re
    m = re.search(r'\{[\s\S]*\}', text)
    if m:
        try:
            change = json.loads(m.group(0))
            print(f'✓ JSON extraído')
            print(f'  Section: {change.get("section", "?")}')
            if ADDED_LINE in change.get('lineToAdd', ''):
                print(f'✅ Contém a linha-alvo!')
        except:
            print(f'✗ Falha ao parsear JSON extraído')
    else:
        print(f'✗ Nenhum JSON encontrado')
        print(f'  Resposta: {text[:300]}')
        
except Exception as e:
    print(f'✗ Erro: {e}')

# Teste 3: gpt-4o (para comparar)
print('\n[3] Testando gpt-4o com response_format JSON Schema (para comparar):')

payload3 = {
    'model': 'gpt-4o',
    'messages': [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': instruction}
    ],
    'temperature': 0,
    'response_format': {
        'type': 'json_schema',
        'json_schema': {
            'name': 'PromptEditChange',
            'schema': json_schema
        }
    }
}

start = time.time()
try:
    r = requests.post('https://api.openai.com/v1/chat/completions', 
                     headers=headers, 
                     data=json.dumps(payload3), 
                     timeout=120)
    r.raise_for_status()
    data = r.json()
    duration = time.time() - start
    
    text = data['choices'][0]['message']['content']
    print(f'✓ Resposta em {duration:.1f}s')
    print(f'  Tamanho: {len(text)} chars')
    
    try:
        change = json.loads(text)
        if ADDED_LINE in change.get('lineToAdd', ''):
            print(f'✅ gpt-4o também funciona!')
    except:
        print(f'✗ Erro ao parsear JSON')
        
except Exception as e:
    print(f'✗ Erro: {e}')

print('\n=== CONCLUSÕES ===')
print('Se [1] funciona: Use response_format="json_schema" para garantir JSON válido')
print('Se [2] falha: O modelo não respeita instruções de retornar APENAS JSON')
print('Se [3] funciona: Pode ser alternativa ao gpt-5.1')
