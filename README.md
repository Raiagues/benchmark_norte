# Norte

Um benchmark pequeno para comparar OpenAI, Anthropic e Google Gemini na leitura de documentos de engenharia, extração de relações e análise de impacto de alterações.

**O projeto começa sem resultados. Não existe modo de demonstração.** Cada resposta real da API é salva e fica disponível assim que sua estrutura e sua avaliação terminam. Respostas de engenharia incorretas também contam nas métricas. Falhas de API, respostas inválidas e interrupções aparecem no acompanhamento operacional, sem virar notas de benchmark. Uma avaliação parcial preserva todos os resultados válidos já recebidos.

O site mostra métricas separadas, respostas originais e grafos de referência e do modelo lado a lado. Não há uma nota única nem um vencedor pré-definido.

## Começar

Requer Linux, Python 3.11+ (testado com 3.12), Node.js 20.19+ com npm e Git. Se faltar Python ou Node, o instalador informa o requisito. Não é necessário Docker, ativar ambientes ou iniciar dois servidores.

1. Entre na pasta do clone:

```bash
cd benchmark_norte
```

2. Instale uma vez (ou novamente após atualizar dependências):

```bash
./setup
```

O script instala as dependências, compila a interface, cria ou atualiza as tabelas sem apagar dados e cria `.env` sem sobrescrever um arquivo existente. O progresso detalhado fica em `.runtime/setup.log`.

3. Abra **`.env` na raiz do projeto** no seu editor. Cole cada chave depois do `=` correspondente:

```dotenv
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
```

Não escreva `Bearer` antes da chave. Pode deixar os provedores que não pretende usar em branco. A chave dá acesso à sua conta; **o modelo é escolhido no site, separadamente da chave**, conforme o acesso permitido pelo provedor.

4. Abra o site:

```bash
./start
```

O navegador abre em **http://127.0.0.1:8000**. Se ele não abrir automaticamente, acesse esse endereço. Um único servidor atende a interface e a API. O terminal fica livre; executar `./start` novamente não cria outro servidor.

5. Quando terminar:

```bash
./stop
```

Instalar, abrir e fechar não chamam modelos nem criam resultados. Você pode começar com `.env` vazio: o site lista exatamente o que falta. Alterações nas chaves são reconhecidas ao clicar em **Atualizar status**, sem reiniciar. As tabelas e resultados ficam salvos entre reinícios.

## Entender e editar o benchmark pelo site

A **Visão geral** apresenta o sistema e o fluxo **entrada → prompt/contexto → resposta → avaliação**. O seletor distingue texto normalizado de texto integral dos PDFs. Respostas e métricas só aparecem se houver dados reais compatíveis com o modo selecionado.

- **Entradas do benchmark** separa documentos originais, texto normalizado, requisitos, configuração e cenários. O leitor PDF mostra páginas reais com navegação, zoom e texto acessível; o leitor do navegador é a alternativa. Quando falta um PDF, **Obter PDF oficial para uso local** busca apenas o endereço do registro de fontes. Nenhum modelo é chamado; o PDF fica fora do Git. Os fatos normalizados são uma transcrição técnica, não o documento original nem uma resposta de modelo.
- **Requisitos** tem busca por ID/texto, categoria, componente, tipo, origem e impacto esperado de um cenário, além de ordenação. A seleção mostra o texto integral, sua verificação e vínculos do gabarito. Categorias organizam a interface sem alterar o prompt ou as regras de avaliação.
- **Configuração** separa escolhas do sistema, hipóteses documentadas e opções de execução. Cada valor do sistema é identificado como hipótese do benchmark; os limites do fabricante ficam nas fontes.
- **Cenários** mostra tipo, nível, elemento alterado, descrição, valores antes/depois quando explicitamente disponíveis e presença de respostas reais. O impacto esperado fica identificado como gabarito, separado da entrada.
- **Prompt e contexto** preserva a prévia exata, o contrato de saída e os editores existentes. Em L2, a prévia remove as pistas PROJECT-05/06. A prévia não chama APIs.
- **Gabarito revisável** mantém as ações Confirmar, Recusar e Editar. A porcentagem dessa tela mede revisão humana, nunca desempenho de modelo. O gabarito esperado não é enviado na primeira passagem.
- **Fontes e proveniência** reúne fabricante, peça, revisão, URL oficial, seções, data, disponibilidade local e hash do PDF, além dos IDs e tipos permitidos.
- **Mapa de relações**, **Análise de impacto** e **Comparação de modelos** usam respostas reais preservadas. Há grafos lado a lado, evidências, contagens de acertos/ausências/extras, amostras e métricas separadas por tarefa, nível, versão, modo e configuração.
- **Aprendizado** mostra correções, confirmação humana e avaliações assistidas pareadas, se existirem. Não há curvas de melhoria demonstrativas.
- **Configurações** mostra a versão ativa, idioma, modelos padrão, conexões e hashes dos prompts.
- **Português / English** troca a interface. Documentos, prompts, evidências e respostas permanecem no idioma original.

