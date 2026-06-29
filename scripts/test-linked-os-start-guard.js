/**
 * Testes: linkedOsStartGuard — tarefa pai só pode ir para "Em andamento"
 * se tiver ao menos uma OS vinculada. Tarefas filhas seguem sem restrição.
 *
 * node scripts/test-linked-os-start-guard.js
 */
'use strict';

/* ── stubs mínimos ─────────────────────────────────────────── */

const LINKED_OS_CATS = new Set([
  'atendimento-cliente', 'rompimentos', 'troca-poste',
  'otimizacao-rede', 'certificacao-cemig', 'qualidade-potencia',
  'manutencao-corretiva',
]);

function isLinkedOsCategory(category) {
  return LINKED_OS_CATS.has(String(category || '').trim());
}

// Simula Store.getOpTasks() com lista injetável por teste
let _opTasks = [];

function getLinkedOsChildren(parentTask) {
  const cat = String(parentTask?.categoria || '').trim();
  const parentId = Number(parentTask?.id);
  if (!parentId || !isLinkedOsCategory(cat)) return [];
  return _opTasks.filter(
    (t) => isLinkedOsChildForParent(t, parentTask),
  );
}

const LINKED_OS_V2_CATEGORY = 'ordem-servico';

function isLinkedOsChildForParent(task, parentTaskOrCategory) {
  if (!task?.parentTaskId) return false;
  const parentCat = typeof parentTaskOrCategory === 'object'
    ? String(parentTaskOrCategory?.categoria || '').trim()
    : String(parentTaskOrCategory || '').trim();
  const parentId = typeof parentTaskOrCategory === 'object'
    ? Number(parentTaskOrCategory?.id)
    : null;
  if (parentId && Number(task.parentTaskId) !== parentId) return false;
  const childCat = String(task.categoria || '').trim();
  if (childCat === LINKED_OS_V2_CATEGORY && isLinkedOsCategory(parentCat)) return true;
  return childCat === parentCat;
}

function linkedOsStartGuard(task, targetStatus) {
  if (String(targetStatus || '').trim() !== 'Em andamento') return null;
  if (!task) return null;
  if (task.parentTaskId) return null;
  if (!isLinkedOsCategory(task.categoria)) return null;
  if (getLinkedOsChildren(task).length > 0) return null;
  return 'Esta tarefa precisa ter ao menos uma OS vinculada antes de iniciar.';
}

