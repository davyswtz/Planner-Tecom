-- Data de saída (prazo de saída) das listas ATD — campo dataInstalacao no front.
-- Execute uma vez após patch_op_tasks_atendimento_meta.sql (quando data_entrada já existir).

ALTER TABLE op_tasks
  ADD COLUMN data_instalacao VARCHAR(64) NOT NULL DEFAULT '' AFTER data_entrada;
