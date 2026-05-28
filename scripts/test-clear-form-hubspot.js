/**
 * Testes: _clearForm deve zerar todos os campos HubSpot ao criar nova tarefa.
 * node scripts/test-clear-form-hubspot.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const JS_FILE = path.join(__dirname, '..', 'src', 'js', 'main.js');
const src = fs.readFileSync(JS_FILE, 'utf8');

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

// Extrai o corpo da função _clearForm
const clearFormMatch = src.match(/_clearForm\s*\(preset[^)]*\)\s*\{([\s\S]*?)\n    \},/);
const clearFormBody = clearFormMatch ? clearFormMatch[1] : '';

console.log('\n═══ _clearForm — Campos HubSpot devem ser zerados na criação ═══\n');

// ── 1. Campos que DEVEM ser zerados ───────────────────────────────────────
console.log('1. Campos HubSpot zerados em _clearForm');

const hubspotFields = [
  { id: 'op-geral-os-hubspot',  label: 'Geral (rompimento/troca-etiqueta/troca-poste/correção-atenuação)' },
  { id: 'op-cemig-os-hubspot',  label: 'Cemig' },
  { id: 'op-atd-os-hubspot',    label: 'Atendimento ao cliente' },
];

for (const { id, label } of hubspotFields) {
  const pattern = new RegExp(`getElementById\\(['"]${id}['"]\\)[\\s\\S]{0,80}\\.value\\s*=\\s*['"]\\s*['"]`);
  ok(`${id} (${label})`, pattern.test(clearFormBody),
    `Adicione: const el = getElementById('${id}'); if (el) el.value = '';`);
}

// ── 2. Campos já zerados antes (regressão) ─────────────────────────────────
console.log('\n2. Outros campos zerados em _clearForm (regressão)');

const otherFields = [
  'op-titulo',
  'op-prazo',
  'op-regiao',
  'op-otim-ordem-servico',
  'op-qdp-ordem-servico',
  'op-cemig-protocolo',
  'op-atd-protocolo',
];

for (const id of otherFields) {
  // Aceita atribuição inline OU via variável intermediária
  // Aceita atribuição inline OU via variável (pode ter muitas linhas entre getElement e .value)
  const varPattern = new RegExp(`getElementById\\(['"]${id}['"]\\)[\\s\\S]{0,800}\\.value\\s*=\\s*['"]`);
  ok(id, varPattern.test(clearFormBody));
}

// ── 3. _clearForm não deve pré-preencher HubSpot na criação ────────────────
console.log('\n3. openNewModal não deve atribuir valor a campos HubSpot');

// Extrai openNewModal
const openNewModalMatch = src.match(/openNewModal\s*\(preset[^)]*\)\s*\{([\s\S]*?)\n    \},/);
const openNewModalBody = openNewModalMatch ? openNewModalMatch[1] : '';

for (const { id } of hubspotFields) {
  // Não deve haver atribuição direta de valor no openNewModal (que não seja vazio)
  const assignPattern = new RegExp(`getElementById\\(['"]${id}['"]\\)[\\s\\S]{0,80}\\.value\\s*=\\s*[^'"]`);
  ok(`openNewModal não atribui valor não-vazio a ${id}`, !assignPattern.test(openNewModalBody));
}

// ── Resumo ─────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(55));
const total = passed + failed;
console.log(`Resultado: ${passed}/${total} passaram`);
if (failed > 0) {
  console.error(`\n${failed} teste(s) falharam.`);
  process.exit(1);
} else {
  console.log('\nTodos os testes passaram! Campos HubSpot serão limpos ao criar nova tarefa.');
  process.exit(0);
}
