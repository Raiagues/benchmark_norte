# Validação — 27/09/2026

Versão 1.1: resultados publicados somente após uma execução real e completa das APIs.

- 74 testes Python passaram. Incluem precisão/recall/F1, evidências, relações direcionadas, impactos críticos, parsing, normalização dos provedores, feedback, publicação atômica e rejeição de respostas inválidas.
- 8 testes de navegador passaram na interface compilada: estado vazio; falha sem resultado; seleção de modelo e grafos lado a lado; métricas e respostas originais; layout móvel; bloqueio de todos os modelos quando falta uma chave; confirmação manual persistente; diagnóstico de crédito sem confundir resposta HTTP com geração confirmada.
- As confirmações são testadas em bancos temporários: ausência/rotação de chave, configuração alterada, crédito, cota, rate limit, acesso negado e resposta malformada. Iniciar não repete o teste de conexão e uma única pendência bloqueia o lote antes de qualquer chamada.
- `./setup`, `./start` repetido, `./stop` repetido e reabertura imediata passaram no ambiente Linux. O instalador criou apenas um `.env` vazio e preserva arquivos existentes. O servidor atende interface e API em uma única porta.
- A compilação de produção do frontend passou. O Vite informa que ignora a diretiva `use client` da dependência React Flow; isso não impede a compilação.
- A análise estática Python passou. A varredura de segredos não encontrou possíveis credenciais nos arquivos visíveis pelo Git ou no histórico. `.env` está ignorado.
- Depois dos testes, o banco real continha zero resultados, zero respostas de tarefas, zero tentativas, zero feedbacks e zero confirmações de conexão. As rotas `/api/runs`, `/api/summary`, `/api/executions` e `/api/feedback` retornaram listas vazias. Não havia exportações `run.json` em `results/`.
- Uma verificação final no navegador real, sem interceptação de respostas, confirmou a página de resultados vazia, seleção dos seis modelos, verificação bloqueada por falta das chaves, início bloqueado e nenhum erro de JavaScript.
- Foram apagados os três resultados de demonstração gerados anteriormente e seus arquivos. A aplicação e o CLI não oferecem geração de demonstrações.
- Fixtures ficam exclusivamente nos testes: bancos temporários no Python e interceptação de todas as rotas API no navegador. Elas não entram no banco ou nas exportações do aplicativo.
- Dataset 1.1 substitui duas especificações de componentes hipotéticos: o novo ventilador usa fatos do NF-A4x20 5V e o cenário de velocidade altera um requisito de projeto. Fontes dos componentes reais e limites de fabricante permanecem registrados em `data/sources.json`.

As fontes oficiais e os PDFs locais foram conferidos durante a implementação inicial; as edições e hashes estão no registro de fontes. As relações e impactos esperados estão descritos em `ground_truth_review.md`. A referência continua provisória até revisão humana independente.

Não foram feitas chamadas pagas ou medições de modelos reais nesta validação. Acesso às contas, compatibilidade dos modelos reais com os schemas, qualidade das respostas e faturamento dependem de chaves válidas. Não houve teste de hardware.

A suíte Python informa uma depreciação do uso de httpx no TestClient do Starlette. Os testes passaram; o aviso é da dependência de teste.
