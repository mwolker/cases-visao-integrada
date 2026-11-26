#!/usr/bin/env python3
"""Gera site/briefing/index.html e site/painel/index.html.

O cabeçalho, o rodapé, o painel de acessibilidade e o diálogo de atalhos são
copiados de site/index.html, para que as três páginas fiquem sempre iguais.
Rode de novo sempre que mudar esses trechos na página inicial:

    python3 ferramentas/gerar-paginas.py
"""
from pathlib import Path
import re

# Mude a versão a cada publicação para que os navegadores baixem os arquivos novos.
VERSAO = "2026-11-26"
RAIZ = Path(__file__).resolve().parent.parent / "site"
inicio = (RAIZ / "index.html").read_text(encoding="utf-8")

def trecho(comeco, fim):
    i = inicio.index(comeco)
    j = inicio.index(fim, i) + len(fim)
    return inicio[i:j]

dialogos = trecho("<!-- ===================== Painel de acessibilidade", '<div class="sr-only" role="status" id="anunciador"></div>')

ICONE_A11Y = re.search(r'(<button type="button" class="btn btn-a11y".*?</button>)', inicio, re.S).group(1)
ICONE_MENU = re.search(r'(<button type="button" class="btn btn-secondary menu-toggle".*?</button>)', inicio, re.S).group(1)

def cabecalho(subtitulo):
    return f'''<div class="skip-links">
  <a href="#conteudo">Pular para o conteúdo principal</a>
  <a href="#menu-principal">Pular para o menu</a>
  <a href="#rodape">Pular para o rodapé</a>
</div>

<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/">
      <img class="brand-mark" src="/assets/img/emblema-176.webp" width="88" height="88" alt="">
      <span class="brand-text">
        <span class="brand-name">Visão Integrada</span>
        <span class="brand-sub">{subtitulo}</span>
      </span>
      <span class="sr-only">, ir para a página inicial</span>
    </a>

    <nav class="site-nav" id="menu-principal" aria-label="Principal" tabindex="-1">
      {ICONE_MENU}
      <ul class="nav-list" id="lista-menu" role="list">
        <li><a href="/">Página inicial</a></li>
        <li><a href="/#cases">Cases</a></li>
        <li><a href="/#contato">Contato</a></li>
      </ul>
    </nav>

    {ICONE_A11Y}
  </div>
</header>
'''

RODAPE = '''<footer class="site-footer" id="rodape" tabindex="-1">
  <div class="container footer-inner">
    <p>© 2026 Wolker Soluções em Informática · Maurício Wolker</p>
    <ul class="footer-links" role="list">
      <li><a href="/#declaracao">Declaração de acessibilidade</a></li>
      <li><button type="button" class="link-button" data-abrir-atalhos aria-haspopup="dialog" aria-keyshortcuts="Alt+0">Atalhos de teclado</button></li>
      <li><a href="#conteudo">Voltar ao início desta página</a></li>
    </ul>
  </div>
</footer>
'''

def pagina(titulo, descricao, subtitulo, principal, dialogos_extra, scripts):
    scripts_html = "\n".join(f'<script src="{s}?v={VERSAO}"></script>' for s in scripts)
    return f'''<!doctype html>
<html lang="pt-BR" data-tema="auto">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{titulo}</title>
  <meta name="description" content="{descricao}">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#f6f6fb" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0a0d18" media="(prefers-color-scheme: dark)">
  <link rel="icon" type="image/png" href="/assets/img/favicon-64.png">
  <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
  <link rel="preload" href="/assets/fonts/atkinson-hyperlegible-next-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/atkinson-hyperlegible-next-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
  <script src="/assets/js/prefs-init.js"></script>
  <link rel="stylesheet" href="/assets/css/site.css?v={VERSAO}">
  <link rel="stylesheet" href="/assets/css/briefing.css?v={VERSAO}">
</head>
<body>

{cabecalho(subtitulo)}
{principal}
{RODAPE}
{dialogos}

{dialogos_extra}

{scripts_html}
</body>
</html>
'''

