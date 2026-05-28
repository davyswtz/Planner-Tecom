# Migrations do Banco

Estes arquivos foram pensados para banco já em uso. Eles não apagam dados.

Ordem recomendada para produção:

1. `000_schema_migrations.sql`
2. `007_performance_indexes.sql`
3. `008_deleted_entity_log.sql`
4. … demais migrations na ordem numérica do arquivo, até `018_op_tasks_numero_os.sql` (campo **Número da OS HubSpot** em `op_tasks.numero_os`)

Observações:

- Faça backup antes de rodar qualquer SQL em produção.
- Os arquivos usam `CREATE TABLE IF NOT EXISTS` e checagem em `information_schema` para evitar duplicidade.
- `007_performance_indexes.sql` pode demorar um pouco se as tabelas já tiverem muitos registros, porque o MySQL precisa montar os índices.
- `008_deleted_entity_log.sql` cria uma tabela nova para registrar exclusões futuras; não restaura exclusões antigas.
