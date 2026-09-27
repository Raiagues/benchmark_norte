# Norte

Um benchmark pequeno para comparar OpenAI, Anthropic e Google Gemini na leitura de documentos de engenharia, extração de relações e análise de impacto de alterações.

**O projeto começa sem resultados. Não existe modo de demonstração.** Um resultado só é publicado depois que todas as tarefas daquela repetição recebem respostas reais da API, em JSON válido e no formato esperado. Uma resposta tecnicamente errada ainda é avaliada: o que fica fora dos resultados é uma execução que falhou, foi interrompida ou retornou um formato inválido.

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

O script instala as dependências, compila a interface, cria as tabelas vazias e cria `.env` sem sobrescrever um arquivo existente. O progresso detalhado fica em `.runtime/setup.log`.

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

A página inicial agora é **O benchmark**, com um diagrama clicável: **entrada → modelo → saída → avaliação**. Os componentes têm ícones, fatos do fabricante e links para as fontes. Esses fatos são dados fornecidos ao modelo, não respostas geradas por ele.

- **Entradas e saídas**: selecione uma tarefa para ver exatamente seus documentos, requisitos, configuração, cenários e vocabulário. Os requisitos são regras de projeto dadas ao modelo. A aba **Instruções do modelo** mostra o prompt geral e o da tarefa. **O que deve devolver** explica o contrato da resposta, sem inventar uma resposta de exemplo. **Mensagem completa** permite inspecionar e baixar o pedido exato, construído pela mesma função do executor. A prévia não chama APIs. Em L2 ela já exclui as pistas PROJECT-05/06.
- **Gabarito revisável**: entidades, valores, relações e impactos esperados usados pela avaliação. Esses arquivos de respostas esperadas não são enviados ao modelo. Em L1, os documentos de entrada já descrevem relações explícitas para extrair. Cada item tem ações **Confirmar**, **Recusar**, **Editar** e, quando aplicável, **Evidências**. A porcentagem desta tela mede revisão humana, não desempenho de modelo.
- **Critérios de avaliação**: cartões explicam as condições de publicação, acertos, falsos positivos, faltantes, evidência inválida e fórmulas. Uma resposta tecnicamente errada mas válida recebe pontuação; uma chamada que falhou não vira resultado. Não há nota mínima global nem vencedor automático.
- **Português / English**: troca o idioma da interface inteira e salva a preferência no navegador. Documentos, prompts, evidências e respostas originais permanecem no idioma original para preservar exatamente o conteúdo do teste. A interface identifica esse conteúdo literal.

Para editar uma entrada, abra seu trecho e clique em **Editar entrada**; configurações, descrições de alterações e prompts também têm editores. Para corrigir uma resposta esperada, use **Editar** no gabarito. Os editores têm campos legíveis; não exigem editar JSON. Explique a alteração e clique em **Salvar nova versão**.

Cada edição é uma ação humana explícita e cria uma revisão local, como `1.1.0+local.1`. Ela fica em `benchmark_revisions` no SQLite, sem sobrescrever os arquivos originais do Git nem resultados antigos. A versão local passa a ser usada pelas novas avaliações, tanto no site quanto no CLI. As confirmações antigas não valem automaticamente para conteúdo alterado. Editar uma entrada não recalcula a resposta esperada: revise o gabarito correspondente. Alterar a criticidade de um requisito atualiza sua classificação em todos os cenários.

Confirmações e recusas ficam em `benchmark_reviews`, com data, item, observação e hash do dataset. Recusar exige explicar o problema e bloqueia novas avaliações daquela versão até corrigir ou confirmar a referência. A versão inicial continua provisória; não há aprovação humana inventada. Evidências inexistentes não podem ser confirmadas. Duas edições concorrentes não sobrescrevem uma à outra silenciosamente.

Esta primeira versão permite editar os itens existentes, mantendo IDs e tipos do vocabulário fixos. Para ampliar o vocabulário ou adicionar um cenário, siga a seção **Adicionar um modelo ou cenário**. Se houver uma versão local, ela é a configuração ativa; alterações nos arquivos de origem não sobrescrevem essa revisão. Preserve `data/benchmark.sqlite3` ao fazer backup do trabalho local.

## Conferir as conexões e avaliar

