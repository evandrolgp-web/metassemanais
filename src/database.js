const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'ganhos.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    init();
  }
  return db;
}

function init() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS ganhos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      valor REAL NOT NULL,
      data TEXT NOT NULL,
      semana TEXT NOT NULL,
      mes TEXT NOT NULL,
      ano INTEGER NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);
}

function registrarGanho(valor, data) {
  const d = data ? new Date(data + 'T12:00:00') : new Date();
  const dataStr = formatarData(d);
  const semana = getSemanaStr(d);
  const mes = getMesStr(d);
  const ano = d.getFullYear();

  const stmt = getDb().prepare(
    'INSERT INTO ganhos (valor, data, semana, mes, ano) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(valor, dataStr, semana, mes, ano);
}

function getTotalSemana(semana) {
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(valor), 0) as total FROM ganhos WHERE semana = ?')
    .get(semana);
  return row.total;
}

function getTotalMesAtual() {
  const d = new Date();
  const mes = getMesStr(d);
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(valor), 0) as total FROM ganhos WHERE mes = ?')
    .get(mes);
  return row.total;
}

function getTotalMesPorNome(nomeMes) {
  const meses = {
    janeiro: '01', fevereiro: '02', marco: '03', março: '03',
    abril: '04', maio: '05', junho: '06', julho: '07',
    agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12'
  };
  const num = meses[nomeMes.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
  if (!num) return null;

  const ano = new Date().getFullYear();
  const mes = `${ano}-${num}`;
  const row = getDb()
    .prepare('SELECT COALESCE(SUM(valor), 0) as total FROM ganhos WHERE mes = ?')
    .get(mes);
  return { total: row.total, mes };
}

function getGanhosDia(data) {
  const rows = getDb()
    .prepare('SELECT valor FROM ganhos WHERE data = ? ORDER BY criado_em')
    .all(data);
  return rows;
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
  const diaSemana = dia.getDay(); // 0=dom
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana; // segunda como início
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
