-- Persistência do tópico do Google Chat por tarefa (para funcionar em qualquer navegador/usuário).
-- Execute no mesmo banco do painel.

ALTER TABLE op_tasks
  ADD COLUMN chat_thread_key VARCHAR(140) NOT NULL DEFAULT '' AFTER historico;

