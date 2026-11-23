# Cases · Visão Integrada — publicação na Cloudflare

Site estático (HTML, CSS e JavaScript sem dependências), publicado com **Workers Static Assets**.

## Visualizar no computador

Abra `abrir-localmente.html` (arquivo único, com CSS, JavaScript e fontes embutidos). Para ver a versão de produção, extraia o .zip inteiro antes e abra `site/index.html`; ele depende da pasta `site/assets` ao lado.

## Estrutura

```
site/                 arquivos públicos
  index.html
  404.html
  _headers            cabeçalhos de segurança e cache (CSP estrita, sem scripts inline)
  assets/css/site.css
  assets/js/prefs-init.js   aplica as preferências antes da primeira pintura
  assets/js/site.js         painel, atalhos, filtro, menu
  assets/fonts/             Atkinson Hyperlegible Next, Lexend, OpenDyslexic (OFL 1.1)
wrangler.jsonc        configuração do deploy
```

## Publicar

Pré-requisito: o domínio `visaointegrada.net.br` precisa estar com o DNS na Cloudflare.

1. Ajuste o subdomínio em `wrangler.jsonc` (`routes[0].pattern`). O padrão é `cases.visaointegrada.net.br`.
2. Nesta pasta, rode:
   ```
   npx wrangler login
   npx wrangler deploy
   ```
3. A Cloudflare cria o registro DNS e o certificado do subdomínio automaticamente.

`workers_dev` e `preview_urls` ficam desligados para que o site só responda no subdomínio oficial.

### Alternativa: deploy automático pelo GitHub

Suba esta pasta para um repositório e, no painel da Cloudflare, use **Workers & Pages → Create → Import a repository**. Sem comando de build; o diretório de assets é `site`.

## Antes de cada publicação

- Teste com NVDA e teclado: atalhos `Alt+1` a `Alt+7` e `Alt+0`, painel (`Alt+5`), `Esc` devolvendo o foco ao botão de origem.
- Confira os temas claro, escuro e os dois de alto contraste, além do texto em 200%.
