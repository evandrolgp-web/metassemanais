require('dotenv').config();
const express = require('express');
const { processarMensagem } = require('./bot');
const { enviarMensagem } = require('./whatsapp');

const app = express();
app.use(express.json());

// Log de todas as requisições para debug
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'metas_semanais_token';

// Verificação do webhook pela Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado pela Meta');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Recebimento de mensagens
app.post('/webhook', async (req, res) => {
  // Responder 200 imediatamente para a Meta não reenviar
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value?.messages) continue;

        for (const msg of value.messages) {
          if (msg.type !== 'text') continue;

          const de = msg.from;
          const texto = msg.text?.body;

          console.log(`📩 Mensagem de ${de}: ${texto}`);

          const resposta = processarMensagem(texto);
          if (resposta) {
            await enviarMensagem(de, resposta);
          }
        }
      }
    }
  } catch (err) {
    console.error('Erro ao processar mensagem:', err.message);
  }
});

// Health check (também usado pelo keep-alive)
app.get('/', (req, res) => {
  res.json({ status: 'ok', servico: 'Metas Semanais Bot' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot rodando na porta ${PORT}`);
  console.log(`🔑 Verify token: ${VERIFY_TOKEN}`);
  agendarKeepAlive();
});

// Evita que o Render.com desligue o servidor por inatividade.
// Faz um ping em si mesmo a cada 14 minutos (limite é 15 min).
function agendarKeepAlive() {
  const url = process.env.APP_URL;
  if (!url) return;

  const axios = require('axios');
  setInterval(async () => {
    try {
      await axios.get(url);
    } catch (_) {
      // silencioso
    }
  }, 14 * 60 * 1000);
}
