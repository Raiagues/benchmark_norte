# Continuidade temporária — leia antes de editar

Atualizado em 2026-09-27. Este arquivo é um registro de passagem entre IAs; atualize-o após cada etapa verificada. Não presuma que um item pendente foi implementado.

## Trabalho atual — relatório para o Gama Fund (questão 5)

- A usuária encerrou a tentativa de corrigir Claude e pediu relatório detalhado com imagens + resposta em português sobre os pontos fortes/fracos dos modelos Google no NORTE. Não continuar alterações no produto nesta tarefa. Sem commit/push e sem chamadas pagas.
- [x] Cópia privada somente para análise: `.runtime/fund-report/evidence.sqlite3`, corte 27/09/2026 22:33:24 BRT. Originais preservados.
- [x] Extração: `scripts/analyze_fund_report.py`; CSV e agregado em `reports/gama-fund-2026-09-27/`. Há **43 respostas elegíveis**: Gemini 18, Astra 17, Claude 8 (4 b43c00 + 3 678f30 + 1 7f007f). Não reutilizar contagens antigas.
- [x] Confirmado: d4408d excluído; gabarito provisório, 58 itens sem ratificação. b43c00 e 678f30 têm mesmos dados/prompts/schemas, mas hash do código avaliador diferente. Não misturar protocolos nem alegar ranking controlado.
- [x] Achado relevante: Gemini cita SENSOR/DRIVER página 1 com trechos literais válidos, mas avaliador exige páginas 5/4. Relatório deve separar restrição do avaliador de invenção de conteúdo. Todas as 18 respostas Gemini são parciais pelas regras salvas, embora impactos tenham F1 100%.
- [x] Gerados `reports/gama-fund-2026-09-27/NORTE_relatorio_Gama_Fund.docx` e `.pdf` (13 páginas, 5 figuras), `resposta_formulario.txt`, `relatorio.md`, CSV/JSON auditáveis e figuras PNG/SVG. Scripts `analyze_fund_report.py` e `build_fund_report.py` preservados para continuidade.
- [x] Conferência final: PDF renderizado e inspecionado visualmente, sem páginas vazias/linhas órfãs; 43 IDs únicos no CSV, 19 grupos somando 43; d4408d ausente; custos indisponíveis sem estimativas; Word com cinco imagens. As **14 tabelas do SQLite original permanecem idênticas** à cópia de corte. Diff check e secrets scan passaram. Sem chamadas pagas, sem commit/push.
- Relatório deixa explícito que desempenho semântico é provisório, não mede produtividade/custo humano nem leitura multimodal de PDF. Foram separados erros de contrato, billing e problemas do próprio avaliador. Próxima IA: não atualizar este recorte silenciosamente nem retomar correções Claude; aguardar novo pedido. Os registros privados em `.runtime/fund-report/` não devem ser anexados.
- Última tentativa Claude 7f007f (`80d646cb…`, one_hop L2, uma resposta) foi avaliada, F1 de impactos 100%, explicações 0%. Não afirmar que Claude nunca respondeu. Histórico possui 3 falhas de contrato por duplicação + 1 billing; nenhum novo teste feito para este relatório.

## Última unidade concluída — exclusão Astra d4408d e contrato do Claude

- Pedido novo: retirar Astra d4408d dos resultados válidos e corrigir causa da duplicação no Claude, não somente explicar o erro. Sem commit/push nem chamadas pagas.
- Backup `.runtime/astra-invalid-claude-contract/before.sqlite3`. Quatro batches estavam parciais, nenhum ativo; conferir novamente antes de reiniciar.
- `config/result_exclusions.json` registra os três IDs exatos de repetição Astra d4408d invalidados pela usuária. Camada de leitura `result_validity.py`, agregação e UI excluem essas medições da comparação, mantendo todas as linhas originais. Não invalidar outras versões/modelos por prefixo.
- Concluído: instrução de uma entrada por requisito/cenário nos prompts de impacto para novas chamadas (prompt 2.0.1), mantendo validação estrita e snapshots anteriores. Validação encerrada; veja o último checkpoint.

## Última unidade concluída — diagnóstico Claude

