/**
 * Testes: numeroOsStartGuard + linkedOsStartGuard (combinado)
 *
 * Regras:
 *  1. Tarefa só vai para "Em andamento" se numeroOs estiver preenchido.
 *  2. Tarefas pai de categorias com OS vinculada também exigem ≥ 1 OS filha.
 *  3. Ambas as restrições devem ser satisfeitas simultaneamente.
 *
 * node scripts/test-numero-os-start-guard.js
 */
'use strict';

/* ── stubs mínimos (espelha main.js) ──────────────────────────── */

const LINKED_OS_CATS = new Set([
  'atendimento-cliente', 'rompimentos', 'troca-poste',
  'otimizacao-rede', 'certificacao-cemig', 'qualidade-potencia',
  'manutencao-corretiva',
]);

function isLinkedOsCategory(cat) {
  return LINKED_OS_CATS.has(String(cat || '').trim());
}

let _opTasks = [];

function getLinkedOsChildren(parentTask) {
  const cat = String(parentTask?.categoria || '').trim();
  const parentId = Number(parentTask?.id);
  if (!parentId || !isLinkedOsCategory(cat)) return [];
  return _opTasks.filter(
    (t) => t && String(t.categoria).trim() === cat && Number(t.parentTaskId) === parentId,
  );
}

function linkedOsStartGuard(task, targetStatus) {
  if (String(targetStatus || '').trim() !== 'Em andamento') return null;
  if (!task) return null;
  if (task.parentTaskId) return null;
  if (!isLinkedOsCategory(task.categoria)) return null;
  if (getLinkedOsChildren(task).length > 0) return null;
  return 'Esta tarefa precisa ter ao menos uma OS vinculada antes de iniciar.';
}

function numeroOsStartGuard(task, targetStatus) {
  if (String(targetStatus || '').trim() !== 'Em andamento') return null;
  if (!task) return null;
  if (String(task.numeroOs || '').trim()) return null;
  return 'O número da OS HubSpot é obrigatório para iniciar esta tarefa.';
}

/** Simula a sequência exata do código de produção: linkedOs → numeroOs */
function combinedGuard(task, targetStatus) {
  return linkedOsStartGuard(task, targetStatus) || numeroOsStartGuard(task, targetStatus) || null;
}

/* ── helpers ─────────────────────────────────────────────────── */

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

/* ═══════════════════════════════════════════════════════════════
   1. numeroOsStartGuard — isolado
═══════════════════════════════════════════════════════════════ */

section('numeroOsStartGuard — destino ≠ Em andamento → sempre null');
{
  const task = { id: 1, categoria: 'rompimentos', numeroOs: '' };
  assert('null para "Concluída"',  numeroOsStartGuard(task, 'Concluída')  === null);
  assert('null para "Finalizada"', numeroOsStartGuard(task, 'Finalizada') === null);
  assert('null para "Criada"',     numeroOsStartGuard(task, 'Criada')     === null);
  assert('null para ""',           numeroOsStartGuard(task, '')            === null);
  assert('null para undefined',    numeroOsStartGuard(task, undefined)     === null);
}

section('numeroOsStartGuard — task nula/indefinida → null');
{
  assert('task=null',      numeroOsStartGuard(null,      'Em andamento') === null);
  assert('task=undefined', numeroOsStartGuard(undefined, 'Em andamento') === null);
}

section('numeroOsStartGuard — numeroOs ausente/vazio → bloqueia');
{
  const casos = [
    { id: 1, categoria: 'rompimentos',        numeroOs: ''        },
    { id: 2, categoria: 'troca-poste',        numeroOs: null      },
    { id: 3, categoria: 'otimizacao-rede',    numeroOs: undefined },
    { id: 4, categoria: 'atendimento-cliente',numeroOs: '   '     },
    { id: 5, categoria: 'qualidade-potencia', /* sem campo */      },
    { id: 6, categoria: 'correcao-atenuacao', numeroOs: ''        },
    { id: 7, categoria: 'troca-etiqueta',     numeroOs: null      },
    { id: 8, categoria: 'certificacao-cemig', numeroOs: ''        },
  ];
  for (const t of casos) {
    const msg = numeroOsStartGuard(t, 'Em andamento');
    assert(`"${t.categoria}" sem numeroOs → bloqueia`, typeof msg === 'string' && msg.length > 0);
  }
}

section('numeroOsStartGuard — numeroOs preenchido → null');
{
  const casos = [
    { id: 1,  categoria: 'rompimentos',        numeroOs: 'OS-00123'   },
    { id: 2,  categoria: 'troca-poste',        numeroOs: '987654'     },
    { id: 3,  categoria: 'otimizacao-rede',    numeroOs: 'HUB-001'    },
    { id: 4,  categoria: 'atendimento-cliente',numeroOs: '1234'       },
    { id: 5,  categoria: 'qualidade-potencia', numeroOs: 'OS-9999'    },
    { id: 6,  categoria: 'correcao-atenuacao', numeroOs: 'ATN-0001'   },
    { id: 7,  categoria: 'troca-etiqueta',     numeroOs: 'ETQ-001'    },
    { id: 8,  categoria: 'certificacao-cemig', numeroOs: '2026-00001' },
    { id: 9,  categoria: 'manutencao-corretiva', numeroOs: 'MCR-001'  },
    { id: 10, categoria: 'rompimentos',        numeroOs: '  OS-0001  ' }, // espaços em branco
  ];
  for (const t of casos) {
    assert(
      `"${t.categoria}" numeroOs="${t.numeroOs}" → libera`,
      numeroOsStartGuard(t, 'Em andamento') === null,
    );
  }
}