1. Abra **Nova avaliação → Modelos**. Ative os provedores desejados. Cada linha tem **modelo** e **profundidade**; o modelo padrão vem marcado com ★. **Todos os modelos** inclui o catálogo inteiro; **Padrões** volta a um modelo por provedor. Sua seleção fica salva neste navegador.
2. Clique no status da linha para ver o diagnóstico: **verde** confirma geração; **vermelho** indica chave ausente, conexão não confirmada ou falha; **amarelo** indica créditos, faturamento, cota ou limite temporário. O detalhe distingue essas causas e mostra o que fazer. A presença de uma chave não significa que ela funciona.
3. Clique em **Verificar conexões**. É uma chamada curta que pode consumir créditos, separada da avaliação. A confirmação fica salva. Para verificar um modelo individualmente, abra o status daquela linha. Alterar seletores ou clicar em **Atualizar status** consulta apenas o estado local, sem chamar provedores.
4. Quando as conexões selecionadas estiverem confirmadas, clique em **Iniciar avaliação**. Para começar pequeno, escolha **1 repetição** e, na aba **Tarefas e opções**, deixe apenas **Relações**. A profundidade escolhida é enviada à API e registrada com a execução; não é apenas uma preferência visual.
5. Acompanhe o progresso em **Atividade**. Falhas têm detalhes próprios e não viram resultados.
6. Em **Grafos**, escolha modelo e execução para ver referência e resposta lado a lado. Em **Resultados**, use as abas **Gráficos**, **Resumo**, **Uso e custo** e **Respostas**.

As páginas principais usam uma área fixa, abas e paginação, sem rolagem da página. Os leitores de prompts e respostas preservam todo o texto, dividido em páginas. Editores e detalhes abertos sob demanda podem rolar quando necessário, inclusive para não esconder campos em telas pequenas. A paleta azul-escuro segue o [Norte](https://github.com/Raiagues/norte), consultado no commit `a2945d8`.

A confirmação é persistida para **aquela chave, modelo, profundidade e configuração**. O botão de iniciar faz apenas a checagem local; não repete o teste de conexão. **Verificar novamente** força uma nova chamada quando você quiser. Trocar/remover a chave, mudar a configuração do modelo ou receber uma falha de API invalida a confirmação. Uma confirmação anterior não garante saldo, disponibilidade ou acesso futuro.

**Se faltar qualquer chave ou confirmação entre os modelos selecionados, nenhuma chamada de benchmark é enviada, nem para os provedores prontos.** O próprio botão de verificar também não envia chamadas se falta uma das chaves selecionadas. Para conferir só um provedor, selecione apenas seus modelos ou use o botão individual. Se o provedor passar a falhar durante uma avaliação já iniciada, chamadas anteriores podem ter consumido tokens; não há como reservar crédito antecipadamente.

Para comparar OpenAI, Anthropic e Gemini, configure as três chaves e mantenha os três **Padrões** selecionados. Com todas as tarefas e três repetições, são **54 chamadas de benchmark**, antes de retentativas. **Todos os modelos** seleciona os seis modelos do catálogo, totalizando 108 chamadas nas mesmas condições. A tela mostra o total antes de iniciar.

Os destaques iniciais são GPT-6 Astra, Claude Fable 5.1 e Gemini 3.1 Pro Preview, escolhidos pela proposta de raciocínio publicada pelos fabricantes em 27/09/2026. As alternativas são GPT-6 Sol, Claude Opus 5.5 e Gemini 3.8 Flash. **Destaque não é resultado medido nem vencedor deste benchmark.** Modelos preview podem mudar. Fontes, datas e parâmetros estão em `config/models.json` e [docs/api_sources.md](docs/api_sources.md).

**Resultados** permite selecionar modelos, tarefa e dificuldade para comparar precisão, recall, F1, afirmações sem suporte, impactos críticos perdidos, consistência e latência. Tokens e custo ficam na aba **Uso e custo**. Profundidades diferentes são identificadas e não têm suas médias misturadas. Texto/PDF, primeira passagem/correções e versões diferentes ficam em grupos separados. Campos sem medição mostram `—` ou “Não disponível”.

Falhas aparecem somente em **Nova avaliação → Atividade**, com diagnóstico. Nenhum resultado parcial, grafo, nota zero ou exportação é publicado para aquela repetição. Outras repetições concluídas continuam válidas. Fechar o site durante uma avaliação interrompe o trabalho pendente; não há retomada automática de chamadas pagas.

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

Explicações livres não podem ser integralmente verificadas por essas regras. A tela **Alterações** permite registrar uma revisão humana, sem alterar automaticamente a pontuação. Veja as fórmulas e limitações em `docs/metrics.md`.

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
tests/                        Testes isolados de Python
frontend/tests/               Testes isolados do navegador
docs/                         Regras de avaliação e revisão da referência
```

SQLite mantém confirmações em `connection_checks`, separadas de resultados, e separa `executions` (andamento e diagnósticos) de `runs`/`task_results` (resultados completos). A publicação de uma repetição é atômica: todas as suas tarefas ou nenhuma. Uma execução bem-sucedida também gera `run.json` com resposta original, saída validada, métricas, tokens, latência, horários, modelo, prompts e hashes, dataset, ground truth, preços e configurações. O download no site usa o registro completo do banco. Falhas de chamada não criam exportações de resultados.

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
