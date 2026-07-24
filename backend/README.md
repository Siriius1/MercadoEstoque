# API Python do Mercado+

API local em FastAPI usando PostgreSQL. Produtos, estoque, movimentações e vendas
compartilham o mesmo banco.

## Desenvolvimento local

Use os scripts da raiz do projeto:

- `scripts\setup-postgres.ps1`: inicializa o banco local na primeira execução.
- `scripts\start-local.ps1`: inicia PostgreSQL, API e interface web.
- `scripts\stop-local.ps1`: encerra os processos locais do projeto.

A documentação interativa da API fica em `http://127.0.0.1:8000/docs`.