- Rechecagem explícita na retomada em `ResumeConnectionCheck.jsx`/`ResumeControl.jsx`; exibe status/data locais, só o botão aciona a verificação curta existente. Confirmar retomada continua separado. Unidade validada; detalhes no último checkpoint.
- `RejectedOutput.jsx`/`ResultWorkbench.jsx` detalham duplicação observável na resposta rejeitada; não reparam nem reavaliam resultados. Fallback neutro para trabalho ainda não avaliado. Testes passaram.
- Claude tinha validação de saldo negativa salva às 18:37 local. A tentativa de verificação pelo endpoint recebeu 409 por operação concorrente, **sem chamar provedor**. Não afirmar que acesso/saldo atual foi confirmado.
- Erro técnico real `0f7a4ebe56c944d1a83bdabf308d02af`: HTTP 200/end_turn, `duplicate_impact` em CHG-004/REQ-002 (duas entradas: depends_on P-FAN-SPEED e verified_by V-SPEED). Erro independente de billing. Resposta preservada, sem mudar validação.
- Backups privados `.runtime/claude-connection/before.sqlite3` e `before-site-recovery.sqlite3`. A usuária iniciou `ebab04462b1f44c088aad22bec5d18c3` durante o trabalho anterior. Ao retomar, localhost:8000 não respondeu e o processo uvicorn já não existia. Site aberto com `NORTE_NO_BROWSER=1 ./start` após backup; recuperação existente registrou trabalho inacabado como interrompido, sem reenviar chamadas. Os três batches agora estão `PARTIALLY_COMPLETED`.
- Sem commit/push. Não alterar banco, segredos, prompts, ground truth ou workflow.

## Regras atuais da usuária (sobrepõem instruções antigas)

- **NÃO fazer commit, push, reset, clean ou descartar alterações. A usuária cuidará do Git.** A autorização anterior de commit/push foi revogada.
- Implementar em etapas pequenas, mantendo o site funcional em cada ponto de parada. Registrar arquivos, verificações e pendências aqui.
- Nenhum resultado/score/token/latência/custo fictício em produção. Fixtures somente nos testes isolados.
- Preservar todo banco, histórico, respostas, gabarito e prompts antigos. Não reavaliar nem sobrescrever resultados antigos. Migração somente aditiva e com backup/comparação.
- Chaves só no `.env` e backend. Nunca imprimir nem copiar segredos. Preservar validação de todos os modelos antes de iniciar chamadas, sem consumo se falta configuração.
- Não chamar APIs pagas, iniciar, retomar ou repetir benchmarks para testar a interface. Isso é decisão da usuária no site.
- Preservar `./setup`, `./start`, `./stop`, português/inglês, tarefas/níveis e inspeção das respostas reais.
- A usuária AGORA permite nova tentativa de testes já tentados/concluídos. Deve exigir ação explícita, preservar tentativas anteriores e indicar custo/versão. Não é autorização para a IA executá-los.
- Continuações devem aparecer como **um estudo** com todos os modelos. Não misturar médias de protocolos diferentes. O protocolo histórico tinha pistas; o atual 2.0 usa documentos sem respostas do gabarito. Uma continuação usa protocolo atual, nunca reproduzir pistas antigas.

## Como retomar com outra IA

1. Leia este arquivo, README, `docs/live_execution.md`, `git status` e diff atual; procure AGENTS.md. Não sobrescreva o trabalho de outro agente.
2. Confira processos e `GET /api/live` antes de reiniciar o servidor. Se houver avaliação ativa, não parar/reiniciar. O frontend compilado pode ser atualizado sem encerrar o backend.
3. Escolha a primeira etapa pendente, anote que está trabalhando nela e só então edite. Uma IA por vez; não criar locks persistentes que impeçam retomada após limite de créditos.
4. Termine uma unidade funcional, rode verificações pertinentes, atualize a checklist e o ponto de parada. Se precisar parar no meio, descreva exatamente o que está incompleto; não marque como pronto.
5. Não presumir que o estado do SQLite continua igual às contagens abaixo: a usuária pode estar executando testes. Preservar todos os registros preexistentes e permitir acréscimos reais.

## Base existente

- HEAD inicial `c441217`, branch main. A última etapa anterior passou 121 testes Python e 31 Playwright. Esses números são da base, não das novas mudanças.
- FastAPI/Python + SQLite; React/Vite + React Flow + PDF.js. Sem infraestrutura externa. Servidor local `http://127.0.0.1:8000` serve `frontend/dist`.
- `benchmark/live.py`: SSE, chamadas/tarefas persistidas, métricas e detalhes; `inspection.py`: explica avaliações salvas. `runner.py`/`providers.py`: chamadas reais, não alterar sem necessidade.
- `benchmark/resume.py`: continuação segura de tarefas comprovadamente não enviadas, tabela `live_continuations`. Não refazer chamadas incertas automaticamente.
- `frontend/src/LiveExecution.jsx`: cartões/histórico/inspetor; `InspectionViews.jsx`: entrada/saída/métricas; `ScenarioResults.jsx`: requisitos por mudança; `ModelResults.jsx`: seleção categoria/repetição.
- `frontend/src/main.jsx`: comparação, GraphCanvas/LiveGraph; `PdfViewer.jsx`: leitor PDF existente; `benchmark/artifacts.py` e `/api/sources`: PDFs locais com hash/proveniência.
- `/api/feedback`: correções de arestas; `/api/reviews`: revisão de explicações. Não alterar gabarito nem usar revisão não confirmada no primeiro passe.
- Banco e resultados locais são ignorados pelo Git. Antes desta solicitação havia 3 runs publicados, 9 repetições, 18 respostas, 54 tarefas, um estudo parcial. **Conferir novamente: a usuária começou uma continuação depois.**
- Backup inicial deste pedido: `.runtime/clarity-update/before.sqlite3` + `before.json` (somente leitura de dados originais; não restaurar sobre o banco). Outros backups anteriores em `.runtime` devem permanecer.

