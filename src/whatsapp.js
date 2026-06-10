const axios = require('axios');

const BASE_URL = 'https://graph.facebook.com/v19.0';

async function enviarMensagem(para, texto) {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;

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
