-- Chat geral: suporte a imagens nas mensagens.
ALTER TABLE chat_message
  ADD COLUMN image_mime VARCHAR(80) NOT NULL DEFAULT '' AFTER message,
  ADD COLUMN image_data LONGBLOB NULL AFTER image_mime;

