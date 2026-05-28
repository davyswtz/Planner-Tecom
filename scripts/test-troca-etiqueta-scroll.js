/**
 * Testes: layout de scroll da tela "Troca de etiqueta" (kanban v2 - te2).
 * Verifica que as regras CSS necessárias para o scroll funcionar estão presentes.
 *
 * node scripts/test-troca-etiqueta-scroll.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const CSS_FILE = path.join(__dirname, '..', 'src', 'css', 'main.css');

let passed = 0;
let failed = 0;

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

const css = fs.readFileSync(CSS_FILE, 'utf8');

// Helper: extrai o bloco de regras de um seletor
function extractBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped + '\\s*\\{([^}]*?)\\}', 's');
  const m = css.match(re);
  return m ? m[1] : null;
}

// Helper: conta ocorrências de uma propriedade em um bloco
function hasProp(block, prop, value) {
  if (!block) return false;
  const re = new RegExp(`${prop}\\s*:\\s*[^;]*${value ? value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : ''}`, 'i');
  return re.test(block);
}

console.log('\n═══ Troca de etiqueta — Scroll Layout Tests ═══\n');

// ── 1. #teRoot não deve ter height: 100vh ──────────────────────────────────
console.log('1. #teRoot — não deve ter height: 100vh fixo');
{
  // Verifica se height:100vh aparece no bloco do #teRoot (não só no seletor combinado)
  // O seletor combinado também vale, mas precisa não ter height: 100vh
  const blockGroup = (() => {
    const re = /#page-troca-etiqueta\s+#teRoot[^{]*\{([^}]*)\}/gs;
    const blocks = [];
    let m;
    while ((m = re.exec(css)) !== null) blocks.push(m[1]);
    return blocks.join('\n');
  })();
  const combinedBlock = (() => {
    // Captura o bloco que contém #teRoot junto com .te-page/.te-layout
    const re = /#page-troca-etiqueta\s+\.te-page[^{]*#teRoot[^{]*\{([^}]*)\}/s;
    const m = css.match(re);
    return m ? m[1] : '';
  })();
  const allTeRootCSS = blockGroup + combinedBlock;
  ok('height: 100vh removido de #teRoot', !(/height\s*:\s*100vh/.test(allTeRootCSS)),
    'height: 100vh fixa bloqueia o scroll do layout flex');
}

// ── 2. #teRoot deve usar flex para preencher o espaço ──────────────────────
console.log('\n2. #teRoot — deve usar flex para preencher espaço disponível');
{
  const re = /#page-troca-etiqueta\s+(?:\.te-page[\s\S]*?#teRoot|#teRoot)[^{]*\{([^}]*)\}/gs;
  let allBlocks = '';
  let m;
  while ((m = re.exec(css)) !== null) allBlocks += m[1];
  ok('flex: 1 1 auto em #teRoot ou seletor combinado', /flex\s*:\s*1\s+1\s+auto/.test(allBlocks));
  ok('display: flex em #teRoot ou seletor combinado', /display\s*:\s*flex/.test(allBlocks));
  ok('min-height: 0 em #teRoot ou seletor combinado', /min-height\s*:\s*0/.test(allBlocks));
}

// ── 3. .te2 deve ser flex column ───────────────────────────────────────────
console.log('\n3. .te2 — deve ser flex column (não grid) para distribuir espaço');
{
  const re = /#page-troca-etiqueta\s+\.te2\s*\{([^}]*)\}/;
  const m = css.match(re);
  const block = m ? m[1] : '';
  ok('display: flex', /display\s*:\s*flex/.test(block));
  ok('flex-direction: column', /flex-direction\s*:\s*column/.test(block));
  ok('flex: 1 1 auto', /flex\s*:\s*1\s+1\s+auto/.test(block));
  ok('min-height: 0', /min-height\s*:\s*0/.test(block));
}

// ── 4. .te2__board — deve preencher espaço restante ────────────────────────
console.log('\n4. .te2__board — deve preencher espaço restante (flex: 1 1 auto)');
{
  const re = /#page-troca-etiqueta\s+\.te2__board\s*\{([^}]*)\}/;
  const m = css.match(re);
  const block = m ? m[1] : '';
  ok('flex: 1 1 auto', /flex\s*:\s*1\s+1\s+auto/.test(block));
  ok('min-height: 0', /min-height\s*:\s*0/.test(block));
  ok('overflow: hidden (contém o grid)', /overflow\s*:\s*hidden/.test(block));
}

// ── 5. .te2-grid — deve preencher altura do board ──────────────────────────
console.log('\n5. .te2-grid — deve preencher altura total do board');
{
  const re = /#page-troca-etiqueta\s+\.te2-grid\s*\{([^}]*)\}/;
  const m = css.match(re);
  const block = m ? m[1] : '';
  ok('height: 100%', /height\s*:\s*100%/.test(block));
  ok('align-items: stretch (colunas mesma altura)', /align-items\s*:\s*stretch/.test(block));
}

// ── 6. .te2-col — deve ter height: 100% ────────────────────────────────────
console.log('\n6. .te2-col — deve ter height: 100%');
{
  const re = /#page-troca-etiqueta\s+\.te2-col\s*\{([^}]*)\}/;
  const m = css.match(re);
  const block = m ? m[1] : '';
  ok('height: 100%', /height\s*:\s*100%/.test(block));
  ok('display: flex', /display\s*:\s*flex/.test(block));
  ok('flex-direction: column', /flex-direction\s*:\s*column/.test(block));
}

// ── 7. .te2-col__body — deve ser flex child que preenche coluna ────────────
console.log('\n7. .te2-col__body — deve preencher espaço da coluna com flex');
{
  const re = /#page-troca-etiqueta\s+\.te2-col__body\s*\{([^}]*)\}/;
  const m = css.match(re);
  const block = m ? m[1] : '';
  ok('flex: 1 1 auto', /flex\s*:\s*1\s+1\s+auto/.test(block));
  ok('min-height: 0', /min-height\s*:\s*0/.test(block));
  ok('display: flex (para conter inner)', /display\s*:\s*flex/.test(block));
  ok('flex-direction: column', /flex-direction\s*:\s*column/.test(block));
  ok('overflow: hidden (necessário para animação de colapso)', /overflow\s*:\s*hidden/.test(block));
  ok('max-height tem fallback grande (não fixo em 900px)', !/max-height\s*:\s*var\(--te2-body-h,\s*900px\)/.test(block));
}

// ── 8. .te2-col__body-inner — deve ser o container scrollável ─────────────
console.log('\n8. .te2-col__body-inner — deve scroll quando conteúdo excede altura');
{
  const re = /#page-troca-etiqueta\s+\.te2-col__body-inner\s*\{([^}]*)\}/;
  const m = css.match(re);
  const block = m ? m[1] : '';
  ok('flex: 1 1 auto (preenche body)', /flex\s*:\s*1\s+1\s+auto/.test(block));
  ok('min-height: 0', /min-height\s*:\s*0/.test(block));
  ok('overflow-y: auto (scroll vertical)', /overflow-y\s*:\s*auto/.test(block));
  ok('overflow-x: hidden', /overflow-x\s*:\s*hidden/.test(block));
  ok('display: flex; flex-direction: column (cards em coluna)', /display\s*:\s*flex/.test(block) && /flex-direction\s*:\s*column/.test(block));
  ok('SEM height/max-height fixo que bloqueie scroll', !(/max-height\s*:\s*900px/.test(block)));
}

// ── 9. Animação de colapso preservada ─────────────────────────────────────
console.log('\n9. Animação de colapso — deve estar intacta');
{
  const re = /#page-troca-etiqueta\s+\.te2-col__body\.is-collapsed\s*\{([^}]*)\}/;
  const m = css.match(re);
  const block = m ? m[1] : '';
  ok('is-collapsed com max-height: 0', /max-height\s*:\s*0/.test(block));
  ok('is-collapsed com opacity: 0', /opacity\s*:\s*0/.test(block));
}

// ── 10. Transição de max-height ────────────────────────────────────────────
console.log('\n10. Transição de max-height preservada');
{
  const re = /#page-troca-etiqueta\s+\.te2-col__body\s*\{([^}]*)\}/;
  const m = css.match(re);
  const block = m ? m[1] : '';
  ok('transition inclui max-height', /transition\s*:[^;]*max-height/.test(block));
}

// ── Resumo ─────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(50));
const total = passed + failed;
console.log(`Resultado: ${passed}/${total} passaram`);
if (failed > 0) {
  console.error(`\n${failed} teste(s) falharam — verifique o CSS em src/css/main.css`);
  process.exit(1);
} else {
  console.log('\nTodos os testes passaram! Scroll da tela troca-de-etiqueta corrigido.');
  process.exit(0);
}
