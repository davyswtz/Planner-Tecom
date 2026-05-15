<?php
declare(strict_types=1);

/**
 * Copie para webhooks.local.php e preencha (NÃO commitar).
 * Depois rode: php api/tools/apply_webhooks.php
 */
return [
    'urlsByRegion' => [
        'GOVAL' => 'https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...',
        'VALE_DO_ACO' => 'https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...',
        'CARATINGA' => 'https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...',
        'BACKUP' => 'https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...',
    ],
    'events' => [
        'andamento' => true,
        'concluida' => true,
        'finalizada' => true,
    ],
];
