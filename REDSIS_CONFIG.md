# Configuração da Integração Redsis

## 📋 Pré-requisitos

Para integrar o sistema com a API Redsis, você precisa ter:

1. **Credenciais de acesso** ao sistema Redsis (usuário e senha)
2. **Endereço do servidor** onde o Redsis está instalado
3. **Porta de acesso** à API (geralmente 3000)
4. **Código da empresa** configurado no Redsis (necessário para estoque)

## 🔧 Como Configurar

### Passo 1: Obter as Credenciais

Entre em contato com:
- **Suporte Redsis**: Para solicitar suas credenciais de API
- **Administrador do Sistema**: Se sua empresa já tem Redsis instalado

Você precisará dos seguintes dados:
- Usuário
- Senha
- IP ou domínio do servidor
- Porta (padrão: 3000)

### Passo 2: Configurar no Sistema

1. Faça login no sistema CRM Pro
2. No menu lateral, vá em **Configurações → Redsis API**
3. Preencha os campos:
   - **Usuário**: Seu usuário de acesso ao Redsis
   - **Senha**: Sua senha de acesso
   - **Servidor**: IP (ex: `192.168.1.100`) ou domínio (ex: `servidor.empresa.com`)
   - **Porta**: Porta do serviço (padrão: `3000`)
   - **Empresa**: Código da empresa (obrigatório para consultar estoque)

4. Clique em **Testar Conexão** para validar as credenciais
5. Se o teste for bem-sucedido, clique em **Salvar Configuração**

### Passo 3: Usar a Integração

Após configurar, você pode usar a integração em:

- **Contatos CRM** (`/crm-contacts`): Lista todos os clientes do Redsis
- **Broadcast de Estoque** (`/inventory`): Envia atualizações de produtos para clientes

## 🔍 Endpoints Disponíveis

A integração utiliza os seguintes endpoints da API Redsis:

### Autenticação
```
POST http://{servidor}:{porta}/api/Redsis/auth
Body: { "usuario": "...", "senha": "..." }
```

### Buscar Clientes
```
GET http://{servidor}:{porta}/api/Redsis/clientes
Headers: { "Authorization": "Bearer {token}" }
Query params: nome, documento, situacao, limit
```

## 📚 Documentação Oficial

Para mais detalhes sobre a API Redsis, consulte:
- [Swagger API Redsis](https://swagger.redsis.com.br/?urls.primaryName=Web)

## ❓ Troubleshooting

### Erro: "Redsis não configurado"
**Solução**: Acesse Configurações → Redsis API e configure suas credenciais.

### Erro: "Falha na conexão"
**Possíveis causas**:
- Credenciais incorretas
- Servidor ou porta incorretos
- Servidor Redsis offline
- Firewall bloqueando a conexão

**Solução**: 
1. Verifique se o servidor está acessível
2. Confirme usuário e senha com o administrador
3. Teste a porta com `telnet {servidor} {porta}`

### Erro: "Token expirado"
O sistema renova automaticamente o token. Se persistir:
1. Salve a configuração novamente
2. Teste a conexão

## 🔒 Segurança

- As credenciais são armazenadas criptografadas no banco de dados
- Tokens de autenticação são renovados automaticamente
- Apenas usuários autenticados podem acessar a configuração

## 💡 Dicas

1. **Use conexão segura**: Se possível, configure HTTPS no servidor Redsis
2. **Teste regularmente**: Use o botão "Testar Conexão" para validar o acesso
3. **Mantenha as credenciais atualizadas**: Se alterar a senha no Redsis, atualize aqui também
