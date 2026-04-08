/** @typedef {{ id: number, titulo: string, responsavel: string, prazo: string, status: string, prioridade: string, assinadaPor?: string, assinadaEm?: string }} Task */
/** @typedef {'Criada'|'Backlog'|'A iniciar'|'Em andamento'|'Concluída'|'Finalizada'|'Cancelada'|'Agendado'|'Validação'|'Envio pendente'|'Necessário adequação'|'Finalizado'} OpStatus */
/** @typedef {{ status: OpStatus, timestamp: string, autor: string }} HistoryEntry */
/** @typedef {{ id: number, titulo: string, responsavel: string, responsavelChatId?: string, categoria: string, prazo: string, prioridade: string, descricao: string, status: OpStatus, historico: HistoryEntry[], criadaEm: string, assinadaPor?: string, assinadaEm?: string, protocolo?: string, dataEntrada?: string, subProcesso?: string, dataInstalacao?: string, ordemServico?: string, nomeCliente?: string }} OpTask */
/** @typedef {{ note: string }} PlannerConfig */

function normalizeTechName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getTechDirectory(regionKey = '') {
  const cfg = window.APP_CONFIG || {};
  const byRegion = cfg.techsByRegion && typeof cfg.techsByRegion === 'object' ? cfg.techsByRegion : {};
  const flat = Array.isArray(cfg.techs) ? cfg.techs : [];

  const fromRegion =
    regionKey && Array.isArray(byRegion[regionKey])
      ? byRegion[regionKey]
      : [];

  const merged = [...fromRegion, ...flat];
  return merged
    .filter(t => t && typeof t.name === 'string' && t.name.trim() && typeof t.chatUserId === 'string' && t.chatUserId.trim())
    .map(t => ({ name: t.name.trim(), chatUserId: t.chatUserId.trim(), key: normalizeTechName(t.name) }));
}

// Lista única de técnicos (config) para datalist do responsável.
function getAllTechsForOpSelect() {
  const cfg = window.APP_CONFIG || {};
  const byRegion = cfg.techsByRegion && typeof cfg.techsByRegion === 'object' ? cfg.techsByRegion : {};
  const flat = Array.isArray(cfg.techs) ? cfg.techs : [];
  const merged = [...flat];
  for (const arr of Object.values(byRegion)) {
    if (Array.isArray(arr)) merged.push(...arr);
  }
  const seen = new Set();
  const out = [];
  for (const t of merged) {
    if (!t || typeof t.name !== 'string' || !t.name.trim() || typeof t.chatUserId !== 'string' || !t.chatUserId.trim()) continue;
    const id = t.chatUserId.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ name: t.name.trim(), chatUserId: id, key: normalizeTechName(t.name) });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return out;
}

function getSignedUserName() {
  try {
    const raw = localStorage.getItem('planner.session.displayName.v1');
    const name = String(raw || '').trim();
    return name || 'Usuário';
  } catch {
    return 'Usuário';
  }
}

const SESSION_USER_KEY = 'planner.session.userKey.v1';
// Última rota do menu (sessionStorage).
const NAV_LAST_PAGE_KEY = 'planner.nav.lastPage.v1';
const CHAT_LAST_SEEN_ID_KEY = 'planner.chat.lastSeenId.v1';
const CHAT_MENTION_INBOX_KEY = 'planner.chat.mentionInbox.v1';
const CHAT_MENTION_HANDLED_IDS_KEY = 'planner.chat.mentionHandledIds.v1';
function getSessionUserKey() {
  try {
    return String(localStorage.getItem(SESSION_USER_KEY) || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

// Troca de appBuild limpa cache local (exceto sessão/tema).
const CLIENT_BUNDLE_STORAGE_KEY = 'planner.clientBundle.v1';
const DEPLOY_CACHE_KEEP_KEYS = new Set([
  'planner.session.v1',
  'planner.session.displayName.v1',
  'planner.session.userKey.v1',
  'planner.theme.v1',
]);

function applyDeployCacheReset() {
  const build = String((window.APP_CONFIG && window.APP_CONFIG.appBuild) || '').trim();
  if (!build || build === '0') return;
  try {
    let prev = '';
    try {
      prev = String(localStorage.getItem(CLIENT_BUNDLE_STORAGE_KEY) || '');
    } catch {}
    if (prev === build) return;
    const drop = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('planner.') && !DEPLOY_CACHE_KEEP_KEYS.has(k)) drop.push(k);
    }
    drop.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
    try {
      sessionStorage.clear();
    } catch {}
    try {
      localStorage.setItem(CLIENT_BUNDLE_STORAGE_KEY, build);
    } catch {}
  } catch {
    /* ignore */
  }
}

applyDeployCacheReset();

const Store = (() => {
  const APP_CONFIG = window.APP_CONFIG || {};
  const STORAGE_KEYS = {
    tasks: 'planner.tasks.v2',
    opTasks: 'planner.opTasks.v2',
    note: 'planner.note.v2',
  };

  // URL base `/api`: config explícita ou inferida na hospedagem (não em localhost).
  const resolveApiBaseUrl = () => {
    const raw = APP_CONFIG.apiBaseUrl;
    if (raw === false) return '';
    if (typeof raw === 'string') {
      const trimmed = raw.trim().replace(/\/$/, '');
      if (trimmed) return trimmed;
    }
    try {
      const { protocol, hostname, origin, pathname } = window.location;
      if (protocol !== 'http:' && protocol !== 'https:') return '';
      const h = String(hostname || '').toLowerCase();
      if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local')) {
        return '';
      }
      const path = String(pathname || '/');
      let p = path;
      if (p !== '/' && p.endsWith('/')) p = p.replace(/\/+$/, '');
      const segments = p.split('/').filter(Boolean);
      if (segments.length) {
        const last = segments[segments.length - 1];
        if (/\.[a-z0-9]{2,12}$/i.test(last)) segments.pop();
      }
      const folder = segments.length ? `/${segments.join('/')}` : '';
      const rel = folder ? `${folder}/api` : '/api';
      const u = new URL(rel, origin);
      return u.href.replace(/\/$/, '');
    } catch {
      /* ignore */
    }
    return '';
  };

  const ApiService = {
    baseUrl: resolveApiBaseUrl(),
    enabled() {
      return Boolean(this.baseUrl);
    },
    async request(path, options = {}) {
      if (!this.enabled()) {
        return { ok: false, error: 'api_disabled' };
      }
      try {
        const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 15000;
        const { timeoutMs: _omitTimeout, headers: optHeaders, ...rest } = options;
        const ctrl = new AbortController();
        const kill = setTimeout(() => {
          try {
            ctrl.abort();
          } catch {
            /* ignore */
          }
        }, timeoutMs);
        const method = String(rest.method || 'GET').toUpperCase();
        const hasJsonBody =
          rest.body != null && typeof rest.body === 'string' && method !== 'GET' && method !== 'HEAD';
        const headers = {
          ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
          ...(optHeaders && typeof optHeaders === 'object' ? optHeaders : {}),
        };
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...rest,
          signal: ctrl.signal,
          headers,
          credentials: 'same-origin',
        });
        clearTimeout(kill);
        const rawText = await response.text();
        const text = rawText.replace(/^\uFEFF/, '').trim();
        if (!text) return { ok: false, error: 'empty_response', status: response.status };
        const head = text.slice(0, 24).toLowerCase();
        if (head.startsWith('<!') || head.startsWith('<?') || head.startsWith('<htm') || head.startsWith('<html')) {
          return { ok: false, error: 'html_response', status: response.status };
        }
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch {
          return { ok: false, error: 'invalid_json', status: response.status };
        }
        if (!response.ok) {
          if (parsed && typeof parsed === 'object' && 'ok' in parsed) return parsed;
          return { ok: false, error: 'http_error', status: response.status };
        }
        return parsed;
      } catch {
        return { ok: false, error: 'network_error' };
      }
    },
    async requestAny(paths, options = {}) {
      const shouldTryNextPath = (result) => {
        if (!result || typeof result !== 'object') return true;
        if (result.ok === true) return false;
        if (result.error === 'unauthorized') return false;
        const t = result.error;
        if (t === 'network_error' || t === 'empty_response' || t === 'invalid_json' || t === 'html_response' || t === 'api_disabled') return true;
        if (t === 'http_error' && (result.status === 404 || result.status === 405 || result.status === 502 || result.status === 503)) return true;
        return false;
      };

      let last = null;
      const list = Array.isArray(paths) ? paths : [];
      for (let i = 0; i < list.length; i++) {
        last = await this.request(list[i], options);
        if (last && last.ok === true) return last;
        if (i < list.length - 1 && shouldTryNextPath(last)) continue;
        return last;
      }
      return last;
    },
    async getBootstrap() {
      return this.requestAny(['/bootstrap.php', '/bootstrap']);
    },
    async login(username, password) {
      return this.request('/login.php', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        timeoutMs: 12000,
      });
    },
    async saveTask(task) {
      return this.requestAny(['/tasks.php', '/tasks'], { method: 'POST', body: JSON.stringify(task) });
    },
    async saveOpTask(task) {
      return this.requestAny(['/op_tasks.php', '/op-tasks'], { method: 'POST', body: JSON.stringify(task) });
    },
    async deleteOpTask(id, cascade = false) {
      return this.requestAny(['/op_tasks.php', '/op-tasks'], { method: 'DELETE', body: JSON.stringify({ id, cascade }) });
    },
    async saveConfig(payload) {
      return this.requestAny(['/config.php', '/config'], { method: 'POST', body: JSON.stringify(payload) });
    },
    async getTeamChat() {
      return null;
    },
    async postTeamChat() {
      return null;
    },
    buildUrl(path) {
      const p = String(path || '');
      if (!p) return '';
      return `${this.baseUrl}${p.startsWith('/') ? '' : '/'}${p}`;
    },
  };

  const readLocal = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const writeLocal = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  };

  /** @type {Task[]} */
  const tasks = readLocal(STORAGE_KEYS.tasks, []);
  let nextTaskId = tasks.reduce((max, t) => Math.max(max, Number(t.id) || 0), 0) + 1;

  /** @type {OpTask[]} */
  const opTasks = readLocal(STORAGE_KEYS.opTasks, []);
  let nextOpTaskId = opTasks.reduce((max, t) => Math.max(max, Number(t.id) || 0), 0) + 1;

  /** @type {PlannerConfig} */
  const plannerConfig = { note: '' };
  const localNote = readLocal(STORAGE_KEYS.note, '');
  if (typeof localNote === 'string') plannerConfig.note = localNote;

  const calendarStorageKey = 'planner.calendar.notes.v2';
  let calendarNotes = [];
  try {
    const raw = localStorage.getItem(calendarStorageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) calendarNotes = parsed;
    }
  } catch {
    calendarNotes = [];
  }
  let nextCalendarNoteId = calendarNotes.reduce((max, n) => Math.max(max, n.id || 0), 0) + 1;
  const persistCalendarNotes = () => {
    try { localStorage.setItem(calendarStorageKey, JSON.stringify(calendarNotes)); } catch {}
  };
  const persistSnapshot = () => {
    writeLocal(STORAGE_KEYS.tasks, tasks);
    writeLocal(STORAGE_KEYS.opTasks, opTasks);
    writeLocal(STORAGE_KEYS.note, plannerConfig.note || '');
  };
  const syncUpTask = (task) => { ApiService.saveTask(task); };
  const syncUpOpTask = (task) => {
    if (!ApiService.enabled()) return;
    void ApiService.saveOpTask(task).then((resp) => {
      if (resp && resp.ok && typeof resp.descricao === 'string' && task && task.id) {
        const t = opTasks.find(x => Number(x.id) === Number(task.id));
        if (t) {
          t.descricao = resp.descricao;
          persistSnapshot();
        }
      }
    });
  };
  const syncDeleteOpTask = (id, cascade = false) => { ApiService.deleteOpTask(id, cascade); };
  const syncConfig = () => ApiService.saveConfig({ plannerConfig: { ...plannerConfig } });

  persistSnapshot();
  if (ApiService.enabled()) {
    void syncConfig();
  }

  let currentPage = 'dashboard';
  let currentOpCategory = 'rompimentos';
  let dashboardFilter = 'all';
  let dashboardSearch = '';
  let opSearch = '';
  let opRegionSearch = '';
  let opTecnicoSearch = '';
  let opTaskIdSearch = '';
  let opDateSort = 'all';
  let atdOpSearch = '';
  let atdOpRegionSearch = '';
  let atdOpTecnicoSearch = '';
  let atdOpTaskIdSearch = '';
  let atdOpDateSort = 'all';
  let editingTaskId = null;
  let editingOpTaskId = null;
  let sidebarOpen = true;
  let teamChatRosterKeys = [];
  let bootstrapInFlight = null;

  return {
    ApiService,

    getTasks:        ()      => [...tasks],
    addTask:         (data)  => {
      const nowIso = new Date().toISOString();
      const signedBy = getSignedUserName();
      const t = {
        id: nextTaskId++,
        ...data,
        responsavel: (data && String(data.responsavel || '').trim()) ? data.responsavel : signedBy,
        assinadaPor: signedBy,
        assinadaEm: nowIso,
      };
      tasks.push(t);
      persistSnapshot();
      syncUpTask(t);
      return t;
    },
    updateTask:      (id, d) => {
      const i = tasks.findIndex(t => t.id === id);
      if (i !== -1) {
        Object.assign(tasks[i], d);
        persistSnapshot();
        syncUpTask(tasks[i]);
      }
      return tasks[i];
    },
    findTask:        (id)    => tasks.find(t => t.id === id),

    getOpTasks:      ()           => [...opTasks],
    getOpTasksByCategory: (cat)   => opTasks.filter(t => t.categoria === cat),
    addOpTask:       (data)       => {
      const nowIso = new Date().toISOString();
      const signedBy = getSignedUserName();
      const t = {
        id: nextOpTaskId++,
        ...data,
        criadaEm: nowIso,
        assinadaPor: signedBy,
        assinadaEm: nowIso,
        historico: [{ status: data.status || 'Criada', timestamp: nowIso, autor: signedBy }],
      };
      opTasks.push(t);
      persistSnapshot();
      syncUpOpTask(t);
      return t;
    },
    updateOpTaskStatus: (id, newStatus, autor = 'Usuário') => {
      const task = opTasks.find(t => t.id === id);
      if (!task) return null;
      task.status = newStatus;
      task.historico.push({ status: newStatus, timestamp: new Date().toISOString(), autor });
      persistSnapshot();
      syncUpOpTask(task);
      return task;
    },
    updateOpTask: (id, data) => {
      const i = opTasks.findIndex(t => t.id === id);
      if (i !== -1) {
        Object.assign(opTasks[i], data);
        persistSnapshot();
        syncUpOpTask(opTasks[i]);
      }
      return opTasks[i];
    },
    removeOpTask: (id, options = {}) => {
      const cascade = Boolean(options.cascade);
      const removeIds = cascade
        ? [id, ...opTasks.filter(t => Number(t.parentTaskId) === Number(id)).map(t => t.id)]
        : [id];
      let changed = false;
      for (const rid of removeIds) {
        const idx = opTasks.findIndex(t => t.id === rid);
        if (idx !== -1) {
          opTasks.splice(idx, 1);
          changed = true;
        }
      }
      if (changed) {
        persistSnapshot();
        syncDeleteOpTask(id, cascade);
      }
      return changed;
    },
    findOpTask: (id) => opTasks.find(t => t.id === id),

    loginRemote: async (username, password) => ApiService.login(username, password),
    isRemoteApiEnabled: () => ApiService.enabled(),
    getApiBaseUrl: () => (ApiService.enabled() ? String(ApiService.baseUrl).replace(/\/$/, '') : ''),
    fetchTeamChat: async (since = 0) => ApiService.getTeamChat(since),
    sendTeamChat: async (payload) => ApiService.postTeamChat(payload),
    getTeamChatRosterKeys: () => [...teamChatRosterKeys],
    applyTeamChatRosterFromApi(roster) {
      if (!Array.isArray(roster)) return;
      const next = roster.map(x => String(x?.userKey || '').toLowerCase()).filter(Boolean);
      teamChatRosterKeys = [...new Set(next)].sort();
    },

    getPlannerConfig: () => ({ ...plannerConfig }),
    setPlannerConfig: (data) => {
      Object.assign(plannerConfig, data);
      persistSnapshot();
      syncConfig();
    },

    getCalendarNotes: () => [...calendarNotes],
    getCalendarNotesByDate: (isoDate) => calendarNotes.filter(n => n.date === isoDate),
    addCalendarNote: (data) => {
      const note = { id: nextCalendarNoteId++, ...data, createdAt: new Date().toISOString() };
      calendarNotes.push(note);
      persistCalendarNotes();
      ApiService.requestAny(['/calendar_notes.php', '/calendar-notes'], { method: 'POST', body: JSON.stringify(note) });
      return note;
    },
    removeCalendarNote: (id) => {
      const sizeBefore = calendarNotes.length;
      calendarNotes = calendarNotes.filter(n => n.id !== id);
      if (calendarNotes.length !== sizeBefore) persistCalendarNotes();
      ApiService.requestAny(['/calendar_notes.php', '/calendar-notes'], { method: 'DELETE', body: JSON.stringify({ id }) });
    },
    bootstrapFromRemote: async () => {
      if (bootstrapInFlight) return bootstrapInFlight;
      bootstrapInFlight = (async () => {
      const payload = await ApiService.getBootstrap();
      if (payload && typeof payload === 'object' && payload.ok === false && payload.error === 'unauthorized') {
        // Só localStorage autenticado, sem sessão PHP: exige novo login para restaurar servidor.
        try {
          if (typeof Controllers !== 'undefined' && Controllers?.auth?._isAuthenticated?.()) {
            ToastService.show('Sessão do servidor expirada. Faça login novamente.', 'warning');
            Controllers.auth.logout();
          }
        } catch {
          /* ignore */
        }
        return false;
      }
      if (!payload || !payload.ok) return false;

      // Preserva metadados locais que não existem no servidor (ex.: threadKey do Google Chat).
      const mergeLocalFieldsById = (localArr, incomingArr, fields) => {
        const map = new Map();
        for (const item of (Array.isArray(localArr) ? localArr : [])) {
          const id = Number(item?.id);
          if (!Number.isFinite(id)) continue;
          const snapshot = {};
          for (const f of fields) {
            const v = item?.[f];
            if (v !== undefined && v !== null && String(v).trim() !== '') snapshot[f] = v;
          }
          if (Object.keys(snapshot).length) map.set(id, snapshot);
        }
        for (const inc of (Array.isArray(incomingArr) ? incomingArr : [])) {
          const id = Number(inc?.id);
          if (!Number.isFinite(id) || !map.has(id)) continue;
          const snap = map.get(id);
          for (const f of Object.keys(snap)) {
            if (inc[f] === undefined || inc[f] === null || String(inc[f]).trim() === '') {
              inc[f] = snap[f];
            }
          }
        }
      };

      if (Array.isArray(payload.tasks)) {
        mergeLocalFieldsById(tasks, payload.tasks, ['chatThreadKey']);
        tasks.splice(0, tasks.length, ...payload.tasks);
        nextTaskId = tasks.reduce((max, t) => Math.max(max, Number(t.id) || 0), 0) + 1;
      }
      if (Array.isArray(payload.opTasks)) {
        mergeLocalFieldsById(opTasks, payload.opTasks, ['chatThreadKey']);
        opTasks.splice(0, opTasks.length, ...payload.opTasks);
        nextOpTaskId = opTasks.reduce((max, t) => Math.max(max, Number(t.id) || 0), 0) + 1;
      }
      if (payload.plannerConfig && typeof payload.plannerConfig === 'object') {
        Object.assign(plannerConfig, payload.plannerConfig);
      }
      if (Array.isArray(payload.calendarNotes)) {
        calendarNotes = payload.calendarNotes;
        nextCalendarNoteId = calendarNotes.reduce((max, n) => Math.max(max, n.id || 0), 0) + 1;
      }
      persistSnapshot();
      persistCalendarNotes();
      if (ApiService.enabled()) {
        void syncConfig();
      }
      return true;
      })();
      try {
        return await bootstrapInFlight;
      } finally {
        bootstrapInFlight = null;
      }
    },

    get currentPage()       { return currentPage; },
    set currentPage(v)      { currentPage = v; },
    get currentOpCategory() { return currentOpCategory; },
    set currentOpCategory(v){ currentOpCategory = v; },
    get dashboardFilter()   { return dashboardFilter; },
    set dashboardFilter(v)  { dashboardFilter = v; },
    get dashboardSearch()   { return dashboardSearch; },
    set dashboardSearch(v)  { dashboardSearch = v; },
    get opSearch()          { return opSearch; },
    set opSearch(v)         { opSearch = v; },
    get opRegionSearch()   { return opRegionSearch; },
    set opRegionSearch(v)  { opRegionSearch = v; },
    get opTecnicoSearch()   { return opTecnicoSearch; },
    set opTecnicoSearch(v)  { opTecnicoSearch = v; },
    get opTaskIdSearch()   { return opTaskIdSearch; },
    set opTaskIdSearch(v)  { opTaskIdSearch = v; },
    get opDateSort()       { return opDateSort; },
    set opDateSort(v)      { opDateSort = v; },
    get atdOpSearch()       { return atdOpSearch; },
    set atdOpSearch(v)      { atdOpSearch = v; },
    get atdOpRegionSearch() { return atdOpRegionSearch; },
    set atdOpRegionSearch(v){ atdOpRegionSearch = v; },
    get atdOpTecnicoSearch(){ return atdOpTecnicoSearch; },
    set atdOpTecnicoSearch(v){ atdOpTecnicoSearch = v; },
    get atdOpTaskIdSearch() { return atdOpTaskIdSearch; },
    set atdOpTaskIdSearch(v){ atdOpTaskIdSearch = v; },
    get atdOpDateSort()     { return atdOpDateSort; },
    set atdOpDateSort(v)    { atdOpDateSort = v; },
    get editingTaskId()     { return editingTaskId; },
    set editingTaskId(v)    { editingTaskId = v; },
    get editingOpTaskId()   { return editingOpTaskId; },
    set editingOpTaskId(v)  { editingOpTaskId = v; },
    get sidebarOpen()       { return sidebarOpen; },
    set sidebarOpen(v)      { sidebarOpen = v; },
  };
})();

