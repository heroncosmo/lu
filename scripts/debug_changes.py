#!/usr/bin/env python3
import os
import requests
import re
import json
from difflib import SequenceMatcher

API_URL = 'https://api.openai.com/v1/chat/completions'
API_KEY = os.environ.get('OPENAI_API_KEY')

with open('tests/fixtures/master_prompt.txt', 'r', encoding='utf-8') as f:
    master_prompt = f.read()

ADDED_LINE = '* Sempre memorize o nome do cliente durante a conversa.'

system = (
    'Você é um editor simples de texto que faz edições cirúrgicas em documentos.\n'
    'Preservar: 100% da estrutura, espaçamento, quebras de linha.\n'
    'Fazer: APENAS a mudança pedida.\n'
    'Retornar: documento inteiro em ```prompt-completo```'
)

instruction = (
    f'DOCUMENTO:\n```prompt-completo\n{master_prompt}\n```\n\n'
    f'TAREFA: Adicione ao final da seção "## 3) Tecnologias padrão" a linha:\n{ADDED_LINE}\n'
    f'Responda com o documento inteiro em ```prompt-completo```'
)

headers = {'Authorization': f'Bearer {API_KEY}', 'Content-Type': 'application/json'}

payload = {
    'model': 'gpt-5.1',
    'messages': [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': instruction}
    ],
    'temperature': 0,
}

r = requests.post(API_URL, headers=headers, data=json.dumps(payload), timeout=120)
data = r.json()
text = data['choices'][0]['message']['content']

# Save response to file for inspection
with open('out/debug_response.txt', 'w', encoding='utf-8') as f:
    f.write("=== RESPOSTA COMPLETA ===\n")
    f.write(text)
    f.write("\n\n=== FIM RESPOSTA ===\n")

m = re.search(r'```prompt-completo\s*([\s\S]*?)\s*```', text, re.IGNORECASE)
updated = m.group(1).strip() if m else ''

print(f"Resposta salva em out/debug_response.txt")
print(f"Tamanho total: {len(text)} chars")
if m:
    print(f"Bloco extraído: {len(m.group(0))} chars")
    print(f"Conteúdo extraído: {len(updated)} chars")
else:
    print("Não encontrou bloco ```prompt-completo```")

# Find first 500 chars of each
print("ORIGINAL (primeiros 500 chars):")
print(repr(master_prompt[:500]))
print("\nATUALIZADO (primeiros 500 chars):")
print(repr(updated[:500]))

# Find where they start to differ
for i, (c1, c2) in enumerate(zip(master_prompt, updated)):
    if c1 != c2:
        print(f"\nPrimeira diferença em índice {i}:")
        print(f"  Original: {repr(master_prompt[max(0,i-50):i+50])}")
        print(f"  Atualizado: {repr(updated[max(0,i-50):i+50])}")
        break

# Count line count differences
orig_lines = master_prompt.count('\n')
updated_lines = updated.count('\n')
print(f"\nLinhas original: {orig_lines}")
print(f"Linhas atualizado: {updated_lines}")
print(f"Chars original: {len(master_prompt)}")
print(f"Chars atualizado: {len(updated)}")
