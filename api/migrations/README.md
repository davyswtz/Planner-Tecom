# Migrations do Banco

Estes arquivos foram pensados para banco já em uso. Eles não apagam dados.

Ordem recomendada para produção:

1. `000_schema_migrations.sql`
2. `006_team_chat_message.sql`
3. `007_performance_indexes.sql`
4. `008_deleted_entity_log.sql`

Observações:

- Faça backup antes de rodar qualquer SQL em produção.
- Os arquivos usam `CREATE TABLE IF NOT EXISTS` e checagem em `information_schema` para evitar duplicidade.
- `007_performance_indexes.sql` pode demorar um pouco se as tabelas já tiverem muitos registros, porque o MySQL precisa montar os índices.
- `008_deleted_entity_log.sql` cria uma tabela nova para registrar exclusões futuras; não restaura exclusões antigas.
