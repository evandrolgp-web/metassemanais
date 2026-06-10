const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'ganhos.json');

function lerDados() {
  if (!fs.existsSync(DB_PATH)) {
    const vazio = { ganhos: [] };
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(vazio, null, 2));
    return vazio;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function salvarDados(dados) {
  fs.writeFileSync(DB_PATH, JSON.stringify(dados, null, 2));
}

function registrarGanho(valor, data) {
  const d = data ? new Date(data + 'T12:00:00') : new Date();
  const dados = lerDados();
  dados.ganhos.push({
    id: Date.now(),
    valor,
    data: formatarData(d),
    semana: getSemanaStr(d),
    mes: getMesStr(d),
    ano: d.getFullYear(),
    criado_em: new Date().toISOString(),
  });
  salvarDados(dados);
}

function getTotalSemana(semana) {
  const { ganhos } = lerDados();
  return ganhos.filter(g => g.semana === semana).reduce((s, g) => s + g.valor, 0);
}

function getTotalMesAtual() {
  const mes = getMesStr(new Date());
  const { ganhos } = lerDados();
  return ganhos.filter(g => g.mes === mes).reduce((s, g) => s + g.valor, 0);
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
  const { ganhos } = lerDados();
  const total = ganhos.filter(g => g.mes === mes).reduce((s, g) => s + g.valor, 0);
  return { total, mes };
}

function getGanhosDia(data) {
  const { ganhos } = lerDados();
  return ganhos.filter(g => g.data === data);
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
  registrarGanho,
  getTotalSemana,
  getTotalMesAtual,
  getTotalMesPorNome,
  getGanhosDia,
  getSemanaAtual,
  getMesAtual,
  formatarData,
};