Para editar uma entrada, abra seu trecho e clique em **Editar entrada**; configurações, descrições de alterações e prompts também têm editores. Para corrigir uma resposta esperada, use **Editar** no gabarito. Os editores têm campos legíveis; não exigem editar JSON. Explique a alteração e clique em **Salvar nova versão**.

Cada edição é uma ação humana explícita e cria uma revisão local, como `1.1.0+local.1`. Ela fica em `benchmark_revisions` no SQLite, sem sobrescrever os arquivos originais do Git nem resultados antigos. A versão local passa a ser usada pelas novas avaliações, tanto no site quanto no CLI. As confirmações antigas não valem automaticamente para conteúdo alterado. Editar uma entrada não recalcula a resposta esperada: revise o gabarito correspondente. Alterar a criticidade de um requisito atualiza sua classificação em todos os cenários.

Confirmações e recusas ficam em `benchmark_reviews`, com data, item, observação e hash do dataset. Recusar exige explicar o problema e bloqueia novas avaliações daquela versão até corrigir ou confirmar a referência. A versão inicial continua provisória; não há aprovação humana inventada. Evidências inexistentes não podem ser confirmadas. Duas edições concorrentes não sobrescrevem uma à outra silenciosamente.

Esta primeira versão permite editar os itens existentes, mantendo IDs e tipos do vocabulário fixos. Para ampliar o vocabulário ou adicionar um cenário, siga a seção **Adicionar um modelo ou cenário**. Se houver uma versão local, ela é a configuração ativa; alterações nos arquivos de origem não sobrescrevem essa revisão. Preserve `data/benchmark.sqlite3` ao fazer backup do trabalho local.

## Conferir as conexões e avaliar

1. Abra **Nova avaliação → Modelos**. Ative os provedores desejados. Cada linha tem **modelo** e **profundidade**; o modelo padrão vem marcado com ★. **Todos os modelos** inclui o catálogo inteiro; **Padrões** volta a um modelo por provedor. Sua seleção fica salva neste navegador.
2. Clique no status da linha para ver o diagnóstico: **verde** confirma geração; **vermelho** indica chave ausente, conexão não confirmada ou falha; **amarelo** indica créditos, faturamento, cota ou limite temporário. O detalhe distingue essas causas e mostra o que fazer. A presença de uma chave não significa que ela funciona.
3. Clique em **Verificar conexões**. É uma chamada curta que pode consumir créditos, separada da avaliação. A confirmação fica salva. Para verificar um modelo individualmente, abra o status daquela linha. Alterar seletores ou clicar em **Atualizar status** consulta apenas o estado local, sem chamar provedores.
4. Quando as conexões selecionadas estiverem confirmadas, clique em **Iniciar avaliação**. Para começar pequeno, escolha **1 repetição** e, na aba **Tarefas e opções**, deixe apenas **Relações**. A profundidade escolhida é enviada à API e registrada com a execução; não é apenas uma preferência visual.
5. Ao iniciar, o site abre **Execução ao vivo** automaticamente. Todos os modelos ficam visíveis; suas repetições aparecem dentro de um único cartão. Abra qualquer resposta recebida sem esperar o restante da avaliação.
6. Em **Mapa de relações**, escolha modelo e execução para ver referência e resposta lado a lado. Em **Comparação de modelos**, use as abas **Gráficos**, **Resumo**, **Uso e custo** e **Respostas**.

