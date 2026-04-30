-- Importar no banco `samu6922_burrinhosProjetosProd` pelo phpMyAdmin.
-- Reseta/cria o login do sistema abaixo com a senha combinada.
-- Apague este arquivo do servidor depois de importar.

INSERT INTO usuario (username, pass_salt, pass_hash, pass_iterations)
VALUES (
  'davyibipar',
  '56e8527fe1f38fa689531a355d27c2ff',
  '484e8b9a05b17e201674cb3b82c3232bbed7595c678ef1fd182ce62f2b61a7a0',
  60000
)
ON DUPLICATE KEY UPDATE
  pass_salt = VALUES(pass_salt),
  pass_hash = VALUES(pass_hash),
  pass_iterations = VALUES(pass_iterations);
