# Sistema de Inspeção e Gestão de Pendências

Aplicação de demonstração para registro de inspeções, inclusão de evidências fotográficas, consulta por TAG e acompanhamento de pendências.

## Teste a demonstração

Este repositório possui uma demonstração interativa compatível com **GitHub Pages**. Nela, visitantes podem registrar uma pendência com fotografia, consultar registros anteriores pela TAG, filtrar a lista e mudar o status.

> **Importante:** a demonstração do GitHub Pages é independente do backend. Os registros ficam no armazenamento local do navegador de cada visitante. Eles não são enviados ao Google Sheets ou Google Drive e não ficam visíveis para outras pessoas. Utilize somente dados fictícios.

### Como publicar a demonstração no GitHub Pages

1. Envie todos os arquivos deste repositório para o GitHub.
2. Abra o repositório e entre em **Settings → Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**.
4. Selecione a branch `main` e a pasta `/(root)`; clique em **Save**.
5. Aguarde a publicação e abra o endereço informado na seção **Pages**. A página inicial será `index.html`.

Depois que a página estiver publicada, adicione esse endereço à seção **About** do repositório para que visitantes encontrem o botão de demonstração facilmente.

## O que pode ser testado na demonstração

- Cadastro de uma pendência com local, TAG, descrição e foto.
- Pré-visualização e compressão da foto no navegador.
- Consulta do histórico local ao digitar uma TAG existente.
- Pesquisa por TAG, local ou descrição.
- Filtro por status.
- Alteração entre `Pendente` e `Concluída`.
- Indicadores de total, pendentes e concluídas.
- Restauração dos registros de exemplo.

Os registros de exemplo são fictícios. Os dados novos ficam no `localStorage` do próprio navegador. Limpar os dados do navegador ou usar outro dispositivo/navegador pode remover ou não exibir esses registros.

## Versão integrada ao Google Apps Script

Além da demonstração estática, o repositório mantém a implementação para Google Apps Script em `src/`:

- `src/Code.gs`: backend, autorização, validação, integração com Google Sheets/Drive e geração de relatórios.
- `src/Index.html`: interface usada pela aplicação implantada no Apps Script.
- `appsscript.json`: manifesto do projeto Apps Script.
- `docs/architecture.md`: descrição da arquitetura.

Essa versão completa **não executa diretamente no GitHub Pages**. O backend usa serviços do Google e a interface chama `google.script.run`, que existe no ambiente HTML Service do Apps Script. Para disponibilizar essa versão, é necessário implantá-la como aplicativo da Web no Apps Script e configurar as permissões. Não configure uma aplicação pública que grava na sua conta pessoal sem proteção contra abuso e sem considerar as cotas de serviço.

## Tecnologias

| Parte | Tecnologia |
|---|---|
| Demonstração hospedada | HTML5, CSS3 e JavaScript puro |
| Persistência da demonstração | `localStorage` do navegador |
| Interface integrada | HTML5, CSS3 e JavaScript |
| Backend integrado | Google Apps Script / JavaScript |
| Armazenamento integrado | Google Sheets e Google Drive |

## Estrutura do projeto

```text
sistema-inspecao-gestao-pendencias/
├── index.html              # Demonstração pública do GitHub Pages
├── README.md
├── .gitignore
├── .claspignore
├── appsscript.json
├── docs/
│   └── architecture.md
├── screenshots/
│   └── .gitkeep
└── src/
    ├── Code.gs             # Backend Google Apps Script
    └── Index.html          # Interface Google Apps Script
```

## Segurança e privacidade

A demonstração do GitHub Pages não envia dados para um servidor, porém qualquer informação salva no navegador pode permanecer no dispositivo utilizado. Não inclua dados pessoais, informações operacionais reais nem fotografias confidenciais.

Antes de publicar o backend integrado, confirme que possui autorização para compartilhar o código e mantenha os dados reais fora do repositório público. O modo de compartilhamento de fotos do backend deve ser configurado de acordo com a política de acesso desejada.

## Descrição curta para o GitHub

> Demonstração interativa de inspeção e acompanhamento de pendências, com cadastro por TAG, evidência fotográfica, filtros e controle de status. Inclui uma versão integrada ao Google Apps Script, Sheets e Drive.

## Tópicos recomendados

`google-apps-script` · `javascript` · `html` · `css` · `github-pages` · `google-sheets` · `google-drive` · `automacao` · `manutencao` · `inspecao`

