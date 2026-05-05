-- Imagens coladas na descrição de tarefas operacionais (ex.: Otimização de Rede)
-- MySQL armazena o binário; o HTML em op_tasks.descricao referencia op_task_image.php?id=

CREATE TABLE IF NOT EXISTS op_task_image (
  id INT NOT NULL AUTO_INCREMENT,
  op_task_id BIGINT NOT NULL,
  mime_type VARCHAR(80) NOT NULL DEFAULT 'image/png',
  image_data LONGBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_op_task_image_task (op_task_id),
  CONSTRAINT fk_op_task_image_op_task FOREIGN KEY (op_task_id) REFERENCES op_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Descrições longas com muitas imagens/base64 temporário
ALTER TABLE op_tasks MODIFY COLUMN descricao MEDIUMTEXT;