## Checklist do pedido atual

- [x] Inspeção inicial e backup; criação deste documento.
- [x] 1. Cores sem ambiguidade: verde correto, amarelo parcial, vermelho incorreto/erro técnico, azul em execução, neutro interrompido/sem dado. Explicar `Rep. 1` e `6 testes avaliados de 6`; separar progresso de acertos.
- [x] 2. Inspetor abre em saída vs esperado, com comparação/cor por item. Entrada fica em aba separada. Detalhar diferença exata (ex.: tipo da relação), em linguagem legível, sem reescrever notas.
- [x] 3. Feedback manual contextual: concordar/discordar do avaliador, sugestão de prompt, resposta longa etc.; persistir sem alterar resultado/gabarito automaticamente.
- [x] 4. Entrada começa pelo PDF original; alternar para texto integral extraído que foi enviado. Checar hash para não apresentar PDF atual como histórico se diferente/ausente. Configuração = escolhas/hipóteses do projeto, **não extração do PDF**.
- [x] 5. Saída em tabelas compactas filtráveis por tipo/relação/item/status, com detalhes expansíveis. Mostrar fase/tarefa, prompt e origem (explícita/inferida apenas quando declarado). Não inventar proveniência.
- [x] 6. Diagramas lado a lado dentro da saída; filtros e cores das divergências. Remover opções quebradas no inspetor. Não atribuir erro de outra tarefa a grafo correto sem identificação explícita.
- [x] 7. Métricas expansíveis: fórmula, contagens e itens avaliados; cores; nenhum limite arbitrário para latência (usuária aceitou deixá-la como medição).
- [x] 8. Exportar seleção de resultados, tabelas e diagramas em relatório imprimível/PDF; exportar imagem do diagrama; nunca incluir segredos ou gerar números de exemplo.
- [x] 9. Visão única do estudo original + continuações com todos os modelos e versões identificadas; nova tentativa selecionável com confirmação/preflight, sem apagar tentativas anteriores. Não fundir médias incompatíveis.
- [x] 10. Testes, inspeção visual local, comparação de preservação, secrets scan, documento final atualizado. **Sem commit/push.**

## Comandos para validação (não chamar provedores reais)

- `.venv/bin/ruff check benchmark tests`
- `.venv/bin/pytest -q` (bancos/credenciais isolados pelos fixtures)
- `npm --prefix frontend run build`
- `npm --prefix frontend run test:e2e` (requisições de benchmark interceptadas no navegador)
- `.venv/bin/python scripts/check_secrets.py`
- `git diff --check`

## Ponto de parada / trabalho em andamento

Reabertura concluída após a usuária mostrar telas antigas (seletor “Comparable evaluation” e apenas dois modelos). Servidor/bundle instalado mostram 1 estudo/3 modelos; ambos IDs de etapa resolvem para 54 tarefas/40 respostas via `study=true`. Corrigido controle de cache de HTML/JSON; testes e inspeção real passaram. Nenhum trabalho ativo. Veja checkpoint de entrega ao final. Nenhum dado foi fundido ou reescrito.

Pedido adicional concluído: b43c00 e d4408d reunidos na comparação como um único estudo. Vínculo confirmado: batch `cf73fb2248e14823879c4208368229ce` (b43c00) tem `resumed_from=a66272eaf0c24305b11bd3c368db4798` (d4408d). A comparação e a visão ao vivo usam esse vínculo. Nenhum trabalho ativo; veja o checkpoint de união ao final. Não alterar hashes/resultados nem misturar médias entre protocolos. Sem commit/push.

- [x] Banco conferido: 6 runs publicados, 14 executions, 36 task_results publicados, 84 live_calls, 2 batches parciais; 40 respostas avaliadas incluindo repetições incompletas. Nenhum batch ativo.
- [x] Backup deste pedido: `.runtime/join-study/before.sqlite3`; hashes em `.runtime/join-study/files.json`. Não sobrescrever/restaurar sobre banco real.
- [x] Agrupamento da comparação por estudo/continuações, com modelos juntos e versões como proveniência.
- [x] Testes de isolamento entre estudos, inspeção real somente leitura e comparação de preservação.

Os checkpoints abaixo registram o trabalho anterior. Não repetir backups iniciais nem substituir seu conteúdo.

### Checkpoint A

- Conferência após a nova mensagem: 6 runs publicados, 14 repetições, 36 task_results publicados, 84 live_calls em 2 batches parciais. Há 40 respostas avaliadas contando tarefas de repetições parciais (18 originais + 22 na continuação). Nenhum batch ativo.
- Backup completo adicional: `.runtime/clarity-update/current-before.sqlite3` e `current-before.json`. Este é o baseline para conferir preservação ao terminar; o primeiro backup é anterior à execução real feita pela usuária.
- Etapa 1 em progresso: `liveLabels.js`, `ModelResults.jsx`, `LiveExecution.jsx`, `product.css` ajustados para status parcial amarelo e textos explícitos por repetição. Build passou; ainda faltam testes e aplicar consistência ao novo inspetor. Não considerar a etapa concluída.

