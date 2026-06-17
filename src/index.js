require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const { processarMensagem } = require('./bot');
const { enviarMensagem, registrarMensagemRecebida } = require('./whatsapp');

const app = express();

// Guarda o corpo bruto da requisição para validar a assinatura da Meta.
// A assinatura é um HMAC sobre os bytes exatos recebidos, então precisamos
// do raw body antes de o JSON ser parseado.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

const APP_SECRET = process.env.WHATSAPP_APP_SECRET || '';

// Valida o cabeçalho X-Hub-Signature-256 enviado pela Meta. Garante que a
// requisição veio mesmo da Meta (assinada com o App Secret) e não é forjada.
// Sem isso, qualquer um que conheça a URL poderia injetar mensagens falsas.
function assinaturaValida(req) {
  if (!APP_SECRET) {
    console.warn('⚠️ WHATSAPP_APP_SECRET não configurado — assinatura do webhook NÃO validada!');
    return true; // não bloqueia até o segredo ser configurado
  }
  const assinatura = req.get('X-Hub-Signature-256') || '';
  if (!assinatura.startsWith('sha256=') || !req.rawBody) return false;

  const esperado = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(req.rawBody)
    .digest('hex');

  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Log de todas as requisições para debug
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'metas_semanais_token';

// Números autorizados a usar o bot (lista separada por vírgula no .env).
// Comparação ignora o nono dígito para casar formatos com/sem o 9.
// Vazio = qualquer número pode usar.
const NUMEROS_AUTORIZADOS = (process.env.NUMEROS_AUTORIZADOS || '')
  .split(',')
  .map(n => n.replace(/\D/g, ''))
  .filter(Boolean);

function soDigitosSemNove(numero) {
  const n = numero.replace(/\D/g, '');
  // remove o nono dígito de celulares BR (55 + DDD + 9 + 8 dígitos)
  return n.replace(/^(55\d{2})9(\d{8})$/, '$1$2');
}

function numeroAutorizado(numero) {
  if (NUMEROS_AUTORIZADOS.length === 0) return true;
  const alvo = soDigitosSemNove(numero);
  return NUMEROS_AUTORIZADOS.some(n => soDigitosSemNove(n) === alvo);
}

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
  // Rejeita requisições sem assinatura válida da Meta (anti-falsificação)
  if (!assinaturaValida(req)) {
    console.warn('🚫 Webhook recusado: assinatura inválida');
    return res.sendStatus(401);
  }

  // Responder 200 imediatamente para a Meta não reenviar
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        // Status de entrega das respostas enviadas (sent/delivered/failed)
        for (const st of value?.statuses || []) {
          const erros = st.errors ? ' | erros: ' + JSON.stringify(st.errors) : '';
          console.log(`📬 Status "${st.status}" para ${st.recipient_id}${erros}`);
        }

        if (!value?.messages) continue;

        for (const msg of value.messages) {
          if (msg.type !== 'text') continue;

          const de = msg.from;
          const texto = msg.text?.body;

          console.log(`📩 Mensagem de ${de}: ${texto}`);

          // Ignora silenciosamente números não autorizados — não responde
          // (não consome cota) e não deixa terceiros mexerem nos dados.
          if (!numeroAutorizado(de)) {
            console.log(`⛔ Número não autorizado, ignorado: ${de}`);
            continue;
          }

          // Registra o timestamp para garantir que a resposta fique
          // dentro da janela gratuita de 24h (trava anti-custo)
          registrarMensagemRecebida(de);

          const resposta = processarMensagem(texto, de);
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

// Inscreve o app na conta do WhatsApp Business. Sem essa inscrição a Meta
// gera os eventos de mensagens reais mas não os entrega ao webhook
// (o teste do painel não passa por ela, por isso funcionava).
// Uso no navegador: /subscribe?waba=ID_DA_CONTA&token=VERIFY_TOKEN
app.get('/subscribe', async (req, res) => {
  if (req.query.token !== VERIFY_TOKEN) {
    return res.status(403).json({ erro: 'token inválido' });
  }
  const waba = req.query.waba;
  if (!waba) {
    return res.status(400).json({ erro: 'informe ?waba=ID_DA_CONTA_WHATSAPP_BUSINESS' });
  }

  const axios = require('axios');
  const headers = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
  const resultado = {};

  try {
    const sub = await axios.post(
      `https://graph.facebook.com/v19.0/${waba}/subscribed_apps`,
      {},
      { headers }
    );
    resultado.inscricao = sub.data;
  } catch (err) {
    resultado.inscricao_erro = err.response?.data || err.message;
  }

  try {
    const lista = await axios.get(
      `https://graph.facebook.com/v19.0/${waba}/subscribed_apps`,
      { headers }
    );
    resultado.apps_inscritos = lista.data;
  } catch (err) {
    resultado.apps_inscritos_erro = err.response?.data || err.message;
  }

  console.log('🔔 Resultado /subscribe:', JSON.stringify(resultado));
  res.json(resultado);
});

// Limpa todos os dados (ganhos, metas e estado). Protegido pelo verify token.
// Uso no navegador: /reset?token=VERIFY_TOKEN
app.get('/reset', (req, res) => {
  if (req.query.token !== VERIFY_TOKEN) {
    return res.status(403).json({ erro: 'token inválido' });
  }
  require('./database').resetar();
  console.log('🧹 Dados zerados via /reset');
  res.json({ ok: true, mensagem: 'Dados zerados' });
});

// Health check (também usado pelo keep-alive)
app.get('/', (req, res) => {
  res.json({ status: 'ok', servico: 'Metas Semanais Bot' });
});

const PORT = process.env.PORT || 3000;
const db = require('./database');

db.carregar().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Bot rodando na porta ${PORT}`);
    console.log(`🔑 Verify token: ${VERIFY_TOKEN}`);
    agendarKeepAlive();
  });
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
  }, 5 * 60 * 1000);
}
