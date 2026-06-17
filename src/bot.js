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

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function nomeDiaSemana(dataStr) {
  // dataStr = YYYY-MM-DD (dia em SP); usa UTC para não deslocar o dia
  const [y, m, d] = dataStr.split('-').map(Number);
  return DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// Linha "quanto falta por dia" para bater a meta no restante da semana.
function linhaPorDia(falta) {
  if (falta <= 0) return '';
  const dias = db.getDiasRestantesSemana();
  const porDia = falta / dias;
  const sufixo = dias === 1 ? 'hoje (último dia)' : `por dia (${dias} dias restantes)`;
  return `\n📈 Ritmo: ${formatarMoeda(porDia)} ${sufixo}`;
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

  // /desfazer — remove o último ganho registrado na semana
  if (/^\/desfazer$/i.test(msg)) {
    return desfazerUltimo();
  }

  // /historico ou /histórico — últimas semanas com meta vs. realizado
  if (/^\/hist[oó]rico$/i.test(msg)) {
    return responderHistorico();
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

  // Lançamento retroativo: "ontem 150", "anteontem 200", "hoje 100"
  const matchRel = msg.match(/^(hoje|ontem|anteontem)\s+(?:r\$\s*)?(\d{1,7}(?:[.,]\d{1,2})?)$/i);
  if (matchRel) {
    const valorRel = parseValor(matchRel[2]);
    if (valorRel === null) return '❓ Valor inválido. Ex: `ontem 150`';
    const dias = { hoje: 0, ontem: 1, anteontem: 2 }[matchRel[1].toLowerCase()];
    return registrarRetroativo(valorRel, db.dataRelativa(dias));
  }

  // Lançamento retroativo por data: "15/06 200" ou "15/06/2026 200"
  const matchData = msg.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(?:r\$\s*)?(\d{1,7}(?:[.,]\d{1,2})?)$/);
  if (matchData) {
    const valorData = parseValor(matchData[4]);
    if (valorData === null) return '❓ Valor inválido. Ex: `15/06 200`';
    const dataStr = db.montarData(+matchData[1], +matchData[2], matchData[3] ? +matchData[3] : null);
    if (!dataStr) return '❓ Data inválida. Use o formato `DD/MM` ou `DD/MM/AAAA`.';
    return registrarRetroativo(valorData, dataStr);
  }

  // Editar por data: "15/06 editar 150 para 200"
  const matchEditarData = msg.match(
    /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+editar\s+(?:r\$\s*)?(\d{1,7}(?:[.,]\d{1,2})?)\s+para\s+(?:r\$\s*)?(\d{1,7}(?:[.,]\d{1,2})?)$/i
  );
  if (matchEditarData) {
    const antigo = parseValor(matchEditarData[4]);
    const novo = parseValor(matchEditarData[5]);
    if (antigo === null || novo === null) return '❓ Valores inválidos. Ex: `15/06 editar 150 para 200`';
    const dataStr = db.montarData(+matchEditarData[1], +matchEditarData[2], matchEditarData[3] ? +matchEditarData[3] : null);
    if (!dataStr) return '❓ Data inválida. Use `DD/MM` ou `DD/MM/AAAA`.';
    return editarPorData(dataStr, antigo, novo);
  }

  // Editar na semana atual: "editar 150 para 200"
  const matchEditar = msg.match(
    /^editar\s+(?:r\$\s*)?(\d{1,7}(?:[.,]\d{1,2})?)\s+para\s+(?:r\$\s*)?(\d{1,7}(?:[.,]\d{1,2})?)$/i
  );
  if (matchEditar) {
    const antigo = parseValor(matchEditar[1]);
    const novo = parseValor(matchEditar[2]);
    if (antigo === null || novo === null) return '❓ Valores inválidos. Ex: `editar 150 para 200`';
    return editarNaSemana(antigo, novo);
  }

  // Múltiplos valores numa só mensagem: "150 200 300"
  const tokens = msg.split(/\s+/);
  if (tokens.length >= 2 && tokens.every(t => parseValor(t) !== null)) {
    const valores = tokens.map(parseValor);
    if (db.getMeta(semana) === null) {
      // Sem meta ainda: primeiro valor vira o ganho pendente; pede a meta.
      // (Para simplificar, lançamos só após a meta; aqui pedimos a meta
      // e guardamos apenas o primeiro; o usuário reenvia os demais.)
      return pedirMeta(telefone, valores[0]);
    }
    return registrarMultiplos(valores, semana);
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
  // Este lançamento foi o que cruzou a meta agora?
  const cruzouAgora = atingiu && (totalSemana - valor) < meta;

  const totalDia = db.getGanhosDia(db.getDataHoje()).reduce((s, r) => s + r.valor, 0);

  const barra = barraProgresso(totalSemana, meta);
  const percentual = meta > 0 ? Math.min((totalSemana / meta) * 100, 100).toFixed(1) : '0';

  let resposta = '';
  if (cruzouAgora) {
    resposta += `🎉🎉🎉 *META DA SEMANA BATIDA!* 🎉🎉🎉\n`;
    resposta += `Foi esse ganho que fechou a meta. Parabéns! 👏\n\n`;
  }
  resposta += `✅ *Ganho registrado!*\n`;
  resposta += `💰 Valor: ${formatarMoeda(valor)}\n`;
  resposta += `📅 Total hoje: ${formatarMoeda(totalDia)}\n\n`;
  resposta += `📊 *Meta da Semana:* ${formatarMoeda(meta)}\n`;
  resposta += `${barra}\n`;
  resposta += `Acumulado: ${formatarMoeda(totalSemana)} (${percentual}%)\n`;

  if (atingiu) {
    const excedente = totalSemana - meta;
    if (!cruzouAgora) {
      resposta += `\n🎉 *Meta da semana atingida!*`;
    }
    if (excedente > 0) {
      resposta += `\n➕ Excedente: ${formatarMoeda(excedente)}`;
    }
  } else {
    resposta += `⏳ Falta: *${formatarMoeda(falta)}* para a meta`;
    resposta += linhaPorDia(falta);
  }

  return resposta;
}

// Registra vários ganhos de hoje numa só mensagem ("150 200 300").
function registrarMultiplos(valores, semana) {
  const metaAntes = db.getMeta(semana);
  const totalAntes = db.getTotalSemana(semana);

  for (const v of valores) db.registrarGanho(v);

  const meta = db.getMeta(semana);
  const totalSemana = db.getTotalSemana(semana);
  const falta = Math.max(meta - totalSemana, 0);
  const atingiu = totalSemana >= meta;
  const cruzouAgora = atingiu && totalAntes < meta;

  const totalDia = db.getGanhosDia(db.getDataHoje()).reduce((s, r) => s + r.valor, 0);
  const somaLote = valores.reduce((s, v) => s + v, 0);
  const barra = barraProgresso(totalSemana, meta);
  const percentual = meta > 0 ? Math.min((totalSemana / meta) * 100, 100).toFixed(1) : '0';

  let resposta = '';
  if (cruzouAgora) {
    resposta += `🎉🎉🎉 *META DA SEMANA BATIDA!* 🎉🎉🎉\n👏\n\n`;
  }
  resposta += `✅ *${valores.length} ganhos registrados!*\n`;
  resposta += valores.map(v => `• ${formatarMoeda(v)}`).join('\n') + '\n';
  resposta += `➕ Soma do lote: ${formatarMoeda(somaLote)}\n`;
  resposta += `📅 Total hoje: ${formatarMoeda(totalDia)}\n\n`;
  resposta += `📊 *Meta da Semana:* ${formatarMoeda(meta)}\n`;
  resposta += `${barra}\n`;
  resposta += `Acumulado: ${formatarMoeda(totalSemana)} (${percentual}%)\n`;

  if (atingiu) {
    const excedente = totalSemana - meta;
    if (!cruzouAgora) resposta += `\n🎉 *Meta da semana atingida!*`;
    if (excedente > 0) resposta += `\n➕ Excedente: ${formatarMoeda(excedente)}`;
  } else {
    resposta += `⏳ Falta: *${formatarMoeda(falta)}* para a meta`;
    resposta += linhaPorDia(falta);
  }
  return resposta;
}

// Edita um ganho da semana atual: troca um valor por outro.
function editarNaSemana(antigo, novo) {
  const semana = db.getSemanaAtual();
  const atualizado = db.editarUltimoGanhoSemana(semana, antigo, novo);
  if (!atualizado) {
    return `🤷 Não encontrei nenhum ganho de ${formatarMoeda(antigo)} nesta semana para editar.`;
  }
  return respostaEdicao(antigo, novo, atualizado);
}

// Edita um ganho de uma data específica.
function editarPorData(dataStr, antigo, novo) {
  const atualizado = db.editarGanhoDia(dataStr, antigo, novo);
  if (!atualizado) {
    return `🤷 Não encontrei nenhum ganho de ${formatarMoeda(antigo)} em ${formatarDataBR(dataStr)} para editar.`;
  }
  return respostaEdicao(antigo, novo, atualizado);
}

function respostaEdicao(antigo, novo, registro) {
  const semana = registro.semana;
  const meta = db.getMeta(semana);
  const total = db.getTotalSemana(semana);
  const [inicio, fim] = semana.split('_');
  const periodo = `${formatarDataBR(inicio).slice(0, 5)} a ${formatarDataBR(fim).slice(0, 5)}`;

  let resposta = `✏️ *Ganho corrigido!*\n`;
  resposta += `${formatarMoeda(antigo)} → *${formatarMoeda(novo)}*\n`;
  resposta += `_(em ${nomeDiaSemana(registro.data)}, ${formatarDataBR(registro.data)})_\n\n`;

  if (meta !== null) {
    const falta = Math.max(meta - total, 0);
    const pct = meta > 0 ? Math.min((total / meta) * 100, 100).toFixed(1) : '0';
    resposta += `📊 *Semana ${periodo}*\n`;
    resposta += `🎯 Meta: ${formatarMoeda(meta)}\n`;
    resposta += `${barraProgresso(total, meta)}\n`;
    resposta += `Acumulado: ${formatarMoeda(total)} (${pct}%)\n`;
    resposta += total >= meta
      ? `🎉 Meta atingida!`
      : `⏳ Falta: *${formatarMoeda(falta)}* para a meta`;
  } else {
    resposta += `📊 Total da semana (${periodo}): *${formatarMoeda(total)}*`;
  }
  return resposta;
}

function registrarRetroativo(valor, dataStr) {
  if (dataStr > db.getDataHoje()) {
    return '⚠️ Não dá para lançar um ganho em data futura.';
  }

  db.registrarGanho(valor, dataStr);

  const semana = db.getSemanaDeData(dataStr);
  const meta = db.getMeta(semana);
  const total = db.getTotalSemana(semana);
  const [inicio, fim] = semana.split('_');
  const periodo = `${formatarDataBR(inicio).slice(0, 5)} a ${formatarDataBR(fim).slice(0, 5)}`;

  let resposta = `✅ *Ganho lançado em ${nomeDiaSemana(dataStr)}, ${formatarDataBR(dataStr)}*\n`;
  resposta += `💰 Valor: ${formatarMoeda(valor)}\n\n`;

  if (meta !== null) {
    const falta = Math.max(meta - total, 0);
    const pct = meta > 0 ? Math.min((total / meta) * 100, 100).toFixed(1) : '0';
    resposta += `📊 *Semana ${periodo}*\n`;
    resposta += `🎯 Meta: ${formatarMoeda(meta)}\n`;
    resposta += `${barraProgresso(total, meta)}\n`;
    resposta += `Acumulado: ${formatarMoeda(total)} (${pct}%)\n`;
    resposta += total >= meta
      ? `🎉 Meta atingida!`
      : `⏳ Falta: *${formatarMoeda(falta)}* para a meta`;
  } else {
    resposta += `📊 Total da semana (${periodo}): *${formatarMoeda(total)}*\n`;
    resposta += `_(essa semana não tem meta definida)_`;
  }

  return resposta;
}

function desfazerUltimo() {
  const semana = db.getSemanaAtual();
  const removido = db.removerUltimoGanho(semana);
  if (!removido) {
    return '🤷 Não há nenhum ganho registrado nesta semana para desfazer.';
  }

  const meta = db.getMeta(semana);
  const total = db.getTotalSemana(semana);

  let resposta = `↩️ *Ganho removido:* ${formatarMoeda(removido.valor)}\n`;
  resposta += `_(registrado em ${formatarDataBR(removido.data)})_\n\n`;
  if (meta !== null) {
    const falta = Math.max(meta - total, 0);
    const percentual = meta > 0 ? Math.min((total / meta) * 100, 100).toFixed(1) : '0';
    resposta += `📊 *Meta da Semana:* ${formatarMoeda(meta)}\n`;
    resposta += `${barraProgresso(total, meta)}\n`;
    resposta += `Acumulado: ${formatarMoeda(total)} (${percentual}%)\n`;
    if (total < meta) {
      resposta += `⏳ Falta: *${formatarMoeda(falta)}* para a meta`;
      resposta += linhaPorDia(falta);
    } else {
      resposta += `🎉 Meta ainda atingida!`;
    }
  } else {
    resposta += `Acumulado da semana: ${formatarMoeda(total)}`;
  }
  return resposta;
}

function responderHistorico() {
  const semanas = db.getHistoricoSemanas(6);
  if (semanas.length === 0) {
    return '📭 Ainda não há histórico de semanas registrado.';
  }

  let resposta = `📜 *Histórico (últimas semanas)*\n`;
  for (const s of semanas) {
    const [inicio, fim] = s.semana.split('_');
    const periodo = `${formatarDataBR(inicio).slice(0, 5)} a ${formatarDataBR(fim).slice(0, 5)}`;
    if (s.meta === null) {
      resposta += `\n🗓️ ${periodo}\n   Total: ${formatarMoeda(s.total)} _(sem meta)_`;
    } else {
      const bateu = s.total >= s.meta;
      const icone = bateu ? '✅' : '❌';
      const pct = s.meta > 0 ? Math.round((s.total / s.meta) * 100) : 0;
      resposta += `\n${icone} ${periodo}\n   ${formatarMoeda(s.total)} / ${formatarMoeda(s.meta)} (${pct}%)`;
    }
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

  // Detalhe por dia
  const porDia = {};
  for (const g of db.getGanhosSemana(semana)) {
    porDia[g.data] = (porDia[g.data] || 0) + g.valor;
  }
  const dias = Object.keys(porDia).sort();
  if (dias.length > 0) {
    resposta += `\n📆 *Por dia:*\n`;
    for (const d of dias) {
      resposta += `• ${nomeDiaSemana(d)} ${formatarDataBR(d).slice(0, 5)}: ${formatarMoeda(porDia[d])}\n`;
    }
  }

  if (atingiu) {
    resposta += `\n🎉 *Meta atingida!* Excedente: ${formatarMoeda(total - meta)}`;
  } else {
    resposta += `\n⏳ Falta: *${formatarMoeda(falta)}* para atingir a meta`;
    resposta += linhaPorDia(falta);
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

*Vários de uma vez:*
\`150 200 300\` — registra três ganhos de hoje numa mensagem

*Lançar em dia passado:*
\`ontem 150\` · \`anteontem 200\` · \`15/06 300\` · \`15/06/2026 300\`

*Corrigir um valor errado:*
\`editar 150 para 200\` · \`15/06 editar 150 para 200\`

*Consultas:*
📊 \`/semana\` — Resumo da semana (com detalhe por dia)
📅 \`/mes\` — Total do mês atual
📅 \`/mes janeiro\` — Total de um mês específico
📜 \`/historico\` — Últimas semanas: meta vs. realizado

*Gerenciar:*
🎯 \`/meta\` — Definir/alterar a meta da semana atual
↩️ \`/desfazer\` — Remove o último ganho registrado

_A semana vai de segunda a domingo (horário de São Paulo)._

❓ \`/help\` — Mostra esta mensagem`;

module.exports = { processarMensagem };