### Checkpoint B

- Etapa 1 validada: build + 5 testes `inspection-resume.spec.js` passaram. Amarelo para parcial, progresso rotulado como testes avaliados, contagens distintas de acertos. Apenas apresentação, sem recalcular notas.
- Próxima unidade em andamento: comparação por campo, tabelas compactas, revisão humana e PDFs históricos. Adições em API reutilizam `human_reviews`; não há migração SQL.


### Checkpoint C — registro intermediário da integração

- **Nenhum commit/push.** Alterações anteriores e novas estão no working tree.
- `liveLabels.js`, `LiveExecution.jsx`, `ModelResults.jsx`: amarelo parcial, verde correto, vermelho incorreto/técnico; repetição conta testes avaliados. Não alteram classificações históricas no SQLite.
- `ResultWorkbench.jsx` / `ScenarioResults.jsx`: inspetor abre em resposta × gabarito, tabelas compactas com busca/filtros, comparação de cada campo, evidências e revisão humana; relações/itens/parâmetros separados. Opções de diagrama quebradas removidas do inspetor, permanecem dois diagramas lado a lado. GraphCanvas das outras páginas é preservado.
- `ResultReview.jsx` + `/api/result-reviews`: notas persistem em `human_reviews`, com execução, alvo, prompt/dataset hash. Não mudam scores/GT/prompts nem entram automaticamente no contexto de modelos. Nenhuma revisão foi inserida no banco real durante testes.
- `InspectionViews.jsx`, `PdfViewer.jsx`, API de fontes: PDF primeiro, hash histórico obrigatório para apresentá-lo como original da execução; texto enviado em opção separada. Configuração é explicitamente definida pelo projeto/benchmark, não extração. Métricas abrem contagens e itens.
- `ResultExport.jsx`: seleção de respostas para relatório com tabelas/diagramas, janela com Imprimir/salvar PDF; SVG vetorial dos diagramas filtrados. O PDF é salvo pelo diálogo do navegador; não há biblioteca/serviço externo. Diagramas disponíveis correspondem a tarefas de relações, não se inventa grafo para tarefa sem esse resultado.
- `studies.py`: projeção somente leitura da árvore de continuações. Uma tarefa planejada conta uma vez; tentativa mais recente no cartão; originais disponíveis via `#live/<batch>/history`. Backend guarda batches separados para preservar histórico, interface reúne o estudo. `?study=true` em snapshot/SSE/eventos/stop. Parar estudo interrompe batches ativos vinculados.
- `retry.py` / `RetryControl.jsx`: seleção explícita, confirmação, preflight original intacto. Pode refazer testes concluídos, técnicos ou interrompidos. Encadeia `live_continuations` a partir da última tentativa; unicidade impede dupla reserva. Reusa tabelas existentes, sem migração. `resume.py` encontra pendentes nunca enviados nas continuações, mantém exclusão de envio incerto.
- `main.jsx`: comparação mostra todos os modelos/versões por padrão, sem misturar médias. Aviso: protocolos diferentes não são comparação controlada. Qualidade no estudo usa o protocolo mais recente por tarefa/modelo, excluindo versões diferentes da mesma média. Registro original permanece acessível.
- Site reiniciado somente após confirmar ambos batches parciais e nenhum ativo. Um primeiro start demorou e falhou, segundo `./start` iniciou normalmente. Não houve chamada paga. Inspeção Playwright real somente GET: 3 cartões, entrada PDF, tabela e divergências; zero erros JS.
- Banco real verificado **linha por linha**, não apenas contagens: 6 runs, 14 executions, 36 task_results publicados, 2 batches, 84 live_calls, 341 eventos e 30 links de continuação, todos idênticos ao baseline `current-before.sqlite3`. 38 arquivos (respostas/GT/prompts) conferidos por SHA256, todos idênticos. Relatório local: `.runtime/clarity-update/after.json`.
- Estado bruto legado de `executions`: 6 completed, 2 failed, 5 pending, 1 running. São registros históricos preservados; o journal de recuperação já registra a interrupção, e ambos batches estão PARTIALLY_COMPLETED. Não iniciar/retomar esse legado automaticamente.
- Visão do estudo original: 54 slots, 40 respostas válidas, 84 tentativas históricas. Astra 18, Claude 4, Gemini 18 avaliadas. Astra usa protocolo 1.1; os novos resultados usam 2.0. Não declarar equivalência.
- Verificações já concluídas: 121 testes backend anteriores; depois 15 testes de retomada/preservação/revisão/PDF; 30/31 testes UI (a única falha era seletor da aba antiga removida, já ajustado). Novos testes UI e suíte backend completa estão sendo executados. **Consultar checkpoint final antes de afirmar número final.**

