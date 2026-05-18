/**
 * Testes: persistência de descrição (merge + coleta do formulário).
 * node scripts/test-op-descricao-persist.js
 */
'use strict';

const OP_TASK_REMOTE_EMPTY_MERGE_FIELDS = ['descricao'];

const isBlankOpTaskMergeValue = (field, v) => {
  if (v === undefined || v === null) return true;
  const s = String(v).trim();
  return !s;
};

const mergeLocalOpTaskIntoIncomingPatch = (localTask, incomingPatch) => {
  if (!localTask || !incomingPatch) return;
  for (const f of OP_TASK_REMOTE_EMPTY_MERGE_FIELDS) {
    if (!isBlankOpTaskMergeValue(f, incomingPatch[f])) continue;
    if (isBlankOpTaskMergeValue(f, localTask[f])) continue;
    incomingPatch[f] = localTask[f];
  }
};

function collectOpDescricaoForSave(opts) {
  const existingStr = String(opts.existing?.descricao ?? '');
  const pick = (v) => String(v ?? '').trim();
  const {
    descAtdRaw, finalDescricaoMeta, isRompimento, isRompParentOnly,
    isOtimParentOnly, isOtimChildOnly, isCemigParentOnly, isCemigChildOnly,
    isAtdChildOnly, isOsLinkedChildOnly, isParentTask,
  } = opts;

  if (isOtimParentOnly || isOtimChildOnly) {
    const html = pick(opts.otimHtml);
    return html || existingStr;
  }
  if (isCemigParentOnly || isCemigChildOnly) {
    const html = pick(opts.cemigHtml);
    return html || existingStr;
  }
  if (isAtdChildOnly || isOsLinkedChildOnly) {
    const raw = pick(descAtdRaw);
    return raw || existingStr;
  }
  if (isRompParentOnly) return pick(finalDescricaoMeta) || existingStr;
  const atdRaw = pick(descAtdRaw);
  if (atdRaw) return atdRaw;
  if (existingStr) return existingStr;
  if (isRompimento && isParentTask) return pick(finalDescricaoMeta);
  return pick(finalDescricaoMeta) || '';
}

let failed = 0;

// merge: polling sem descricao não apaga local
{
  const local = { id: 1, descricao: '<p>Nota importante</p>', descricaoLen: 20 };
  const inc = { id: 1, status: 'Em andamento' };
  mergeLocalOpTaskIntoIncomingPatch(local, inc);
  const merged = { ...local, ...inc };
  if (merged.descricao !== '<p>Nota importante</p>') {
    failed++;
    console.error('FAIL merge: descricao local foi perdida');
  } else {
    console.log('OK merge: descricao preservada no poll');
  }
}

// save: otim não apaga quando editor vazio mas já tinha HTML
{
  const got = collectOpDescricaoForSave({
    existing: { descricao: '<p>Antigo</p>' },
    otimHtml: '',
    isOtimParentOnly: true,
  });
  if (got !== '<p>Antigo</p>') {
    failed++;
    console.error('FAIL save otim: apagou descrição existente');
  } else {
    console.log('OK save otim: mantém descrição se editor vazio');
  }
}

// save: atendimento filha grava textarea
{
  const got = collectOpDescricaoForSave({
    existing: { descricao: '' },
    descAtdRaw: 'Cliente ligou pedindo retorno',
    isAtdChildOnly: true,
  });
  if (got !== 'Cliente ligou pedindo retorno') {
    failed++;
    console.error('FAIL save atd filha');
  } else {
    console.log('OK save atd filha: grava textarea');
  }
}

// save: troca poste não zera existente
{
  const got = collectOpDescricaoForSave({
    existing: { descricao: 'Observação troca' },
    finalDescricaoMeta: '',
    isRompimento: false,
    isParentTask: true,
  });
  if (got !== 'Observação troca') {
    failed++;
    console.error('FAIL save troca: zerou descrição');
  } else {
    console.log('OK save troca: preserva descrição existente');
  }
}

if (failed) process.exit(1);
console.log('\nTodos os testes de descrição passaram.');
