# Cases · Visão Integrada — publicação na Cloudflare

Site estático (HTML, CSS e JavaScript sem dependências), publicado com **Workers Static Assets**.

## Visualizar no computador

Para rodar o site completo (com o questionário e o painel) na pasta do projeto:

```
npx wrangler dev --show-interactive-dev-session=false
```

Depois abra `http://localhost:8787`. A opção `--show-interactive-dev-session=false` desliga os atalhos de uma letra do wrangler (como `t`, que abre um túnel público, e `l`, que troca para o modo remoto e pede login). Sem ela, teclas enviadas pelo leitor de tela podem acionar esses comandos. Para encerrar, use Ctrl + C.


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

## Questionário de briefing (/briefing/ e /painel/)

- `/briefing/?c=CÓDIGO`: questionário que o cliente responde pelo link individual. Salva sozinho, permite continuar depois e pede confirmação antes do envio.
- `/painel/`: área com login para criar links, editar perguntas e ler respostas.
- Dados no Supabase, projeto `cases-briefing` (sa-east-1), separado do Visão Integrada. Estrutura em `supabase/migrations/`.
- `src/index.js`: Worker que atende só `/api/*`. A rota `/api/aviso-briefing` recebe do banco o aviso de questionário enviado e manda um e-mail pelo Cloudflare Email Routing.
- As páginas `site/briefing/index.html` e `site/painel/index.html` são geradas a partir da página inicial (cabeçalho, rodapé, painel de acessibilidade). Depois de mudar esses trechos em `site/index.html`, rode `python3 ferramentas/gerar-paginas.py`.

### Segredos do Worker (Cloudflare > Workers e Pages > cases-visao-integrada > Settings > Variables and Secrets)

| Nome | Tipo | Valor |
|---|---|---|
| `AVISO_SEGREDO` | Secret | o mesmo valor guardado no Vault do Supabase com o nome `aviso_segredo` |
| `AVISO_PARA` | Secret | e-mail que recebe o aviso (precisa estar verificado no Email Routing) |

Sem esses segredos, o questionário funciona normalmente; só o aviso por e-mail não é enviado.