const OPERATIONAL_KANBAN_CATEGORY_PAGES = new Set(['rompimentos']);
const OPERATIONAL_NAV_PAGE_IDS = new Set([...OPERATIONAL_KANBAN_CATEGORY_PAGES, 'tarefas']);

const CtoLocationRegistry = { load() { return Promise.resolve(); }, findByQuery() { return null; } };
const ChatMentionNotifs = { syncBellUi() {}, init() {}, _closePanel() {} };

const Utils = {
  toIsoLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  todayIso() {
    return this.toIsoLocal(new Date());
  },

  addDaysIso(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return this.toIsoLocal(d);
  },

  weekRangeIso(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay();
    const offsetToMonday = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(d);
    monday.setDate(d.getDate() + offsetToMonday);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: this.toIsoLocal(monday), end: this.toIsoLocal(sunday) };
  },

  monthLabel(date) {
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  },

  prettyDate(isoDate) {
    const [year, month, day] = isoDate.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  },

  formatDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  },

  escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  },

  truncateForCalendar(label, maxLen = 26) {
    const str = String(label ?? '').trim();
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return `${str.slice(0, maxLen - 1)}…`;
  },

  formatChatRelative(iso) {
    if (!iso) return '';
    try {
      const d = new Date(String(iso).replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) return String(iso);
      const diff = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diff < 45) return 'agora';
      if (diff < 3600) return `${Math.floor(diff / 60)} min`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
      if (diff < 172800) return 'ontem';
      return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(iso);
    }
  },

  formatChatFullDateTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(String(iso).replace(' ', 'T'));
      if (Number.isNaN(d.getTime())) return String(iso);
      return d.toLocaleString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(iso);
    }
  },

  // Detecta http(s) no texto do chat e vira link seguro (nova aba).
  linkifyChatText(raw) {
    const t = String(raw ?? '');
    const re = /https?:\/\/[^\s<>"']+/gi;
    let html = '';
    let last = 0;
    let m;
    const rx = new RegExp(re.source, 'gi');
    while ((m = rx.exec(t)) !== null) {
      html += Utils.escapeHtml(t.slice(last, m.index));
      let u = m[0];
      while (u.length > 14 && /[),.;!?]$/.test(u)) u = u.slice(0, -1);
      const href = Utils.escapeHtml(u);
      const vis = Utils.escapeHtml(u);
      html += `<a href="${href}" class="team-chat-link" target="_blank" rel="noopener noreferrer">${vis}</a>`;
      last = m.index + m[0].length;
    }
    html += Utils.escapeHtml(t.slice(last));
    return html;
  },

  _formatChatSegmentWithMentions(segment, rosterSet) {
    const reMen = /@([a-z0-9._-]+)/gi;
    let html = '';
    let last = 0;
    const s = String(segment);
    let m;
    reMen.lastIndex = 0;
    while ((m = reMen.exec(s)) !== null) {
      html += Utils.escapeHtml(s.slice(last, m.index));
      const user = m[1];
      const low = user.toLowerCase();
      const safeU = Utils.escapeHtml(user);
      if (rosterSet.has(low)) {
        html += `<span class="team-chat-mention" data-user="${Utils.escapeHtml(low)}">@${safeU}</span>`;
      } else {
        html += Utils.escapeHtml(m[0]);
      }
      last = m.index + m[0].length;
    }
    html += Utils.escapeHtml(s.slice(last));
    return html;
  },

  // linkify + @usuário com highlight se estiver no roster do servidor.
  formatChatBodyHtml(raw, rosterKeys) {
    const set = new Set((rosterKeys || []).map(k => String(k).toLowerCase()));
    const reUrl = /https?:\/\/[^\s<>"']+/gi;
    const t = String(raw ?? '');
    let html = '';
    let last = 0;
    let m;
    const rx = new RegExp(reUrl.source, 'gi');
    while ((m = rx.exec(t)) !== null) {
      html += Utils._formatChatSegmentWithMentions(t.slice(last, m.index), set);
      let u = m[0];
      while (u.length > 14 && /[),.;!?]$/.test(u)) u = u.slice(0, -1);
      const href = Utils.escapeHtml(u);
      const vis = Utils.escapeHtml(u);
      html += `<a href="${href}" class="team-chat-link" target="_blank" rel="noopener noreferrer">${vis}</a>`;
      last = m.index + m[0].length;
    }
    html += Utils._formatChatSegmentWithMentions(t.slice(last), set);
    return html;
  },

  messageMentionsUser(body, userKey) {
    const u = String(userKey || '').toLowerCase();
    if (!u) return false;
    const k = u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`@${k}(?![a-z0-9._-])`, 'i');
    return re.test(String(body || ''));
  },

  getInitials(name) {
    const s = String(name || '').trim();
    if (!s) return '—';
    return s.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
  },

  isLate(task) {
    return task.status !== 'Concluída' && task.prazo && task.prazo < this.todayIso();
  },

  pad(n) { return String(n).padStart(2, '0'); },

  _avatarMap: {},
  _avatarColors: ['#2dff6e','#42b8f5','#f5c842','#b8f542','#42f5c2','#f5a342'],
  getAvatarColor(name) {
    if (!this._avatarMap[name]) {
      this._avatarMap[name] = this._avatarColors[Object.keys(this._avatarMap).length % this._avatarColors.length];
    }
    return this._avatarMap[name];
  },

  // Botão copiar mostra protocolo/taskCode (não o id numérico do banco).
  TASK_COPY_ID_SVG:
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',

  escapeHtmlAttr(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  },

  _opTaskRegionPrefix(regionRaw = '') {
    const norm = WebhookService._normalizeRegionKey(regionRaw);
    if (norm === 'GOVAL') return 'GV';
    if (norm === 'VALE_DO_ACO') return 'VL';
    if (norm === 'CARATINGA') return 'CA';
    return '';
  },

  syntheticOpTaskCode(task) {
    if (!task || typeof task !== 'object') return '';
    const prefixMap = {
      'rompimentos': 'ROM',
      'troca-poste': 'POS',
      'atendimento-cliente': 'ATD',
      'otimizacao-rede': 'NET',
      'certificacao-cemig': 'CEM',
    };
    const prefix = prefixMap[task.categoria] || 'ROM';
    const regionPrefix = this._opTaskRegionPrefix(task.regiao);
    const id = Number(task.id);
    if (!Number.isFinite(id) || id <= 0) return '';
    const base = `${prefix}-${String(id).padStart(4, '0')}`;
    return regionPrefix ? `${regionPrefix}-${base}` : base;
  },

  // Ordem: protocolo (form) → taskCode → código sintético por categoria.
  opTaskDisplayRef(task) {
    if (!task || typeof task !== 'object') return '';
    const proto = String(task.protocolo || '').trim();
    const code = String(task.taskCode || '').trim();
    if (proto) return proto;
    if (code) return code;
    if (task.categoria) return this.syntheticOpTaskCode(task);
    return '';
  },

  unifiedTaskDisplayRef(task) {
    if (!task || typeof task !== 'object') return '';
    if (task.source === 'operacional' || task.categoria) return this.opTaskDisplayRef(task);
    return '';
  },

  taskCopyProtocolButtonHtml(displayRef, extraClass = '') {
    const code = String(displayRef ?? '').trim();
    if (!code) return '';
    const cls = ['task-copy-id-btn', extraClass].filter(Boolean).join(' ');
    const a = this.escapeHtmlAttr(code);
    return `<button type="button" class="${cls}" draggable="false" data-copy-protocol="${a}" title="Copiar protocolo (${code})" aria-label="Copiar protocolo ${code}">${this.TASK_COPY_ID_SVG}</button>`;
  },

  async copyTextToClipboard(text) {
    const s = String(text ?? '').trim();
    if (!s) return false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(s);
        return true;
      }
    } catch {
      /* fallback */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = s;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  },

  async copyProtocolWithToast(text) {
    const s = String(text ?? '').trim();
    if (!s) return;
    const ok = await this.copyTextToClipboard(s);
    if (ok) ToastService.show(`Copiado: ${s}`, 'success');
    else ToastService.show('Não foi possível copiar', 'danger');
  },
};


const WebhookService = {
  _normalizeRegionKey(regionRaw) {
    const r = String(regionRaw || '').trim().toLowerCase();
    if (!r) return '';
    if (r === 'goval') return 'GOVAL';
    if (r === 'vale do aço' || r === 'vale do aco') return 'VALE_DO_ACO';
    if (r === 'caratinga') return 'CARATINGA';
    return r.toUpperCase().replace(/\s+/g, '_');
  },
  async send() {},
  async sendTest() {},
};

const ToastService = {
  _icons: {
    success: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
    info:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    danger:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  },

  show(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${this._icons[type] || this._icons.info}</span><span class="toast-msg">${Utils.escapeHtml(message)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 220);
    }, 3500);
  },
};


const ModalService = {
  open(id)  { document.getElementById(id)?.classList.add('open'); },
  close(id) {
    if (id === 'opTaskModal' && typeof OpTaskService !== 'undefined' && OpTaskService._resetAtdChildrenListExpand) {
      OpTaskService._resetAtdChildrenListExpand();
    }
    document.getElementById(id)?.classList.remove('open');
  },
  closeAll() {
    const op = document.getElementById('opTaskModal');
    if (op?.classList.contains('open') && typeof OpTaskService !== 'undefined' && OpTaskService._resetAtdChildrenListExpand) {
      OpTaskService._resetAtdChildrenListExpand();
    }
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  },
};


const TaskService = {
  _opCategoryLabelMap: {
    'rompimentos': 'Tarefas',
    'troca-poste': 'Troca de Poste',
    'atendimento-cliente': 'Atendimento ao Cliente',
    'otimizacao-rede': 'Otimização de Rede',
    'certificacao-cemig': 'Certificação Cemig',
  },

  _isDoneStatus(status) {
    return status === 'Concluída' || status === 'Finalizada' || status === 'Finalizado';
  },

  _isPendingStatus(status) {
    return status === 'Pendente' || status === 'Criada' || status === 'Backlog' || status === 'Agendado';
  },

  _isProgressStatus(status) {
    return status === 'Em andamento' || status === 'Validação' || status === 'Envio pendente' || status === 'Necessário adequação';
  },

  _isLateTask(task) {
    if (!task.prazo) return false;
    if (this._isDoneStatus(task.status) || task.status === 'Cancelada') return false;
    return task.prazo < Utils.todayIso();
  },

  _normalizeGeneralTask(task) {
    return {
      ...task,
      source: 'dashboard',
      sourceLabel: 'Dashboard',
      dashboardRowId: `dashboard-${task.id}`,
      effectiveStatus: task.status,
    };
  },

  _normalizeOpTask(task) {
    return {
      ...task,
      source: 'operacional',
      sourceLabel: this._opCategoryLabelMap[task.categoria] || 'Operacional',
      dashboardRowId: `operacional-${task.id}`,
      effectiveStatus: task.status,
    };
  },

  getAllDashboardTasks() {
    this.autoFlagLate();
    const general = Store.getTasks().map(t => this._normalizeGeneralTask(t));
    const op = Store.getOpTasks()
      .filter(t => t && t.categoria === 'rompimentos')
      .map(t => this._normalizeOpTask(t));
    return [...general, ...op];
  },

  autoFlagLate() {
    Store.getTasks().forEach(t => {
      if (Utils.isLate(t) && t.status !== 'Atrasada') {
        Store.updateTask(t.id, { status: 'Atrasada' });
      }
    });
  },

  getFilteredTasks() {
    const tod = Utils.todayIso();
    const week = Utils.weekRangeIso();
    const filter = Store.dashboardFilter;
    const query  = Store.dashboardSearch;

    return this.getAllDashboardTasks().filter(t => {
      const matchFilter =
        filter === 'all' ||
        (filter === 'today' && t.prazo === tod) ||
        (filter === 'week' && t.prazo && t.prazo >= week.start && t.prazo <= week.end);
      const matchSearch = !query ||
        t.titulo.toLowerCase().includes(query) ||
        t.responsavel.toLowerCase().includes(query) ||
        t.status.toLowerCase().includes(query) ||
        t.sourceLabel.toLowerCase().includes(query);
      return matchFilter && matchSearch;
    });
  },

  getCounts() {
    const tasks = this.getAllDashboardTasks();
    const counts = { pending: 0, progress: 0, done: 0, late: 0 };
    tasks.forEach(t => {
      if (this._isPendingStatus(t.effectiveStatus)) counts.pending++;
      else if (this._isProgressStatus(t.effectiveStatus)) counts.progress++;
      else if (this._isDoneStatus(t.effectiveStatus)) counts.done++;

      if (t.effectiveStatus === 'Atrasada' || this._isLateTask(t)) counts.late++;
    });
    return { ...counts, total: tasks.length };
  },
};


