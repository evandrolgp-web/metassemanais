const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DB_PATH = path.join(__dirname, '..', 'data', 'ganhos.json');
const TZ = 'America/Sao_Paulo';

// Estrutura:
// { ganhos: [...], metas: { "INICIO_FIM": valor }, estado: { "telefone": {...} } }
let dados = { ganhos: [], metas: {}, estado: {} };
let remotoOk = false;

function gistConfig() {
  const { GITHUB_TOKEN, GIST_ID } = process.env;
  if (!GITHUB_TOKEN || !GIST_ID) return null;
  return {
    url: `https://api.github.com/gists/${GIST_ID}`,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'metas-semanais-bot',
    },
  };
}

function normalizarEstrutura(obj) {
  return {
    ganhos: Array.isArray(obj?.ganhos) ? obj.ganhos : [],
    metas: obj && typeof obj.metas === 'object' ? obj.metas : {},
    estado: obj && typeof obj.estado === 'object' ? obj.estado : {},
  };
}

async function carregar() {
  const cfg = gistConfig();
  if (cfg) {
    try {
      const resp = await axios.get(cfg.url, { headers: cfg.headers });
      const arquivo = resp.data.files['ganhos.json'];
      dados = normalizarEstrutura(arquivo ? JSON.parse(arquivo.content) : null);
      remotoOk = true;
      console.log(`💾 Dados carregados do GitHub Gist (${dados.ganhos.length} registros)`);
      return;
    } catch (err) {
      console.error('⚠️ Falha ao carregar do Gist:', err.response?.data?.message || err.message);
      console.error('⚠️ Gravação remota desativada para não sobrescrever dados.');
    }
  } else {
    console.log('💾 Gist não configurado — usando só arquivo local (dados se perdem em deploys)');
  }

  try {
    dados = normalizarEstrutura(JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
  } catch {
    dados = { ganhos: [], metas: {}, estado: {} };
  }
}

function salvar() {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(dados, null, 2));
  } catch (err) {
    console.error('⚠️ Falha ao salvar arquivo local:', err.message);
  }

  const cfg = gistConfig();
  if (cfg && remotoOk) {
    axios
      .patch(
        cfg.url,
        { files: { 'ganhos.json': { content: JSON.stringify(dados, null, 2) } } },
        { headers: cfg.headers }
      )
      .then(() => console.log('💾 Dados salvos no Gist'))
      .catch((err) =>
        console.error('⚠️ Falha ao salvar no Gist:', err.response?.data?.message || err.message)
      );
  }
}

function resetar() {
  dados = { ganhos: [], metas: {}, estado: {} };
  salvar();
}

// ---- ganhos ----

function registrarGanho(valor) {
  const d = spHoje();
  dados.ganhos.push({
    id: Date.now(),
    valor,
    data: formatarData(d),
    semana: getSemanaStr(d),
    mes: getMesStr(d),
    ano: d.getUTCFullYear(),
    criado_em: new Date().toISOString(),
  });
  salvar();
}

function getTotalSemana(semana) {
  return dados.ganhos.filter(g => g.semana === semana).reduce((s, g) => s + g.valor, 0);
}

function getTotalMesAtual() {
  const mes = getMesStr(spHoje());
  return dados.ganhos.filter(g => g.mes === mes).reduce((s, g) => s + g.valor, 0);
}

function getTotalMesPorNome(nomeMes) {
  const meses = {
    janeiro: '01', fevereiro: '02', marco: '03', março: '03',
    abril: '04', maio: '05', junho: '06', julho: '07',
    agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
  };
  const normalizado = nomeMes.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const num = meses[normalizado];
  if (!num) return null;

  const ano = spHoje().getUTCFullYear();
  const mes = `${ano}-${num}`;
  const total = dados.ganhos.filter(g => g.mes === mes).reduce((s, g) => s + g.valor, 0);
  return { total, mes };
}

function getGanhosDia(data) {
  return dados.ganhos.filter(g => g.data === data);
}

function getGanhosSemana(semana) {
  return dados.ganhos.filter(g => g.semana === semana);
}

// Remove e retorna o último ganho registrado na semana informada.
// Retorna null se não houver nenhum ganho nessa semana.
function removerUltimoGanho(semana) {
  for (let i = dados.ganhos.length - 1; i >= 0; i--) {
    if (dados.ganhos[i].semana === semana) {
      const [removido] = dados.ganhos.splice(i, 1);
      salvar();
      return removido;
    }
  }
  return null;
}

// Retorna as últimas N semanas que têm meta definida ou algum ganho,
// da mais recente para a mais antiga, com total e meta de cada uma.
function getHistoricoSemanas(limite = 6) {
  const semanas = new Set([
    ...Object.keys(dados.metas),
    ...dados.ganhos.map(g => g.semana),
  ]);
  return [...semanas]
    .sort((a, b) => (a < b ? 1 : -1)) // mais recente primeiro (ordenação por data ISO)
    .slice(0, limite)
    .map(semana => ({
      semana,
      meta: getMeta(semana),
      total: getTotalSemana(semana),
    }));
}

// ---- metas por semana ----

function getMeta(semana) {
  const v = dados.metas[semana];
  return typeof v === 'number' ? v : null;
}

function setMeta(semana, valor) {
  dados.metas[semana] = valor;
  salvar();
}

// ---- estado da conversa (por telefone) ----

function getEstado(telefone) {
  return dados.estado[telefone] || null;
}

function setEstado(telefone, obj) {
  dados.estado[telefone] = obj;
  salvar();
}

function limparEstado(telefone) {
  delete dados.estado[telefone];
  salvar();
}

// ---- datas no fuso de São Paulo ----

// Retorna um Date "à meia-noite UTC" representando o dia-calendário atual
// em São Paulo. Usar métodos getUTC* nesse objeto dá os componentes corretos
// do dia em SP, independentemente do fuso do servidor (Render roda em UTC).
function spHoje() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = fmt.formatToParts(new Date());
  const get = (t) => +p.find(x => x.type === t).value;
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}

function formatarData(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getInicioDaSemana(d) {
  const dia = new Date(d);
  const dow = dia.getUTCDay(); // 0=domingo
  const diff = dow === 0 ? -6 : 1 - dow; // segunda como início
  dia.setUTCDate(dia.getUTCDate() + diff);
  return dia;
}

function getSemanaStr(d) {
  const inicio = getInicioDaSemana(d);
  const fim = new Date(inicio);
  fim.setUTCDate(fim.getUTCDate() + 6);
  return `${formatarData(inicio)}_${formatarData(fim)}`;
}

function getMesStr(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getSemanaAtual() {
  return getSemanaStr(spHoje());
}

function getMesAtual() {
  return getMesStr(spHoje());
}

function getDataHoje() {
  return formatarData(spHoje());
}

// Dias restantes na semana, incluindo hoje (semana de segunda a domingo).
// Segunda = 7 dias restantes; domingo = 1 dia restante.
function getDiasRestantesSemana() {
  const dow = spHoje().getUTCDay(); // 0=domingo
  const posicao = dow === 0 ? 7 : dow; // segunda=1 ... domingo=7
  return 8 - posicao;
}

module.exports = {
  carregar,
  resetar,
  registrarGanho,
  getTotalSemana,
  getTotalMesAtual,
  getTotalMesPorNome,
  getGanhosDia,
  getGanhosSemana,
  removerUltimoGanho,
  getHistoricoSemanas,
  getMeta,
  setMeta,
  getEstado,
  setEstado,
  limparEstado,
  getSemanaAtual,
  getMesAtual,
  getDataHoje,
  getDiasRestantesSemana,
};
