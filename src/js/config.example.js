// Exemplo: copie para config.js (não commitar segredos). Inclua antes de main.js no index.html.
window.APP_CONFIG = {
  // Incremente a cada deploy para limpar caches locais (planner.*) e alinhar ?v= no HTML.
  appBuild: '2026-03-30-1',

  // Base da pasta api (sem barra final). '' = inferir no mesmo host; false = só modo offline/local.
  apiBaseUrl: '',

  // Opcional: técnicos por região (autocomplete no modal operacional).
  // techsByRegion: { GOVAL: [ { name: 'Fulano', chatUserId: '...' } ], VALE_DO_ACO: [] },

  // defaultWebhookUrl: 'https://chat.googleapis.com/v1/spaces/...',
  // defaultWebhookUrlsByRegion: { GOVAL: '...', VALE_DO_ACO: '...', CARATINGA: '...' },
  // ctoDataBase: 'https://exemplo.com/subpasta/src/data/',
  // authUsers: [{ user: 'nome', pass: 'senha' }],
  // sidebarAvatarUrl: 'https://exemplo.com/foto.jpg',
  // avatarOptions: [ { label: '1', url: './assets/avatares/avatar1.png' } ],
};