const OpTaskService = {
  _statusToEvent: {
    'Em andamento': 'andamento',
    'Concluída':    'concluida',
    'Finalizada':   'finalizada',
    'Finalizado':   'finalizada',
  },

  _categoryLabels: {
    'rompimentos': 'Tarefas',
    'troca-poste': 'Troca de Poste',
    'atendimento-cliente': 'Atendimento ao Cliente',
    'otimizacao-rede': 'Otimização de Rede',
    'certificacao-cemig': 'Certificação Cemig',
  },

  _cemigColumns: [
    { status: 'Backlog', key: 'col-cemig-backlog', label: 'Backlog' },
    { status: 'Agendado', key: 'col-cemig-agendado', label: 'Agendado' },
    { status: 'Em andamento', key: 'col-cemig-andamento', label: 'Em andamento' },
    { status: 'Validação', key: 'col-cemig-validacao', label: 'Validação' },
    { status: 'Envio pendente', key: 'col-cemig-envio', label: 'Envio pendente' },
    { status: 'Necessário adequação', key: 'col-cemig-adequacao', label: 'Necessário adequação' },
    { status: 'Finalizado', key: 'col-cemig-final', label: 'Finalizado' },
  ],
  _cemigNext: {
    'Backlog': ['Agendado'],
    'Agendado': ['Em andamento'],
    'Em andamento': ['Validação'],
    'Validação': ['Envio pendente'],
    'Envio pendente': ['Necessário adequação'],
    'Necessário adequação': ['Finalizado'],
    'Finalizado': [],
  },
  _cemigActionLabels: {
    'Agendado': 'Agendar',
    'Em andamento': 'Iniciar',
    'Validação': 'Em validação',
    'Envio pendente': 'Envio pendente',
    'Necessário adequação': 'Adequação',
    'Finalizado': 'Finalizar',
  },

  changeStatus(id, newStatus) {
    const task = Store.updateOpTaskStatus(id, newStatus);
    if (!task) return;

    const event = this._statusToEvent[newStatus];
    if (event) {
      const categoryLabel = this._categoryLabels[task.categoria] || task.categoria;
      WebhookService.send(event, task, categoryLabel);
    }
  },

  getFilteredByCategory(category, opts = {}) {
    const ns = opts.filterNamespace === 'atd' ? 'atd' : 'op';
    const query = (ns === 'atd' ? Store.atdOpSearch : Store.opSearch || '').toLowerCase();
    const regionQuery = (ns === 'atd' ? Store.atdOpRegionSearch : Store.opRegionSearch || '').toLowerCase();
    const techQuery = (ns === 'atd' ? Store.atdOpTecnicoSearch : Store.opTecnicoSearch || '').toLowerCase();
    const taskIdRaw = String((ns === 'atd' ? Store.atdOpTaskIdSearch : Store.opTaskIdSearch) || '').trim();
    const taskIdNum = taskIdRaw && /^\d+$/.test(taskIdRaw) ? Number(taskIdRaw) : null;
    const dateSort = String((ns === 'atd' ? Store.atdOpDateSort : Store.opDateSort) || 'all');

    const filtered = Store.getOpTasksByCategory(category).filter(t => {
      const matchSearch =
        !query ||
        String(t.titulo || '').toLowerCase().includes(query) ||
        String(t.responsavel || '').toLowerCase().includes(query) ||
        String(t.descricao || '').toLowerCase().includes(query);

      const matchRegion = !regionQuery || String(t.regiao || '').toLowerCase() === regionQuery;

      const matchTech = !techQuery || String(t.responsavel || '').toLowerCase().includes(techQuery);

      const matchTaskId =
        !taskIdRaw ||
        (taskIdNum !== null ? Number(t.id) === taskIdNum : false) ||
        String(t.taskCode || '').includes(taskIdRaw) ||
        String(t.id).includes(taskIdRaw);

      return matchSearch && matchRegion && matchTech && matchTaskId;
    });

    const toTime = (task) => {
      const d = String(task.dataEntrada || task.prazo || task.criadaEm || '').trim();
      const ts = d ? new Date(d).getTime() : Number.NaN;
      return Number.isFinite(ts) ? ts : 0;
    };

    if (dateSort === 'oldest') {
      return [...filtered].sort((a, b) => toTime(a) - toTime(b));
    }
    if (dateSort === 'newest') {
      return [...filtered].sort((a, b) => toTime(b) - toTime(a));
    }
    return filtered;
  },

  getStatusCounts() {
    const counts = { Criada: 0, 'Em andamento': 0, Concluída: 0, Finalizada: 0, Backlog: 0 };
    Store.getOpTasks().filter(t => t && t.categoria === 'rompimentos').forEach(t => {
      // No "Atendimento ao Cliente", subtarefas não devem inflar contadores de tarefas.
      if (t.categoria === 'atendimento-cliente' && t.parentTaskId) return;
      if (t.categoria === 'certificacao-cemig') {
        const s = t.status;
        if (s === 'Backlog' || s === 'Agendado') counts.Criada++;
        else if (['Em andamento', 'Validação', 'Envio pendente', 'Necessário adequação'].includes(s)) counts['Em andamento']++;
        else if (s === 'Finalizado') counts.Finalizada++;
        return;
      }
      if (t.status === 'Backlog' || t.status === 'Criada' || t.status === 'A iniciar') {
        counts.Criada++;
        counts.Backlog++;
        return;
      }
      if (counts[t.status] !== undefined) counts[t.status]++;
    });
    return counts;
  },
};

