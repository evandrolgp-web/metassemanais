const db = require('./database');

const META_SEMANAL = 1000;

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataBR(dataStr) {
  const [y, m, d] = dataStr.split('-');
  return `${d}/${m}/${y}`;
}

function barraProgresso(atual, meta) {
  const total = 10;
  const preenchido = Math.min(Math.round((atual / meta) * total), total);
  return '🟩'.repeat(preenchido) + '⬜'.repeat(total - preenchido);
}

function processarMensagem(texto) {
  if (!texto) return null;
  const msg = texto.trim();

  // /help
  if (/^\/help$/i.test(msg)) {
    return HELP_TEXT;
  }

  // /semana
  if (/^\/semana$/i.test(msg)) {
    return responderSemana();
  }

  // /mes ou /mês
  if (/^\/m[eê]s$/i.test(msg)) {
    return responderMesAtual();
  }

  // /mes janeiro ou /mês janeiro
  const matchMes = msg.match(/^\/m[eê]s\s+([a-záàãâéêíóôõúç]+)$/i);
  if (matchMes) {
    return responderMesPorNome(matchMes[1]);
  }

  // Registrar ganho: número simples ou com R$
  // Exemplos: 150, 150.50, R$150, R$ 150,50
  const matchValor = msg.match(/^(?:r\$\s*)?(\d{1,6}(?:[.,]\d{1,2})?)$/i);
  if (matchValor) {
    const valorStr = matchValor[1].replace(',', '.');
    const valor = parseFloat(valorStr);
    if (!isNaN(valor) && valor > 0) {
      return registrarEResponder(valor);
    }
  }

  // Texto não reconhecido
  return '❓ Não entendi. Digite */help* para ver os comandos disponíveis.';
}

function registrarEResponder(valor) {
  db.registrarGanho(valor);

  const hoje = db.formatarData(new Date());
  const semana = db.getSemanaAtual();
  const totalSemana = db.getTotalSemana(semana);
  const falta = Math.max(META_SEMANAL - totalSemana, 0);
  const atingiu = totalSemana >= META_SEMANAL;

  const ganhosDia = db.getGanhosDia(hoje);
  const totalDia = ganhosDia.reduce((s, r) => s + r.valor, 0);

  const barra = barraProgresso(totalSemana, META_SEMANAL);
  const percentual = Math.min((totalSemana / META_SEMANAL) * 100, 100).toFixed(1);

  let resposta = `✅ *Ganho registrado!*\n`;
  resposta += `💰 Valor: ${formatarMoeda(valor)}\n`;
  resposta += `📅 Total hoje: ${formatarMoeda(totalDia)}\n\n`;
  resposta += `📊 *Meta Semanal*\n`;
  resposta += `${barra}\n`;
  resposta += `Acumulado: ${formatarMoeda(totalSemana)} de ${formatarMoeda(META_SEMANAL)} (${percentual}%)\n`;

  if (atingiu) {
    const excedente = totalSemana - META_SEMANAL;
    resposta += `\n🎉 *Parabéns! Meta semanal atingida!*`;
    if (excedente > 0) {
      resposta += `\n➕ Excedente: ${formatarMoeda(excedente)}`;
    }
  } else {
    resposta += `⏳ Falta: *${formatarMoeda(falta)}* para a meta`;
  }

  return resposta;
}

function responderSemana() {
  const semana = db.getSemanaAtual();
  const total = db.getTotalSemana(semana);
  const falta = Math.max(META_SEMANAL - total, 0);
  const atingiu = total >= META_SEMANAL;
  const barra = barraProgresso(total, META_SEMANAL);
  const percentual = Math.min((total / META_SEMANAL) * 100, 100).toFixed(1);

  const [inicio, fim] = semana.split('_');

  let resposta = `📊 *Resumo da Semana*\n`;
  resposta += `🗓️ ${formatarDataBR(inicio)} a ${formatarDataBR(fim)}\n\n`;
  resposta += `${barra}\n`;
  resposta += `Total: ${formatarMoeda(total)} de ${formatarMoeda(META_SEMANAL)} (${percentual}%)\n`;

  if (atingiu) {
    resposta += `\n🎉 *Meta atingida!* Excedente: ${formatarMoeda(total - META_SEMANAL)}`;
  } else {
    resposta += `\n⏳ Falta: *${formatarMoeda(falta)}* para atingir a meta`;
  }

  return resposta;
}

function responderMesAtual() {
  const total = db.getTotalMesAtual();
  const mes = db.getMesAtual();
  const [ano, numMes] = mes.split('-');
  const nomeMes = NOMES_MESES[parseInt(numMes) - 1];

  let resposta = `📅 *Resumo de ${nomeMes}/${ano}*\n\n`;
  resposta += `💰 Total do mês: *${formatarMoeda(total)}*\n`;

  const metasMesAtingidas = Math.floor(total / META_SEMANAL);
  resposta += `🏆 Equivalente a ${metasMesAtingidas} meta(s) semanal(is)`;

  return resposta;
}

function responderMesPorNome(nome) {
  const resultado = db.getTotalMesPorNome(nome);
  if (!resultado) {
    return `❌ Mês "${nome}" não reconhecido.\nExemplo: */mes janeiro*`;
  }

  const [ano, numMes] = resultado.mes.split('-');
  const nomeMes = NOMES_MESES[parseInt(numMes) - 1];
  const total = resultado.total;

  let resposta = `📅 *Resumo de ${nomeMes}/${ano}*\n\n`;
  resposta += `💰 Total do mês: *${formatarMoeda(total)}*\n`;

  const metasMesAtingidas = Math.floor(total / META_SEMANAL);
  resposta += `🏆 Equivalente a ${metasMesAtingidas} meta(s) semanal(is)`;

  return resposta;
}

const HELP_TEXT = `🤖 *Comandos disponíveis:*

*Registrar ganho:*
Digite apenas o valor (ex: \`150\` ou \`150,50\` ou \`R$ 200\`)
↳ Registra o ganho do dia e mostra o progresso da meta semanal

*Consultas:*
📊 \`/semana\` — Resumo da semana atual
📅 \`/mes\` — Total do mês atual
📅 \`/mes janeiro\` — Total de um mês específico

*Meta semanal:* R$ 1.000,00

❓ \`/help\` — Mostra esta mensagem`;

module.exports = { processarMensagem };
