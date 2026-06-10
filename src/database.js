const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DB_PATH = path.join(__dirname, '..', 'data', 'ganhos.json');

// Dados mantidos em memória; persistidos em um GitHub Gist (se configurado)
// e em arquivo local como cache. O Gist sobrevive a deploys/reinícios do
// Render, o arquivo local não.
let dados = { ganhos: [] };
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

async function carregar() {
  const cfg = gistConfig();
  if (cfg) {
    try {
      const resp = await axios.get(cfg.url, { headers: cfg.headers });
      const arquivo = resp.data.files['ganhos.json'];
      const conteudo = arquivo ? JSON.parse(arquivo.content) : null;
      dados = conteudo && Array.isArray(conteudo.ganhos) ? conteudo : { ganhos: [] };
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
    dados = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    dados = { ganhos: [] };
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

function registrarGanho(valor, data) {
  const d = data ? new Date(data + 'T12:00:00') : new Date();
  dados.ganhos.push({
    id: Date.now(),
    valor,
    data: formatarData(d),
    semana: getSemanaStr(d),
    mes: getMesStr(d),
    ano: d.getFullYear(),
    criado_em: new Date().toISOString(),
  });
  salvar();
}

function getTotalSemana(semana) {
  return dados.ganhos.filter(g => g.semana === semana).reduce((s, g) => s + g.valor, 0);
}

function getTotalMesAtual() {
  const mes = getMesStr(new Date());
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

  const ano = new Date().getFullYear();
  const mes = `${ano}-${num}`;
  const total = dados.ganhos.filter(g => g.mes === mes).reduce((s, g) => s + g.valor, 0);
  return { total, mes };
}

function getGanhosDia(data) {
  return dados.ganhos.filter(g => g.data === data);
}

function getSemanaAtual() {
  return getSemanaStr(new Date());
}

function getMesAtual() {
  return getMesStr(new Date());
}

// ---- helpers ----

function formatarData(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getSemanaStr(d) {
  const inicio = getInicioDaSemana(d);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);
  return `${formatarData(inicio)}_${formatarData(fim)}`;
}

function getMesStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getInicioDaSemana(d) {
  const dia = new Date(d);
  const diaSemana = dia.getDay();
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
  dia.setDate(dia.getDate() + diff);
  dia.setHours(0, 0, 0, 0);
  return dia;
}

module.exports = {
  carregar,
  registrarGanho,
  getTotalSemana,
  getTotalMesAtual,
  getTotalMesPorNome,
  getGanhosDia,
  getSemanaAtual,
  getMesAtual,
  formatarData,
};
