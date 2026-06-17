const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

// O wa_id de números brasileiros antigos vem sem o nono dígito
// (ex: 553193444893), mas a lista de destinatários permitidos usa o
// formato com 9 (5531993444893). Reinserimos o 9 para o envio passar
// na verificação da lista.
function normalizarNumeroBR(numero) {
  if (/^55\d{10}$/.test(numero)) {
    return numero.slice(0, 4) + '9' + numero.slice(4);
  }
  return numero;
}

// Rastreia a última mensagem recebida de cada número (timestamp Unix).
// Só respondemos se a mensagem chegou há menos de 24h — isso garante
// que estamos sempre dentro da janela de conversa iniciada pelo usuário,
// que é gratuita na API da Meta. Fora dessa janela seria necessário
// enviar um template aprovado (pago). Bloqueamos o envio em vez de
// arriscar qualquer custo.
const ultimaMensagemRecebida = new Map();

function registrarMensagemRecebida(telefone) {
  ultimaMensagemRecebida.set(telefone, Date.now());
}

function dentroJanela24h(telefone) {
  const ts = ultimaMensagemRecebida.get(telefone);
  if (!ts) return false;
  return Date.now() - ts < 23.5 * 60 * 60 * 1000; // 23h30 de margem
}

async function enviarMensagem(para, texto) {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
  para = normalizarNumeroBR(para);

  // Trava anti-custo: bloqueia envio fora da janela gratuita de 24h
  if (!dentroJanela24h(para) && !dentroJanela24h(para.replace(/^559/, '55'))) {
    console.warn(`🚫 Envio bloqueado para ${para}: fora da janela de 24h (seria pago)`);
    return;
  }

  try {
    const resp = await axios.post(
      `${BASE_URL}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: para,
        type: 'text',
        text: { body: texto, preview_url: false },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`✅ Resposta enviada para ${para}:`, JSON.stringify(resp.data));
  } catch (err) {
    const detalhe = err.response?.data
      ? JSON.stringify(err.response.data, null, 2)
      : err.message;
    console.error(`❌ Erro ao enviar para ${para}:\n${detalhe}`);
  }
}

module.exports = { enviarMensagem, registrarMensagemRecebida };