## Limites e próximos refinamentos opcionais

- Latência permanece medição, sem rótulo arbitrário de rápido/lento.
- Anotações humanas não acionam alteração de prompt/GT. Há fluxo explícito anterior de revisão de referência; notas aqui são comentários.
- Origem explícita/inferida só é mostrada quando declarada na resposta; não inferir essa procedência a partir do gabarito.
- Protocolos antigos com pistas permanecem identificados. Nova tentativa sempre usa protocolo atual sem gabarito no prompt.
- SVG é a exportação de imagem implementada; PNG não é implementado. Impressão/PDF exige ação no navegador.
- Não criar locks persistentes. Ao continuar: confira working tree, testes abaixo e avaliações ativas antes de qualquer restart.


### Checkpoint FINAL — ponto seguro para encerrar/continuar

- Todas as etapas da checklist foram integradas. Não há arquivo parcialmente editado nem processo de benchmark iniciado pela IA. Servidor local está funcionando em `http://127.0.0.1:8000`; atualizar o navegador carrega a interface nova.
- **Sem commit e sem push**, conforme pedido. Nenhuma alteração em `setup`, `start`, `stop`, `.env`, ground truth ou prompts. Nenhuma migração de schema foi necessária.
- Testes: suíte completa Python **127/127** passou; em seguida o teste adicional de interrupção antiga foi acrescentado e o módulo final completo passou **7/7**. Total atual coletado: **128 testes Python** (todos cobertos nas execuções acima). Playwright completo **34/34** passou. Build, Ruff, `git diff --check` e secrets scan passaram. Advertências existentes: tamanho de bundle Vite e depreciação do TestClient/httpx; não são falhas.
- Novos testes backend: projeção de estudo sem duplicar tarefas; preservação de linhas; repetir somente seleção; bloqueio de repetição concorrente; preflight/seleção inválida; revisão persistida sem alterar notas; PDF histórico com hash incorreto bloqueado; métricas de protocolos diferentes separadas; stop antigo não bloqueia stop de nova continuação; uso histórico preservado.
- Novos testes UI: filtros/status parcial, expansão de métricas, SVG com dados reais do fixture isolado; anotação persistida entre aberturas; exportação apenas da seleção; confirmação e payload de novas tentativas. Testes anteriores foram mantidos e adaptados à aba inicial nova.
- Inspeção final com banco real, **somente requisições GET permitidas**: 3 modelos no estudo e após refresh; 54 itens selecionáveis para nova tentativa; comparação com Astra/Claude/Gemini e versões separadas; tabela, PDF e diagramas renderizados sem erros JavaScript. Nenhuma confirmação de chamada paga foi acionada.
- Exportação real verificada: uma resposta selecionada gerou relatório com dois SVGs e PDF de 5 páginas em `/tmp/norte-real-report.pdf`. Screenshots locais `/tmp/clarity-final-output.png`, `/tmp/clarity-final-graphs.png`, `/tmp/clarity-final-comparison.png`. São inspeções de dados reais; não são novos benchmarks.
- SSE real confirmou snapshot persistido do estudo com 54 tarefas/40 avaliações. Métricas de qualidade continuam excluindo técnicos, interrompidos, fila e em execução; incorretas avaliadas contribuem normalmente. Revisões não mudam notas automaticamente.
- Auditoria final repetida após último restart: **todos os registros anteriores continuam byte a byte iguais nos campos**, e os 38 arquivos têm os mesmos hashes. Antes/depois: runs **6/6**; executions **14/14**; task_results publicados **36/36**; live_calls **84/84**; batches **2/2**; events **341/341**; continuation links **30/30**. Nenhuma perda ou sobrescrita.
- As 40 respostas válidas no journal incluem 4 respostas de repetições incompletas que não estão nos 36 task_results publicados. Não confundir as duas contagens.
- Histórico de etapas continua acessível por `#live/<batch>/history`. O relatório de todas as tentativas no cabeçalho inclui uso/tokens e erros técnicos antigos, mesmo após nova tentativa. Os demais contadores do estudo referem-se à tentativa mais recente de cada slot.
- Ao assumir o trabalho: não refazer a checklist como se estivesse pendente, não executar chamadas pagas para validar, não descartar diffs. Leia primeiro este checkpoint, confirme estado real/avaliações ativas e aguarde o próximo pedido ou escolha um refinamento claramente solicitado.
- Revisão final de proveniência: o texto explicativo diferencia `pdf_text` de `controlled_text` histórico; não afirma extração de PDF para entradas normalizadas antigas. Build final e diff check passaram após esse ajuste de texto.

### Checkpoint final — união b43c00 + d4408d (27/09/2026)

