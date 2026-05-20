<?php
declare(strict_types=1);

/**
 * Copie para credentials.php e preencha com os dados do seu banco.
 * NÃO versionar credentials.php (já está no .gitignore).
 *
 * Local (Laragon / XAMPP):
 *   host: localhost | user: root | password: (a que você definiu no Laragon)
 *
 * HostGator (produção):
 *   host: localhost (ou o valor indicado no cPanel)
 *   user / password / database: criados no cPanel → MySQL Databases
 */
return [
    'host'     => 'localhost',
    'port'     => '3306',
    'database' => 'planner_tecom',   // nome do banco que você criou
    'user'     => 'root',
    'password' => '',                // senha do MySQL local
];
