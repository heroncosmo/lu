# Documentação da API w-api - Instância PRO

Este documento resume os endpoints e as estruturas de dados para a versão PRO da API w-api, com base na documentação do Postman e na implementação funcional.

**URL Base para Envio de Mensagens:** `https://w-api.io/api/v1`
**URL Base para Outros Endpoints (Consulta, Gerenciamento):** `https://api.w-api.app` (Ajustar se necessário após testes)

---

## Autenticação

Todas as requisições para a API PRO devem incluir `instance_id` e `token` como parte do corpo da requisição (para `POST`) ou como parâmetros de consulta (para `GET`).

---

## 1. Endpoints de Envio de Mensagens

**Nota:** Para os endpoints de envio de mensagens, a URL base é `https://w-api.io/api/v1`.

### 1.1. Enviar Mensagem de Texto
Envia uma mensagem de texto simples para um contato ou grupo.
- **Método:** `POST`
- **Endpoint:** `/send_message` (completo: `https://w-api.io/api/v1/send_message`)
- **Corpo da Requisição (JSON):**
  ```json
  {
    "instance_id": "SEU_INSTANCE_ID",
    "token": "SEU_TOKEN",
    "chat_id": "5511999998888@c.us",
    "message": "Olá, esta é uma mensagem de teste."
  }
  ```

### 1.2. Enviar Mensagem com Botões
Envia uma mensagem de texto acompanhada de botões de resposta rápida.
- **Método:** `POST`
- **Endpoint:** `/send_button` (completo: `https://w-api.io/api/v1/send_button`)
- **Corpo da Requisição (JSON):**
  ```json
  {
    "instance_id": "SEU_INSTANCE_ID",
    "token": "SEU_TOKEN",
    "chat_id": "5511999998888@c.us",
    "message": "Escolha uma opção:",
    "footer": "Rodapé opcional",
    "buttons": [
      { "buttonId": "id1", "buttonText": "Opção 1", "type": 1 },
      { "buttonId": "id2", "buttonText": "Opção 2", "type": 1 }
    ]
  }
  ```

### 1.3. Enviar Mensagem de Lista
Envia uma mensagem que, ao ser clicada, abre uma lista de opções.
- **Método:** `POST`
- **Endpoint:** `/send_list` (completo: `https://w-api.io/api/v1/send_list`)
- **Corpo da Requisição (JSON):**
  ```json
  {
    "instance_id": "SEU_INSTANCE_ID",
    "token": "SEU_TOKEN",
    "chat_id": "5511999998888@c.us",
    "title": "Título da Lista",
    "message": "Mensagem principal",
    "footer": "Rodapé da lista",
    "buttonText": "Ver Opções",
    "sections": [
      {
        "title": "Seção 1",
        "rows": [
          { "rowId": "item1", "title": "Item 1", "description": "Descrição do Item 1" },
          { "rowId": "item2", "title": "Item 2", "description": "Descrição do Item 2" }
        ]
      }
    ]
  }
  ```

### 1.4. Enviar Mídia
Envia um arquivo de mídia (imagem, vídeo, documento) a partir de uma URL.
- **Método:** `POST`
- **Endpoint:** `/send_media` (completo: `https://w-api.io/api/v1/send_media`)
- **Corpo da Requisição (JSON):**
  ```json
  {
    "instance_id": "SEU_INSTANCE_ID",
    "token": "SEU_TOKEN",
    "chat_id": "5511999998888@c.us",
    "caption": "Legenda da imagem",
    "file": "https://exemplo.com/imagem.jpg"
  }
  ```

### 1.5. Enviar Contato
Envia um cartão de contato para um chat.
- **Método:** `POST`
- **Endpoint:** `/send_contact` (completo: `https://w-api.io/api/v1/send_contact`)
- **Corpo da Requisição (JSON):**
  ```json
  {
    "instance_id": "SEU_INSTANCE_ID",
    "token": "SEU_TOKEN",
    "chat_id": "5511999998888@c.us",
    "contact_id": "5511988887777@c.us"
  }
  ```

### 1.6. Enviar Reação
Envia uma reação (emoji) a uma mensagem específica.
- **Método:** `POST`
- **Endpoint:** `/send_reaction` (completo: `https://w-api.io/api/v1/send_reaction`)
- **Corpo da Requisição (JSON):**
  ```json
  {
    "instance_id": "SEU_INSTANCE_ID",
    "token": "SEU_TOKEN",
    "chat_id": "5511999998888@c.us",
    "message_id": "ID_DA_MENSAGEM_ALVO",
    "reaction": "👍"
  }
  ```

---

## 2. Endpoints de Consulta

**Nota:** Para os endpoints de consulta, a URL base é `https://api.w-api.app`.

### 2.1. Pegar Chat
Pega o histórico de mensagens de um chat específico.
- **Método:** `GET`
- **Endpoint:** `/get-chat`
- **Parâmetros de Consulta:**
  - `instance_id`: SEU_INSTANCE_ID
  - `token`: SEU_TOKEN
  - `chat_id`: 5511999998888@c.us

### 2.2. Pegar Contatos
Pega a lista de todos os contatos salvos.
- **Método:** `GET`
- **Endpoint:** `/get-contacts`
- **Parâmetros de Consulta:**
  - `instance_id`: SEU_INSTANCE_ID
  - `token`: SEU_TOKEN

### 2.3. Pegar Grupos
Pega a lista de todos os grupos dos quais a instância faz parte.
- **Método:** `GET`
- **Endpoint:** `/get-groups`
- **Parâmetros de Consulta:**
  - `instance_id`: SEU_INSTANCE_ID
  - `token`: SEU_TOKEN

### 2.4. Pegar Informações do Grupo
Pega informações detalhadas de um grupo específico.
- **Método:** `GET`
- **Endpoint:** `/get-group-info`
- **Parâmetros de Consulta:**
  - `instance_id`: SEU_INSTANCE_ID
  - `token`: SEU_TOKEN
  - `group_id`: ID_DO_GRUPO@g.us

---

## 3. Endpoints de Gerenciamento da Instância

**Nota:** Para os endpoints de gerenciamento, a URL base é `https://api.w-api.app`.

### 3.1. Configurar Webhook
Define uma URL para receber eventos em tempo real (ex: mensagens recebidas).
- **Método:** `POST`
- **Endpoint:** `/set-webhook`
- **Corpo da Requisição (JSON):**
  ```json
  {
    "instance_id": "SEU_INSTANCE_ID",
    "token": "SEU_TOKEN",
    "webhook_url": "https://seu-servidor.com/webhook-receiver"
  }
  ```

### 3.2. Obter QR Code
Obtém o QR Code para conectar a instância ao WhatsApp.
- **Método:** `GET`
- **Endpoint:** `/get-qrcode`
- **Parâmetros de Consulta:**
  - `instance_id`: SEU_INSTANCE_ID
  - `token`: SEU_TOKEN

### 3.3. Obter Status da Conexão
Verifica o status atual da conexão da instância (conectado, desconectado, etc.).
- **Método:** `GET`
- **Endpoint:** `/get-status`
- **Parâmetros de Consulta:**
  - `instance_id`: SEU_INSTANCE_ID
  - `token`: SEU_TOKEN

### 3.4. Fazer Logout
Desconecta a instância do WhatsApp.
- **Método:** `GET`
- **Endpoint:** `/logout`
- **Parâmetros de Consulta:**
  - `instance_id`: SEU_INSTANCE_ID
  - `token`: SEU_TOKEN