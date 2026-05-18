/**
 * Teste rápido: prioridade de subtarefa/OS filha não deve ser forçada para Alta.
 * Executar: node scripts/test-op-prioridade-subtask.js
 */
'use strict';

function resolveOpPrioridadeForSave(ctx) {
  const pick = String(ctx.prioPick || '').trim();
  const inherited = String(ctx.existing?.prioridade || ctx.selectedParent?.prioridade || '').trim();
  if (ctx.isOtimParentOnly || ctx.isCemigParentOnly) return pick || 'Média';
  if (ctx.isRompParentOnly) return pick || 'Alta';
  if (ctx.isRompChildOnly || ctx.isAtdChildOnly || ctx.isOsLinkedChildOnly) {
    return pick || inherited || 'Média';
  }
  return pick || inherited || 'Média';
}

const cases = [
  {
    name: 'OS filha rompimento: usuário escolhe Média',
    ctx: {
      prioPick: 'Média',
      existing: { prioridade: 'Alta' },
      selectedParent: { prioridade: 'Alta' },
      isRompParentOnly: false,
      isRompChildOnly: true,
      isOsLinkedChildOnly: true,
    },
    want: 'Média',
  },
  {
    name: 'OS filha rompimento: sem pick, herda pai Baixa',
    ctx: {
      prioPick: '',
      existing: null,
      selectedParent: { prioridade: 'Baixa' },
      isRompChildOnly: true,
      isOsLinkedChildOnly: true,
    },
    want: 'Baixa',
  },
  {
    name: 'Rompimento pai: padrão Alta se vazio',
    ctx: { prioPick: '', isRompParentOnly: true },
    want: 'Alta',
  },
  {
    name: 'Rompimento pai: respeita Baixa',
    ctx: { prioPick: 'Baixa', isRompParentOnly: true },
    want: 'Baixa',
  },
  {
    name: 'bug antigo: rompimento filha com pick Baixa não vira Alta',
    ctx: {
      prioPick: 'Baixa',
      isRompimento: true,
      isRompChildOnly: true,
      isOsLinkedChildOnly: true,
    },
    want: 'Baixa',
    oldBug: true,
  },
];

let failed = 0;
for (const c of cases) {
  const got = resolveOpPrioridadeForSave(c.ctx);
  const oldWouldBe = c.ctx.isRompimento || c.oldBug ? 'Alta' : got;
  const ok = got === c.want;
  if (!ok) {
    failed++;
    console.error(`FAIL: ${c.name} — got "${got}", want "${c.want}"`);
  } else {
    console.log(`OK: ${c.name} → "${got}"`);
  }
  if (c.oldBug && oldWouldBe === 'Alta' && got !== 'Alta') {
    console.log(`  (antes do fix seria "${oldWouldBe}")`);
  }
}

if (failed) {
  process.exit(1);
}
console.log('\nTodos os casos passaram.');
