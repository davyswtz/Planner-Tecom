/**
 * Testes: tarefa local não presente no servidor deve ser preservada no bootstrap.
 * node scripts/test-op-create-persist.js
 */
'use strict';

const pendingOpTaskServerSave = new Set();

const mergeLocalOnlyOpTasksIntoIncoming = (localArr, incomingArr) => {
  const out = Array.isArray(incomingArr) ? [...incomingArr] : [];
  const serverIds = new Set(
    out.map((t) => Number(t?.id)).filter((id) => Number.isFinite(id)),
  );
  for (const local of (Array.isArray(localArr) ? localArr : [])) {
    const id = Number(local?.id);
    if (!Number.isFinite(id) || serverIds.has(id)) continue;
    out.push(local);
    serverIds.add(id);
    pendingOpTaskServerSave.add(id);
  }
  return out;
};

let failed = 0;

{
  const local = [
    { id: 99, titulo: 'Nova local', categoria: 'rompimentos', status: 'Criada' },
    { id: 1, titulo: 'Antiga', categoria: 'rompimentos', status: 'Criada' },
  ];
  const server = [{ id: 1, titulo: 'Antiga servidor', categoria: 'rompimentos', status: 'Criada' }];
  const merged = mergeLocalOnlyOpTasksIntoIncoming(local, server);
  if (!merged.find((t) => Number(t.id) === 99)) {
    failed++;
    console.error('FAIL: tarefa 99 local-only não foi preservada');
  } else if (merged.length !== 2) {
    failed++;
    console.error('FAIL: tamanho merged', merged.length);
  } else if (!pendingOpTaskServerSave.has(99)) {
    failed++;
    console.error('FAIL: pending save não marcado para id 99');
  } else {
    console.log('OK merge local-only preserva tarefa nova');
  }
}

{
  pendingOpTaskServerSave.clear();
  const local = [{ id: 5, titulo: 'X' }];
  const server = [{ id: 5, titulo: 'X servidor' }];
  const merged = mergeLocalOnlyOpTasksIntoIncoming(local, server);
  if (merged.length !== 1 || merged[0].titulo !== 'X servidor') {
    failed++;
    console.error('FAIL: duplicou tarefa já no servidor');
  } else {
    console.log('OK não duplica id existente no servidor');
  }
}

if (failed) process.exit(1);
console.log('\nTestes de persistência na criação passaram.');
