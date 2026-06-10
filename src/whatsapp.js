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

async function enviarMensagem(para, texto) {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
  para = normalizarNumeroBR(para);

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
    // Mostra o erro exato retornado pela API da Meta (código, mensagem, detalhes)
    const detalhe = err.response?.data
      ? JSON.stringify(err.response.data, null, 2)
      : err.message;
    console.error(`❌ Erro ao enviar para ${para}:\n${detalhe}`);
  }
}

module.exports = { enviarMensagem };
