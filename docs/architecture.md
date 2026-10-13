# Arquitetura do Sistema

O repositório contém dois caminhos de execução: uma demonstração estática para GitHub Pages e uma versão integrada ao Google Apps Script.

## 1. Demonstração do GitHub Pages

O arquivo `index.html`, na raiz, pode ser hospedado pelo GitHub Pages. Ele permite experimentar a interface sem cadastro ou autorização do Google.

### Fluxo

```text
Visitante
   │
   ▼
index.html (HTML, CSS e JavaScript)
   ├── Cadastro de pendência
   ├── Seleção e compressão da foto
   ├── Pesquisa por TAG
   ├── Filtros e alteração de status
   └── localStorage do próprio navegador
```

Os dados são armazenados localmente no navegador do visitante. Essa demonstração não chama o Google Sheets, o Google Drive ou o backend Apps Script.

## 2. Versão integrada ao Google Apps Script

Os arquivos em `src/` correspondem à versão que pode ser implantada como aplicativo da Web no Google Apps Script.

```text
Navegador
   │
   ▼
src/Index.html
   │ google.script.run
   ▼
src/Code.gs
   ├── Autorização e validação
   ├── Persistência no Google Sheets
   ├── Armazenamento de fotos no Google Drive
   └── Geração de relatórios por local
```

A interface integrada depende de `google.script.run`, disponível no HTML Service do Apps Script. Portanto, `src/Index.html` não deve ser usado como página principal no GitHub Pages.

## Dados da versão integrada

A aba `Respostas` contém data e hora, e-mail do inspetor, local da inspeção, TAG, descrição, ID da foto no Drive e URL da foto. O backend gera abas de relatório por local e permite acompanhar o status.

## Segurança

- A demonstração pública não envia dados ao servidor.
- Não utilize informação operacional real nem fotografias confidenciais na demonstração.
- Para a versão integrada, configure as permissões e o compartilhamento de fotos de forma restritiva.
- Não disponibilize publicamente uma implantação que grava na sua conta Google sem avaliar riscos de abuso, privacidade e cotas.
