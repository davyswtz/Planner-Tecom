-- Chat interno entre colaboradores (mensagens no MySQL; front usa polling).
-- Execute no phpMyAdmin na mesma base do painel.

CREATE TABLE IF NOT EXISTS team_chat_message (
  id BIGINT NOT NULL AUTO_INCREMENT,
  username VARCHAR(120) NOT NULL,
  display_name VARCHAR(120) NOT NULL DEFAULT '',
  body VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_team_chat_message_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
