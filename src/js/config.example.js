/**
 * Copie para `config.js` na mesma pasta e ajuste (não versionar `config.js` com segredos).
 * Em `index.html`, antes de `main.js`:
 *   <script src="./src/js/config.js"></script>
 *
 * @typedef {{ user: string, pass: string }} AuthUser
 * @typedef {{
 *   apiBaseUrl?: string|false,
 *   defaultWebhookUrl?: string,
 *   defaultWebhookUrlsByRegion?: Record<string,string>,
 *   ctoDataBase?: string,
 *   authUsers?: AuthUser[],
 *   sidebarAvatarUrl?: string,
 *   avatarOptions?: { label?: string, url: string }[],
 * }} AppConfig
 */
window.APP_CONFIG = {
  /**
   * Mude a cada deploy (ex.: data + sufixo). Zera caches `planner.*` (exceto sessão e tema),
   * e o `index.html` usa este valor em `?v=` no main.js e main.css.
   */
  appBuild: '2026-03-30-1',

  /**
   * URL base da pasta `api` (sem barra no final). Ex.: https://meusite.com/burrinho/api
   * Deixe '' para auto-detectar na HostGator: mesmo domínio + caminho da página + `/api`.
   */
  apiBaseUrl: '',

  /** URL do webhook Google Chat (só para ambiente fechado; em geral configure pelo modal do app). */
  // defaultWebhookUrl: 'https://chat.googleapis.com/v1/spaces/...',

  /**
   * URLs de webhook por região. IMPORTANTE: não commitar tokens reais em repositório público.
   * Prefira manter valores reais em um `config.js` local fora do controle de versão.
   */
  // defaultWebhookUrlsByRegion: {
  //   GOVAL: 'https://chat.googleapis.com/v1/spaces/...',
  //   VALE_DO_ACO: 'https://chat.googleapis.com/v1/spaces/...',
  //   CARATINGA: 'https://chat.googleapis.com/v1/spaces/...',
  //   BACKUP: 'https://chat.googleapis.com/v1/spaces/...',
  // },

  /**
   * Pasta base dos JSON de CTO (termina com /). Ex.: `https://meusite.com/burrinho/src/data/`
   * Só necessário se os arquivos não estiverem relativos ao `main.js`.
   */
  // ctoDataBase: 'https://meusite.com/subpasta/src/data/',

  /** Credenciais de login (fallback apenas quando API remota estiver desabilitada). */
  // authUsers: [{ user: 'nome', pass: 'senha-segura' }],

  /** Foto na barra lateral (sobrescreve o mascote padrão em `assets/sidebar-mascote-projetos.png`). */
  // sidebarAvatarUrl: 'https://exemplo.com/foto.jpg',

  /**
   * Avatares extras para o seletor de perfil (Configurações).
   * Ex.: mova os arquivos para `assets/avatares/` e aponte as URLs abaixo.
   */
  // avatarOptions: [
  //   { label: 'Avatar 1', url: './assets/avatares/avatar1.png' },
  //   { label: 'Avatar 2', url: './assets/avatares/avatar2.png' },
  // ],
};