def dialogo(id_, titulo_id, titulo, corpo, rodape, classe="dialog-small"):
    return f'''<dialog class="{classe}" id="{id_}" aria-labelledby="{titulo_id}">
  <div class="panel-inner">
    <div class="panel-head">
      <h2 id="{titulo_id}" tabindex="-1">{titulo}</h2>
    </div>
{corpo}
    <div class="panel-foot">
{rodape}
    </div>
  </div>
</dialog>'''

NOSCRIPT = '<noscript><p class="aviso">Esta página precisa de JavaScript ativado no navegador para funcionar. Se preferir, escreva para <a href="mailto:contato@visaointegrada.net.br">contato@visaointegrada.net.br</a>.</p></noscript>'

# ---------------------------------------------------------------- briefing
briefing_main = f'''<main id="conteudo" tabindex="-1">
  <div class="pagina pagina-estreita" id="area-briefing">
    <h1 id="titulo-pagina" tabindex="-1">Questionário de briefing</h1>
    <p class="carregando" id="msg-carregando">Este questionário precisa de JavaScript para carregar.</p>
    {NOSCRIPT}
  </div>
</main>
'''
briefing_dialogos = dialogo(
    "dialogo-enviar", "titulo-enviar", "Enviar o questionário?",
    '''    <div class="panel-body">
      <p id="texto-envio"></p>
    </div>''',
    '''      <button type="button" class="btn btn-secondary" data-fechar>Voltar e revisar</button>
      <button type="button" class="btn btn-primary" id="btn-confirmar-envio">Enviar agora</button>''')

(RAIZ / "briefing").mkdir(exist_ok=True)
(RAIZ / "briefing" / "index.html").write_text(pagina(
    "Questionário de briefing · Visão Integrada · Maurício Wolker",
    "Questionário acessível para reunir as informações do seu projeto.",
    "Questionário de briefing",
    briefing_main, briefing_dialogos,
    ["/assets/js/site.js", "/assets/js/briefing-api.js", "/assets/js/briefing.js"]), encoding="utf-8")

# ---------------------------------------------------------------- painel
painel_main = f'''<main id="conteudo" tabindex="-1">
  <div class="pagina container">
    <h1 id="titulo-pagina" tabindex="-1">Painel do questionário</h1>
    <div class="resumo-erros" role="alert" id="alerta-painel" hidden></div>
    <div id="area-painel"><p class="carregando">Este painel precisa de JavaScript para carregar.</p>{NOSCRIPT}</div>
  </div>
</main>
'''

TIPOS = [("texto_curto", "Texto curto (uma linha)"), ("texto_longo", "Texto longo (várias linhas)"),
         ("escolha_unica", "Escolha única (o cliente marca uma opção)"),
         ("multipla_escolha", "Múltipla escolha (o cliente marca várias opções)")]
radios_tipo = "\n".join(
    f'''          <li><label class="opcao" for="tipo-{v}"><input type="radio" name="pergunta-tipo" id="tipo-{v}" value="{v}"><span>{t}</span></label></li>'''
    for v, t in TIPOS)

