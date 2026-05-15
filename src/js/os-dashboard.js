/**
 * Dashboard — Ordens de Serviço por técnico
 */
(function (global) {
  const DONE = new Set(['concluída', 'concluida', 'finalizada', 'finalizado']);
  const PROGRESS = new Set([
    'em andamento', 'validação', 'validacao', 'envio pendente',
    'necessário adequação', 'necessario adequação', 'necessario adequacao', 'necessário adequacao',
  ]);
  const CAT_LABELS = {
    'atendimento-cliente': 'Atendimento',
    rompimentos: 'Rompimentos',
    'troca-poste': 'Troca de poste',
    'otimizacao-rede': 'Otimização de rede',
    'certificacao-cemig': 'Certificação Cemig',
    'qualidade-potencia': 'Qualidade de potência',
    'manutencao-corretiva': 'Manutenção corretiva',
  };

  const STATE = {
    bound: false,
    tecnico: '',
    categoria: '',
    regiao: '',
    status: '',
    periodo: 'mes',
    dateMode: 'criacao',
    dateFrom: '',
    dateTo: '',
    busca: '',
  };

  const esc = (s) => (typeof Utils !== 'undefined' && Utils.escapeHtml ? Utils.escapeHtml(s) : String(s ?? ''));
  const fmtDate = (iso) => (iso && Utils.formatDate ? Utils.formatDate(iso) : (iso || '—'));
  const today = () => (Utils.todayIso ? Utils.todayIso() : new Date().toISOString().slice(0, 10));
  const catLabel = (c) => CAT_LABELS[String(c || '').trim()] || String(c || '—');
  const normSt = (s) => String(s ?? '').trim().toLowerCase();
  const isDone = (s) => DONE.has(normSt(s));
  const isProg = (s) => PROGRESS.has(normSt(s));

  function completionDay(task) {
    const hist = Array.isArray(task?.historico) ? task.historico : [];
    for (let i = hist.length - 1; i >= 0; i--) {
      if (DONE.has(normSt(hist[i]?.status))) return String(hist[i].timestamp || '').slice(0, 10);
    }
    return '';
  }

  function osTasks() {
    return (Store.getOpTasks?.() || []).filter((t) => t && Number(t.parentTaskId));
  }

  function techOptions(tasks) {
    const map = new Map();
    ['GOVAL', 'VALE_DO_ACO', 'CARATINGA', ''].forEach((rk) => {
      if (typeof getTechDirectory === 'function') {
        getTechDirectory(rk).forEach((t) => { if (t?.name) map.set(normalizeTechName(t.name), t.name); });
      }
    });
    tasks.forEach((task) => {
      parseResponsaveis?.(task.responsavel)?.forEach((n) => {
        if (isPlaceholderTechName?.(n)) return;
        map.set(normalizeTechName(n), n);
      });
    });
    return [...map.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  function expandRows(tasks) {
    const out = [];
    tasks.forEach((task) => {
      let techs = parseResponsaveis?.(task.responsavel)?.filter((n) => !isPlaceholderTechName?.(n)) || [];
      if (!techs.length) techs = ['—'];
      const criada = String(task.criadaEm || '').slice(0, 10);
      const concl = completionDay(task);
      const ref = STATE.dateMode === 'conclusao' ? (concl || criada) : criada;
      techs.forEach((tecnico) => {
        out.push({
          task, tecnico, criada, concl, ref,
          categoria: String(task.categoria || '').trim(),
          regiao: String(task.regiao || '').trim(),
          status: String(task.status || '').trim(),
          os: String(task.ordemServico || '').trim(),
          titulo: String(task.titulo || '').trim(),
          protocolo: String(task.protocolo || '').trim(),
          code: String(task.taskCode || '').trim(),
          done: isDone(task.status),
          prog: isProg(task.status),
        });
      });
    });
    return out;
  }

  function periodBounds(p) {
    const t = today();
    const [y, m, d] = t.split('-').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    if (p === 'hoje') return { start: t, end: t };
    if (p === 'semana') {
      const dt = new Date(y, m - 1, d);
      const diff = (dt.getDay() === 0 ? 6 : dt.getDay() - 1);
      dt.setDate(dt.getDate() - diff);
      return { start: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, end: t };
    }
    if (p === 'mes') return { start: `${y}-${pad(m)}-01`, end: t };
    if (p === 'ano') return { start: `${y}-01-01`, end: t };
    if (p === 'custom') return { start: STATE.dateFrom || '0000-01-01', end: STATE.dateTo || '9999-12-31' };
    if (p === 'todos') return { start: '0000-01-01', end: '9999-12-31' };
    return { start: '0000-01-01', end: '9999-12-31' };
  }

  function inRange(day, start, end) {
    return day && day.length >= 10 && day >= start && day <= end;
  }

  function filterRows(rows) {
    const { start, end } = periodBounds(STATE.periodo);
    const q = STATE.busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (STATE.tecnico && r.tecnico !== STATE.tecnico) return false;
      if (STATE.categoria && r.categoria !== STATE.categoria) return false;
      if (STATE.regiao && r.regiao !== STATE.regiao) return false;
      if (STATE.status === 'concluida' && !r.done) return false;
      if (STATE.status === 'andamento' && !r.prog) return false;
      if (STATE.status === 'pendente' && (r.done || r.prog)) return false;
      if (!inRange(r.ref, start, end)) return false;
      if (q) {
        const blob = [r.os, r.titulo, r.protocolo, r.code, r.tecnico, catLabel(r.categoria)].join(' ').toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }

  function uniqueOs(rows) {
    const ids = new Set();
    rows.forEach((r) => ids.add(Number(r.task.id)));
    return ids.size;
  }

  function byTech(rows) {
    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.tecnico)) map.set(r.tecnico, { tecnico: r.tecnico, total: 0, concl: 0, prog: 0, ids: new Set() });
      const a = map.get(r.tecnico);
      if (!a.ids.has(r.task.id)) {
        a.ids.add(r.task.id);
        a.total++;
        if (r.done) a.concl++;
        if (r.prog) a.prog++;
      }
    });
    return [...map.values()]
      .map((a) => ({ tecnico: a.tecnico, total: a.total, concluidas: a.concl, andamento: a.prog, taxa: a.total ? Math.round((a.concl / a.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);
  }

  function byDay(rows) {
    const map = new Map();
    rows.forEach((r) => {
      if (!r.ref) return;
      if (!map.has(r.ref)) map.set(r.ref, new Set());
      map.get(r.ref).add(r.task.id);
    });
    return [...map.entries()].map(([day, ids]) => ({ day, count: ids.size })).sort((a, b) => a.day.localeCompare(b.day));
  }

  function byCategory(rows) {
    const map = new Map();
    rows.forEach((r) => {
      if (!map.has(r.categoria)) map.set(r.categoria, new Set());
      map.get(r.categoria).add(r.task.id);
    });
    return [...map.entries()]
      .map(([cat, ids]) => ({ cat, count: ids.size, label: catLabel(cat) }))
      .sort((a, b) => b.count - a.count);
  }

  function kpis(filtered, all) {
    const t = today();
    const [y, m] = t.split('-');
    const w = periodBounds('semana');
    const base = STATE.tecnico ? all.filter((r) => r.tecnico === STATE.tecnico) : all;
    const count = (subset, s, e) => {
      const ids = new Set();
      subset.forEach((r) => { if (inRange(r.ref, s, e)) ids.add(r.task.id); });
      return ids.size;
    };
    return {
      filtrado: uniqueOs(filtered),
      hoje: count(base, t, t),
      semana: count(base, w.start, w.end),
      mes: count(base, `${y}-${m}-01`, t),
      ano: count(base, `${y}-01-01`, t),
      total: uniqueOs(base),
      concluidas: uniqueOs(filtered.filter((r) => r.done)),
      andamento: uniqueOs(filtered.filter((r) => r.prog)),
    };
  }

  function syncFiltersUi(tasks) {
    const techSel = document.getElementById('osdFiltroTecnico');
    const catSel = document.getElementById('osdFiltroCategoria');
    const regSel = document.getElementById('osdFiltroRegiao');
    const techs = techOptions(tasks);
    if (techSel) {
      const cur = STATE.tecnico;
      techSel.innerHTML = '<option value="">Todos os técnicos</option>' + techs.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
      techSel.value = techs.includes(cur) ? cur : '';
      STATE.tecnico = techSel.value;
    }
    if (catSel) {
      const cats = [...new Set(tasks.map((t) => String(t.categoria || '').trim()).filter(Boolean))].sort();
      catSel.innerHTML = '<option value="">Todas as categorias</option>' + cats.map((c) => `<option value="${esc(c)}">${esc(catLabel(c))}</option>`).join('');
      catSel.value = STATE.categoria;
    }
    if (regSel) {
      const regs = [...new Set(tasks.map((t) => String(t.regiao || '').trim()).filter(Boolean))].sort();
      regSel.innerHTML = '<option value="">Todas as regiões</option>' + regs.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
      regSel.value = STATE.regiao;
    }
    const custom = document.getElementById('osdCustomDates');
    if (custom) custom.hidden = STATE.periodo !== 'custom';
  }

  function readFiltersFromDom() {
    STATE.tecnico = document.getElementById('osdFiltroTecnico')?.value || '';
    STATE.categoria = document.getElementById('osdFiltroCategoria')?.value || '';
    STATE.regiao = document.getElementById('osdFiltroRegiao')?.value || '';
    STATE.status = document.getElementById('osdFiltroStatus')?.value || '';
    STATE.periodo = document.getElementById('osdFiltroPeriodo')?.value || 'mes';
    STATE.dateMode = document.getElementById('osdFiltroDateMode')?.value || 'criacao';
    STATE.dateFrom = document.getElementById('osdFiltroDe')?.value || '';
    STATE.dateTo = document.getElementById('osdFiltroAte')?.value || '';
    STATE.busca = document.getElementById('osdFiltroBusca')?.value || '';
  }

  function render() {
    const root = document.getElementById('osdRoot');
    if (!root) return;
    readFiltersFromDom();
    const tasks = osTasks();
    syncFiltersUi(tasks);
    const allRows = expandRows(tasks);
    const rows = filterRows(allRows);
    const k = kpis(rows, allRows);
    const rank = byTech(rows);
    const days = byDay(rows);
    const cats = byCategory(rows);

    const kpiEl = document.getElementById('osdKpiGrid');
    if (kpiEl) {
      const cards = [
        ['No filtro', k.filtrado, 'OS no período atual'],
        ['Hoje', k.hoje, STATE.tecnico || 'Todos'],
        ['Semana', k.semana, 'Seg–hoje'],
        ['Mês', k.mes, 'Mês atual'],
        ['Ano', k.ano, 'Ano atual'],
        ['Total geral', k.total, 'Histórico'],
        ['Concluídas', k.concluidas, 'No filtro', 'ok'],
        ['Em andamento', k.andamento, 'No filtro', 'warn'],
      ];
      kpiEl.innerHTML = cards.map(([label, val, hint, acc]) =>
        `<article class="osd-kpi${acc ? ` osd-kpi--${acc}` : ''}"><span class="osd-kpi-l">${esc(label)}</span><strong class="osd-kpi-v">${esc(val)}</strong><span class="osd-kpi-h">${esc(hint)}</span></article>`,
      ).join('');
    }

    const rankEl = document.getElementById('osdTechRank');
    if (rankEl) {
      if (!rank.length) rankEl.innerHTML = '<p class="osd-empty">Sem dados.</p>';
      else {
        const max = Math.max(...rank.map((x) => x.total), 1);
        rankEl.innerHTML = rank.map((row, i) =>
          `<button type="button" class="osd-rank${STATE.tecnico === row.tecnico ? ' is-on' : ''}" data-tech="${esc(row.tecnico)}">
            <span class="osd-rank-i">${i + 1}</span>
            <span class="osd-rank-n">${esc(row.tecnico)}</span>
            <span class="osd-rank-bar"><i style="width:${Math.round((row.total / max) * 100)}%"></i></span>
            <span class="osd-rank-c">${row.total}</span>
            <span class="osd-rank-m">${row.concluidas} conc. · ${row.taxa}%</span>
          </button>`,
        ).join('');
      }
    }

    const catEl = document.getElementById('osdCatBars');
    if (catEl) {
      if (!cats.length) catEl.innerHTML = '<p class="osd-empty">—</p>';
      else {
        const max = Math.max(...cats.map((x) => x.count), 1);
        catEl.innerHTML = cats.slice(0, 8).map((row) =>
          `<div class="osd-cat"><span>${esc(row.label)}</span><span class="osd-cat-bar"><i style="width:${Math.round((row.count / max) * 100)}%"></i></span><b>${row.count}</b></div>`,
        ).join('').replace(/<\/?motion/g, (x) => x.replace('motion', 'div'));
      }
    }

    const chartEl = document.getElementById('osdDayChart');
    if (chartEl) {
      const slice = days.slice(-14);
      if (!slice.length) chartEl.innerHTML = '<p class="osd-empty">Sem série diária.</p>';
      else {
        const max = Math.max(...slice.map((x) => x.count), 1);
        chartEl.innerHTML = `<div class="osd-chart">${slice.map((d) =>
          `<div class="osd-chart-col" title="${esc(fmtDate(d.day))}: ${d.count} OS">
            <div class="osd-chart-bar" style="height:${Math.max(8, Math.round((d.count / max) * 100))}%"></div>
            <span class="osd-chart-lbl">${esc(d.day.slice(8, 10))}/${esc(d.day.slice(5, 7))}</span>
          </div>`,
        ).join('')}`;
      }
    }

    const tableEl = document.getElementById('osdTableBody');
    const countEl = document.getElementById('osdTableCount');
    if (countEl) countEl.textContent = `${uniqueOs(rows)} OS · ${rows.length} linha(s) técnico`;
    if (tableEl) {
      const seen = new Set();
      const list = [];
      rows.forEach((r) => {
        const key = `${r.task.id}|${r.tecnico}`;
        if (seen.has(key)) return;
        seen.add(key);
        list.push(r);
      });
      list.sort((a, b) => (b.ref || '').localeCompare(a.ref || '') || a.tecnico.localeCompare(b.tecnico));
      if (!list.length) {
        tableEl.innerHTML = '<tr><td colspan="8" class="osd-empty-cell">Nenhuma OS encontrada com os filtros atuais.</td></tr>';
      } else {
        tableEl.innerHTML = list.slice(0, 500).map((r) => {
          const stClass = r.done ? 'osd-st--ok' : (r.prog ? 'osd-st--prog' : 'osd-st--pend');
          return `<tr>
            <td>${esc(r.tecnico)}</td>
            <td><span class="osd-os">${esc(r.os || r.titulo || '—')}</span></td>
            <td>${esc(catLabel(r.categoria))}</td>
            <td>${esc(r.regiao || '—')}</td>
            <td><span class="osd-st ${stClass}">${esc(r.status)}</span></td>
            <td>${esc(fmtDate(r.criada))}</td>
            <td>${esc(r.concl ? fmtDate(r.concl) : '—')}</td>
            <td class="osd-mono">${esc(r.code || '—')}</td>
          </tr>`;
        }).join('');
        if (list.length > 500) {
          tableEl.innerHTML += `<tr><td colspan="8" class="osd-empty-cell">+ ${list.length - 500} registros ocultos — refine os filtros.</td></tr>`;
        }
      }
    }

    const upd = document.getElementById('osdUpdatedAt');
    if (upd) {
      const now = new Date();
      upd.textContent = `Atualizado ${now.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${tasks.length} OS no sistema`;
    }
  }

  function bindOnce() {
    if (STATE.bound) return;
    STATE.bound = true;
    const root = document.getElementById('osdRoot');
    if (!root) return;

    root.addEventListener('change', (e) => {
      if (!e.target.closest('.osd-filters')) return;
      if (e.target.id === 'osdFiltroPeriodo') {
        const custom = document.getElementById('osdCustomDates');
        if (custom) custom.hidden = e.target.value !== 'custom';
      }
      render();
    });
    root.addEventListener('input', (e) => {
      if (e.target.id === 'osdFiltroBusca') render();
    });
    document.getElementById('osdBtnAtualizar')?.addEventListener('click', () => render());
    document.getElementById('osdBtnLimpar')?.addEventListener('click', () => {
      STATE.tecnico = '';
      STATE.categoria = '';
      STATE.regiao = '';
      STATE.status = '';
      STATE.periodo = 'mes';
      STATE.dateMode = 'criacao';
      STATE.dateFrom = '';
      STATE.dateTo = '';
      STATE.busca = '';
      const ids = ['osdFiltroTecnico', 'osdFiltroCategoria', 'osdFiltroRegiao', 'osdFiltroStatus', 'osdFiltroPeriodo', 'osdFiltroDateMode', 'osdFiltroDe', 'osdFiltroAte', 'osdFiltroBusca'];
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'SELECT') {
          if (id === 'osdFiltroPeriodo') el.value = 'mes';
          else if (id === 'osdFiltroDateMode') el.value = 'criacao';
          else el.value = '';
        } else el.value = '';
      });
      const custom = document.getElementById('osdCustomDates');
      if (custom) custom.hidden = true;
      render();
    });
    document.getElementById('osdTechRank')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tech]');
      if (!btn) return;
      const name = btn.getAttribute('data-tech') || '';
      const sel = document.getElementById('osdFiltroTecnico');
      if (sel) sel.value = STATE.tecnico === name ? '' : name;
      render();
    });
    document.getElementById('osdBtnExport')?.addEventListener('click', () => {
      readFiltersFromDom();
      const tasks = osTasks();
      const rows = filterRows(expandRows(tasks));
      const seen = new Set();
      const lines = ['Técnico;OS;Categoria;Região;Status;Criada;Concluída;Código'];
      rows.forEach((r) => {
        const key = `${r.task.id}|${r.tecnico}`;
        if (seen.has(key)) return;
        seen.add(key);
        lines.push([
          r.tecnico, r.os || r.titulo, catLabel(r.categoria), r.regiao, r.status,
          r.criada, r.concl || '', r.code,
        ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'));
      });
      const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ordens-servico-${today()}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      if (typeof ToastService !== 'undefined') ToastService.show('CSV exportado', 'success');
    });
  }

  function init() {
    bindOnce();
    const de = document.getElementById('osdFiltroDe');
    const ate = document.getElementById('osdFiltroAte');
    if (de && !de.value) de.value = today().slice(0, 8) + '01';
    if (ate && !ate.value) ate.value = today();
  }

  global.OsDashboard = { init, render };
})(window);