- Solicitação específica concluída, sem commit/push e sem chamadas pagas. Nenhuma migração ou alteração no banco foi necessária. Todos os diffs anteriores continuam no working tree.
- `runner.aggregate(by_study=True)` e `/api/summary?by_study=true` acrescentam agrupamento por raiz da árvore `resumed_from`. A API sem o parâmetro mantém o comportamento anterior. Estudos independentes não são unidos só por terem o mesmo protocolo.
- `main.jsx`: seletor **Estudo** substitui o seletor de versões na comparação. b43c00 e d4408d aparecem juntos no estudo `a66272ea`, com Astra, Claude e Gemini; versões ficam em **Proveniência dos resultados**. A aba Respostas filtra pelo mesmo estudo e o link de interrupções abre sua raiz. Se o mesmo modelo tiver protocolos diferentes, continuam identificados com métricas próprias.
- Contagem real na comparação: **40 respostas avaliadas** (Astra 18 em d4408d; Claude 4 e Gemini 18 em b43c00). Os **15 grupos de métricas** foram comparados ao endpoint anterior e preservam exatamente todos os valores. Não foi reavaliada nenhuma resposta.
- `product.css`: comparação permite rolagem vertical e gráficos crescem com o conteúdo. A primeira rodada de testes detectou barras escapando dos cartões em telas pequenas após incluir contexto do estudo; corrigido e novamente validado em desktop/mobile.
- Adicionados `tests/test_study_summary.py` (2 testes) e `frontend/tests/study-summary.spec.js` (2 testes). Cobrem união de protocolos em uma continuação, preservação de valores/linhas, estudos independentes separados, todos os modelos após refresh e seleção de respostas por estudo.
- Validação final: **130/130 Python**, **36/36 Playwright**, build, Ruff, diff check e verificação de segredos passaram. Avisos existentes de bundle Vite e TestClient/httpx continuam sem falha.
- Navegador com dados reais, somente GET: **1 estudo, 3 modelos**, mesma seleção após refresh, nenhuma barra fora do cartão e nenhum erro JavaScript. Screenshot `/tmp/joined-study-final.png`.
- Auditoria `.runtime/join-study/after.json`: todas as linhas de todas as tabelas e o schema idênticos ao backup. Antes/depois: runs **6/6**, executions **14/14**, task_results **36/36**, live_calls **84/84**, live_batches **2/2**, eventos **341/341**, vínculos **30/30**. **38 arquivos** de resultados, gabaritos e prompts com hashes idênticos. Nenhuma perda.
- Os dois batches permanecem `PARTIALLY_COMPLETED`. Estados legados de `executions` foram preservados; a atividade atual é determinada pelo journal persistido, sem execução ativa. O servidor foi reiniciado após confirmar ausência de trabalho ativo e está em `http://127.0.0.1:8000`.
- Próxima IA: não repetir esta união nem reescrever `comparison_hash`. Novas continuações serão agrupadas automaticamente pelo vínculo. Revalidar dados/atividade antes de qualquer novo trabalho e manter a proibição de commit/push até nova instrução da usuária.

### Checkpoint — entrega da visão conjunta ao navegador

- A usuária voltou com screenshots contendo componentes anteriores: “Comparable evaluation”, parciais em vermelho e dois cartões na continuação. O servidor local já entregava o bundle atualizado; os GETs de ambas etapas com `study=true` retornavam a mesma raiz, os três modelos, 54 tarefas e 40 respostas avaliadas. Não foi possível inspecionar diretamente a aba antiga da usuária; não afirmar que seu cache foi observado.
- Único servidor encontrado: `127.0.0.1:8000`. A resposta HTML não tinha `Cache-Control`. `benchmark/api.py` agora entrega HTML e JSON dinâmico com `Cache-Control: no-store`, inclusive revalidação do HTML. Assets com hash e SSE mantêm sua semântica; guarda de mutações locais preservada. Nenhuma mudança no schema/dados ou agrupamento foi necessária nesta correção.
- Novo teste `tests/test_frontend_delivery.py`: HTML atual, URL com query, resposta condicional 304, JSON sem cache, asset intacto e bloqueio de POST sem cabeçalho. Passaram **3 testes Python direcionados** (entrega + estudo) e **9 Playwright** (estudo + página de produto). Não repetir como contagem de suíte completa: a rodada anterior completa foi 130 Python/36 Playwright.
- Servidor reiniciado somente após confirmar ausência de batches ativos; build do `./start` passou. Teste no navegador com dados reais e somente GET confirmou comparação com 1 estudo/3 modelos; etapa da continuação e acesso padrão ao vivo com os três cartões, inclusive após refresh, sem erro JS ou mutações. Screenshots `/tmp/study-unified-comparison.png` e `/tmp/study-unified-live.png`.
- Links enviados com query nova para carregar o documento atual: `http://127.0.0.1:8000/?ui=study-unified-v3#results` e `http://127.0.0.1:8000/?ui=study-unified-v3#live/a66272eaf0c24305b11bd3c368db4798`. Um fragmento `#live/...` sozinho numa aba já aberta não recarrega seu JavaScript; abrir documento novo/atualizar é necessário para uma aba antiga.
- Auditoria `.runtime/join-study/after-delivery.json`: todas as linhas continuam idênticas ao backup e todos os 38 hashes conferem. Mantidos 6 runs, 14 executions, 36 task_results, 84 live_calls, 2 batches, 341 eventos, 30 vínculos. Sem perda, sem chamadas pagas, sem commit/push. Ruff, diff check e verificação de segredos passaram.