const UI = {
  _lastMovedOpTask: null,
  _statusBadgeMap: {
    'Backlog':      's-backlog',
    'A iniciar':    's-pendente',
    'Pendente':     's-pendente',
    'Em andamento': 's-andamento',
    'Concluída':    's-concluida',
    'Finalizada':   's-finalizada',
    'Finalizado':   's-finalizado',
    'Agendado':     's-agendado',
    'Validação':    's-validacao',
    'Envio pendente': 's-envio-pendente',
    'Necessário adequação': 's-adequacao',
    'Atrasada':     's-atrasada',
    'Cancelada':    's-cancelada',
    'Criada':       's-criada',
    'Anotado':      's-note',
  },
  _priorityBadgeMap: { Alta: 'p-high', Média: 'p-med', Baixa: 'p-low' },

  _regionBadgeClass(regiao) {
    const key = WebhookService._normalizeRegionKey(regiao);
    if (key === 'GOVAL') return 'reg-goval';
    if (key === 'VALE_DO_ACO') return 'reg-vale';
    if (key === 'CARATINGA') return 'reg-caratinga';
    return '';
  },

  regionBadge(regiao) {
    const label = String(regiao || '').trim();
    if (!label) return '';
    const cls = this._regionBadgeClass(regiao) || 'reg-unknown';
    return `<span class="badge ${cls}">${label}</span>`;
  },

  statusBadge(status) {
    const cls = this._statusBadgeMap[status] || 's-pendente';
    return `<span class="badge ${cls}"><span class="badge-dot" aria-hidden="true"></span>${status}</span>`;
  },

  priorityBadge(priority) {
    const cls = this._priorityBadgeMap[priority] || 'p-med';
    return `<span class="badge ${cls}">${priority}</span>`;
  },

  checkSvg() {
    return `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;
  },

  renderDashboardStats() {
    const counts = TaskService.getCounts();
    document.getElementById('count-pending').textContent  = counts.pending;
    document.getElementById('count-progress').textContent = counts.progress;
    document.getElementById('count-done').textContent     = counts.done;
    document.getElementById('count-late').textContent     = counts.late;
    document.getElementById('sub-pending').textContent    = `${counts.total} total`;
    document.getElementById('sub-progress').textContent   = counts.progress ? 'Em execução' : 'Nenhuma ativa';
    document.getElementById('sub-done').textContent       = counts.done    ? 'Finalizadas'  : 'Nenhuma ainda';
    document.getElementById('sub-late').textContent       = counts.late    ? 'Atenção necessária' : 'Tudo em dia';

    const badgeLate = document.getElementById('badge-late');
    if (badgeLate) {
      badgeLate.textContent = counts.late;
      badgeLate.style.display = counts.late ? 'inline' : 'none';
    }
  },

  renderTaskTable() {
    const tbody = document.getElementById('taskTableBody');
    const list  = TaskService.getFilteredTasks();
    const tod   = Utils.todayIso();

    if (!list.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Nenhuma tarefa encontrada</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(t => {
      const isLate = t.effectiveStatus === 'Atrasada' || (t.prazo && t.prazo < tod && !['Concluída','Finalizada','Finalizado'].includes(t.status));
      const isDone = ['Concluída','Finalizada','Finalizado'].includes(t.effectiveStatus);
      const color  = Utils.getAvatarColor(t.responsavel);
      const titleStyle = isDone ? 'text-decoration:line-through;opacity:.45' : '';
      const assinatura = String(t.assinadaPor || '').trim();
      const sigHtml = assinatura
        ? `<div class="sig-mini">✍ ${Utils.escapeHtml(assinatura)}</div>`
        : '';

      return `
        <tr class="dashboard-row-readonly">
          <td>
            <div class="task-name-cell">
              ${Utils.taskCopyProtocolButtonHtml(Utils.unifiedTaskDisplayRef(t))}
              <span style="${titleStyle}">${Utils.escapeHtml(t.titulo)}</span>
            </div>
          </td>
          <td>
            <div class="assignee-wrap">
              <div class="assignee">
                <div class="av-sm" style="background:${color};color:#0a0c0a" aria-hidden="true">${Utils.getInitials(t.responsavel)}</div>
                ${Utils.escapeHtml(t.responsavel)}
              </div>
              ${sigHtml}
            </div>
          </td>
          <td class="date-cell ${isLate ? 'date-late' : ''}">${Utils.formatDate(t.prazo)}</td>
          <td>${this.statusBadge(t.effectiveStatus)}</td>
          <td><span class="dashboard-badges-cell">${[this.regionBadge(t.regiao), this.priorityBadge(t.prioridade || 'Média')].filter(Boolean).join('')}</span> <span style="margin-left:6px;color:var(--white4);font-size:10px;font-family:var(--font-mono)">· ${t.sourceLabel}</span></td>
        </tr>
      `;
    }).join('');
  },

  renderOpStats() {
    const counts = OpTaskService.getStatusCounts();
    document.getElementById('op-count-criada').textContent    = counts['Criada'];
    document.getElementById('op-count-andamento').textContent = counts['Em andamento'];
    document.getElementById('op-count-concluida').textContent = counts['Concluída'];
    document.getElementById('op-count-finalizada').textContent= counts['Finalizada'];
  },

  renderKanban() {
    const category = Store.currentOpCategory;
    const tasks    = OpTaskService.getFilteredByCategory(category);
    const tod      = Utils.todayIso();
    const board = document.getElementById('kanbanBoard');
    board?.classList.remove('atd-mode');
    const isAtendimento = false;

    const isCemig = category === 'certificacao-cemig';
    if (isCemig) board?.classList.add('kanban-board--cemig');
    else board?.classList.remove('kanban-board--cemig');

    const columns = isCemig
      ? OpTaskService._cemigColumns
      : [
        { status: 'Criada',       key: 'col-criada',     label: 'Criada'       },
        { status: 'Em andamento', key: 'col-andamento',  label: 'Em andamento' },
        { status: 'Concluída',    key: 'col-concluida',  label: 'Concluída'    },
        { status: 'Finalizada',   key: 'col-finalizada', label: 'Finalizada'   },
      ];

    const nextStatusMap = isCemig
      ? OpTaskService._cemigNext
      : {
        'Backlog':      ['Em andamento'],
        'A iniciar':    ['Em andamento'],
        'Criada':       ['Em andamento'],
        'Em andamento': ['Concluída'],
        'Concluída':    ['Finalizada'],
        'Finalizada':   [],
      };

    const statusLabels = isCemig
      ? OpTaskService._cemigActionLabels
      : {
        'Em andamento': 'Iniciar',
        'Concluída':    'Concluir',
        'Finalizada':   'Finalizar',
      };

    const statusActionClass = isCemig
      ? {
        'Agendado': 'cemig-advance',
        'Em andamento': 'cemig-advance',
        'Validação': 'cemig-advance',
        'Envio pendente': 'cemig-advance',
        'Necessário adequação': 'cemig-advance',
        'Finalizado': 'cemig-advance',
      }
      : {
        'Em andamento': 'to-andamento',
        'Concluída':    'to-concluida',
        'Finalizada':   'to-finalizada',
      };

    const doneForLate = isCemig ? ['Finalizado'] : ['Concluída', 'Finalizada'];

    const kanbanColKey = (t) => {
      if (category === 'otimizacao-rede' && ['Backlog', 'A iniciar'].includes(t.status)) return 'Criada';
      return t.status;
    };

    board.innerHTML = columns.map(col => {
      const colTasks = tasks.filter(t => kanbanColKey(t) === col.status);

      const cards = colTasks.length
        ? colTasks
          .filter(t => !(isAtendimento && t.parentTaskId))
          .map(t => {
            const isLate = t.prazo && t.prazo < tod && !doneForLate.includes(t.status);
            const childTasks = isAtendimento
              ? tasks.filter(c => Number(c.parentTaskId) === Number(t.id))
              : [];
            const parentTag = isAtendimento
              ? `<span class="badge s-info" style="margin-bottom:6px">LISTA</span>`
              : '';
            const nextStatuses = nextStatusMap[t.status] || [];
            const actionBtns = nextStatuses.map(ns =>
              `<button class="status-action-btn ${statusActionClass[ns] || 'cemig-advance'}" data-op-id="${Utils.escapeHtml(t.id)}" data-to-status="${Utils.escapeHtml(ns)}">${Utils.escapeHtml(statusLabels[ns])}</button>`
            ).join('');
            const assinatura = String(t.assinadaPor || '').trim();
            const sigHtml = assinatura ? `<div class="kanban-card-signature">✍ ${Utils.escapeHtml(assinatura)}</div>` : '';
            const badgeParts = [this.regionBadge(t.regiao), this.priorityBadge(t.prioridade || 'Média')].filter(Boolean);
            const badgesRow = badgeParts.length ? `<div class="kanban-card-badges">${badgeParts.join('')}</div>` : '';
            const childHtml = childTasks.length
              ? `<div class="subtask-list">${childTasks.map(c => `
                   <div class="subtask-item">
                     ${Utils.taskCopyProtocolButtonHtml(Utils.opTaskDisplayRef(c), 'task-copy-id-btn--sm')}
                     <span>${Utils.escapeHtml(c.taskCode || '')} · ${Utils.escapeHtml(c.titulo)}</span>
                     <button type="button" data-open-subtask="${Utils.escapeHtml(c.id)}">${Utils.escapeHtml(c.status)}</button>
                   </div>
                 `).join('')}</div>`
              : '';

            return `
              <article class="kanban-card ${this._lastMovedOpTask && this._lastMovedOpTask.id === t.id && this._lastMovedOpTask.status === t.status ? 'just-moved' : ''}" data-op-id="${Utils.escapeHtml(t.id)}" data-op-status="${Utils.escapeHtml(t.status)}" draggable="true" aria-label="${Utils.escapeHtml(t.titulo || 'Sem título')}">
                ${parentTag}
                ${badgesRow}
                <div class="kanban-card-title-row">
                  ${Utils.taskCopyProtocolButtonHtml(Utils.opTaskDisplayRef(t))}
                  <div class="kanban-card-title">${Utils.escapeHtml(t.titulo || '(Sem título)')}</div>
                </div>
                <div class="kanban-card-date">${Utils.escapeHtml(t.taskCode || '')}</div>
                <div class="kanban-card-meta">
                  <div class="kanban-card-assignee">
                    <div class="av-sm" style="background:${Utils.getAvatarColor(t.responsavel || '—')};color:#0a0c0a;width:20px;height:20px;font-size:8px" aria-hidden="true">${Utils.getInitials(t.responsavel)}</div>
                    ${Utils.escapeHtml(t.responsavel || '—')}
                  </div>
                  <div class="kanban-card-date ${isLate ? 'late' : ''}">${Utils.formatDate(t.prazo)}</div>
                </div>
                ${sigHtml}
                <div class="kanban-card-actions">${actionBtns}</div>
                ${childHtml}
              </article>
            `;
          }).join('')
        : `<div class="kanban-empty">Nenhuma tarefa</div>`;

      return `
        <div class="kanban-col ${col.key}" role="group" aria-label="Coluna ${col.label}">
          <div class="kanban-col-header">
            <span class="kanban-col-title">${col.label}</span>
            <span class="kanban-col-count">${colTasks.length}</span>
          </div>
          <div class="kanban-cards" data-col-status="${col.status}">${cards}</div>
          <button class="kanban-col-add" type="button" data-add-col="${col.status}" aria-label="Adicionar tarefa na coluna ${col.label}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Adicionar
          </button>
        </div>
      `;
    }).join('');

    // Delegação no board: evita re-bind a cada re-render do kanban.
    board.onclick = (e) => {
      const target = e.target;
      if (!target) return;

      const statusBtn = target.closest?.('.status-action-btn');
      if (statusBtn && board.contains(statusBtn)) {
        e.preventDefault();
        e.stopPropagation();
        const id = +statusBtn.dataset.opId;
        const toStatus = statusBtn.dataset.toStatus;
        this._lastMovedOpTask = { id, status: toStatus };
        OpTaskService.changeStatus(id, toStatus);
        this.renderOpPage();
        setTimeout(() => { this._lastMovedOpTask = null; }, 520);
        ToastService.show(`Tarefa movida para "${toStatus}"`, 'success');
        return;
      }

      const subtaskBtn = target.closest?.('[data-open-subtask]');
      if (subtaskBtn && board.contains(subtaskBtn)) {
        e.preventDefault();
        Controllers.opTask.openEditModal(+subtaskBtn.dataset.openSubtask);
        return;
      }

      const card = target.closest?.('.kanban-card');
      if (!card || !board.contains(card)) return;
      const id = +card.dataset.opId;
      Controllers.opTask.openEditModal(id);
    };

    // Arrastar cartão entre colunas (clique para abrir modal continua funcionando).
    let draggedId = null;
    let draggedFromStatus = null;

    board.querySelectorAll('.kanban-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        draggedId = +card.dataset.opId;
        draggedFromStatus = card.dataset.opStatus;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(draggedId));
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
        board.querySelectorAll('.kanban-cards.drag-over').forEach(c => c.classList.remove('drag-over'));
      });
    });

    board.querySelectorAll('.kanban-cards').forEach(col => {
      col.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('drag-over');
      });

      col.addEventListener('dragleave', e => {
        if (e.relatedTarget && col.contains(e.relatedTarget)) return;
        col.classList.remove('drag-over');
      });

      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drag-over');
        col.classList.add('drop-flash');
        setTimeout(() => col.classList.remove('drop-flash'), 500);
        const targetStatus = col.dataset.colStatus;
        if (!draggedId || !targetStatus || targetStatus === draggedFromStatus) return;
        this._lastMovedOpTask = { id: draggedId, status: targetStatus };
        OpTaskService.changeStatus(draggedId, targetStatus);
        this.renderOpPage();
        setTimeout(() => { this._lastMovedOpTask = null; }, 520);
        ToastService.show(`Tarefa movida para "${targetStatus}"`, 'success');
      });
    });

    board.querySelectorAll('.kanban-col-add').forEach(btn => {
      btn.addEventListener('click', () => {
        const colStatus = btn.getAttribute('data-add-col');
        Controllers.opTask.openNewModal(colStatus ? { status: colStatus } : {});
      });
    });
  },

  renderAtendimentoList() {},

  renderAtendimentoPage() {},

  renderAgenda() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const weekDay = start.getDay(); // 0 dom ... 6 sab
    const diffToMonday = weekDay === 0 ? -6 : 1 - weekDay;
    start.setDate(start.getDate() + diffToMonday);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const startIso = Utils.toIsoLocal(start);
    const endIso = Utils.toIsoLocal(end);

    const taskItems = TaskService.getAllDashboardTasks()
      .filter(t => t.prazo && t.prazo >= startIso && t.prazo <= endIso)
      .map(t => ({
        date: t.prazo,
        text: t.titulo,
        source: t.sourceLabel,
        copyRef: Utils.unifiedTaskDisplayRef(t),
        kind: 'task',
      }));

    const noteItems = Store.getCalendarNotes()
      .filter(n => n.date && n.date >= startIso && n.date <= endIso)
      .map(n => ({
        date: n.date,
        text: n.title,
        source: 'Anotação',
        copyRef: '',
        kind: 'note',
      }));

    const agenda = [...taskItems, ...noteItems]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 10)
      .map(item => {
        const [year, month, day] = item.date.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        const dayLabel = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        return {
          day: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1, 3),
          text: item.text,
          time: `${Utils.formatDate(item.date)} · ${item.source}`,
          copyRef: item.copyRef,
        };
      });

    const list = document.getElementById('agendaList');
    if (!list) return;
    if (!agenda.length) {
      list.innerHTML = `<li class="agenda-item"><div><div class="agenda-desc">Nenhum item marcado para esta semana.</div><div class="agenda-time">Inclua prazos nas tarefas do dashboard ou na tela Tarefas.</div></div></li>`;
      return;
    }

    list.innerHTML = agenda.map(a => `
      <li class="agenda-item">
        <div class="agenda-day">${a.day}</div>
        <div class="agenda-item-body">
          ${Utils.taskCopyProtocolButtonHtml(a.copyRef, 'task-copy-id-btn--sm')}
          <div>
            <div class="agenda-desc">${a.text}</div>
            <div class="agenda-time">${a.time}</div>
          </div>
        </div>
      </li>
    `).join('');
  },

  updateClock() {
    const el = document.getElementById('topbarDate');
    if (!el) return;
    const d    = new Date();
    const opts = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
    const date = d.toLocaleDateString('pt-BR', opts);
    const time = `${Utils.pad(d.getHours())}:${Utils.pad(d.getMinutes())}`;
    el.textContent = `${date} — ${time}`;
  },

  navigateTo(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-item[data-page]').forEach(b => {
      b.classList.toggle('active', b.dataset.page === page);
      b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false');
    });

    const titles = {
      dashboard: { title: 'Dashboard', crumb: 'Visão Geral' },
      rompimentos: { title: 'Tarefas', crumb: 'Atividade de manutenção' },
      config: { title: 'Configurações', crumb: 'Sistema' },
    };
    const meta = titles[page] || { title: page, crumb: '' };
    document.getElementById('pageTitle').textContent      = meta.title;
    document.getElementById('breadcrumbLeaf').textContent = meta.crumb;

    Store.currentPage = page;

    try {
      sessionStorage.setItem(NAV_LAST_PAGE_KEY, page);
    } catch {
      /* ignore */
    }

    if (OPERATIONAL_KANBAN_CATEGORY_PAGES.has(page)) {
      Store.currentOpCategory = page;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-tarefas')?.classList.add('active');
      this.renderOpPage();
    }
  },

  restoreLastPageIfAuthed() {
    if (!Controllers.auth._isAuthenticated()) return;
    let saved = '';
    try {
      saved = String(sessionStorage.getItem(NAV_LAST_PAGE_KEY) || '').trim();
    } catch {
      return;
    }
    const allowed = new Set(['dashboard', 'rompimentos', 'config']);
    if (!saved || !allowed.has(saved)) return;
    const pageDomId = OPERATIONAL_KANBAN_CATEGORY_PAGES.has(saved) ? 'page-tarefas' : `page-${saved}`;
    if (!document.getElementById(pageDomId)) return;
    this.navigateTo(saved);
  },

  renderDashboard() {
    this.renderAgenda();
    this.renderDashboardStats();
    this.renderTaskTable();
  },

  refreshOperationalUi() {
    if (OPERATIONAL_NAV_PAGE_IDS.has(Store.currentPage)) this.renderOpPage();
  },

  syncAfterRemoteBootstrap() {
    this.renderAgenda();
    this.renderDashboard();
    this.refreshOperationalUi();
  },

  renderOpPage() {
    this.renderOpStats();
    this.renderKanban();
  },
};

const Controllers = {
  theme: {
    init() {},
  },
  auth: {
    _sessionKey: 'planner.session.v1',
    _displayNameKey: 'planner.session.displayName.v1',
    _sessionUserKey: SESSION_USER_KEY,
    _getAllowedUsers() {
      const list = window.APP_CONFIG && window.APP_CONFIG.authUsers;
      const base = Array.isArray(list) ? list : [];
      const fromConfig = base.filter(u => u && typeof u.user === 'string' && typeof u.pass === 'string');
      return [...fromConfig, { user: 'teste', pass: '1123' }];
    },
    _submitting: false,
    _isAuthenticated() {
      return localStorage.getItem(this._sessionKey) === '1';
    },
    _lock() {
      document.body.classList.add('auth-locked');
    },
    _unlock() {
      document.body.classList.remove('auth-locked');
    },
    _finishLogin(displayName, userKeyRaw = '') {
      const name = String(displayName || '').trim() || 'Usuário';
      const userKey = String(userKeyRaw || name).trim().toLowerCase();
      localStorage.setItem(this._sessionKey, '1');
      localStorage.setItem(this._displayNameKey, name);
      localStorage.setItem(this._sessionUserKey, userKey);
      this._unlock();
      this._syncSidebarUser();
      queueMicrotask(() => {
        ChatMentionNotifs.syncBellUi();
        UI.restoreLastPageIfAuthed?.();
        if (Controllers.auth._isAuthenticated() && Store.currentPage !== 'chat') {
          Controllers.teamChat.startBackgroundNotify?.();
        }
      });
    },
    _syncSidebarUser() {
      const nameEl = document.getElementById('sidebarUserName');
      const roleEl = document.getElementById('sidebarUserRole');
      const initialsEl = document.getElementById('sidebarUserInitials');
      if (!nameEl || !roleEl) return;

      const logged = this._isAuthenticated();
      const storedName = (localStorage.getItem(this._displayNameKey) || '').trim();
      const display = logged ? (storedName || 'Usuário') : '—';

      nameEl.textContent = display;
      roleEl.textContent = logged ? 'Administrador' : '—';
      if (initialsEl) initialsEl.textContent = logged ? Utils.getInitials(display) : '—';
    },
    // API ativa: POST login.php; caso contrário valida authUsers no config (+ usuário teste embutido).
    async _login(user, pass) {
      if (!user || !pass) {
        ToastService.show('Preencha usuário e senha para entrar', 'danger');
        return false;
      }
      const normalizedUser = String(user).trim().toLowerCase();
      const normalizedPass = String(pass).trim();

      if (Store.isRemoteApiEnabled()) {
        try {
          const res = await Store.loginRemote(normalizedUser, normalizedPass);
          if (res && res.ok) {
            this._finishLogin(user, normalizedUser);
            return true;
          }
        } catch {
          ToastService.show('Falha ao autenticar no servidor', 'danger');
          return false;
        }
        ToastService.show('Usuário ou senha inválidos', 'danger');
        return false;
      }

      const validLocal = this._getAllowedUsers().some(
        item => item.user.toLowerCase() === normalizedUser && item.pass === normalizedPass
      );
      if (!validLocal) {
        if (!this._getAllowedUsers().length) {
          ToastService.show('Autenticação indisponível: configure `authUsers` em `config.js` ou use deploy com API.', 'danger');
        } else {
          ToastService.show('Usuário ou senha inválidos', 'danger');
        }
        return false;
      }

      this._finishLogin(user, normalizedUser);
      return true;
    },
    logout() {
      Controllers.teamChat?.stop?.();
      Controllers.teamChat?.stopBackgroundNotify?.();
      try {
        localStorage.removeItem(CHAT_MENTION_INBOX_KEY);
      } catch {
        /* ignore */
      }
      ChatMentionNotifs._closePanel();
      ChatMentionNotifs.syncBellUi();
      localStorage.removeItem(this._sessionKey);
      localStorage.removeItem(this._displayNameKey);
      localStorage.removeItem(this._sessionUserKey);
      this._lock();
      const passInput = document.getElementById('loginPass');
      if (passInput) passInput.value = '';
      this._syncSidebarUser();
      ToastService.show('Sessão encerrada', 'info');
    },
    init() {
      if (this._isAuthenticated()) this._unlock();
      else this._lock();
      this._syncSidebarUser();

      const form = document.getElementById('loginForm');
      form?.addEventListener('submit', async e => {
        e.preventDefault();
        if (this._submitting) return;
        this._submitting = true;
        const submitBtn = document.getElementById('loginSubmitBtn');
        const prevLabel = submitBtn ? submitBtn.textContent : '';
        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.setAttribute('aria-busy', 'true');
            submitBtn.textContent = 'Entrando…';
          }
          const user = document.getElementById('loginUser')?.value.trim();
          const pass = document.getElementById('loginPass')?.value.trim();

          const ok = await this._login(user, pass);
          if (ok) {
            ToastService.show('Login realizado com sucesso', 'success');
            if (Store.isRemoteApiEnabled()) {
              void (async () => {
                const synced = await Promise.race([
                  Store.bootstrapFromRemote(),
                  new Promise((r) => setTimeout(() => r(false), 12000)),
                ]);
                if (synced) UI.syncAfterRemoteBootstrap();
              })();
            }
          }
        } finally {
          this._submitting = false;
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.removeAttribute('aria-busy');
            submitBtn.textContent = prevLabel || 'Entrar';
          }
        }
      });

      document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
    },
  },

  sidebar: {
    MOBILE_MQ: typeof window !== 'undefined' ? window.matchMedia('(max-width: 960px)') : { matches: false, addEventListener: () => {} },

    isMobileNav() {
      return this.MOBILE_MQ.matches;
    },

    closeMobileNav() {
      document.body.classList.remove('nav-open');
      const btn = document.getElementById('mobileNavBtn');
      if (btn) {
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', 'Abrir menu');
      }
      const bd = document.getElementById('sidebarBackdrop');
      if (bd) {
        bd.hidden = true;
        bd.setAttribute('aria-hidden', 'true');
      }
    },

    openMobileNav() {
      document.body.classList.add('nav-open');
      const btn = document.getElementById('mobileNavBtn');
      if (btn) {
        btn.setAttribute('aria-expanded', 'true');
        btn.setAttribute('aria-label', 'Fechar menu');
      }
      const bd = document.getElementById('sidebarBackdrop');
      if (bd) {
        bd.hidden = false;
        bd.setAttribute('aria-hidden', 'false');
      }
    },

    toggleMobileNav() {
      if (document.body.classList.contains('nav-open')) this.closeMobileNav();
      else this.openMobileNav();
    },

    init() {
      const sidebar = document.getElementById('sidebar');
      const collapseBtn = document.getElementById('collapseBtn');

      collapseBtn.addEventListener('click', () => {
        if (this.isMobileNav()) {
          this.closeMobileNav();
          return;
        }
        sidebar.classList.toggle('collapsed');
        Store.sidebarOpen = !sidebar.classList.contains('collapsed');
      });

      document.getElementById('mobileNavBtn')?.addEventListener('click', () => this.toggleMobileNav());
      document.getElementById('sidebarBackdrop')?.addEventListener('click', () => this.closeMobileNav());

      const onViewportNavMode = e => {
        if (!e.matches) {
          this.closeMobileNav();
          if (!Store.sidebarOpen) sidebar.classList.add('collapsed');
          else sidebar.classList.remove('collapsed');
        }
      };
      if (typeof this.MOBILE_MQ.addEventListener === 'function') {
        this.MOBILE_MQ.addEventListener('change', onViewportNavMode);
      } else if (typeof this.MOBILE_MQ.addListener === 'function') {
        this.MOBILE_MQ.addListener(onViewportNavMode);
      }

      document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
          if (this.isMobileNav()) this.closeMobileNav();
        });
      });

      document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
        btn.addEventListener('click', () => UI.navigateTo(btn.dataset.page));
      });
    },
  },

  task: {
    _clearForm() {
      document.getElementById('f-titulo').value      = '';
      document.getElementById('f-responsavel').value = '';
      document.getElementById('f-prazo').value       = '';
      document.getElementById('f-status').value      = 'Pendente';
      document.getElementById('f-prioridade').value  = 'Alta';
    },

    _validate() {
      let titulo      = document.getElementById('f-titulo').value.trim();
      let responsavel = document.getElementById('f-responsavel').value.trim();
      if (!titulo)      titulo = 'Nova tarefa';
      if (!responsavel) responsavel = getSignedUserName();
      return {
        titulo, responsavel,
        prazo:      document.getElementById('f-prazo').value,
        status:     document.getElementById('f-status').value,
        prioridade: document.getElementById('f-prioridade').value,
      };
    },

    openNewModal() {
      Store.editingTaskId = null;
      document.getElementById('taskModalTitle').textContent = 'Nova tarefa';
      this._clearForm();
      ModalService.open('taskModal');
    },

    openEditModal(id) {
      const task = Store.findTask(id);
      if (!task) return;
      Store.editingTaskId = id;
      document.getElementById('taskModalTitle').textContent  = 'Editar tarefa';
      document.getElementById('f-titulo').value          = task.titulo;
      document.getElementById('f-responsavel').value     = task.responsavel;
      document.getElementById('f-prazo').value           = task.prazo || '';
      document.getElementById('f-status').value          = task.status;
      document.getElementById('f-prioridade').value      = task.prioridade;
      ModalService.open('taskModal');
    },

    save() {
      const data = this._validate();
      if (!data) return;

      if (Store.editingTaskId) {
        Store.updateTask(Store.editingTaskId, data);
        ToastService.show('Tarefa atualizada com sucesso', 'success');
      } else {
        Store.addTask(data);
        ToastService.show('Tarefa criada com sucesso', 'success');
      }

      ModalService.close('taskModal');
      UI.renderDashboard();
    },

    toggleDone(id, source = 'dashboard') {
      if (source === 'operacional') {
        const task = Store.findOpTask(id);
        if (!task) return;
        const wasDone = task.status === 'Concluída' || task.status === 'Finalizada';
        const nextStatus = wasDone ? 'Em andamento' : 'Concluída';
        OpTaskService.changeStatus(id, nextStatus);
        UI.refreshOperationalUi();
      } else {
        const task = Store.findTask(id);
        if (!task) return;
        const wasDone = task.status === 'Concluída';
        Store.updateTask(id, { status: wasDone ? 'Pendente' : 'Concluída' });
      }
      UI.renderDashboard();
    },

    init() {
      document.getElementById('openTaskModalBtn')?.addEventListener('click', () => this.openNewModal());
      document.getElementById('saveTaskBtn').addEventListener('click', () => this.save());
      ['closeTaskModal','cancelTaskModal'].forEach(id =>
        document.getElementById(id)?.addEventListener('click', () => ModalService.close('taskModal'))
      );

      document.getElementById('refreshBtn').addEventListener('click', async () => {
        if (Store.isRemoteApiEnabled() && Controllers.auth._isAuthenticated()) {
          const updated = await Promise.race([
            Store.bootstrapFromRemote(),
            new Promise((r) => setTimeout(() => r(false), 12000)),
          ]);
          if (updated) {
            UI.syncAfterRemoteBootstrap();
            ToastService.show('Dados sincronizados com o servidor', 'success');
            return;
          }
        }
        UI.renderDashboard();
      });
    },
  },

  opTask: {
    _syncSelectedTecnicoChatId() {
      const input = document.getElementById('op-responsavel');
      const hidden = document.getElementById('op-responsavel-chatid');
      if (!input || !hidden) return;
      const key = normalizeTechName(input.value);
      const match = getAllTechsForOpSelect().find(t => t.key === key);
      hidden.value = match ? match.chatUserId : '';
    },
    _newTaskPreset: null,
    _coordsLookupTimer: null,
    _setorCtoLookupTimer: null,
    _isAtendimentoCategory(category = Store.currentOpCategory) {
      return category === 'atendimento-cliente';
    },
    _isOtimizacaoRedeCategory(category = Store.currentOpCategory) {
      return category === 'otimizacao-rede';
    },
    // Otimização de rede: src de imagem relativo → URL da API; <img> soltas viram bloco com botão remover.
    _normalizeOtimDescricaoImgSrcForEdit(html) {
      if (!html || typeof html !== 'string') return '';
      const base = String(ApiService.baseUrl || '').replace(/\/$/, '');
      if (!base) return html;
      let h = html;
      h = h.replace(/src=(["'])api\/op_task_image\.php/gi, `src=$1${base}/op_task_image.php`);
      h = h.replace(/src=(["'])op_task_image\.php/gi, `src=$1${base}/op_task_image.php`);
      return h;
    },
    _buildOtimDescImageWrap(src) {
      const wrap = document.createElement('span');
      wrap.className = 'op-editor-img-wrap';
      wrap.contentEditable = 'false';
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'op-editor-img-remove';
      btn.setAttribute('aria-label', 'Remover imagem');
      btn.title = 'Remover imagem';
      btn.textContent = '×';
      wrap.appendChild(img);
      wrap.appendChild(btn);
      return wrap;
    },
    _wrapBareOtimDescricaoImages(container) {
      if (!container) return;
      const list = [...container.querySelectorAll('img')].filter(im => !im.closest('.op-editor-img-wrap'));
      list.forEach((img) => {
        const wrap = this._buildOtimDescImageWrap(img.getAttribute('src') || img.src);
        img.replaceWith(wrap);
      });
    },
    _isAtendimentoClienteCategory(category = Store.currentOpCategory) {
      return category === 'atendimento-cliente';
    },
    _isRompimentoCategory(category = Store.currentOpCategory) {
      return category === 'rompimentos';
    },
    _isTrocaPosteCategory(category = Store.currentOpCategory) {
      return category === 'troca-poste';
    },
    _toggleGroup(groupId, visible) {
      const el = document.getElementById(groupId);
      if (!el) return;
      el.style.display = visible ? '' : 'none';
    },
    _parseCoords(raw) {
      if (!raw) return null;
      const normalized = raw.replace(/\s+/g, '');
      const parts = normalized.split(',');
      if (parts.length !== 2) return null;
      const lat = Number(parts[0]);
      const lon = Number(parts[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
      return { lat, lon };
    },
    // Nominatim (OSM): lat,lon → rua/bairro nos campos do modal conforme ctx (rompimento / otim / cemig).
    async _resolveCoordsToAddress(rawCoords, ctx = 'rompimento') {
      const coords = this._parseCoords(rawCoords);
      const ids =
        ctx === 'otim'
          ? { address: 'op-otim-address', hint: 'op-otim-address-hint' }
          : ctx === 'cemig'
            ? { address: 'op-cemig-address', hint: 'op-cemig-address-hint' }
            : { address: 'op-address-readonly', hint: 'op-address-hint' };
      const addressInput = document.getElementById(ids.address);
      const hint = document.getElementById(ids.hint);
      if (!addressInput || !hint) return;

      if (!coords) {
        addressInput.value = '';
        hint.textContent = 'Coordenadas inválidas. Use o formato: latitude, longitude.';
        return;
      }

      hint.textContent = 'Buscando endereço...';
      try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.lat}&lon=${coords.lon}&zoom=18&addressdetails=1`;
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
          },
        });
        if (!response.ok) throw new Error('Falha na consulta');
        const payload = await response.json();
        const addr = payload?.address || {};
        const rua = addr.road || addr.pedestrian || addr.residential || addr.path || '';
        const bairro = addr.suburb || addr.neighbourhood || addr.city_district || addr.quarter || '';
        const text = [rua, bairro].filter(Boolean).join(' - ');
        if (!text) {
          addressInput.value = '';
          hint.textContent = 'Não foi possível identificar rua e bairro para essas coordenadas.';
          return;
        }
        addressInput.value = text;
        hint.textContent = 'Localização identificada automaticamente.';
      } catch {
        addressInput.value = '';
        hint.textContent = 'Não foi possível converter coordenadas em endereço agora.';
      }
    },
    _applyCtoLookupFromSetor() {
      if (!this._isRompimentoCategory()) return;
      const setorHint = document.getElementById('op-setor-cto-hint');
      const setorEl = document.getElementById('op-setor-cto');
      if (!setorEl) return;
      const q = setorEl.value.trim();
      if (!q) {
        if (setorHint) setorHint.textContent = '';
        return;
      }
      CtoLocationRegistry.load().then(() => {
        if (!this._isRompimentoCategory()) return;
        const hit = CtoLocationRegistry.findByQuery(q);
        const coordsInput = document.getElementById('op-coords');
        if (!hit) {
          if (setorHint && q.length >= 4) {
            setorHint.textContent = 'Não encontrado na base — preencha as coordenadas manualmente.';
          } else if (setorHint) setorHint.textContent = '';
          return;
        }
        if (setorHint) {
          setorHint.textContent = `Base: ${hit.nome} (ajuste as coordenadas se o ponto da tarefa for outro).`;
        }
        if (!coordsInput) return;
        coordsInput.value = `${hit.lat}, ${hit.lng}`;
        this._resolveCoordsToAddress(coordsInput.value);
      });
    },
    // Devolve prioridade/região/título ao layout padrão do modal ao trocar categoria (ATD vs rompimento etc.).
    _restoreOpModalLayout() {
      const body = document.getElementById('opTaskModalBody');
      const priorityRow = document.getElementById('opPriorityRegionRow');
      const prioridade = document.getElementById('opPrioridadeGroup');
      const mainRow = document.getElementById('opMainRow');
      const responsavel = document.getElementById('opResponsavelGroup');
      const prazoGroup = document.getElementById('opPrazoGroup');
      const tituloGrp = document.getElementById('opTituloGroup');
      if (!body || !priorityRow || !prioridade) return;
      priorityRow.appendChild(prioridade);
      if (mainRow && responsavel) mainRow.appendChild(responsavel);
      const marker = document.getElementById('opRompimentoExtraRow');
      const chain = [tituloGrp, prazoGroup, priorityRow, mainRow].filter(Boolean);
      if (marker && marker.parentNode === body) {
        marker.before(...chain);
      }
      this._restoreOtimRedeLayout();
    },
    _restoreOtimRedeLayout() {
      const priorityRow = document.getElementById('opPriorityRegionRow');
      const prioridade = document.getElementById('opPrioridadeGroup');
      const mainRow = document.getElementById('opMainRow');
      const responsavel = document.getElementById('opResponsavelGroup');
      if (priorityRow && prioridade && prioridade.parentElement !== priorityRow) {
        priorityRow.appendChild(prioridade);
      }
      if (mainRow && responsavel && responsavel.parentElement !== mainRow) {
        mainRow.appendChild(responsavel);
      }
    },
    _syncRompimentoRegiaoPlacement() {
      /* Região removida da UI. */
    },
    _syncCoordsBlockUi(isRompimento, isTrocaPoste) {
      const block = document.getElementById('opRompimentoCoordsRow');
      const coordsInput = document.getElementById('op-coords');
      const hint = document.getElementById('op-address-hint');
      if (!block) return;
      const cLab = block.querySelector('label[for="op-coords"]');
      const aLab = block.querySelector('label[for="op-address-readonly"]');
      if (isTrocaPoste) {
        if (cLab) cLab.textContent = 'Coordenadas';
        if (aLab) aLab.textContent = 'Endereço (rua e bairro)';
        if (coordsInput) {
          coordsInput.placeholder = 'Latitude e longitude (ex.: -19.85, -42.95)';
          coordsInput.removeAttribute('readonly');
        }
        if (hint && !document.getElementById('op-address-readonly')?.value) {
          hint.textContent = 'Digite as coordenadas; rua e bairro serão preenchidos automaticamente.';
        }
      } else if (isRompimento) {
        if (cLab) cLab.textContent = 'Coordenadas';
        if (aLab) aLab.textContent = 'Endereço (rua / bairro)';
        if (coordsInput) coordsInput.placeholder = 'Preenchidas pela CTO ou edite manualmente';
      } else {
        if (cLab) cLab.textContent = 'Coordenadas';
        if (aLab) aLab.textContent = 'Endereço (rua / bairro)';
        if (coordsInput) coordsInput.placeholder = 'Preenchidas pela CTO ou edite manualmente';
      }
    },
    _syncCategorySpecificFields(category = Store.currentOpCategory) {
      const isAtendimento = this._isAtendimentoCategory(category);
      const isOtimRede = this._isOtimizacaoRedeCategory(category);
      const isCemig = category === 'certificacao-cemig';
      const isRompimento = this._isRompimentoCategory(category);
      const isTrocaPoste = this._isTrocaPosteCategory(category);
      const modalTitle = document.getElementById('opTaskModalTitle');
      const modalWrap = document.getElementById('opTaskModal');

      this._restoreOpModalLayout();
      this._syncRompimentoRegiaoPlacement();
      if (modalWrap) {
        modalWrap.classList.toggle('rompimento-mode', isRompimento);
        modalWrap.classList.toggle('troca-poste-mode', isTrocaPoste);
        modalWrap.classList.toggle('otim-rede-mode', isOtimRede);
        modalWrap.classList.toggle('cemig-mode', isCemig);
      }

      this._toggleGroup('opTituloGroup', !isTrocaPoste && !isCemig);
      this._toggleGroup('opPrazoGroup', !isOtimRede);
      this._toggleGroup('opPriorityRegionRow', !isRompimento && !isOtimRede && !isCemig);

      this._toggleGroup('opParentConfig', isAtendimento);
      this._toggleGroup('opRompimentoCoordsRow', !isRompimento && (isTrocaPoste));
      this._toggleGroup('opRompimentoExtraRow', false);
      this._toggleGroup('opRompimentoSetorGroup', false);

      this._syncCoordsBlockUi(isRompimento, isTrocaPoste);

      if (isTrocaPoste) {
        const priorityRow = document.getElementById('opPriorityRegionRow');
        const prioridade = document.getElementById('opPrioridadeGroup');
        const mainRow = document.getElementById('opMainRow');
        if (priorityRow && prioridade) priorityRow.appendChild(prioridade);
        if (mainRow && priorityRow) mainRow.before(priorityRow);
      }

      const tituloLab = document.querySelector('label[for="op-titulo"]');
      const tecRespLab = document.querySelector('label[for="op-responsavel"]');
      const prazoLab = document.querySelector('label[for="op-prazo"]');
      if (isOtimRede) {
        this._toggleGroup('opMainRow', false);
        this._toggleGroup('opOtimRedeWrap', true);
        this._toggleGroup('opCemigWrap', false);
        if (tituloLab) tituloLab.textContent = 'Nome';
        if (tecRespLab) tecRespLab.textContent = 'Técnico';
        const tecSlot = document.getElementById('opOtimTecSlot');
        const respG = document.getElementById('opResponsavelGroup');
        if (tecSlot && respG) tecSlot.appendChild(respG);
      } else if (isCemig) {
        this._toggleGroup('opMainRow', false);
        this._toggleGroup('opOtimRedeWrap', false);
        this._toggleGroup('opCemigWrap', true);
        if (tecRespLab) tecRespLab.textContent = 'Técnico';
        if (prazoLab) prazoLab.textContent = 'Data final para conclusão';
        const tecSlot = document.getElementById('opCemigTecSlot');
        const prazoSlot = document.getElementById('opCemigPrazoSlot');
        const respG = document.getElementById('opResponsavelGroup');
        const prazoG = document.getElementById('opPrazoGroup');
        if (tecSlot && respG) tecSlot.appendChild(respG);
        if (prazoSlot && prazoG) prazoSlot.appendChild(prazoG);
      } else {
        this._toggleGroup('opOtimRedeWrap', false);
        this._toggleGroup('opCemigWrap', false);
        this._toggleGroup('opMainRow', true);
        if (tituloLab) tituloLab.textContent = 'Nome da tarefa';
        if (tecRespLab) tecRespLab.textContent = isRompimento ? 'Responsável pela tarefa' : 'Técnico responsável';
        if (prazoLab) prazoLab.textContent = 'Data de vencimento';
      }

      if (modalTitle && !Store.editingOpTaskId) {
        if (isRompimento) modalTitle.textContent = 'Nova tarefa';
        else if (isTrocaPoste) modalTitle.textContent = 'Nova troca de poste';
        else if (category === 'certificacao-cemig') modalTitle.textContent = 'Nova certificação Cemig';
        else if (isOtimRede) modalTitle.textContent = 'Nova otimização de rede';
        else if (category === 'atendimento-cliente') {
          const hid = document.getElementById('op-parent-task-id');
          const isListaPai = !String(hid?.value || '').trim();
          modalTitle.textContent = isListaPai ? 'Nova lista de atendimento' : 'Nova ordem de serviço';
        } else modalTitle.textContent = 'Nova tarefa';
      }

    },
    _syncAtendimentoKindFields() {
      const modalCat = Store.editingOpTaskId
        ? (Store.findOpTask(Store.editingOpTaskId)?.categoria || Store.currentOpCategory)
        : (this._newTaskPreset?.category || Store.currentOpCategory);
      if (modalCat === 'otimizacao-rede') {
        const atdWrap = document.getElementById('opAtdParentOnlyWrap');
        const atdChildWrap = document.getElementById('opAtdChildOnlyWrap');
        const mainRow = document.getElementById('opMainRow');
        const priorityRow = document.getElementById('opPriorityRegionRow');
        const prazoInput = document.getElementById('op-prazo');
        const prazoGroup = prazoInput?.closest('.form-group');
        const responsavelInput = document.getElementById('op-responsavel');
        if (atdWrap) atdWrap.style.display = 'none';
        if (atdChildWrap) atdChildWrap.style.display = 'none';
        if (mainRow) mainRow.style.display = 'none';
        if (priorityRow) priorityRow.style.display = 'none';
        if (prazoGroup) prazoGroup.style.display = 'none';
        if (responsavelInput) responsavelInput.disabled = false;
        this._syncSelectedTecnicoChatId();
        return;
      }

      if (modalCat === 'certificacao-cemig') {
        const atdWrap = document.getElementById('opAtdParentOnlyWrap');
        const atdChildWrap = document.getElementById('opAtdChildOnlyWrap');
        const mainRow = document.getElementById('opMainRow');
        const priorityRow = document.getElementById('opPriorityRegionRow');
        const responsavelInput = document.getElementById('op-responsavel');
        const prazoInput = document.getElementById('op-prazo');
        const prazoGroup = prazoInput?.closest('.form-group');
        const responsavelGroup = responsavelInput?.closest('.form-group');
        if (atdWrap) atdWrap.style.display = 'none';
        if (atdChildWrap) atdChildWrap.style.display = 'none';
        if (mainRow) mainRow.style.display = 'none';
        if (priorityRow) priorityRow.style.display = 'none';
        [responsavelGroup, prazoGroup].forEach((g) => {
          if (g) g.style.display = '';
        });
        if (responsavelInput) responsavelInput.disabled = false;
        if (prazoInput) prazoInput.disabled = false;
        this._syncSelectedTecnicoChatId();
        return;
      }

      const hiddenParent = document.getElementById('op-parent-task-id');
      const isParent = !String(hiddenParent?.value || '').trim();
      const responsavelInput = document.getElementById('op-responsavel');
      const prazoInput = document.getElementById('op-prazo');
      const responsavelGroup = responsavelInput?.closest('.form-group');
      const prazoGroup = prazoInput?.closest('.form-group');
      const isRompimento = modalCat === 'rompimentos';
      const isTrocaPoste = modalCat === 'troca-poste';
      const isAtdCliente = modalCat === 'atendimento-cliente';
      const atdWrap = document.getElementById('opAtdParentOnlyWrap');
      const atdChildWrap = document.getElementById('opAtdChildOnlyWrap');
      const prioridadeSlot = document.getElementById('opAtdPrioridadeSlot');
      const childTecnicoSlot = document.getElementById('opAtdChildTecnicoSlot');
      const priorityRow = document.getElementById('opPriorityRegionRow');
      const mainRow = document.getElementById('opMainRow');

      [responsavelGroup, prazoGroup].forEach(group => {
        if (!group) return;
        if (isRompimento || isTrocaPoste) {
          group.style.display = '';
          return;
        }
        group.style.display = isParent ? '' : 'none';
      });

      const atdParentOnly = isAtdCliente && isParent && !isRompimento && !isTrocaPoste;
      const atdChildOnly = isAtdCliente && !isParent && !isRompimento && !isTrocaPoste;

      if (atdWrap) atdWrap.style.display = atdParentOnly ? '' : 'none';
      if (atdChildWrap) atdChildWrap.style.display = atdChildOnly ? '' : 'none';
      if (mainRow) mainRow.style.display = atdParentOnly ? 'none' : '';
      if (priorityRow) priorityRow.style.display = atdParentOnly ? 'none' : '';

      if (atdParentOnly) {
        const prioridadeGroup = document.getElementById('opPrioridadeGroup');
        if (prioridadeSlot && prioridadeGroup && prioridadeGroup.parentElement !== prioridadeSlot) {
          prioridadeSlot.appendChild(prioridadeGroup);
        }
        const parentTecSlotI = document.getElementById('opAtdParentTecnicoSlot');
        const tecGroupParent = responsavelInput?.closest('.form-group');
        if (parentTecSlotI && tecGroupParent && tecGroupParent.parentElement !== parentTecSlotI) {
          parentTecSlotI.appendChild(tecGroupParent);
        }
      }

      if (atdChildOnly) {
        const tecGroup = responsavelInput?.closest('.form-group');
        if (childTecnicoSlot && tecGroup && tecGroup.parentElement !== childTecnicoSlot) {
          childTecnicoSlot.appendChild(tecGroup);
        }
        if (tecGroup) tecGroup.style.display = '';
        if (prazoGroup) prazoGroup.style.display = 'none';
        if (priorityRow) priorityRow.style.display = 'none';
      } else {
        if (prazoGroup) prazoGroup.style.display = '';
      }

      if (responsavelInput) {
        if (atdParentOnly || atdChildOnly || isRompimento || isTrocaPoste) responsavelInput.disabled = false;
        else responsavelInput.disabled = !isParent;
      }
      if (prazoInput) {
        prazoInput.disabled = atdParentOnly ? true : (!isRompimento && !isParent);
      }

      const tituloGrp = document.getElementById('opTituloGroup');
      const tituloLabS = document.querySelector('label[for="op-titulo"]');
      if (tituloGrp) {
        if (atdParentOnly || atdChildOnly) tituloGrp.style.display = 'none';
        else {
          tituloGrp.style.display = '';
          if (tituloLabS && isAtdCliente) tituloLabS.textContent = 'Nome da tarefa';
        }
      }

      this._syncSelectedTecnicoChatId();
    },

    _syncParentHidden(currentTask = null) {
      const hidden = document.getElementById('op-parent-task-id');
      if (!hidden) return;
      if (currentTask && currentTask.parentTaskId) hidden.value = String(currentTask.parentTaskId);
      else if (this._newTaskPreset?.parentTaskId) hidden.value = String(this._newTaskPreset.parentTaskId);
      else hidden.value = '';
    },
    _closeAtdStatusDropdown() {
      const dd = document.getElementById('opAtdStatusDropdown');
      if (!dd) return;
      dd.hidden = true;
      delete dd.dataset.childId;
    },
    _positionAtdStatusDropdown(anchorEl) {
      const dd = document.getElementById('opAtdStatusDropdown');
      if (!dd || !anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const ddW = dd.offsetWidth || 188;
      const ddH = dd.offsetHeight || 120;
      let left = rect.left;
      let top = rect.bottom + 6;
      if (left + ddW > window.innerWidth - 8) left = window.innerWidth - ddW - 8;
      if (left < 8) left = 8;
      if (top + ddH > window.innerHeight - 8) top = rect.top - ddH - 6;
      if (top < 8) top = 8;
      dd.style.left = `${Math.round(left)}px`;
      dd.style.top = `${Math.round(top)}px`;
    },
    _resetAtdChildrenListExpand() {
      const wrap = document.getElementById('opAtdChildrenWrap');
      const btn = document.getElementById('opAtdChildrenExpandBtn');
      if (wrap) wrap.classList.remove('is-expanded');
      if (btn) {
        btn.setAttribute('aria-expanded', 'false');
        btn.title = 'Expandir lista';
        btn.setAttribute('aria-label', 'Expandir lista de ordens de serviço vinculadas');
      }
    },
    _refreshAtdChildrenList() {
      const childrenWrap = document.getElementById('opAtdChildrenWrap');
      const childrenList = document.getElementById('opAtdChildrenList');
      if (!childrenWrap || !childrenList) return;

      const category = this._newTaskPreset?.category || Store.currentOpCategory;
      const parentHidden = document.getElementById('op-parent-task-id');
      const parentIdRaw = parentHidden?.value || '';
      const parentId = parentIdRaw ? Number(parentIdRaw) : null;

      const isAtdChild = this._isAtendimentoCategory(category) && !!parentId;
      if (!isAtdChild) {
        this._resetAtdChildrenListExpand();
        childrenWrap.style.display = 'none';
        childrenList.innerHTML = '';
        return;
      }

      const all = Store.getOpTasks()
        .filter(t => t.categoria === 'atendimento-cliente' && Number(t.parentTaskId) === parentId);
      if (!all.length) {
        childrenList.innerHTML = '<li><span class="atd-modal-children-meta">Nenhuma ordem de serviço vinculada ainda.</span></li>';
      } else {
        childrenList.innerHTML = all.map((t) => {
          const title = Utils.escapeHtml(t.titulo || t.ordemServico || '(sem título)');
          const who = Utils.escapeHtml(t.responsavel || '—');
          const prazo = t.prazo ? Utils.formatDate(t.prazo) : 'sem prazo';
          const status = Utils.escapeHtml(t.status || 'Pendente');
          const isDone = ['Concluída', 'Finalizada', 'Finalizado'].includes(t.status);
          const isEmAndamento = !isDone && t.status === 'Em andamento';
          const liClass = [isDone && 'done', isEmAndamento && 'atd-in-progress'].filter(Boolean).join(' ');
          return `
            <li class="${liClass}">
              <label class="atd-modal-children-check">
                <input type="checkbox" data-child-id="${t.id}" ${isDone ? 'checked' : ''} />
              </label>
              <div class="atd-modal-children-main">
                <span class="atd-modal-children-title">${title}</span>
                <span class="atd-modal-children-meta">${who} · ${prazo}</span>
              </div>
              ${Utils.taskCopyProtocolButtonHtml(Utils.opTaskDisplayRef(t), 'task-copy-id-btn--sm')}
              <span class="atd-modal-children-status">${status}</span>
            </li>
          `;
        }).join('');
      }
      childrenWrap.style.display = '';

      if (!childrenList.dataset.boundStatusClick) {
        childrenList.addEventListener('click', (e) => {
          const wrap = e.target.closest('.atd-modal-children-check');
          const input = wrap?.querySelector('input[type=checkbox]');
          if (!input) return;
          e.preventDefault();
          e.stopPropagation();
          const id = Number(input.dataset.childId || 0);
          if (!id) return;
          const dd = document.getElementById('opAtdStatusDropdown');
          if (!dd) return;
          if (!dd.hidden && dd.dataset.childId === String(id)) {
            this._closeAtdStatusDropdown();
            return;
          }
          dd.dataset.childId = String(id);
          dd.hidden = false;
          requestAnimationFrame(() => {
            this._positionAtdStatusDropdown(input);
            document.getElementById('opAtdStatusDropdown')?.querySelector('.atd-status-dropdown-item')?.focus();
          });
        });
        childrenList.dataset.boundStatusClick = '1';
      }
    },
    _regionTaskPrefix(regionRaw = '') {
      const norm = WebhookService._normalizeRegionKey(regionRaw);
      if (norm === 'GOVAL') return 'GV';
      if (norm === 'VALE_DO_ACO') return 'VL';
      if (norm === 'CARATINGA') return 'CA';
      return '';
    },
    _nextTaskCode(category = Store.currentOpCategory, regionRaw = '') {
      const prefixMap = {
        'rompimentos': 'ROM',
        'troca-poste': 'POS',
        'atendimento-cliente': 'ATD',
        'otimizacao-rede': 'NET',
        'certificacao-cemig': 'CEM',
      };
      const prefix = prefixMap[category] || 'ROM';
      const count = Store.getOpTasks()
        .filter(t => t.categoria === category)
        .filter(t => !(category === 'atendimento-cliente' && t.parentTaskId))
        .length + 1;
      const regionPrefix = this._regionTaskPrefix(regionRaw);
      const base = `${prefix}-${String(count).padStart(4, '0')}`;
      return regionPrefix ? `${regionPrefix}-${base}` : base;
    },

    _fallbackTaskCode(task) {
      const prefixMap = {
        'rompimentos': 'ROM',
        'troca-poste': 'POS',
        'atendimento-cliente': 'ATD',
        'otimizacao-rede': 'NET',
        'certificacao-cemig': 'CEM',
      };
      const prefix = prefixMap[task.categoria] || 'ROM';
      const regionPrefix = this._regionTaskPrefix(task?.regiao);
      const base = `${prefix}-${String(task.id).padStart(4, '0')}`;
      return regionPrefix ? `${regionPrefix}-${base}` : base;
    },

    _clearForm(preset = {}) {
      const category = preset.category || Store.currentOpCategory;
      document.getElementById('op-titulo').value      = '';
      const respClear = document.getElementById('op-responsavel');
      if (respClear) {
        respClear.value = '';
        const chatIdHidden = document.getElementById('op-responsavel-chatid');
        if (chatIdHidden) chatIdHidden.value = '';
      }
      const proto = document.getElementById('op-atd-protocolo');
      const dataEnt = document.getElementById('op-atd-data-entrada');
      const subp = document.getElementById('op-atd-subprocesso');
      const dataInst = document.getElementById('op-atd-data-instalacao');
      const os = document.getElementById('op-atd-ordem-servico');
      const desc = document.getElementById('op-atd-descricao');
      const nomeCliClear = document.getElementById('op-atd-nome-cliente');
      if (nomeCliClear) nomeCliClear.value = '';
      const childTituloClear = document.getElementById('op-atd-child-titulo');
      if (childTituloClear) childTituloClear.value = '';
      if (proto) proto.value = '';
      if (dataEnt) dataEnt.value = '';
      if (subp) subp.value = '';
      if (dataInst) dataInst.value = '';
      if (os) os.value = '';
      if (desc) desc.value = '';
      const opOtimProto = document.getElementById('op-otim-protocolo');
      const opOtimOs = document.getElementById('op-otim-ordem-servico');
      if (opOtimProto) opOtimProto.value = '';
      if (opOtimOs) opOtimOs.value = '';
      const otimDescClear = document.getElementById('op-otim-descricao');
      if (otimDescClear) otimDescClear.innerHTML = '';
      const cemigProtoClear = document.getElementById('op-cemig-protocolo');
      if (cemigProtoClear) cemigProtoClear.value = '';
      const cemigDescClear = document.getElementById('op-cemig-descricao');
      if (cemigDescClear) cemigDescClear.innerHTML = '';
      document.getElementById('op-prazo').value       = '';
      {
        const catClear = preset.category || Store.currentOpCategory;
        const priEl = document.getElementById('op-prioridade');
        if (priEl) {
          if (catClear === 'atendimento-cliente' || catClear === 'rompimentos') priEl.value = '';
          else priEl.value = 'Alta';
        }
      }
      const regiaoH = document.getElementById('op-regiao');
      if (regiaoH) regiaoH.value = '';
      const coordsInput = document.getElementById('op-coords');
      const addressInput = document.getElementById('op-address-readonly');
      const addressHint = document.getElementById('op-address-hint');
      if (coordsInput) coordsInput.value = '';
      if (addressInput) addressInput.value = '';
      if (addressHint) addressHint.textContent = 'Aguardando CTO ou coordenadas.';
      const otimGeoC = document.getElementById('op-otim-coords');
      const otimGeoA = document.getElementById('op-otim-address');
      const otimGeoH = document.getElementById('op-otim-address-hint');
      if (otimGeoC) otimGeoC.value = '';
      if (otimGeoA) otimGeoA.value = '';
      if (otimGeoH) otimGeoH.textContent = 'Opcional. Informe lat, long — o endereço é buscado automaticamente.';
      const cemigGeoC = document.getElementById('op-cemig-coords');
      const cemigGeoA = document.getElementById('op-cemig-address');
      const cemigGeoH = document.getElementById('op-cemig-address-hint');
      if (cemigGeoC) cemigGeoC.value = '';
      if (cemigGeoA) cemigGeoA.value = '';
      if (cemigGeoH) cemigGeoH.textContent = 'Opcional. Informe lat, long — o endereço é buscado automaticamente.';
      const setorCtoInput = document.getElementById('op-setor-cto');
      if (setorCtoInput) setorCtoInput.value = '';
      const setorHint = document.getElementById('op-setor-cto-hint');
      if (setorHint) setorHint.textContent = '';
      const parentHidden = document.getElementById('op-parent-task-id');
      if (parentHidden) parentHidden.value = preset.parentTaskId ? String(preset.parentTaskId) : '';
      this._refreshAtdChildrenList();
      this._syncParentHidden(null);
      this._syncCategorySpecificFields(category);
      this._newTaskPreset = { ...preset };
      this._syncAtendimentoKindFields();
      const modalCopyBtnClear = document.getElementById('opTaskModalCopyIdBtn');
      if (modalCopyBtnClear) {
        modalCopyBtnClear.hidden = true;
        delete modalCopyBtnClear.dataset.copyProtocol;
      }
    },

    _validate() {
      let titulo      = document.getElementById('op-titulo').value.trim();
      let responsavel = document.getElementById('op-responsavel').value.trim();
      const responsavelChatId = document.getElementById('op-responsavel-chatid')?.value?.trim() || '';
      let prazo       = document.getElementById('op-prazo').value;
      const existing = Store.editingOpTaskId ? Store.findOpTask(Store.editingOpTaskId) : null;
      const category = existing?.categoria
        || (this._newTaskPreset && this._newTaskPreset.category)
        || Store.currentOpCategory;
      const parentTaskIdRaw = document.getElementById('op-parent-task-id')?.value || '';
      const parentTaskId = parentTaskIdRaw ? Number(parentTaskIdRaw) : (existing?.parentTaskId ? Number(existing.parentTaskId) : null);
      const isParentTask = !parentTaskId;
      let regiao = document.getElementById('op-regiao')?.value ?? '';
      let protocoloRaw = document.getElementById('op-atd-protocolo')?.value?.trim() || '';
      let dataEntradaRaw = document.getElementById('op-atd-data-entrada')?.value || '';
      let subProcessoRaw = document.getElementById('op-atd-subprocesso')?.value?.trim() || '';
      const dataInstalacaoRaw = document.getElementById('op-atd-data-instalacao')?.value || '';
      const ordemServicoRaw = document.getElementById('op-atd-ordem-servico')?.value?.trim() || '';
      let descAtdRaw = document.getElementById('op-atd-descricao')?.value?.trim() || '';
      const nomeClienteRaw = document.getElementById('op-atd-nome-cliente')?.value?.trim() || '';
      const selectedParent = parentTaskId ? Store.findOpTask(parentTaskId) : null;
      const codeRegion = isParentTask ? regiao : (selectedParent?.regiao || regiao);
      const taskCode = existing?.taskCode || this._nextTaskCode(category, codeRegion);
      let coordsRaw = document.getElementById('op-coords')?.value.trim() || '';
      let autoAddress = document.getElementById('op-address-readonly')?.value.trim() || '';
      const otimGeoCoords = document.getElementById('op-otim-coords')?.value.trim() || '';
      const otimGeoAddress = document.getElementById('op-otim-address')?.value.trim() || '';
      const cemigGeoCoords = document.getElementById('op-cemig-coords')?.value.trim() || '';
      const cemigGeoAddress = document.getElementById('op-cemig-address')?.value.trim() || '';
      let clientesAfetadosRaw = document.getElementById('op-clientes-afetados')?.value.trim() || '';
      let setorCto = document.getElementById('op-setor-cto')?.value.trim() || '';
      const isRompimento = this._isRompimentoCategory(category);
      const isTrocaPoste = this._isTrocaPosteCategory(category);
      const isOtimRede = category === 'otimizacao-rede';
      const isCemig = category === 'certificacao-cemig';
      const otimProto = document.getElementById('op-otim-protocolo')?.value?.trim() || '';
      const otimOs = document.getElementById('op-otim-ordem-servico')?.value?.trim() || '';
      const cemigProto = document.getElementById('op-cemig-protocolo')?.value?.trim() || '';
      const isAtdParentOnly = this._isAtendimentoClienteCategory(category) && isParentTask && !isRompimento;
      const isAtdChildOnly = this._isAtendimentoClienteCategory(category) && !isParentTask && !isRompimento;

      if (isAtdChildOnly) {
        titulo = document.getElementById('op-atd-child-titulo')?.value?.trim() || '';
      }

      if (!isRompimento && !isTrocaPoste && !isCemig && !isOtimRede && !isAtdParentOnly && !isAtdChildOnly && !titulo) titulo = 'Sem título';
      if (!isRompimento && !isAtdParentOnly && !isAtdChildOnly && isParentTask && !responsavel && !isOtimRede && !isCemig) responsavel = getSignedUserName();
      if (!isRompimento && !isAtdParentOnly && !isAtdChildOnly && !isOtimRede && !isCemig && isParentTask && !prazo) prazo = Utils.todayIso();
      const prioridadeEl = document.getElementById('op-prioridade');
      if (!isRompimento && !isOtimRede && !isCemig && !isAtdParentOnly && !isAtdChildOnly && prioridadeEl && !prioridadeEl.value) {
        prioridadeEl.value = 'Média';
      }
      if (!isRompimento && isParentTask && !regiao && !isOtimRede && !isCemig && !this._isAtendimentoClienteCategory(category)) regiao = 'N/D';
      if (isRompimento) {
        setorCto = '';
        coordsRaw = '';
        autoAddress = '';
        clientesAfetadosRaw = '';
      } else {
        if (isTrocaPoste && !coordsRaw) coordsRaw = '0, 0';
        if (isTrocaPoste && !autoAddress) autoAddress = 'Local não informado (teste)';
      }
      if (this._isAtendimentoCategory(category) && !isParentTask && !selectedParent) {
        ToastService.show('Subtarefa inválida: crie pela tarefa pai', 'danger');
        return null;
      }

      const presetStatus = this._newTaskPreset?.status || null;
      const defaultStatus = category === 'certificacao-cemig'
        ? (presetStatus || 'Backlog')
        : this._isAtendimentoCategory(category)
          ? (isParentTask ? (presetStatus || 'Backlog') : 'A iniciar')
          : 'Criada';
      const currentStatus = existing?.status || defaultStatus;
      const normalizedStatus = (!isParentTask && this._isAtendimentoCategory(category) && (currentStatus === 'Backlog' || currentStatus === 'Criada'))
        ? 'A iniciar'
        : currentStatus;
      const finalTitulo = isRompimento
        ? titulo.trim()
        : (isTrocaPoste ? `Troca de poste - ${autoAddress}`
          : (isCemig
            ? (cemigProto ? `Cemig — ${cemigProto}` : (existing?.titulo || 'Certificação Cemig'))
            : (isOtimRede
              ? (titulo.trim() || (otimProto && otimOs ? `${otimProto} · ${otimOs}` : (otimProto || otimOs || existing?.titulo || 'Otimização de rede')))
              : (isAtdParentOnly
                ? (nomeClienteRaw || titulo.trim() || existing?.titulo || '')
                : (isAtdChildOnly
                  ? (titulo.trim() || existing?.titulo || '')
                  : titulo)))));
      const finalPrazo = isRompimento
        ? (prazo || '')
        : isOtimRede
          ? (prazo || Utils.todayIso())
          : isCemig
            ? (prazo || existing?.prazo || Utils.todayIso())
            : (isAtdParentOnly
              ? (prazo || existing?.prazo || '')
              : (isParentTask ? prazo : (selectedParent?.prazo || existing?.prazo || '')));
      const prioPick = prioridadeEl ? prioridadeEl.value : '';
      const finalPrioridade = isRompimento
        ? (prioPick || 'Média')
        : (isOtimRede || isCemig ? 'Média' : prioPick);
      const finalDescricaoMeta = isRompimento
        ? ''
        : (isTrocaPoste ? '' : '');
      const setorField = isRompimento
        ? ''
        : (isParentTask ? regiao : (selectedParent?.setor || selectedParent?.regiao || existing?.setor || ''));
      const regiaoField = isRompimento
        ? ''
        : (isParentTask ? regiao : (selectedParent?.regiao || selectedParent?.setor || existing?.regiao || ''));
      const finalResponsavelChatId = isParentTask
        ? responsavelChatId
        : (selectedParent?.responsavelChatId || existing?.responsavelChatId || '');
      const finalProtocolo = isOtimRede
        ? otimProto
        : isCemig
          ? cemigProto
          : (this._isAtendimentoClienteCategory(category) && isParentTask)
            ? protocoloRaw
            : (selectedParent?.protocolo || existing?.protocolo || '');
      const finalDataEntrada = (this._isAtendimentoClienteCategory(category) && isParentTask)
        ? dataEntradaRaw
        : (selectedParent?.dataEntrada || existing?.dataEntrada || '');
      const finalSubProcesso = (this._isAtendimentoClienteCategory(category) && isParentTask)
        ? subProcessoRaw
        : (selectedParent?.subProcesso || existing?.subProcesso || '');
      const finalDataInstalacao = (this._isAtendimentoClienteCategory(category) && isParentTask)
        ? dataInstalacaoRaw
        : (selectedParent?.dataInstalacao || existing?.dataInstalacao || '');
      const finalOrdemServico = isOtimRede
        ? otimOs
        : (this._isAtendimentoClienteCategory(category) && !isParentTask)
          ? ordemServicoRaw
          : (selectedParent?.ordemServico || existing?.ordemServico || '');
      const finalResponsavel = isAtdParentOnly
        ? (responsavel || existing?.responsavel || '')
        : (isOtimRede || isCemig
          ? (responsavel || existing?.responsavel || '')
          : (isParentTask
            ? responsavel
            : (isAtdChildOnly
              ? (responsavel || existing?.responsavel || selectedParent?.responsavel || '')
              : (responsavel || selectedParent?.responsavel || existing?.responsavel || getSignedUserName()))));
      const otimDescEl = document.getElementById('op-otim-descricao');
      const otimDescHtml = isOtimRede && otimDescEl ? String(otimDescEl.innerHTML || '').trim() : '';
      const cemigDescEl = document.getElementById('op-cemig-descricao');
      const cemigDescHtml = isCemig && cemigDescEl ? String(cemigDescEl.innerHTML || '').trim() : '';
      const finalDescricaoAtd = isOtimRede
        ? otimDescHtml
        : isCemig
          ? cemigDescHtml
          : (this._isAtendimentoClienteCategory(category) && !isParentTask)
            ? descAtdRaw
            : finalDescricaoMeta;
      const payload = {
        taskCode,
        titulo: finalTitulo,
        responsavel: finalResponsavel,
        responsavelChatId: finalResponsavelChatId,
        setor: setorField,
        regiao: regiaoField,
        protocolo: finalProtocolo,
        dataEntrada: finalDataEntrada,
        subProcesso: finalSubProcesso,
        dataInstalacao: finalDataInstalacao,
        ordemServico: finalOrdemServico,
        clientesAfetados: isRompimento ? '' : '',
        coordenadas: isRompimento ? '' : (isTrocaPoste ? coordsRaw : (isOtimRede ? otimGeoCoords : (isCemig ? cemigGeoCoords : ''))),
        localizacaoTexto: isRompimento ? '' : (isTrocaPoste ? autoAddress : (isOtimRede ? otimGeoAddress : (isCemig ? cemigGeoAddress : ''))),
        categoria:  category,
        prazo: finalPrazo,
        prioridade: finalPrioridade,
        descricao:  finalDescricaoAtd,
        status:     normalizedStatus,
        isParentTask: this._isAtendimentoCategory(category) ? isParentTask : false,
        parentTaskId: this._isAtendimentoCategory(category) ? (isParentTask ? null : parentTaskId) : null,
      };
      if (isAtdParentOnly) payload.nomeCliente = nomeClienteRaw;
      return payload;
    },

    openNewModal(preset = {}) {
      Store.editingOpTaskId = null;
      if (preset.category) Store.currentOpCategory = preset.category;
      const isAtd = this._isAtendimentoCategory(preset.category);
      document.getElementById('opTaskModalTitle').textContent =
        isAtd && preset.parentTaskId ? 'Nova ordem de serviço'
          : isAtd && !preset.parentTaskId ? 'Nova lista de atendimento'
            : 'Nova tarefa';
      const deleteBtn = document.getElementById('deleteOpTaskBtn');
      if (deleteBtn) deleteBtn.style.display = 'none';
      this._clearForm(preset);
      const hidden = document.getElementById('op-parent-task-id');
      if (hidden) hidden.value = preset.parentTaskId ? String(preset.parentTaskId) : '';
      this._syncAtendimentoKindFields();
      ModalService.open('opTaskModal');
    },

    openEditModal(id) {
      const task = Store.findOpTask(id);
      if (!task) return;
      Store.editingOpTaskId = id;
      document.getElementById('opTaskModalTitle').textContent =
        task.categoria === 'troca-poste' ? 'Editar troca de poste'
          : task.categoria === 'certificacao-cemig' ? 'Editar certificação Cemig'
            : task.categoria === 'otimizacao-rede' ? 'Editar otimização de rede'
              : 'Editar tarefa';
      document.getElementById('op-titulo').value =
        task.categoria === 'troca-poste' || task.categoria === 'certificacao-cemig' || task.categoria === 'atendimento-cliente'
          ? ''
          : task.titulo;
      const respEdit = document.getElementById('op-responsavel');
      if (respEdit) {
        respEdit.value = String(task.responsavel || '').trim();
        const chatIdHidden = document.getElementById('op-responsavel-chatid');
        if (chatIdHidden) chatIdHidden.value = String(task.responsavelChatId || '').trim();
        this._syncSelectedTecnicoChatId();
      }
      const proto = document.getElementById('op-atd-protocolo');
      const dataEnt = document.getElementById('op-atd-data-entrada');
      const subp = document.getElementById('op-atd-subprocesso');
      const dataInst = document.getElementById('op-atd-data-instalacao');
      const os = document.getElementById('op-atd-ordem-servico');
      const desc = document.getElementById('op-atd-descricao');
      const opOtimProto = document.getElementById('op-otim-protocolo');
      const opOtimOs = document.getElementById('op-otim-ordem-servico');
      const opCemigProto = document.getElementById('op-cemig-protocolo');
      if (task.categoria === 'otimizacao-rede') {
        if (opOtimProto) opOtimProto.value = String(task.protocolo || '').trim();
        if (opOtimOs) opOtimOs.value = String(task.ordemServico || '').trim();
        const otimDescEdit = document.getElementById('op-otim-descricao');
        if (otimDescEdit) {
          otimDescEdit.innerHTML = this._normalizeOtimDescricaoImgSrcForEdit(String(task.descricao || ''));
          this._wrapBareOtimDescricaoImages(otimDescEdit);
        }
        if (proto) proto.value = '';
        if (os) os.value = '';
        if (dataEnt) dataEnt.value = '';
        if (subp) subp.value = '';
        if (dataInst) dataInst.value = '';
        if (desc) desc.value = '';
        const childTituloOtim = document.getElementById('op-atd-child-titulo');
        if (childTituloOtim) childTituloOtim.value = '';
        if (opCemigProto) opCemigProto.value = '';
        const cemigDescOtim = document.getElementById('op-cemig-descricao');
        if (cemigDescOtim) cemigDescOtim.innerHTML = '';
      } else if (task.categoria === 'certificacao-cemig') {
        let p = String(task.protocolo || '').trim();
        if (!p && task.titulo) {
          const m = String(task.titulo).match(/^Cemig\s*[—-]\s*(.+)$/);
          if (m) p = m[1].trim();
        }
        if (opCemigProto) opCemigProto.value = p;
        if (proto) proto.value = '';
        if (os) os.value = '';
        if (dataEnt) dataEnt.value = '';
        if (subp) subp.value = '';
        if (dataInst) dataInst.value = '';
        if (desc) desc.value = '';
        const childTituloCem = document.getElementById('op-atd-child-titulo');
        if (childTituloCem) childTituloCem.value = '';
        if (opOtimProto) opOtimProto.value = '';
        if (opOtimOs) opOtimOs.value = '';
        const otimDescC = document.getElementById('op-otim-descricao');
        if (otimDescC) otimDescC.innerHTML = '';
        const cemigDescEdit = document.getElementById('op-cemig-descricao');
        if (cemigDescEdit) {
          cemigDescEdit.innerHTML = this._normalizeOtimDescricaoImgSrcForEdit(String(task.descricao || ''));
          this._wrapBareOtimDescricaoImages(cemigDescEdit);
        }
      } else {
        const nomeCliEdit = document.getElementById('op-atd-nome-cliente');
        if (nomeCliEdit) {
          const nc = String(task.nomeCliente || '').trim();
          nomeCliEdit.value = nc || (task.categoria === 'atendimento-cliente' && !task.parentTaskId ? String(task.titulo || '').trim() : '');
        }
        if (proto) proto.value = String(task.protocolo || '').trim();
        if (dataEnt) dataEnt.value = String(task.dataEntrada || '').trim();
        if (subp) subp.value = String(task.subProcesso || '').trim();
        if (dataInst) dataInst.value = String(task.dataInstalacao || '').trim();
        if (os) os.value = String(task.ordemServico || '').trim();
        if (desc) desc.value = String(task.descricao || '').trim();
        const childTituloEdit = document.getElementById('op-atd-child-titulo');
        if (childTituloEdit) {
          childTituloEdit.value =
            task.categoria === 'atendimento-cliente' && task.parentTaskId ? String(task.titulo || '').trim() : '';
        }
        if (opOtimProto) opOtimProto.value = '';
        if (opOtimOs) opOtimOs.value = '';
        if (opCemigProto) opCemigProto.value = '';
        const otimDescOther = document.getElementById('op-otim-descricao');
        if (otimDescOther) otimDescOther.innerHTML = '';
        const cemigDescOther = document.getElementById('op-cemig-descricao');
        if (cemigDescOther) cemigDescOther.innerHTML = '';
      }
      document.getElementById('op-prazo').value       = task.prazo || '';
      document.getElementById('op-prioridade').value  = task.prioridade || '';
      const regiaoEdit = document.getElementById('op-regiao');
      if (regiaoEdit) regiaoEdit.value = task.regiao || '';
      const hidden = document.getElementById('op-parent-task-id');
      if (hidden) hidden.value = task.parentTaskId ? String(task.parentTaskId) : '';
      const setorCtoInput = document.getElementById('op-setor-cto');
      if (setorCtoInput) setorCtoInput.value = (task.setor || '').toUpperCase();
      const setorHintEdit = document.getElementById('op-setor-cto-hint');
      if (setorHintEdit) setorHintEdit.textContent = '';
      const coordsInput = document.getElementById('op-coords');
      const addressInput = document.getElementById('op-address-readonly');
      const addressHint = document.getElementById('op-address-hint');
      const clientesInput = document.getElementById('op-clientes-afetados');
      const isRompOuTrocaCoord = task.categoria === 'rompimentos' || task.categoria === 'troca-poste';
      if (coordsInput) coordsInput.value = isRompOuTrocaCoord ? (task.coordenadas || '') : '';
      if (addressInput) addressInput.value = isRompOuTrocaCoord ? (task.localizacaoTexto || '') : '';
      const geoHintOpcional = 'Opcional. Informe lat, long — o endereço é buscado automaticamente.';
      const otimGC = document.getElementById('op-otim-coords');
      const otimGA = document.getElementById('op-otim-address');
      const otimGH = document.getElementById('op-otim-address-hint');
      const cemigGC = document.getElementById('op-cemig-coords');
      const cemigGA = document.getElementById('op-cemig-address');
      const cemigGH = document.getElementById('op-cemig-address-hint');
      if (task.categoria === 'otimizacao-rede') {
        if (otimGC) otimGC.value = String(task.coordenadas || '').trim();
        if (otimGA) otimGA.value = String(task.localizacaoTexto || '').trim();
        if (otimGH) otimGH.textContent = task.coordenadas ? 'Localização salva na tarefa.' : geoHintOpcional;
        if (cemigGC) cemigGC.value = '';
        if (cemigGA) cemigGA.value = '';
        if (cemigGH) cemigGH.textContent = geoHintOpcional;
      } else if (task.categoria === 'certificacao-cemig') {
        if (cemigGC) cemigGC.value = String(task.coordenadas || '').trim();
        if (cemigGA) cemigGA.value = String(task.localizacaoTexto || '').trim();
        if (cemigGH) cemigGH.textContent = task.coordenadas ? 'Localização salva na tarefa.' : geoHintOpcional;
        if (otimGC) otimGC.value = '';
        if (otimGA) otimGA.value = '';
        if (otimGH) otimGH.textContent = geoHintOpcional;
      } else {
        if (otimGC) otimGC.value = '';
        if (otimGA) otimGA.value = '';
        if (otimGH) otimGH.textContent = geoHintOpcional;
        if (cemigGC) cemigGC.value = '';
        if (cemigGA) cemigGA.value = '';
        if (cemigGH) cemigGH.textContent = geoHintOpcional;
      }
      if (task.categoria === 'troca-poste' && coordsInput && !String(task.coordenadas || '').trim()) {
        const descStr = String(task.descricao || '');
        const m = descStr.match(/Coordenadas:\s*([^|]+)\s*\|\s*Local:\s*(.+)/);
        if (m) {
          coordsInput.value = m[1].trim();
          if (addressInput) addressInput.value = m[2].trim();
        } else {
          const p = this._parseCoords(String(task.titulo || '').trim());
          if (p) coordsInput.value = `${p.lat}, ${p.lon}`;
        }
      }
      if (task.categoria === 'troca-poste' && coordsInput?.value && addressInput && !addressInput.value.trim()) {
        this._resolveCoordsToAddress(coordsInput.value);
      }
      if (addressHint) {
        if (task.categoria === 'troca-poste') {
          const ok = Boolean(String(addressInput?.value || '').trim());
          addressHint.textContent = ok ? 'Localização carregada.' : 'Informe coordenadas para preencher rua e bairro.';
        } else {
          addressHint.textContent = String(addressInput?.value || '').trim()
            ? 'Localização carregada.'
            : 'Aguardando CTO ou coordenadas.';
        }
      }
      if (clientesInput) clientesInput.value = task.clientesAfetados || '';
      const deleteBtn = document.getElementById('deleteOpTaskBtn');
      if (deleteBtn) deleteBtn.style.display = 'inline-flex';
      this._newTaskPreset = null;
      this._syncCategorySpecificFields(task.categoria);
      this._syncAtendimentoKindFields();
      this._syncParentHidden(task);
      ModalService.open('opTaskModal');
      if (task.categoria === 'otimizacao-rede' && otimGC?.value?.trim() && !otimGA?.value?.trim()) {
        void this._resolveCoordsToAddress(otimGC.value, 'otim');
      }
      if (task.categoria === 'certificacao-cemig' && cemigGC?.value?.trim() && !cemigGA?.value?.trim()) {
        void this._resolveCoordsToAddress(cemigGC.value, 'cemig');
      }
      const modalCopyBtn = document.getElementById('opTaskModalCopyIdBtn');
      if (modalCopyBtn) {
        const cref = Utils.opTaskDisplayRef(task);
        modalCopyBtn.hidden = !cref;
        if (cref) modalCopyBtn.dataset.copyProtocol = cref;
        else delete modalCopyBtn.dataset.copyProtocol;
      }
    },

    deleteTask(id = Store.editingOpTaskId, options = {}) {
      const task = Store.findOpTask(id);
      if (!task) return;
      const hasChildren = Store.getOpTasks().some(t => Number(t.parentTaskId) === Number(id));
      const cascade = options.cascade ?? hasChildren;
      const message = cascade
        ? 'Excluir esta tarefa pai e todas as subtarefas vinculadas?'
        : 'Excluir esta tarefa?';
      if (!window.confirm(message)) return;

      const removed = Store.removeOpTask(id, { cascade });
      if (!removed) {
        ToastService.show('Não foi possível excluir a tarefa', 'danger');
        return;
      }
      ToastService.show('Tarefa excluída com sucesso', 'success');
      ModalService.close('opTaskModal');
      UI.refreshOperationalUi();
      UI.renderDashboard();
    },

    save() {
      const data = this._validate();
      if (!data) return;
      let savedTask = null;

      if (Store.editingOpTaskId) {
        savedTask = Store.updateOpTask(Store.editingOpTaskId, data);
        ToastService.show('Tarefa atualizada com sucesso', 'success');
      } else {
        savedTask = Store.addOpTask(data);
        ToastService.show('Tarefa criada com sucesso', 'success');
        // Se já nasce em um status notificável, dispara webhook imediatamente.
        const event = OpTaskService._statusToEvent[data.status];
        if (event && savedTask) {
          const categoryLabel = OpTaskService._categoryLabels[savedTask.categoria] || savedTask.categoria;
          WebhookService.send(event, savedTask, categoryLabel);
        }
      }

      // Atualiza categoria ativa para a que foi salva (aba Tarefas)
      if (Store.currentPage === 'tarefas') Store.currentOpCategory = data.categoria;

      const isAtdChild =
        data.categoria === 'atendimento-cliente' &&
        !!data.parentTaskId &&
        !Store.editingOpTaskId;

      if (isAtdChild) {
        // Mantém modal aberto para cadastrar várias OS na sequência.
        this.openNewModal({
          category: 'atendimento-cliente',
          parentTaskId: data.parentTaskId,
          status: 'Backlog',
        });
      } else {
        ModalService.close('opTaskModal');
      }

      UI.refreshOperationalUi();
    },

    init() {
      const respInp = document.getElementById('op-responsavel');
      respInp?.addEventListener('input', () => this._syncSelectedTecnicoChatId());

      ['op-otim-descricao', 'op-cemig-descricao'].forEach((richId) => {
        const box = document.getElementById(richId);
        if (!box) return;
        box.addEventListener('click', (e) => {
          const rm = e.target.closest('.op-editor-img-remove');
          if (!rm || !box.contains(rm)) return;
          e.preventDefault();
          e.stopPropagation();
          rm.closest('.op-editor-img-wrap')?.remove();
        });
        box.addEventListener('paste', (e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          for (const it of items) {
            if (it.kind === 'file' && it.type.startsWith('image/')) {
              e.preventDefault();
              const file = it.getAsFile();
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                const wrap = this._buildOtimDescImageWrap(reader.result);
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && box.contains(sel.anchorNode)) {
                  const rng = sel.getRangeAt(0);
                  rng.deleteContents();
                  rng.insertNode(wrap);
                  rng.setStartAfter(wrap);
                  rng.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(rng);
                } else {
                  box.appendChild(wrap);
                }
              };
              reader.readAsDataURL(file);
              return;
            }
          }
        });
      });

      document.getElementById('openOpTaskModalBtn').addEventListener('click', () => this.openNewModal());
      document.getElementById('openAtendimentoTaskModalBtn')?.addEventListener('click', () => {
        this.openNewModal({ kind: 'parent', category: 'atendimento-cliente', status: 'Backlog' });
      });
      document.getElementById('saveOpTaskBtn').addEventListener('click', () => this.save());

      // Dropdown de status para ordens vinculadas (lista no modal de atendimento).
      const statusDd = document.getElementById('opAtdStatusDropdown');
      if (statusDd) {
        const closeDropdown = () => this._closeAtdStatusDropdown();
        statusDd.querySelectorAll('.atd-status-dropdown-item').forEach((btn) => {
          btn.addEventListener('click', () => {
            const id = Number(statusDd.dataset.childId || 0);
            if (!id) return;
            const nextStatus = btn.dataset.status;
            if (!nextStatus) return;
            OpTaskService.changeStatus(id, nextStatus);
            this._refreshAtdChildrenList();
            UI.refreshOperationalUi();
            closeDropdown();
          });
        });
        document.addEventListener('click', (e) => {
          if (statusDd.hidden) return;
          if (statusDd.contains(e.target)) return;
          closeDropdown();
        });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && !statusDd.hidden) closeDropdown();
        });
      }
      document.getElementById('deleteOpTaskBtn')?.addEventListener('click', () => this.deleteTask());
      // Segurança: se alguém abrir modal de subtarefa sem pai, limpa o hidden.
      document.getElementById('op-parent-task-id')?.addEventListener('input', () => this._syncAtendimentoKindFields());
      document.getElementById('op-coords')?.addEventListener('input', e => {
        const value = e.target.value;
        clearTimeout(this._coordsLookupTimer);
        this._coordsLookupTimer = setTimeout(() => this._resolveCoordsToAddress(value), 500);
      });
      document.getElementById('op-coords')?.addEventListener('blur', e => {
        this._resolveCoordsToAddress(e.target.value);
      });
      document.getElementById('op-otim-coords')?.addEventListener('input', e => {
        const value = e.target.value;
        clearTimeout(this._otimCoordsLookupTimer);
        this._otimCoordsLookupTimer = setTimeout(() => this._resolveCoordsToAddress(value, 'otim'), 500);
      });
      document.getElementById('op-otim-coords')?.addEventListener('blur', e => {
        this._resolveCoordsToAddress(e.target.value, 'otim');
      });
      document.getElementById('op-cemig-coords')?.addEventListener('input', e => {
        const value = e.target.value;
        clearTimeout(this._cemigCoordsLookupTimer);
        this._cemigCoordsLookupTimer = setTimeout(() => this._resolveCoordsToAddress(value, 'cemig'), 500);
      });
      document.getElementById('op-cemig-coords')?.addEventListener('blur', e => {
        this._resolveCoordsToAddress(e.target.value, 'cemig');
      });
      document.getElementById('op-setor-cto')?.addEventListener('input', e => {
        const el = e.target;
        const s = el.selectionStart;
        const k = el.selectionEnd;
        const up = el.value.toUpperCase();
        if (el.value !== up) {
          el.value = up;
          if (typeof s === 'number' && typeof k === 'number') el.setSelectionRange(s, k);
        }
        clearTimeout(this._setorCtoLookupTimer);
        this._setorCtoLookupTimer = setTimeout(() => this._applyCtoLookupFromSetor(), 450);
      });
      document.getElementById('op-setor-cto')?.addEventListener('blur', () => {
        this._applyCtoLookupFromSetor();
      });
      ['closeOpTaskModal','cancelOpTaskModal'].forEach(id =>
        document.getElementById(id)?.addEventListener('click', () => ModalService.close('opTaskModal'))
      );
      document.getElementById('opAtdChildrenExpandBtn')?.addEventListener('click', () => {
        const wrap = document.getElementById('opAtdChildrenWrap');
        const btn = document.getElementById('opAtdChildrenExpandBtn');
        if (!wrap || !btn) return;
        wrap.classList.toggle('is-expanded');
        const expanded = wrap.classList.contains('is-expanded');
        btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        btn.title = expanded ? 'Recolher lista' : 'Expandir lista';
        btn.setAttribute(
          'aria-label',
          expanded ? 'Recolher lista de ordens de serviço vinculadas' : 'Expandir lista de ordens de serviço vinculadas'
        );
      });
    },
  },

  filters: {
    init() {
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          Store.dashboardFilter = btn.dataset.filter;
          UI.renderTaskTable();
        });
      });

      document.getElementById('searchInput').addEventListener('input', e => {
        Store.dashboardSearch = e.target.value.trim().toLowerCase();
        UI.renderTaskTable();
      });

      document.getElementById('opSearchInput').addEventListener('input', e => {
        Store.opSearch = e.target.value.trim().toLowerCase();
        UI.renderKanban();
      });

      document.getElementById('opTecnicoInput')?.addEventListener('input', e => {
        Store.opTecnicoSearch = e.target.value.trim().toLowerCase();
        UI.renderKanban();
      });

      document.getElementById('opTaskIdInput')?.addEventListener('input', e => {
        Store.opTaskIdSearch = e.target.value;
        UI.renderKanban();
      });

      document.getElementById('opDateSortFilter')?.addEventListener('change', e => {
        Store.opDateSort = String(e.target.value || 'all');
        UI.renderKanban();
      });

      document.getElementById('atdOpSearchInput')?.addEventListener('input', e => {
        Store.atdOpSearch = e.target.value.trim().toLowerCase();
        UI.renderAtendimentoPage();
      });
      document.getElementById('atdOpRegionSelectFilter')?.addEventListener('change', e => {
        Store.atdOpRegionSearch = e.target.value.trim().toLowerCase();
        UI.renderAtendimentoPage();
      });
      document.getElementById('atdOpTecnicoInput')?.addEventListener('input', e => {
        Store.atdOpTecnicoSearch = e.target.value.trim().toLowerCase();
        UI.renderAtendimentoPage();
      });
      document.getElementById('atdOpTaskIdInput')?.addEventListener('input', e => {
        Store.atdOpTaskIdSearch = e.target.value;
        UI.renderAtendimentoPage();
      });
      document.getElementById('atdOpDateSortFilter')?.addEventListener('change', e => {
        Store.atdOpDateSort = String(e.target.value || 'all');
        UI.renderAtendimentoPage();
      });
    },
  },

  categoryTabs: {
    _activateCategory(cat) {
      Store.currentOpCategory = cat;
      const hidden = document.getElementById('op-parent-task-id');
      if (hidden) hidden.value = '';
      Controllers.opTask._syncAtendimentoKindFields?.();
      UI.renderKanban();
    },
    init() {},
  },

  opFolders: {
    init() {
      const panel = document.getElementById('opPanelContent');
      if (panel) panel.classList.remove('hidden');
    },
  },

  reports: { init() {} },

  calendar: { init() {} },

  teamChat: {
    init() {},
    startBackgroundNotify() {},
    stopBackgroundNotify() {},
    stop() {},
    _isEmojiPanelOpen() { return false; },
    _closeEmojiPanel() {},
  },

  notes: {
    init() {},
  },


  globalModal: {
    init() {
      document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
          if (e.target === overlay) overlay.classList.remove('open');
        });
      });
      document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (Controllers.teamChat._isEmojiPanelOpen?.()) {
          Controllers.teamChat._closeEmojiPanel?.();
          e.preventDefault();
          return;
        }
        const notifPanel = document.getElementById('topbarNotifPanel');
        if (notifPanel && !notifPanel.hidden) {
          ChatMentionNotifs._closePanel();
          e.preventDefault();
          return;
        }
        if (document.body.classList.contains('nav-open')) {
          Controllers.sidebar.closeMobileNav();
          return;
        }
        ModalService.closeAll();
      });
    },
  },
};