painel_dialogos = "\n\n".join([
    dialogo("dialogo-confirmar", "titulo-confirmar", "Confirmar",
        '''    <div class="panel-body">
      <p id="texto-confirmar"></p>
    </div>''',
        '''      <button type="button" class="btn btn-secondary" data-fechar>Cancelar</button>
      <button type="button" class="btn btn-perigo" id="btn-confirmar-ok">Confirmar</button>'''),
    f'''<dialog class="dialog-form" id="dialogo-secao" aria-labelledby="titulo-dialogo-secao">
  <form class="panel-inner" id="form-secao" novalidate>
    <div class="panel-head">
      <h2 id="titulo-dialogo-secao" tabindex="-1">Nova seção</h2>
    </div>
    <div class="panel-body form-grid">
      <div class="campo">
        <label for="secao-titulo">Título da seção <span class="obrigatoria">(obrigatório)</span></label>
        <input type="text" id="secao-titulo" class="campo-texto" maxlength="200" required autocomplete="off">
      </div>
      <div class="campo">
        <label for="secao-descricao">Descrição</label>
        <p class="hint" id="hint-secao-descricao">Opcional. Aparece logo abaixo do título da seção.</p>
        <textarea id="secao-descricao" class="campo-area" rows="3" maxlength="2000" aria-describedby="hint-secao-descricao"></textarea>
      </div>
    </div>
    <div class="panel-foot">
      <button type="button" class="btn btn-secondary" data-fechar>Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar seção</button>
    </div>
  </form>
</dialog>''',
    f'''<dialog class="dialog-form" id="dialogo-pergunta" aria-labelledby="titulo-dialogo-pergunta">
  <form class="panel-inner" id="form-pergunta" novalidate>
    <div class="panel-head">
      <h2 id="titulo-dialogo-pergunta" tabindex="-1">Nova pergunta</h2>
    </div>
    <div class="panel-body form-grid">
      <div class="campo">
        <label for="pergunta-texto">Texto da pergunta <span class="obrigatoria">(obrigatório)</span></label>
        <textarea id="pergunta-texto" class="campo-area" rows="3" maxlength="1000" required></textarea>
      </div>
      <div class="campo">
        <label for="pergunta-ajuda">Texto de ajuda</label>
        <p class="hint" id="hint-pergunta-ajuda">Opcional. Aparece logo abaixo da pergunta, com um exemplo ou uma explicação.</p>
        <textarea id="pergunta-ajuda" class="campo-area" rows="2" maxlength="2000" aria-describedby="hint-pergunta-ajuda"></textarea>
      </div>
      <div class="campo">
        <label for="pergunta-secao">Seção</label>
        <select id="pergunta-secao" class="campo-select"></select>
      </div>
      <fieldset class="grupo-radio">
        <legend>Tipo de resposta</legend>
        <ul class="lista-opcoes" role="list">
{radios_tipo}
        </ul>
      </fieldset>
      <div class="campo" id="bloco-opcoes">
        <label for="pergunta-opcoes">Opções de resposta</label>
        <p class="hint" id="hint-pergunta-opcoes">Escreva uma opção por linha, na ordem em que devem aparecer.</p>
        <textarea id="pergunta-opcoes" class="campo-area" rows="6" aria-describedby="hint-pergunta-opcoes"></textarea>
      </div>
      <div class="check" id="bloco-permite-outro">
        <input type="checkbox" id="pergunta-outro" aria-describedby="hint-pergunta-outro">
        <label for="pergunta-outro">Permitir "Outra resposta"</label>
        <p class="hint" id="hint-pergunta-outro">Acrescenta um campo de texto para o cliente escrever uma resposta que não está na lista.</p>
      </div>
      <div class="check">
        <input type="checkbox" id="pergunta-obrigatoria" aria-describedby="hint-pergunta-obrigatoria">
        <label for="pergunta-obrigatoria">Resposta obrigatória</label>
        <p class="hint" id="hint-pergunta-obrigatoria">O cliente só consegue enviar o questionário depois de responder.</p>
      </div>
      <div class="check">
        <input type="checkbox" id="pergunta-ativa" aria-describedby="hint-pergunta-ativa">
        <label for="pergunta-ativa">Visível para os clientes</label>
        <p class="hint" id="hint-pergunta-ativa">Desmarque para ocultar a pergunta sem excluí-la.</p>
      </div>
    </div>
    <div class="panel-foot">
      <button type="button" class="btn btn-secondary" data-fechar>Cancelar</button>
      <button type="submit" class="btn btn-primary">Salvar pergunta</button>
    </div>
  </form>
</dialog>''',
])

(RAIZ / "painel").mkdir(exist_ok=True)
(RAIZ / "painel" / "index.html").write_text(pagina(
    "Painel do questionário · Visão Integrada",
    "Área restrita para administrar o questionário de briefing.",
    "Painel do questionário",
    painel_main, painel_dialogos,
    ["/assets/js/site.js", "/assets/js/briefing-api.js", "/assets/js/painel.js"]), encoding="utf-8")

print("Páginas geradas: site/briefing/index.html e site/painel/index.html")