### Checkpoint final — Claude: saldo salvo e resposta duplicada

- **Concluído e validado, sem commit/push.** Arquivos desta unidade: novos `ResumeConnectionCheck.jsx` e `RejectedOutput.jsx`; integrações em `ResumeControl.jsx`, `ResultWorkbench.jsx`, `LiveExecution.jsx`; regressões em `frontend/tests/inspection-resume.spec.js` e `tests/test_connections.py`. Os demais diffs preexistentes foram preservados.
- A janela de retomada mostra a data/estado da última validação e o detalhe seguro recebido do provedor. Abrir consulta somente estado local. **Verificar conexão novamente** usa o endpoint já existente, com seleção exata de modelo/profundidade, `force:false` (pula os já confirmados), bloqueio de concorrência preservado e aviso de consumo de tokens. Depois é necessário confirmar a retomada separadamente. Não altera acesso, chave ou status para contornar erro de saldo.
- O erro salvo do Claude continua `billing_error`, de `2026-09-27T21:37:08.376220+00:00`. A única tentativa de verificação desta tarefa foi recusada com 409 antes de chamar provedor. **Não foi confirmado se a conta/chave atual já consegue gerar respostas.** A próxima ação é da usuária: atualizar a página, abrir Retomar pendentes e clicar Verificar conexão novamente. Não repetir benchmark ou probe pago automaticamente.
- Resposta técnica real `0f7a4ebe56c944d1a83bdabf308d02af`: a API respondeu HTTP 200/end_turn, mas o parser local rejeitou `duplicate_impact`: CHG-004/REQ-002 foi enviado duas vezes, uma relação `depends_on → P-FAN-SPEED` e outra `verified_by → V-SPEED`. O inspetor agora mostra as duas linhas recebidas e a regra de uma entrada por requisito. Continua erro técnico sem nota; não descarta duplicata, repara saída, afrouxa schema/validação ou usa gabarito para substituir resposta. Outros erros sem diagnóstico específico mantêm mensagem neutra e acesso à resposta preservada em Downloads técnicos.
- Testes isolados: **46 Python passaram** (`test_connections`, `test_result_clarity`, `test_resume`); **19 Playwright passaram** (`inspection-resume`, `product`, `study-summary`). Houve um timeout inicial num teste antigo enquanto a tela carregava; a rodada final inteira passou sem alterar aquela asserção. Regressões novas cobrem erro salvo → verificação explícita → confirmação separada, bloqueio 409, duplicação canônica, campos inválidos sem crash e ausência de resultado sem falso erro técnico. Fixtures de testes nunca foram gravados como benchmarks.
- Build pelo `./start`, Ruff, `git diff --check` e secrets scan passaram. Nenhuma migração; nenhum prompt, gabarito, chave ou script de workflow foi alterado nesta unidade.
- O servidor anterior já estava ausente na retomada (porta 8000 indisponível e PID antigo inexistente). Após backup, `NORTE_NO_BROWSER=1 ./start` abriu o site normalmente. A recuperação original marcou somente trabalho inacabado como interrompido; não foi parado um processo ativo nem retomada uma chamada paga. Os três batches estão `PARTIALLY_COMPLETED`. O servidor temporário da UI (4173) foi encerrado; o site real permanece em **http://127.0.0.1:8000**.
- Navegador real, somente GET: abriu a resposta histórica do Claude e exibiu as duas dependências corretas, zero erros JS e zero mutações. Screenshot local `/tmp/norte-claude-duplicate.png`. O teste não alterou resultados.
- Auditoria `.runtime/claude-connection/preservation.json`: todas as linhas dos dois estudos originais permanecem idênticas. A nova avaliação iniciada pela usuária acrescentou registros legitimamente. Antes/depois da recuperação em `after-recovery.json`: **6 runs, 17 executions, 36 task_results, 48 links e 3 verificações de conexão, todos inalterados**; todos os registros de chamadas já encerradas e eventos anteriores preservados. **38 arquivos históricos com hashes iguais; 28 eventos API_REQUEST_SENT antes e depois**, sem novo envio. Apenas chamadas incompletas/batch receberam o estado de recuperação previsto pelo sistema.
- Prévia atual (pode mudar com uso): retomada da raiz oferece 20 chamadas comprovadamente não enviadas (Claude 6 e OpenAI 14), exclui 7 com envio incerto. Não confundir isso com autorização para iniciá-las. A contagem `completed_preserved` da prévia ainda é da execução raiz; as contagens de estudo completo seguem no painel. Refinamento possível futuro: tornar essa contagem da prévia explicitamente agregada, sem recalcular resultados.

