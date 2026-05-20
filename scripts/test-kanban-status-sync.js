/**
 * Testes: merge de status op_tasks (pending local + updatedAt remoto).
 * node scripts/test-kanban-status-sync.js
 */
'use strict';

const pendingOpTaskLocalSync = new Map();
const OP_TASK_STATUS_GUARD_MS = 8000;

const opTaskUpdatedAtMs = (task) => {
  const u = task?.updatedAt ?? task?.updated_at;
  if (u == null || u === '') return 0;
  if (typeof u === 'number') {
    if (u > 1e12) return u;
    if (u > 0) return u * 1000;
    return 0;
  }
  const n = Number(u);
  if (Number.isFinite(n) && n > 0) return n > 1e12 ? n : n * 1000;
  const t = Date.parse(String(u));
  return Number.isFinite(t) ? t : 0;
};

const opTaskHistoricoLastMs = (task) => {
  const hist = Array.isArray(task?.historico) ? task.historico : [];
  if (!hist.length) return 0;
  const ts = new Date(hist[hist.length - 1]?.timestamp || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const incomingOpTaskIsNewerThanLocal = (localTask, incomingPatch) => {
  const lu = opTaskUpdatedAtMs(localTask);
  const iu = opTaskUpdatedAtMs(incomingPatch);
  if (iu > lu) return true;
  if (iu < lu) return false;
  return opTaskHistoricoLastMs(incomingPatch) > opTaskHistoricoLastMs(localTask);
};

const mergeLocalOpTaskIntoIncomingPatch = (localTask, incomingPatch) => {
  const id = Number(localTask.id);
  const pending = pendingOpTaskLocalSync.get(id);
  const pendingActive = !!(pending && (Date.now() - pending.at) < OP_TASK_STATUS_GUARD_MS);
  const incomingNewer = incomingOpTaskIsNewerThanLocal(localTask, incomingPatch);

  if (incomingNewer) {
    pendingOpTaskLocalSync.delete(id);
  } else if (pendingActive) {
    if (pending.status) incomingPatch.status = pending.status;
    if (Array.isArray(localTask.historico) && localTask.historico.length) {
      incomingPatch.historico = localTask.historico;
    }
  } else if (opTaskHistoricoLastMs(localTask) > opTaskHistoricoLastMs(incomingPatch)) {
    incomingPatch.status = localTask.status;
    incomingPatch.historico = localTask.historico;
  }
};

let failed = 0;

// Cenário atendimento: usuário move para Em andamento, poll traz Backlog antigo
{
  const local = {
    id: 42,
    categoria: 'atendimento-cliente',
    status: 'Em andamento',
    updatedAt: 2000,
    historico: [
      { status: 'Backlog', timestamp: '2026-05-15T10:00:00.000Z' },
      { status: 'Em andamento', timestamp: '2026-05-15T12:00:00.000Z' },
    ],
  };
  pendingOpTaskLocalSync.set(42, { status: 'Em andamento', at: Date.now() });
  const incoming = {
    id: 42,
    status: 'Backlog',
    updatedAt: 1000,
    historico: [{ status: 'Backlog', timestamp: '2026-05-15T10:00:00.000Z' }],
  };
  mergeLocalOpTaskIntoIncomingPatch(local, incoming);
  const merged = { ...local, ...incoming };
  if (merged.status !== 'Em andamento') {
    failed++;
    console.error('FAIL pending guard: status revertido para', merged.status);
  } else {
    console.log('OK pending guard: mantém Em andamento');
  }
}

// Outro usuário alterou no servidor (updatedAt mais novo) — viewer deve aceitar
{
  pendingOpTaskLocalSync.clear();
  const local = {
    id: 9,
    status: 'Criada',
    updatedAt: 100,
    historico: [{ status: 'Criada', timestamp: '2026-05-15T08:00:00.000Z' }],
  };
  const incoming = {
    id: 9,
    status: 'Em andamento',
    updatedAt: 500,
    historico: [
      { status: 'Criada', timestamp: '2026-05-15T08:00:00.000Z' },
      { status: 'Em andamento', timestamp: '2026-05-15T14:00:00.000Z' },
    ],
  };
  mergeLocalOpTaskIntoIncomingPatch(local, incoming);
  const merged = { ...local, ...incoming };
  if (merged.status !== 'Em andamento') {
    failed++;
    console.error('FAIL remote newer: status', merged.status);
  } else {
    console.log('OK remote newer: aplica status do outro usuário');
  }
}

// Histórico local mais novo sem pending e sem updatedAt remoto
{
  pendingOpTaskLocalSync.clear();
  const local = {
    id: 7,
    status: 'Em andamento',
    historico: [
      { status: 'Criada', timestamp: '2026-05-15T08:00:00.000Z' },
      { status: 'Em andamento', timestamp: '2026-05-15T14:00:00.000Z' },
    ],
  };
  const incoming = {
    id: 7,
    status: 'Criada',
    historico: [{ status: 'Criada', timestamp: '2026-05-15T08:00:00.000Z' }],
  };
  mergeLocalOpTaskIntoIncomingPatch(local, incoming);
  const merged = { ...local, ...incoming };
  if (merged.status !== 'Em andamento') {
    failed++;
    console.error('FAIL historico newer: status', merged.status);
  } else {
    console.log('OK historico newer: preserva status local');
  }
}

if (failed) process.exit(1);
console.log('\nTodos os testes de status do kanban passaram.');
