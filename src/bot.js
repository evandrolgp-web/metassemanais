const db = require('./database');

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
  const preenchido = meta > 0 ? Math.min(Math.round((atual / meta) * total), total) : 0;
  return '🟩'.repeat(preenchido) + '⬜'.repeat(total - preenchido);
}

// Extrai um valor monetário de uma mensagem (150, 150,50, R$ 200...).
// Retorna o número ou null se não for um valor válido.
function parseValor(msg) {
  const m = msg.match(/^(?:r\$\s*)?(\d{1,7}(?:[.,]\d{1,2})?)$/i);
  if (!m) return null;
  const valor = parseFloat(m[1].replace(',', '.'));
  return !isNaN(valor) && valor > 0 ? valor : null;
}

function processarMensagem(texto, telefone) {
  if (!texto) return null;
  const msg = texto.trim();

  // /help funciona sempre, mesmo durante a definição da meta
  if (/^\/help$/i.test(msg)) {
    return HELP_TEXT;
  }

  const semana = db.getSemanaAtual();

  // Se estamos aguardando a definição da meta da semana, a próxima
  // mensagem deve ser o valor da meta.
  const estado = db.getEstado(telefone);
  if (estado?.aguardandoMeta) {
    const meta = parseValor(msg);
    if (meta === null) {
      return '🎯 Para definir a meta da semana, envie apenas o valor.\nExemplo: `1000` ou `R$ 1.500`';
    }
    db.setMeta(semana, meta);
    const ganhoPendente = estado.ganhoPendente;
    db.limparEstado(telefone);

    let resposta = `🎯 *Meta da semana definida:* ${formatarMoeda(meta)}\n`;
    const [inicio, fim] = semana.split('_');
    resposta += `🗓️ ${formatarDataBR(inicio)} a ${formatarDataBR(fim)}\n`;

    if (ganhoPendente) {
      resposta += '\n' + registrarEResponder(ganhoPendente, semana);
    } else {
      resposta += '\n✅ Pronto! Agora é só enviar seus ganhos do dia.';
    }
    return resposta;
  }

  // /meta — (re)definir a meta da semana atual
  if (/^\/meta$/i.test(msg)) {
    return pedirMeta(telefone, null);
  }

  // /semana
  if (/^\/semana$/i.test(msg)) {
    if (db.getMeta(semana) === null) {
      return pedirMeta(telefone, null);
    }
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

  // Valor (registrar ganho)
  const valor = parseValor(msg);
  if (valor !== null) {
    // Primeira mensagem da semana (sem meta definida): perguntar a meta
    if (db.getMeta(semana) === null) {
      return pedirMeta(telefone, valor);
    }
    return registrarEResponder(valor, semana);
  }

  // Texto não reconhecido
  return '❓ Não entendi. Digite */help* para ver os comandos disponíveis.';
}

function pedirMeta(telefone, ganhoPendente) {
  db.setEstado(telefone, { aguardandoMeta: true, ganhoPendente: ganhoPendente || null });
  let resposta = '🎯 *Nova semana!* Qual é a sua meta para esta semana?\n';
  resposta += 'Envie apenas o valor. Exemplo: `1000` ou `R$ 1.500`';
  if (ganhoPendente) {
    resposta += `\n\n_(seu ganho de ${formatarMoeda(ganhoPendente)} será registrado em seguida)_`;
  }
  return resposta;
}

function registrarEResponder(valor, semana) {
  db.registrarGanho(valor);

  const meta = db.getMeta(semana);
  const totalSemana = db.getTotalSemana(semana);
  const falta = Math.max(meta - totalSemana, 0);
  const atingiu = totalSemana >= meta;

  const totalDia = db.getGanhosDia(db.getDataHoje()).reduce((s, r) => s + r.valor, 0);

  const barra = barraProgresso(totalSemana, meta);
  const percentual = meta > 0 ? Math.min((totalSemana / meta) * 100, 100).toFixed(1) : '0';

  let resposta = `✅ *Ganho registrado!*\n`;
  resposta += `💰 Valor: ${formatarMoeda(valor)}\n`;
  resposta += `📅 Total hoje: ${formatarMoeda(totalDia)}\n\n`;
  resposta += `📊 *Meta da Semana:* ${formatarMoeda(meta)}\n`;
  resposta += `${barra}\n`;
  resposta += `Acumulado: ${formatarMoeda(totalSemana)} (${percentual}%)\n`;

  if (atingiu) {
    const excedente = totalSemana - meta;
    resposta += `\n🎉 *Parabéns! Meta da semana atingida!*`;
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
  const meta = db.getMeta(semana);
  const total = db.getTotalSemana(semana);
  const falta = Math.max(meta - total, 0);
  const atingiu = total >= meta;
  const barra = barraProgresso(total, meta);
  const percentual = meta > 0 ? Math.min((total / meta) * 100, 100).toFixed(1) : '0';

  const [inicio, fim] = semana.split('_');

  let resposta = `📊 *Resumo da Semana*\n`;
  resposta += `🗓️ ${formatarDataBR(inicio)} a ${formatarDataBR(fim)}\n\n`;
  resposta += `🎯 Meta: ${formatarMoeda(meta)}\n`;
  resposta += `${barra}\n`;
  resposta += `Total: ${formatarMoeda(total)} (${percentual}%)\n`;

  if (atingiu) {
    resposta += `\n🎉 *Meta atingida!* Excedente: ${formatarMoeda(total - meta)}`;
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
  resposta += `💰 Total do mês: *${formatarMoeda(total)}*`;

  return resposta;
}

function responderMesPorNome(nome) {
  const resultado = db.getTotalMesPorNome(nome);
  if (!resultado) {
    return `❌ Mês "${nome}" não reconhecido.\nExemplo: */mes janeiro*`;
  }

  const [ano, numMes] = resultado.mes.split('-');
  const nomeMes = NOMES_MESES[parseInt(numMes) - 1];

  let resposta = `📅 *Resumo de ${nomeMes}/${ano}*\n\n`;
  resposta += `💰 Total do mês: *${formatarMoeda(resultado.total)}*`;

  return resposta;
}

const HELP_TEXT = `🤖 *Comandos disponíveis:*

*Registrar ganho:*
Digite apenas o valor (ex: \`150\` ou \`150,50\` ou \`R$ 200\`)
↳ Na primeira mensagem da semana, eu pergunto qual é a sua meta.

*Consultas:*
📊 \`/semana\` — Resumo da semana atual
📅 \`/mes\` — Total do mês atual
📅 \`/mes janeiro\` — Total de um mês específico

*Meta:*
🎯 \`/meta\` — Definir/alterar a meta da semana atual

_A semana vai de segunda a domingo (horário de São Paulo)._

❓ \`/help\` — Mostra esta mensagem`;

module.exports = { processarMensagem };