### Checkpoint final — exclusão do Astra d4408d e correção do contrato de impacto

- **Pedido atendido sem apagar execuções e sem commit/push.** A usuária declarou a versão Astra `d4408d` inválida. `config/result_exclusions.json` registra os três IDs exatos dessas repetições, com modelo, hash completo e motivo. Não é um filtro genérico por nome/hash parcial, nem uma alteração das respostas.
- `benchmark/result_validity.py` fornece anotações de elegibilidade na leitura. `storage.list_runs` mantém todas as repetições e identifica as excluídas; `runner.aggregate` deixa essas respostas fora das médias e séries. `live` exclui-as das métricas de qualidade e mantém contagens de execução com aviso de exclusão. Detalhes e downloads históricos permanecem disponíveis e preservados.
- `main.jsx`: Astra d4408d não aparece nos gráficos, checkboxes ou seleção de respostas para comparação; o aviso de exclusão identifica a versão removida. Astra novo continua visível. Os seletores de análise também ignoram resultados excluídos. `LiveExecution.jsx` identifica resultados invalidados como histórico, sem reescrever sua nota original.
- Causa do Claude tratada nesta etapa: a regra local `duplicate_impact` não estava explícita no prompt. Os prompts de `change_impact`, `impact_explanation` e `one_hop` agora exigem no máximo uma entrada por requisito em cada cenário e uma dependência principal; outras relações podem ser explicadas na mesma entrada com evidência. A versão do prompt comum passou a **2.0.1**. Nenhum exemplo/aresta/resposta do gabarito foi acrescentado. `parse_output`, schemas e regras de avaliação não foram afrouxados.
- A resposta histórica do Fable ainda é um erro técnico verdadeiro e não foi convertida em sucesso. `RejectedOutput.jsx` explica que a alteração só vale para novas chamadas e orienta a seleção explícita de nova tentativa. **Não foi executado um novo benchmark Claude para afirmar que ele passará.** Isso consome créditos e cabe à usuária; a opção já existente de nova tentativa mantém toda tentativa anterior.
- Não havia revisão local ativa; preview real confirmou a nova regra no prompt enviado por uma próxima avaliação. Novas tentativas armazenam o prompt atual em novo snapshot/hash; prompts antigos continuam literais, conforme teste de regressão. Dataset permanece 2.0.0: esta alteração é de instruções de saída, não de gabarito/dataset.
- Auditoria real antes/depois das métricas: **60 → 42 respostas na comparação**, exclusão exata das 18 respostas das três repetições Astra d4408d. Todos os demais grupos, métricas, amostras e valores ficaram exatamente iguais. Os números podem aumentar se a usuária executar novas chamadas; não fixar contagens em código.
- Backend: execução completa teve **137 aprovados e 1 falha na montagem de um novo fixture histórico**. O fixture foi corrigido para criar a execução já com o prompt antigo, respeitando o journal; depois **20/20 testes direcionados** de política de input, exclusão e schemas passaram (inclui o teste que falhou). Total coletado nessa suíte: 138, todos cobertos pelas execuções mencionadas; não foi repetida a suíte completa após corrigir o fixture. Nenhum teste pendente conhecido.
- Interface: suíte completa **39/39 Playwright** passou. Novo teste protege remoção exclusiva da versão inválida, permanência do Astra novo, seletor de respostas e persistência após refresh. Regressões Python cobrem exclusão sem escrita, acesso a histórico, métricas inalteradas dos demais resultados, rejeição de requisito duplicado nas três tarefas e snapshot antigo literal em nova tentativa.
- Build, Ruff, diff check e secrets scan passaram. Nenhuma migração ou mudança em `./setup`, `./start`, `./stop` ou `.env`. Reinício feito via workflow somente após reconfirmar os quatro batches parciais, nenhum ativo. Site disponível em `http://127.0.0.1:8000`.
- Inspeção real no navegador com somente GET: quatro séries de modelo/protocolo selecionáveis, três modelos únicos, 42 respostas válidas para comparação, zero erros JS e zero mutações. Astra d4408d ausente dos seletores após refresh. Screenshot `/tmp/norte-astra-valid-only.png`.
- Preservação `.runtime/astra-invalid-claude-contract/after.json`: **todas as linhas de todas as tabelas e o schema idênticos ao backup**. Dos 38 arquivos do manifesto anterior, só os quatro arquivos de prompts atuais mudaram intencionalmente; os outros 34 permaneceram byte a byte iguais. Prompts originais dentro dos snapshots/respostas antigos continuam intactos. Nenhuma chamada paga foi iniciada, retomada ou repetida pela IA.
- Próxima IA: não apagar o histórico invalidado, não voltar a colocar d4408d na comparação, não reclassificar a duplicação antiga como sucesso. Não executar nova tentativa paga para demonstrar a correção. Confirmar atividade antes de qualquer restart e manter a proibição de commit/push.
