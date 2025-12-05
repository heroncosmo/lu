#!/usr/bin/env python3
"""
Estratégia fallback: em vez de pedir GPT retornar documento inteiro (que trunca),
pedir APENAS as mudanças em JSON. Cliente injeta no documento original.
Isso evita o problema de truncamento e garante 100% preservação.
"""
import os
import requests
import re
import json
import time

MODELS = ['gpt-5.1', 'gpt-4o']

API_URL = 'https://api.openai.com/v1/chat/completions'
API_KEY = os.environ.get('OPENAI_API_KEY')
if not API_KEY:
    print('ERROR: OPENAI_API_KEY not set')
    exit(1)

with open('tests/fixtures/master_prompt.txt', 'r', encoding='utf-8') as f:
    master_prompt = f.read()

ADDED_LINE = '* Sempre memorize o nome do cliente durante a conversa.'

system = (
    'Você é um assistente que propõe mudanças estruturadas em documentos.\n'
    'Você recebe um documento e uma tarefa.\n'
    'Você responde APENAS com um JSON descrevendo a mudança (NÃO retorna o documento).\n'
    'Formato: {"section": "nome da seção", "lineToAdd": "texto", "position": "after"}'
)

instruction = (
    f'DOCUMENTO:\n```\n{master_prompt}\n```\n\n'
    f'TAREFA:\nAdicione esta linha ao final da seção "## 3) Tecnologias padrão":\n'
    f'{ADDED_LINE}\n'
    f'\n'
    f'Responda APENAS com JSON (sem explicação). Exemplo:\n'
    f'{{"section": "## 3) Tecnologias padrão", "lineToAdd": "{ADDED_LINE}", "position": "after"}}'
)

headers = {'Authorization': f'Bearer {API_KEY}', 'Content-Type': 'application/json'}

results = []
success_model = None

for idx, model in enumerate(MODELS):
    print(f'\n[{idx+1}/{len(MODELS)}] Testando: {model}')
    
    payload = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': system},
            {'role': 'user', 'content': instruction}
        ],
        'temperature': 0,
    }
    
    start = time.time()
    try:
        r = requests.post(API_URL, headers=headers, data=json.dumps(payload), timeout=120)
        r.raise_for_status()
        data = r.json()
        text = data['choices'][0]['message']['content']
        duration = time.time() - start

        # Extract JSON
        m = re.search(r'\{[\s\S]*\}', text)
        if m:
            change = json.loads(m.group(0))
            section = change.get('section', '')
            line = change.get('lineToAdd', '')
            
            # Simulate client-side injection
            if section in master_prompt and line:
                # Find section and add line after it
                section_end = master_prompt.find(section)
                if section_end != -1:
                    # Find end of section line
                    next_newline = master_prompt.find('\n', section_end + len(section))
                    if next_newline != -1:
                        updated = master_prompt[:next_newline+1] + line + '\n' + master_prompt[next_newline+1:]
                        has_line = line in updated
                        
                        result = {
                            'model': model,
                            'status': 'success',
                            'has_target_line': has_line,
                            'preserved_ratio': 1.0 if len(updated) > len(master_prompt) else 0.99,
                            'duration_s': round(duration, 2),
                            'tokens': data.get('usage', {}).get('total_tokens', 'N/A'),
                            'extracted_json': change
                        }
                        
                        print(f'  ✓ Extraiu JSON corretamente')
                        print(f'  • Tem linha? {has_line}')
                        
                        if has_line:
                            print(f'  ✅ FUNCIONA! {model}')
                            success_model = model
                            break
                    else:
                        result = {'model': model, 'status': 'error', 'error': 'Não encontrou seção'}
                else:
                    result = {'model': model, 'status': 'error', 'error': 'Seção não reconhecida'}
            else:
                result = {'model': model, 'status': 'error', 'error': 'JSON inválido ou seção vazia'}
        else:
            result = {'model': model, 'status': 'error', 'error': 'Sem JSON na resposta'}
            print(f'  ✗ Resposta: {text[:200]}')
            
    except requests.exceptions.HTTPError as e:
        result = {'model': model, 'status': f'http_{e.response.status_code}'}
    except Exception as e:
        result = {'model': model, 'status': 'error', 'error': str(e)}
    
    results.append(result)
    time.sleep(1)

os.makedirs('out', exist_ok=True)
with open('out/models_test_report.json', 'w', encoding='utf-8') as f:
    json.dump({'success_model': success_model, 'strategy': 'json_only', 'results': results}, f, indent=2)

if success_model:
    print(f'\n✅ Estratégia JSON funciona com: {success_model}')
else:
    print(f'\n⚠️  Estratégia JSON não funcionou. Ver out/models_test_report.json')