/* ═══════════════════════════════════════════════════════════════
   2. Regra combinada — linkedOsStartGuard + numeroOsStartGuard
═══════════════════════════════════════════════════════════════ */

section('Combinado — categoria SEM linkedOs: só exige numeroOs');
{
  const cats = ['correcao-atenuacao', 'troca-etiqueta'];
  _opTasks = [];

  for (const cat of cats) {
    const semOs  = { id: 100, categoria: cat, parentTaskId: null, numeroOs: '' };
    const comOs  = { id: 101, categoria: cat, parentTaskId: null, numeroOs: 'OS-123' };

    assert(`"${cat}" sem numeroOs → bloqueia`,   combinedGuard(semOs,  'Em andamento') !== null);
    assert(`"${cat}" com numeroOs → libera`,      combinedGuard(comOs,  'Em andamento') === null);
  }
}

section('Combinado — categoria COM linkedOs: exige AMBAS as condições');
{
  const linkedCats = [
    'rompimentos', 'troca-poste', 'otimizacao-rede',
    'certificacao-cemig', 'qualidade-potencia', 'manutencao-corretiva',
    'atendimento-cliente',
  ];

  for (const cat of linkedCats) {
    const paiId = 200;
    const pai = { id: paiId, categoria: cat, parentTaskId: null };

    // Cenário A: sem linkedOs, sem numeroOs → bloqueia (por linkedOs primeiro)
    _opTasks = [];
    const msgA = combinedGuard({ ...pai, numeroOs: '' }, 'Em andamento');
    assert(`"${cat}" sem OS filha + sem numeroOs → bloqueia`, msgA !== null);

    // Cenário B: com linkedOs, mas sem numeroOs → bloqueia (por numeroOs)
    _opTasks = [{ id: 201, categoria: cat, parentTaskId: paiId }];
    const msgB = combinedGuard({ ...pai, numeroOs: '' }, 'Em andamento');
    assert(`"${cat}" com OS filha + sem numeroOs → bloqueia`, msgB !== null);

    // Cenário C: sem linkedOs, mas com numeroOs → bloqueia (por linkedOs)
    _opTasks = [];
    const msgC = combinedGuard({ ...pai, numeroOs: 'OS-001' }, 'Em andamento');
    assert(`"${cat}" sem OS filha + com numeroOs → bloqueia`, msgC !== null);

    // Cenário D: com linkedOs E com numeroOs → libera
    _opTasks = [{ id: 202, categoria: cat, parentTaskId: paiId }];
    const msgD = combinedGuard({ ...pai, numeroOs: 'OS-001' }, 'Em andamento');
    assert(`"${cat}" com OS filha + com numeroOs → libera`, msgD === null);
  }
}

section('Combinado — tarefa FILHA: exige só numeroOs (linkedOs não se aplica)');
{
  const cats = ['rompimentos', 'troca-poste', 'atendimento-cliente', 'otimizacao-rede'];
  _opTasks = [];

  for (const cat of cats) {
    const filhaSem = { id: 300, categoria: cat, parentTaskId: 1, numeroOs: '' };
    const filhaCom = { id: 301, categoria: cat, parentTaskId: 1, numeroOs: 'OS-999' };

    assert(`filha "${cat}" sem numeroOs → bloqueia`,  combinedGuard(filhaSem, 'Em andamento') !== null);
    assert(`filha "${cat}" com numeroOs → libera`,    combinedGuard(filhaCom, 'Em andamento') === null);
  }
}

section('Combinado — destino ≠ Em andamento → sempre null');
{
  _opTasks = [];
  const task = { id: 400, categoria: 'rompimentos', parentTaskId: null, numeroOs: '' };
  for (const status of ['Criada', 'Concluída', 'Finalizada', 'Backlog', '']) {
    assert(`status="${status || '(vazio)'}" → null`, combinedGuard(task, status) === null);
  }
}

section('Combinado — edge cases de parentTaskId');
{
  _opTasks = [];
  for (const pid of [0, null, undefined, '']) {
    const t = { id: 500, categoria: 'rompimentos', parentTaskId: pid, numeroOs: '' };
    assert(`parentTaskId=${JSON.stringify(pid)} tratado como pai → bloqueia`, combinedGuard(t, 'Em andamento') !== null);
  }

  for (const pid of [0, null, undefined, '']) {
    const t = { id: 501, categoria: 'rompimentos', parentTaskId: pid, numeroOs: 'OS-001' };
    // Ainda sem OS filha, deve bloquear por linkedOsStartGuard
    assert(`parentTaskId=${JSON.stringify(pid)} com numeroOs, sem OS filha → bloqueia`, combinedGuard(t, 'Em andamento') !== null);
  }
}

/* ── resultado ───────────────────────────────────────────────── */

console.log(`\n${'─'.repeat(60)}`);
if (failed === 0) {
  console.log(`✅  Todos os ${passed} testes passaram.`);
} else {
  console.error(`❌  ${failed} falha(s) de ${passed + failed} testes.`);
  process.exit(1);
}
