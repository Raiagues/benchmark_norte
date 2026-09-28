# Relatório NORTE — questão 5, Gama Fund

Preparado em português para acompanhar a resposta sobre pontos fortes e limitações dos modelos Google no processo de desenvolvimento.

- `NORTE_relatorio_Gama_Fund.pdf`: versão para anexar.
- `NORTE_relatorio_Gama_Fund.docx`: versão editável, com as mesmas imagens e tabelas.
- `resposta_formulario.txt`: texto sugerido para a questão 5.
- `relatorio.md`: conteúdo do relatório em texto.
- `metricas_por_resposta.csv`: 43 respostas elegíveis, sem prompts nem chaves.
- `metricas_agregadas.json`: 19 grupos por modelo/protocolo/tarefa/nível.
- `figuras/`: cinco gráficos/diagramas em PNG e SVG, produzidos dos dados reais.

Base congelada em 27/09/2026 às 22h33min24s (America/Sao_Paulo). A cópia privada está em `.runtime/fund-report/evidence.sqlite3` e **não deve ser anexada**: contém o histórico completo para auditoria local. Os arquivos desta pasta não incluem credenciais ou dados pessoais da tela de faturamento.

O Astra d4408d foi excluído. Os demais protocolos permanecem separados; o gabarito é provisório. Não foram feitas novas chamadas aos modelos nem alterações nos resultados para este relatório.

Geração: `scripts/analyze_fund_report.py` usa os arquivos privados de extração; `scripts/build_fund_report.py` gera Word, Markdown e figuras a partir da base congelada. Este último usa o Python do sistema com Matplotlib e python-docx instalado isoladamente em `/tmp/norte-report-libs`. O PDF foi convertido pelo LibreOffice, com perfil temporário em `/tmp/norte-report-lo`. Não executar benchmarks para recriar os documentos.

Não fazer commits/push: a responsável pelo projeto cuidará do Git. Antes de atualizar conclusões, conferir novos registros e versionar o corte, sem sobrescrever a evidência desta edição.