async function initApp() {
  if (typeof window !== 'undefined') {
    if (window.__bpAppStarted) return;
    window.__bpAppStarted = true;
  }
  Controllers.theme.init();
  CtoLocationRegistry.load().catch(() => {});
  Controllers.auth.init();
  ChatMentionNotifs.syncBellUi();

  document.addEventListener(
    'click',
    (e) => {
      const btn = e.target.closest('.task-copy-id-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const raw = String(btn.dataset.copyProtocol || '').trim();
      void Utils.copyProtocolWithToast(raw);
    },
    true,
  );

  // Inicializa listeners antes do bootstrap assíncrono para a UI não ficar sem clique.
  const bootstrapWithTimeout = async (timeoutMs) => {
    try {
      return await Promise.race([
        Store.bootstrapFromRemote(),
        new Promise(resolve => setTimeout(() => resolve(false), timeoutMs)),
      ]);
    } catch {
      return false;
    }
  };

  Controllers.sidebar.init();
  Controllers.task.init();
  Controllers.opTask.init();
  Controllers.filters.init();
  Controllers.categoryTabs.init();
  Controllers.opFolders.init();
  Controllers.reports.init();
  Controllers.calendar.init();
  Controllers.notes.init();
  Controllers.teamChat.init();
  ChatMentionNotifs.init();
  Controllers.globalModal.init();

  void bootstrapWithTimeout(10000).then(ok => {
    if (!ok) return;
    UI.syncAfterRemoteBootstrap();
  });

  UI.renderAgenda();
  UI.renderDashboard();

  UI.updateClock();
  setInterval(() => UI.updateClock(), 30000);

  const REMOTE_POLL_MS_VISIBLE = 12088;
  const REMOTE_POLL_MS_HIDDEN = 55000;
  let remotePollId = null;
  const runRemotePollTick = async () => {
    if (!Store.isRemoteApiEnabled() || !Controllers.auth._isAuthenticated()) return;
    const updated = await bootstrapWithTimeout(8000);
    if (updated) UI.syncAfterRemoteBootstrap();
  };
  const scheduleRemotePoll = () => {
    if (remotePollId !== null) {
      clearInterval(remotePollId);
      remotePollId = null;
    }
    if (!Store.isRemoteApiEnabled()) return;
    const ms = document.visibilityState === 'visible' ? REMOTE_POLL_MS_VISIBLE : REMOTE_POLL_MS_HIDDEN;
    remotePollId = setInterval(runRemotePollTick, ms);
  };
  const kickRemoteSync = () => {
    if (!Store.isRemoteApiEnabled() || !Controllers.auth._isAuthenticated()) return;
    void runRemotePollTick();
  };
  scheduleRemotePoll();
  document.addEventListener('visibilitychange', () => {
    scheduleRemotePoll();
    if (document.visibilityState === 'visible') kickRemoteSync();
  });
  window.addEventListener('focus', () => {
    kickRemoteSync();
  });

  UI.restoreLastPageIfAuthed();
  if (Controllers.auth._isAuthenticated() && Store.currentPage !== 'chat') {
    Controllers.teamChat.startBackgroundNotify();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { initApp(); });
} else {
  initApp();
}