/* ── helpers de teste ──────────────────────────────────────── */

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FALHOU: ${label}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title}`);
}

/* ── cenários ─────────────────────────────────────────────── */

section('Destino ≠ Em andamento — sempre libera');
{
  const pai = { id: 1, categoria: 'rompimentos', parentTaskId: null };
  _opTasks = [];
  assert('null para "Concluída"',    linkedOsStartGuard(pai, 'Concluída')    === null);
  assert('null para "Finalizada"',   linkedOsStartGuard(pai, 'Finalizada')   === null);
  assert('null para "Criada"',       linkedOsStartGuard(pai, 'Criada')       === null);
  assert('null para string vazia',   linkedOsStartGuard(pai, '')              === null);
  assert('null para undefined',      linkedOsStartGuard(pai, undefined)       === null);
}

section('Task nula ou indefinida — libera');
{
  _opTasks = [];
  assert('null para task=null',      linkedOsStartGuard(null, 'Em andamento')      === null);
  assert('null para task=undefined', linkedOsStartGuard(undefined, 'Em andamento') === null);
}

section('Tarefa filha (parentTaskId preenchido) — sempre libera');
{
  const filho = { id: 10, categoria: 'rompimentos', parentTaskId: 1 };
  _opTasks = [];
  assert('filha sem OS vinculada libera', linkedOsStartGuard(filho, 'Em andamento') === null);

  const filhoAtd = { id: 11, categoria: 'atendimento-cliente', parentTaskId: 5 };
  assert('filha atendimento libera', linkedOsStartGuard(filhoAtd, 'Em andamento') === null);
}

section('Categoria sem suporte a OS vinculada — sempre libera');
{
  const cats = [
    'correcao-atenuacao', 'troca-etiqueta', 'outro-qualquer', '',
  ];
  _opTasks = [];
  for (const cat of cats) {
    const task = { id: 99, categoria: cat, parentTaskId: null };
    assert(`"${cat || '(vazio)'}" libera`, linkedOsStartGuard(task, 'Em andamento') === null);
  }
}

section('Tarefa pai SEM OS vinculada — deve bloquear');
{
  const cats = [
    'rompimentos', 'troca-poste', 'otimizacao-rede',
    'certificacao-cemig', 'qualidade-potencia', 'manutencao-corretiva',
    'atendimento-cliente',
  ];
  _opTasks = []; // nenhuma OS filha
  for (const cat of cats) {
    const pai = { id: 20, categoria: cat, parentTaskId: null };
    const msg = linkedOsStartGuard(pai, 'Em andamento');
    assert(`"${cat}" pai sem OS → bloqueia`, typeof msg === 'string' && msg.length > 0);
  }
}

section('Tarefa pai COM ao menos 1 OS vinculada — libera');
{
  const paiRomp = { id: 30, categoria: 'rompimentos', parentTaskId: null };
  _opTasks = [
    { id: 31, categoria: 'rompimentos', parentTaskId: 30 },
  ];
  assert('rompimento com 1 OS → libera', linkedOsStartGuard(paiRomp, 'Em andamento') === null);

  const paiTroca = { id: 40, categoria: 'troca-poste', parentTaskId: null };
  _opTasks = [
    { id: 41, categoria: 'troca-poste', parentTaskId: 40 },
    { id: 42, categoria: 'troca-poste', parentTaskId: 40 },
  ];
  assert('troca-poste com 2 OS → libera', linkedOsStartGuard(paiTroca, 'Em andamento') === null);

  const paiAtd = { id: 50, categoria: 'atendimento-cliente', parentTaskId: null };
  _opTasks = [
    { id: 51, categoria: 'atendimento-cliente', parentTaskId: 50 },
  ];
  assert('atendimento com 1 OS → libera', linkedOsStartGuard(paiAtd, 'Em andamento') === null);

  const paiLaravel = { id: 60, categoria: 'rompimentos', parentTaskId: null };
  _opTasks = [
    { id: 61, categoria: 'ordem-servico', parentTaskId: 60 },
  ];
  assert('OS Laravel (ordem-servico) vinculada → libera', linkedOsStartGuard(paiLaravel, 'Em andamento') === null);
}

section('OS filha de outro pai não contamina o bloco');
{
  const paiA = { id: 60, categoria: 'rompimentos', parentTaskId: null };
  const paiB = { id: 70, categoria: 'rompimentos', parentTaskId: null };
  _opTasks = [
    { id: 61, categoria: 'rompimentos', parentTaskId: 70 }, // é filho do paiB, não do paiA
  ];
  const msg = linkedOsStartGuard(paiA, 'Em andamento');
  assert('paiA sem filhos próprios ainda bloqueia', typeof msg === 'string' && msg.length > 0);
  assert('paiB com filhos libera', linkedOsStartGuard(paiB, 'Em andamento') === null);
}

section('parentTaskId = 0 / null / undefined — trata como pai');
{
  _opTasks = [];
  for (const pid of [0, null, undefined, '']) {
    const task = { id: 80, categoria: 'rompimentos', parentTaskId: pid };
    const msg = linkedOsStartGuard(task, 'Em andamento');
    assert(`parentTaskId=${JSON.stringify(pid)} sem OS → bloqueia`, typeof msg === 'string' && msg.length > 0);
  }
}

/* ── resultado ─────────────────────────────────────────────── */

console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`✅  Todos os ${passed} testes passaram.`);
} else {
  console.error(`❌  ${failed} falha(s) de ${passed + failed} testes.`);
  process.exit(1);
}
