-- ═══════════════════════════════════════════════════════════════════════════
-- Burrinho Projetos — schema MySQL 8.x / MariaDB 10.3+ (HostGator / cPanel)
-- Charset: utf8mb4 (acentuação e símbolos nas notificações)
-- Execute no phpMyAdmin ou: mysql -u USUARIO -p NOME_DB < schema.sql
-- ═══════════════════════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ─── Tarefas gerais (Dashboard) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id BIGINT NOT NULL,
  titulo VARCHAR(255) NOT NULL,
  responsavel VARCHAR(120) NOT NULL,
  prazo DATE NULL,
  status VARCHAR(48) NOT NULL DEFAULT 'Pendente',
  prioridade VARCHAR(24) NOT NULL DEFAULT 'Média',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_tasks_prazo (prazo),
  KEY idx_tasks_status (status),
  KEY idx_tasks_updated_at (updated_at),
  KEY idx_tasks_status_prazo (status, prazo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Tarefas operacionais (Rompimentos, Troca de poste, Atendimento) ──────
CREATE TABLE IF NOT EXISTS op_tasks (
  id BIGINT NOT NULL,
  taskCode VARCHAR(32) NOT NULL,
  titulo VARCHAR(500) NOT NULL,
  setor VARCHAR(180) NOT NULL DEFAULT '',
  regiao VARCHAR(64) NOT NULL DEFAULT '',
  responsavel VARCHAR(120) NOT NULL,
  clientesAfetados VARCHAR(32) NOT NULL DEFAULT '',
  coordenadas VARCHAR(120) NOT NULL DEFAULT '',
  localizacao_texto VARCHAR(512) NOT NULL DEFAULT '',
  descricao MEDIUMTEXT,
  categoria VARCHAR(48) NOT NULL,
  prazo DATE NULL,
  prioridade VARCHAR(24) NOT NULL DEFAULT 'Média',
  status VARCHAR(48) NOT NULL DEFAULT 'Criada',
  is_parent_task TINYINT(1) NOT NULL DEFAULT 0,
  parent_task_id BIGINT NULL,
  criadaEm VARCHAR(64) NOT NULL DEFAULT '',
  historico LONGTEXT,
  chat_thread_key VARCHAR(140) NOT NULL DEFAULT '',
  nome_cliente VARCHAR(255) NOT NULL DEFAULT '',
  protocolo VARCHAR(180) NOT NULL DEFAULT '',
  data_entrada VARCHAR(64) NOT NULL DEFAULT '',
  data_instalacao VARCHAR(64) NOT NULL DEFAULT '',
  assinada_por VARCHAR(120) NOT NULL DEFAULT '',
  assinada_em VARCHAR(64) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_op_tasks_categoria (categoria),
  KEY idx_op_tasks_status (status),
  KEY idx_op_tasks_parent (parent_task_id),
  KEY idx_op_tasks_updated_at (updated_at),
  KEY idx_op_tasks_categoria_status (categoria, status),
  KEY idx_op_tasks_categoria_regiao (categoria, regiao),
  KEY idx_op_tasks_status_prazo (status, prazo),
  KEY idx_op_tasks_taskCode (taskCode),
  KEY idx_op_tasks_parent_status (parent_task_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Imagens embutidas na descrição (op_tasks) ─────────────────────────────
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

-- ─── Configuração (webhook Google Chat, nota do planner) ───────────────────
CREATE TABLE IF NOT EXISTS app_config (
  cfg_key VARCHAR(64) NOT NULL,
  cfg_value LONGTEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cfg_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Notificações do sistema (sininho) ─────────────────────────────────────
-- "Não lido" é controlado no front por lastSeenId por usuário (localStorage).
CREATE TABLE IF NOT EXISTS app_notification (
  id BIGINT NOT NULL AUTO_INCREMENT,
  kind VARCHAR(48) NOT NULL DEFAULT 'task_added',
  title VARCHAR(255) NOT NULL DEFAULT '',
  message VARCHAR(600) NOT NULL DEFAULT '',
  ref_type VARCHAR(32) NOT NULL DEFAULT '',  -- 'task' | 'op_task'
  ref_id BIGINT NULL,
  op_category VARCHAR(48) NOT NULL DEFAULT '',
  created_by VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_app_notification_created (created_at),
  KEY idx_app_notification_updated (updated_at),
  KEY idx_app_notification_kind (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Atividade recente do usuário (audit leve) ─────────────────────────────
-- Feed do dashboard: eventos do usuário logado (criou/alterou status etc.).
CREATE TABLE IF NOT EXISTS app_activity_event (
  id BIGINT NOT NULL AUTO_INCREMENT,
  username VARCHAR(120) NOT NULL,
  event_type VARCHAR(48) NOT NULL,          -- task_created | op_task_created | op_status_changed | task_updated ...
  severity VARCHAR(16) NOT NULL DEFAULT 'info', -- info|success|warning|danger
  message VARCHAR(600) NOT NULL DEFAULT '',
  ref_type VARCHAR(32) NOT NULL DEFAULT '', -- task|op_task
  ref_id BIGINT NULL,
  op_category VARCHAR(48) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_user_created (username, created_at),
  KEY idx_activity_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Escalas (mês/dia/horário/horas/nome) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS escalas (
  id BIGINT NOT NULL AUTO_INCREMENT,
  client_uid VARCHAR(48) NOT NULL,
  data DATE NULL,
  mes TINYINT UNSIGNED NOT NULL,          -- 1..12
  dia_semana TINYINT UNSIGNED NOT NULL,   -- 1..7 (Segunda..Domingo)
  horario TIME NOT NULL,
  horario_inicio TIME NULL,
  horario_fim TIME NULL,
  horas DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  nome VARCHAR(120) NOT NULL,
  created_by VARCHAR(120) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_escalas_client_uid (client_uid),
  KEY idx_escalas_nome (nome),
  KEY idx_escalas_mes (mes),
  KEY idx_escalas_data (data),
  KEY idx_escalas_nome_data (nome, data),
  KEY idx_escalas_updated_at (updated_at),
  KEY idx_escalas_mes_dia_hora (mes, dia_semana, horario),
  KEY idx_escalas_horarios (horario_inicio, horario_fim)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Usuários (login do painel) ─────────────────────────────────────────
-- Senhas armazenadas como PBKDF2 (sha256) com salt por usuário.
CREATE TABLE IF NOT EXISTS usuario (
  username VARCHAR(120) NOT NULL,
  pass_salt CHAR(64) NOT NULL,
  pass_hash CHAR(64) NOT NULL,
  pass_iterations INT NOT NULL DEFAULT 60000,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