As páginas usam painéis, navegação lateral e rolagem vertical quando necessária. O acompanhamento não esconde modelos atrás de paginação. Os leitores exatos e editores anteriores continuam disponíveis. A paleta segue o [Norte](https://github.com/Raiagues/norte), consultado no commit `a2945d8`. O leitor de documentos usa [PDF.js](https://mozilla.github.io/pdf.js/examples/), servido localmente.

A confirmação é persistida para **aquela chave, modelo, profundidade e configuração**. O botão de iniciar faz apenas a checagem local; não repete o teste de conexão. **Verificar novamente** força uma nova chamada quando você quiser. Trocar/remover a chave, mudar a configuração do modelo ou receber uma falha de API invalida a confirmação. Uma confirmação anterior não garante saldo, disponibilidade ou acesso futuro.

**Se faltar qualquer chave ou confirmação entre os modelos selecionados, nenhuma chamada de benchmark é enviada, nem para os provedores prontos.** O próprio botão de verificar também não envia chamadas se falta uma das chaves selecionadas. Para conferir só um provedor, selecione apenas seus modelos ou use o botão individual. Se o provedor passar a falhar durante uma avaliação já iniciada, chamadas anteriores podem ter consumido tokens; não há como reservar crédito antecipadamente.

Para comparar OpenAI, Anthropic e Gemini, configure as três chaves e mantenha os três **Padrões** selecionados. Com todas as tarefas e três repetições, são **54 chamadas de benchmark**, antes de retentativas. **Todos os modelos** seleciona os seis modelos do catálogo, totalizando 108 chamadas nas mesmas condições. A tela mostra o total antes de iniciar.

Os destaques iniciais são GPT-6 Astra, Claude Fable 5.1 e Gemini 3.1 Pro Preview, escolhidos pela proposta de raciocínio publicada pelos fabricantes em 27/09/2026. As alternativas são GPT-6 Sol, Claude Opus 5.5 e Gemini 3.8 Flash. **Destaque não é resultado medido nem vencedor deste benchmark.** Modelos preview podem mudar. Fontes, datas e parâmetros estão em `config/models.json` e [docs/api_sources.md](docs/api_sources.md).

**Comparação de modelos** permite selecionar modelos, tarefa e dificuldade para comparar precisão, recall, F1, afirmações sem suporte, impactos críticos perdidos, consistência e latência. Tokens e custo ficam na aba **Uso e custo**. Profundidades diferentes são identificadas e não têm suas médias misturadas. Texto/PDF, primeira passagem/correções e versões diferentes ficam em grupos separados. Campos sem medição mostram `—` ou “Não disponível”.

## Acompanhar e interromper

**Execução ao vivo** mostra estados persistidos pelo backend através de Server-Sent Events. O progresso é `(respostas avaliadas + erros técnicos) / chamadas planejadas`; ele não cresce com o tempo. Interrupções são contadas separadamente. Cada tarefa/nível é uma chamada; tarefas de impacto enviam vários cenários juntos.

O cartão de cada modelo reúne repetições, atividade atual, acertos integrais/parciais, erros técnicos, interrupções, tokens informados, latência e custo quando calculável. A comparação cumulativa mantém L1/L2 e tarefas separados. Clique numa métrica para abrir numerador, denominador e respostas participantes. A matriz alterna tarefas ou cenários sem paginação. O registro de eventos tem filtros e fica em segundo plano.

**Interromper avaliação** exige confirmação. Respostas já salvas permanecem intactas; tarefas na fila não começam. A chamada em andamento pode terminar e ser salva. Interrupções e falhas técnicas não reduzem precisão/recall/F1. Respostas válidas mas incorretas continuam contribuindo para essas métricas.

**Histórico** inclui avaliações parciais, com planejadas, avaliadas, erros e interrupções. Recarregar ou sair da página não para o backend. Já `./stop` encerra o servidor: use o botão do site primeiro se quiser aguardar a resposta em andamento. Após uma queda ou reinício, o estado incompleto é identificado como interrupção, sem retomar chamadas pagas automaticamente.

A atualização de banco é aditiva. As tabelas antigas e os arquivos de respostas não são apagados ou reescritos. Registros antigos que ainda dizem `running` ou `pending` recebem uma anotação separada de recuperação. Eventos históricos ausentes não são inventados. Detalhes da migração, contagens, fórmulas e eventos estão em [docs/live_execution.md](docs/live_execution.md).

## Chaves e Git

As chaves são lidas somente pelo backend e nunca entram no JavaScript do navegador, prompts ou resultados. O banco guarda apenas um hash da chave para invalidar confirmações quando ela mudar. Nunca faça commit de `.env`, nunca cole chaves no frontend e nunca publique chaves no GitHub. Se uma chave tiver sido publicada, trate-a como comprometida e revogue-a no provedor.

`.gitignore` exclui `.env` e variantes, banco, resultados, PDFs locais, dependências e logs. `./setup` instala um hook local que verifica segredos antes de cada commit, incluindo o conteúdo preparado para commit. Ele ajuda a prevenir acidentes, mas não substitui a revisão dos arquivos.

<details>
<summary>Comandos opcionais para desenvolvimento e CLI</summary>

Para o uso normal, basta `./setup`, `./start` e `./stop`. Estes comandos são opcionais, executados na raiz. O CLI exige as mesmas conexões confirmadas pelo site.

```bash
.venv/bin/python -m benchmark.cli run --provider openai --model gpt-6-astra --tasks relationship_extraction --repetitions 1
.venv/bin/python -m benchmark.cli run --provider all --repetitions 3
.venv/bin/python -m benchmark.cli list
```

`--provider all` inclui os seis modelos configurados. Não execute CLI e interface simultaneamente. O CLI retorna código diferente de zero se alguma execução falhar.

Para desenvolvimento com recarga automática, pare `./start` com `./stop`, então inicie backend e frontend em dois terminais:

```bash
.venv/bin/python -m uvicorn benchmark.api:app --host 127.0.0.1 --port 8000
npm --prefix frontend run dev
```

Nesse modo, acesse http://127.0.0.1:5173. No uso normal com `./start`, o endereço é http://127.0.0.1:8000.

</details>

## Sistema e fontes

O sistema documental usa três componentes reais:

| Componente | Fabricante / peça | Datasheet oficial | Fatos usados |
| --- | --- | --- | --- |
| Ventilador | Noctua NF-A4x10 5V | [PDF do fabricante](https://cdn.noctua.at/media/e4b04217/Noctua%20NF-A4x10%205V%20Specification.pdf) | 5 V nominal; 0,05 A nominal ±10%; 4500 rpm ±10% |
| Sensor | Texas Instruments TMP117AIDRVR | [TMP117](https://www.ti.com/lit/ds/symlink/tmp117.pdf) | Alimentação recomendada de 1,8 a 5,5 V para a faixa completa de temperatura |
| Chave de alimentação | Texas Instruments TPS22919DCKR | [TPS22919](https://www.ti.com/lit/ds/symlink/tps22919.pdf) | Entrada de 1,6 a 5,5 V; capacidade publicada de corrente contínua de 1,5 A |

A TPS22919 liga/desliga a alimentação; ela não regula velocidade nem limita a corrente do ventilador ao requisito do projeto. O ESP32 é apenas um controlador conceitual. Não há hardware testado.

As edições, páginas, condições, tolerâncias, datas de acesso e componentes alternativos estão em `data/sources.json`. O texto normalizado foi escrito a partir de fatos pontuais; os PDFs não são redistribuídos pelo Git. Os limites de projeto — por exemplo, corrente de até 0,08 A, velocidade mínima de 4000 rpm e ativação acima de 35 °C — são **requisitos do benchmark**, não especificações inventadas dos fabricantes.

São cinco requisitos, 17 entidades, 13 fatos numéricos, 11 relações direcionadas e 12 cenários. Cenários são alterações propostas para testar raciocínio, não alterações físicas realizadas. Alterações de requisitos e configuração estão identificadas como propostas de teste. Os componentes e suas especificações vêm das fontes registradas. As respostas esperadas ficam separadas da entrada enviada aos modelos.

Os rótulos de referência foram escritos durante a implementação, independentemente das respostas dos modelos avaliados. **Ainda não houve aprovação humana independente.** Consulte `docs/ground_truth_review.md` antes de publicar conclusões de engenharia ou rankings.

## Tarefas e métricas

| Tarefa | O que compara |
| --- | --- |
| Extração de dados | Entidades, parâmetros, valores, unidades e citações |
| Relações | Ligações direcionadas, tipos permitidos e evidências |
| Impactos | Quais requisitos precisam de revisão após cada alteração |
| Explicações | Elemento alterado, requisito, dependência e evidência declarados |
| Raciocínio de um passo | Impactos L2, sem as indicações explícitas usadas em L1 |

L1 e L2 são medidos separadamente. A avaliação usa código determinístico para TP, FP, FN, precisão, recall, F1, acurácia de valores/unidades/fontes, alegações sem suporte, falsos alarmes, impactos perdidos e falhas críticas. Conclusão correta com evidência inválida não recebe crédito de relação sustentada. A direção da ligação importa.

Repetições produzem média, mínimo, máximo, desvio padrão e consistência de decisões. Nos gráficos, o traço representa mínimo e máximo; não é um intervalo de confiança. Todas as métricas de qualidade são **condicionadas às execuções concluídas**, conforme a regra de publicação: não medem disponibilidade da API ou frequência de falhas. Diagnósticos de tentativas inválidas ficam separados, sem contaminar o ranking de qualidade.

Explicações livres não podem ser integralmente verificadas por essas regras. A tela **Análise de impacto** permite registrar uma revisão humana, sem alterar automaticamente a pontuação. Veja as fórmulas e limitações em `docs/metrics.md`.

Os preços de `config/pricing.json` começam indisponíveis. Só preencha valores por milhão de tokens após verificar preço, data e fonte oficial. Custos estimados não equivalem à fatura. Falta de preço confiável, cache com preço não modelado ou uso incompleto permanece indisponível.

## Documentos completos

O modo principal é **Texto controlado**: todos os modelos recebem os mesmos fatos normalizados. Ele funciona sem internet para carregar o dataset; as APIs exigem conexão.

O modo secundário **Texto dos PDFs** extrai o texto de PDFs locais com o mesmo parser para todos os provedores. Ele não mede visão nativa de PDF. Consulte `data/pdfs/README.md` para obter os PDFs oficiais e salvá-los localmente. PDFs ficam fora do Git. As métricas deste modo nunca são misturadas às do texto controlado.

## Experimento com correções

Uma avaliação **Sem correções prévias** nunca inclui feedback anterior.

1. Em um grafo de uma execução real concluída, clique na relação e expanda **Registrar correção**.
2. Marque correta, incorreta ou ausente; escreva a correção. Confirme explicitamente para autorizar seu uso como contexto.
3. Em **Nova avaliação → Ajustar tarefas e modo de avaliação**, selecione **Com correções confirmadas** e aquela execução de referência.
4. Compare os indicadores da execução: correções mantidas, erros repetidos, erros novos e variação de F1. Casos de transferência CHG-011/012 ficam separados dos casos conhecidos.

A referência e a avaliação assistida precisam ter modelo, configurações, dataset, prompts, tarefas e código de avaliação compatíveis. Só correções confirmadas daquela execução entram no contexto. Confirmar feedback não modifica o ground truth. Não há fine-tuning nem memória autônoma.

Pelo terminal, use o ID real de uma primeira execução:

```bash
.venv/bin/python -m benchmark.cli run --provider openai --model gpt-6-astra --feedback-baseline ID_DA_EXECUCAO --repetitions 3
```

Use as mesmas opções `--tasks` e `--input-mode` da execução de referência.

## Arquivos e armazenamento

```text
setup / start / stop          Instalar, abrir e fechar o site
benchmark/                    API, provedores, conexões, execução e métricas
config/                       Modelos, configurações e preços
prompts/                      Instruções versionadas de cada tarefa
data/sources.json             Fontes oficiais e fatos técnicos
data/normalized/              Documentos e configuração enviados aos modelos
data/ground_truth/            Entidades, relações, requisitos e cenários esperados
data/manifest.json            Versões do benchmark e dataset
data/benchmark.sqlite3        Banco local, ignorado pelo Git
frontend/                     Interface React e grafos React Flow
results/<provider>/<id>/run.json   Somente avaliações reais concluídas
results/<provider>/<id>/calls/     Respostas avaliadas, salvas durante a execução
tests/                        Testes isolados de Python
frontend/tests/               Testes isolados do navegador
docs/                         Regras de avaliação e revisão da referência
```

SQLite mantém confirmações em `connection_checks`, separadas de resultados, e separa `executions` (repetições e diagnósticos) de `runs`/`task_results` (repetições completas). `live_batches`, `live_calls` e `live_events` guardam o progresso, cada resposta avaliada e os eventos reais; `execution_recovery` anota interrupções sem reescrever o histórico antigo. As tarefas válidas ficam disponíveis imediatamente, mesmo quando a repetição termina parcialmente. Ao concluir todas as tarefas, a publicação nas tabelas originais continua atômica e gera `run.json` com respostas, métricas, uso, horários, configurações, prompts e referências. O download usa o registro preservado no banco. Falhas de chamada não criam exportações de resultados de qualidade.

Não há importação de resultados fictícios, modo offline de geração de respostas ou API para o navegador enviar notas prontas. Cabeçalhos e chaves não são salvos. Não há telemetria externa.

## Adicionar um modelo ou cenário

Para adicionar um modelo, edite `config/models.json`: provedor (`openai`, `anthropic` ou `gemini`), nome exato, temperatura compatível e opção de saída estruturada. Atualize a página. Configure a chave somente no `.env` e use **Atualizar status**. Confirme o acesso ao novo modelo com **Verificar conexão**. Use `featured: true` para destacá-lo na seleção inicial; isso não cria uma nota ou ranking. Se o modelo não aceitar saída estruturada nativa, `structured_output: false` mantém o mesmo schema no prompt e a validação local. Confira `docs/api_sources.md`.

Para adicionar um cenário:

1. Copie um objeto de `data/ground_truth/change_scenarios.json` e use um novo ID, por exemplo `CHG-013`.
2. Descreva a alteração, o elemento alterado, tipo, dificuldade (`L1_DIRECT` ou `L2_ONE_HOP`) e grupo (`core` ou `transfer`). Não atribua números hipotéticos ao fabricante.
3. Defina requisitos afetados e não afetados, relações, impactos críticos, razão e citações. Faça uma revisão humana independente das respostas dos modelos.
4. Atualize as versões de dataset e ground truth no manifesto. Se ampliar além de 12 cenários, ajuste conscientemente a verificação de tamanho nos testes.
5. Execute os testes. A interface lê o novo cenário automaticamente.

Ao alterar prompts, atualize a versão correspondente no manifesto. Os hashes também separam resultados automaticamente; execuções antigas preservam suas entradas.

## Testes

```bash
.venv/bin/python -m pytest -q
npm --prefix frontend run build
.venv/bin/python scripts/check_secrets.py
```

Com o site iniciado por `./start`, instale o Chromium e rode os testes visuais:

```bash
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

Os testes Python usam bancos temporários e transporte HTTP interceptado. Os testes do navegador interceptam todas as rotas `/api` dentro do próprio teste. **Nenhum teste popula o banco do aplicativo, cria resultados em `results/` ou chama modelos pagos.** Fixtures existem somente para testar o código, fora do fluxo da aplicação.

Sem suas chaves, não é possível verificar acesso às contas, aceitação do schema pelos modelos reais, qualidade das respostas ou faturamento. O estado vazio, a publicação de resultados, rejeição de falhas, métricas, gráficos e feedback são verificáveis localmente. Este benchmark pequeno não demonstra competência geral em engenharia nem valida hardware.

Os novos resultados por tarefa também ficam em `results/<provedor>/<repetição>/calls/<execução>.json`. Repetições completas mantêm `run.json`. O SQLite é a fonte principal; arquivos históricos não são sobrescritos pela migração. PDFs originais podem ser obtidos no site para uso local, sem entrar no Git.
