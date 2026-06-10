# 🤖 Metas Semanais — WhatsApp Bot

Bot para rastreamento de ganhos diários com meta semanal de **R$ 1.000,00**, integrado ao WhatsApp via **API oficial da Meta** (sem risco de banimento).

---

## ✨ Funcionalidades

| Ação | Como usar |
|------|-----------|
| Registrar ganho do dia | Digite o valor: `150` ou `150,50` ou `R$ 200` |
| Ver resumo da semana | `/semana` |
| Ver total do mês atual | `/mes` |
| Ver total de um mês específico | `/mes janeiro` |
| Ajuda | `/help` |

---

## 🛠️ Configuração

### 1. Pré-requisitos

- Conta de desenvolvedor na Meta: https://developers.facebook.com
- App criado com o produto **WhatsApp** adicionado
- Node.js 18+

### 2. Obter credenciais (gratuito)

1. Acesse https://developers.facebook.com e crie um app do tipo **Business**
2. Adicione o produto **WhatsApp** ao app
3. Em **WhatsApp > API Setup**, copie:
   - **Temporary access token** (ou gere um permanente via System User)
   - **Phone Number ID**
4. Adicione um número de telefone de teste (ou seu número verificado)

### 3. Instalar e configurar

```bash
npm install

cp .env.example .env
# Edite o .env com seus dados
```

### 4. Expor o servidor (necessário para o webhook)

#### Opção A — Desenvolvimento local com ngrok (gratuito)
```bash
# Instalar ngrok: https://ngrok.com
ngrok http 3000
# Copie a URL https gerada (ex: https://abc123.ngrok-free.app)
```

#### Opção B — Deploy gratuito na Render.com
1. Crie conta em https://render.com
2. Conecte este repositório
3. Crie um **Web Service** com:
   - Build command: `npm install`
   - Start command: `npm start`
4. Adicione as variáveis de ambiente (`.env.example`)

### 5. Configurar o Webhook na Meta

1. No painel do app, vá em **WhatsApp > Configuration > Webhook**
2. Clique em **Edit**:
   - **URL**: `https://sua-url/webhook`
   - **Verify Token**: o valor que você colocou em `WEBHOOK_VERIFY_TOKEN`
3. Clique em **Verify and Save**
4. Inscreva o campo **messages**

### 6. Iniciar o bot

```bash
npm start
# ou em desenvolvimento:
npm run dev
```

---

## 📁 Estrutura

```
src/
  index.js      — servidor Express e webhook
  bot.js        — lógica dos comandos
  database.js   — armazenamento SQLite
  whatsapp.js   — envio de mensagens via API da Meta
data/
  ganhos.db     — banco de dados local (criado automaticamente)
```

---

## 🔒 Segurança

- Usa exclusivamente a **WhatsApp Cloud API oficial da Meta**
- Nenhuma biblioteca não-oficial — zero risco de banimento
- Dados armazenados localmente em SQLite

---

## 📱 Exemplo de uso

```
Você: 250
Bot: ✅ Ganho registrado!
     💰 Valor: R$ 250,00
     📅 Total hoje: R$ 250,00

     📊 Meta Semanal
     🟩🟩⬜⬜⬜⬜⬜⬜⬜⬜
     Acumulado: R$ 250,00 de R$ 1.000,00 (25,0%)
     ⏳ Falta: R$ 750,00 para a meta
```
