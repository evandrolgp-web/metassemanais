# 🤖 Metas Semanais — WhatsApp Bot

Bot para rastreamento de ganhos diários com meta semanal de **R$ 1.000,00**, integrado ao WhatsApp via **API oficial da Meta** — 100% gratuito, sem risco de banimento.

---

## ✨ Comandos do bot

| O que digitar | O que acontece |
|---|---|
| `150` ou `150,50` ou `R$ 200` | Registra o ganho e mostra o progresso da meta |
| `/semana` | Resumo da semana atual com barra de progresso |
| `/mes` | Total acumulado do mês atual |
| `/mes janeiro` | Total de um mês específico |
| `/help` | Lista todos os comandos |

---

## 📱 Precisa de número Business ou pode usar o pessoal?

**Você tem duas opções:**

### Opção A — Usar o número de teste da Meta ✅ (Recomendado para começar)
- A Meta fornece um **número de teste gratuito** no painel de desenvolvedor
- Você **não precisa de número business** nem perde seu número pessoal
- Você envia mensagens **do seu WhatsApp pessoal** para o número de teste da Meta
- **Limitação:** só funciona com até **5 números** cadastrados como destinatários de teste
- Ideal para uso pessoal/familiar

### Opção B — Usar seu número pessoal como o bot
- É possível, mas **o número deixa de funcionar como WhatsApp normal**
- Você perderia o histórico e não poderia mais usá-lo para conversas pessoais
- Recomendado apenas se tiver um número separado exclusivo para o bot

**Conclusão:** Use a Opção A. Para uso pessoal, os 5 números de teste são mais do suficiente.

---

## 💸 Custos: zero

| Componente | Serviço | Custo |
|---|---|---|
| WhatsApp API | Meta Cloud API | 1.000 conversas/mês grátis |
| Servidor | Render.com ou Koyeb | Gratuito |
| Banco de dados | SQLite (arquivo local) | Gratuito |
| **Total** | | **R$ 0,00** |

---

## 🚀 Configuração passo a passo

### Parte 1 — Criar o app na Meta (15 min)

**1.1. Criar conta de desenvolvedor**
1. Acesse https://developers.facebook.com
2. Clique em **Get Started** e faça login com sua conta do Facebook
3. Se pedido, aceite os termos de desenvolvedor

**1.2. Criar o app**
1. Clique em **My Apps** → **Create App**
2. Selecione o tipo **Other** e depois **Business**
3. Dê um nome qualquer (ex: "Metas Bot") e clique em **Create App**

**1.3. Adicionar o produto WhatsApp**
1. Na tela de produtos, localize **WhatsApp** e clique em **Set up**
2. Você será direcionado para a seção **WhatsApp > API Setup**

**1.4. Copiar as credenciais**

Na tela de API Setup você verá:

```
Phone number ID:  1234567890123456   ← copie este
Temporary access token: EAABs...     ← copie este (válido por 24h)
```

> ⚠️ O token temporário expira em 24h. Para uso permanente, veja a seção
> "Gerar token permanente" abaixo.

**1.5. Adicionar seu número como destinatário de teste**
1. Ainda na tela de API Setup, clique em **Add phone number** (seção "To")
2. Digite seu número pessoal no formato +55 11 99999-9999
3. Você receberá um código no WhatsApp para confirmar

---

### Parte 2 — Hospedar o servidor (10 min)

Escolha **uma** das opções abaixo:

---

#### Opção 2A — Render.com (mais fácil, gratuito com keep-alive)

O bot já inclui keep-alive automático para evitar que o Render desligue o servidor.

1. Crie conta em https://render.com (pode usar conta do GitHub/Google)
2. Clique em **New** → **Web Service**
3. Escolha **Build and deploy from a Git repository**
4. Conecte sua conta do GitHub e selecione o repositório **metassemanais**
5. Configure:
   - **Name:** metas-semanais-bot (qualquer nome)
   - **Region:** Ohio (US East) ou South America se disponível
   - **Branch:** `claude/gallant-meitner-grmg2y` (ou `main` se fizer merge)
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`
6. Clique em **Advanced** → **Add Environment Variable** e adicione:

| Key | Value |
|---|---|
| `WHATSAPP_TOKEN` | seu token da Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | seu Phone Number ID |
| `WEBHOOK_VERIFY_TOKEN` | `metas_semanais_token` |
| `APP_URL` | deixe em branco por enquanto (preenche depois) |

7. Clique em **Create Web Service**
8. Aguarde o deploy (2-3 minutos). Você verá a URL no topo: `https://metas-semanais-bot.onrender.com`
9. Volte nas variáveis de ambiente e preencha `APP_URL` com essa URL

