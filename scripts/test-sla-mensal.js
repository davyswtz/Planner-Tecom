/* eslint-disable no-console */
/**
 * Teste de sanidade do SLA mensal (rompimentos) conforme lógica do dashboard (`src/js/dashboard-planner.js`).
 *
 * Como o código do app não é um módulo Node, este arquivo replica a lógica crítica
 * (classify + summarizeMonth) para validar resultados esperados.
 *
 * Execução:
 *   node scripts/test-sla-mensal.js
 */

'use strict';

const doneStatuses = new Set(['Concluída', 'Finalizada', 'Finalizado']);

const okYmd = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !String(d || '').startsWith('0000');
const monthKey = (ymd) => String(ymd || '').slice(0, 7);

function addMonths(ym, delta) {
  const y = Number(String(ym).slice(0, 4));
  const m = Number(String(ym).slice(5, 7));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ym;
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}

function classify(task, todayIso) {
  const prazo = String(task?.prazo || '').slice(0, 10);
  const st = String(task?.status || '').trim();
  const isDone = doneStatuses.has(st);

  let endDay = '';
  if (isDone) {
    const hist = Array.isArray(task?.historico) ? task.historico : [];
    const end = [...hist].reverse().find(h => doneStatuses.has(String(h?.status || '').trim()) && h?.timestamp)?.timestamp;
    endDay = end ? String(end).slice(0, 10) : '';
  }

  if (isDone) {
    if (endDay && endDay > prazo) return 'violado';
    return 'noPrazo';
  }
  if (todayIso > prazo) return 'violado';

  const daysLeft = Math.floor((Date.parse(prazo) - Date.parse(todayIso)) / 86400000);
  if (Number.isFinite(daysLeft) && daysLeft <= 2) return 'emRisco';
  return 'noPrazo';
}

function summarizeMonth(tasks, ym, todayIso) {
  const base = tasks.filter(t => okYmd(String(t?.prazo || '').slice(0, 10)) && monthKey(String(t?.prazo || '').slice(0, 10)) === ym);
  const s = { total: base.length, noPrazo: 0, emRisco: 0, violado: 0 };
  base.forEach((t) => {
    const k = classify(t, todayIso);
    s[k] += 1;
  });
  const geral = s.total ? (100 * s.noPrazo) / s.total : 0;
  return { ...s, geral };
}

function assertEq(label, actual, expected) {
  const ok = Object.is(actual, expected);
  if (!ok) {
    console.error(`[FAIL] ${label}: esperado=${expected} atual=${actual}`);
    process.exitCode = 1;
  } else {
    console.log(`[OK]   ${label}: ${actual}`);
  }
}

function assertNear(label, actual, expected, eps = 1e-9) {
  const ok = Math.abs(actual - expected) <= eps;
  if (!ok) {
    console.error(`[FAIL] ${label}: esperado≈${expected} atual=${actual}`);
    process.exitCode = 1;
  } else {
    console.log(`[OK]   ${label}: ${actual.toFixed(6)}`);
  }
}

function buildTask({ prazo, status, historico }) {
  return {
    categoria: 'rompimentos',
    prazo,
    status,
    historico: historico || [],
  };
}

function run() {
  // Fixamos "hoje" para tornar o teste determinístico.
  const todayIso = '2026-05-06';
  const curYm = monthKey(todayIso); // 2026-05
  const prevYm = addMonths(curYm, -1); // 2026-04

  // Cenário mês corrente:
  // - 1 aberta dentro do prazo (noPrazo)
  // - 1 aberta a vencer em 2 dias (emRisco)
  // - 1 aberta atrasada (violado)
  // - 1 concluída antes do prazo (noPrazo)
  // - 1 concluída depois do prazo (violado) — usa histórico
  const tasks = [
    buildTask({ prazo: '2026-05-10', status: 'Em andamento' }), // noPrazo
    buildTask({ prazo: '2026-05-08', status: 'Criada' }), // emRisco (faltam 2 dias)
    buildTask({ prazo: '2026-05-01', status: 'Em andamento' }), // violado (hoje > prazo)
    buildTask({
      prazo: '2026-05-20',
      status: 'Concluída',
      historico: [
        { status: 'Em andamento', timestamp: '2026-05-03T10:00:00.000Z', autor: 'x' },
        { status: 'Concluída', timestamp: '2026-05-05T10:00:00.000Z', autor: 'x' },
      ],
    }), // noPrazo
    buildTask({
      prazo: '2026-05-04',
      status: 'Finalizada',
      historico: [
        { status: 'Em andamento', timestamp: '2026-05-01T10:00:00.000Z', autor: 'x' },
        { status: 'Finalizada', timestamp: '2026-05-06T10:00:00.000Z', autor: 'x' },
      ],
    }), // violado (endDay 2026-05-06 > 2026-05-04)
  ];

  // Cenário mês anterior:
  // - 2 noPrazo, 1 violado => SLA 66.666...
  const tasksPrev = [
    buildTask({ prazo: '2026-04-15', status: 'Concluída', historico: [{ status: 'Concluída', timestamp: '2026-04-15T01:00:00Z', autor: 'x' }] }),
    buildTask({ prazo: '2026-04-20', status: 'Finalizada', historico: [{ status: 'Finalizada', timestamp: '2026-04-19T01:00:00Z', autor: 'x' }] }),
    buildTask({ prazo: '2026-04-10', status: 'Em andamento' }), // violado em relação a 2026-05-06
  ];

  const all = tasks.concat(tasksPrev);
  const cur = summarizeMonth(all, curYm, todayIso);
  const prev = summarizeMonth(all, prevYm, todayIso);

  assertEq('cur.total', cur.total, 5);
  assertEq('cur.noPrazo', cur.noPrazo, 2);
  assertEq('cur.emRisco', cur.emRisco, 1);
  assertEq('cur.violado', cur.violado, 2);
  assertNear('cur.geral', cur.geral, 40); // 2/5 = 40%

  assertEq('prev.total', prev.total, 3);
  assertEq('prev.noPrazo', prev.noPrazo, 2);
  assertEq('prev.violado', prev.violado, 1);
  assertNear('prev.geral', prev.geral, 66.66666666666667);

  const delta = prev.total ? (cur.geral - prev.geral) : 0;
  assertNear('delta(cur-prev)', delta, 40 - 66.66666666666667);
}

run();

