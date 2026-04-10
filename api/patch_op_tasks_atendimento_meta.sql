-- Bancos já existentes: adiciona metadados de Atendimento ao Cliente em op_tasks
-- (nome do cliente, protocolo, datas de assinatura — espelho do JSON do front).
-- Execute uma vez no phpMyAdmin ou: mysql -u USER -p DB < api/patch_op_tasks_atendimento_meta.sql

ALTER TABLE op_tasks
  ADD COLUMN nome_cliente VARCHAR(255) NOT NULL DEFAULT '' AFTER chat_thread_key,
  ADD COLUMN protocolo VARCHAR(180) NOT NULL DEFAULT '' AFTER nome_cliente,
  ADD COLUMN data_entrada VARCHAR(64) NOT NULL DEFAULT '' AFTER protocolo,
  ADD COLUMN assinada_por VARCHAR(120) NOT NULL DEFAULT '' AFTER data_entrada,
  ADD COLUMN assinada_em VARCHAR(64) NOT NULL DEFAULT '' AFTER assinada_por;