---

#### Opção 2B — Koyeb (gratuito, sem dormir, precisa de cartão para verificar)

1. Crie conta em https://koyeb.com
2. Clique em **Create App** → **GitHub**
3. Selecione o repositório e configure:
   - **Run command:** `npm start`
   - **Port:** `3000`
4. Adicione as variáveis de ambiente (mesmas da tabela acima, sem `APP_URL`)
5. Clique em **Deploy**
6. Copie a URL gerada (ex: `https://metas-bot-xxx.koyeb.app`)

---

### Parte 3 — Configurar o Webhook na Meta (5 min)

1. Volte no painel: https://developers.facebook.com → seu app → **WhatsApp** → **Configuration**
2. Na seção **Webhook**, clique em **Edit**
3. Preencha:
   - **Callback URL:** `https://sua-url/webhook`
     (ex: `https://metas-semanais-bot.onrender.com/webhook`)
   - **Verify Token:** `metas_semanais_token`
4. Clique em **Verify and Save**
   - Se aparecer ✅, funcionou. Se der erro, verifique se o servidor está rodando.
5. Na seção **Webhook fields**, clique em **Manage** e ative o campo **messages**

---

### Parte 4 — Testar

1. No WhatsApp do seu celular, envie uma mensagem para o **número de teste da Meta**
   (aparece na tela de API Setup como "From")
2. Digite `150` e envie
3. O bot deve responder com o ganho registrado e o progresso da meta

---

## 🔑 Gerar token permanente (para não expirar em 24h)

O token temporário dura apenas 24 horas. Para um token permanente:

1. No painel da Meta, vá em **Business Settings** (configurações do negócio)
   - URL: https://business.facebook.com/settings/
2. Vá em **Users** → **System Users**
3. Clique em **Add** → dê um nome (ex: "Bot Metas") → função **Admin**
4. Clique no usuário criado → **Add Assets**
5. Selecione seu app → marque **Manage app** → salve
6. Clique em **Generate New Token**
7. Selecione seu app, marque as permissões `whatsapp_business_messaging` e `whatsapp_business_management`
8. Clique em **Generate Token** e copie o token
9. Atualize a variável `WHATSAPP_TOKEN` no Render/Koyeb com esse novo token

---

## 📁 Estrutura do projeto

```
src/
  index.js      — servidor Express e webhook
  bot.js        — lógica de todos os comandos
  database.js   — armazenamento SQLite (cria automaticamente)
  whatsapp.js   — envio de mensagens via API da Meta
data/
  ganhos.db     — banco de dados (criado automaticamente ao iniciar)
.env.example    — modelo das variáveis de ambiente
```

---

## 📱 Exemplo de conversa

```
Você: 250
Bot:  ✅ Ganho registrado!
      💰 Valor: R$ 250,00
      📅 Total hoje: R$ 250,00

      📊 Meta Semanal
      🟩🟩🟩⬜⬜⬜⬜⬜⬜⬜
      Acumulado: R$ 250,00 de R$ 1.000,00 (25,0%)
      ⏳ Falta: R$ 750,00 para a meta

Você: 800
Bot:  ✅ Ganho registrado!
      💰 Valor: R$ 800,00
      📅 Total hoje: R$ 1.050,00

      📊 Meta Semanal
      🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩
      Acumulado: R$ 1.050,00 de R$ 1.000,00 (100%)

      🎉 Parabéns! Meta semanal atingida!
      ➕ Excedente: R$ 50,00

Você: /semana
Bot:  📊 Resumo da Semana
      🗓️ 08/06/2026 a 14/06/2026

      🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩
      Total: R$ 1.050,00 de R$ 1.000,00 (100%)
      🎉 Meta atingida! Excedente: R$ 50,00

Você: /mes junho
Bot:  📅 Resumo de Junho/2026
      💰 Total do mês: R$ 1.050,00
      🏆 Equivalente a 1 meta(s) semanal(is)
```
