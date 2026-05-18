/**
 * Testes: status do kanban não deve ser revertido por patch remoto desatualizado.
 * node scripts/test-kanban-status-sync.js
 */
'use strict';

const pendingOpTaskLocalSync = new Map();
const OP_TASK_STATUS_GUARD_MS = 20000;

const opTaskHistoricoLastMs = (task) => {
  const hist = Array.isArray(task?.historico) ? task.historico : [];
  if (!hist.length) return 0;
  const ts = new Date(hist[hist.length - 1]?.timestamp || 0).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const mergeLocalOpTaskIntoIncomingPatch = (localTask, incomingPatch) => {
  const id = Number(localTask.id);
  const pending = pendingOpTaskLocalSync.get(id);
  if (pending && (Date.now() - pending.at) < OP_TASK_STATUS_GUARD_MS) {
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
    historico: [
      { status: 'Backlog', timestamp: '2026-05-15T10:00:00.000Z' },
      { status: 'Em andamento', timestamp: '2026-05-15T12:00:00.000Z' },
    ],
  };
  pendingOpTaskLocalSync.set(42, { status: 'Em andamento', at: Date.now() });
  const incoming = { id: 42, status: 'Backlog', historico: [{ status: 'Backlog', timestamp: '2026-05-15T10:00:00.000Z' }] };
  mergeLocalOpTaskIntoIncomingPatch(local, incoming);
  const merged = { ...local, ...incoming };
  if (merged.status !== 'Em andamento') {
    failed++;
    console.error('FAIL pending guard: status revertido para', merged.status);
  } else {
    console.log('OK pending guard: mantém Em andamento');
  }
}

// Histórico local mais novo sem pending explícito
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
