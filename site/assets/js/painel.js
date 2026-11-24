/* ==========================================================================
   Questionário de briefing · painel do administrador (/painel/)
   - Entrar com e-mail e senha (Supabase Auth); só contas cadastradas como
     administrador conseguem ver ou alterar dados (regras no banco).
   - Clientes e links: criar link individual, copiar, reabrir, desativar, excluir.
   - Perguntas: criar, editar, ocultar, reordenar e excluir seções e perguntas.
   - Respostas: ler, imprimir e copiar como texto.
   Acessibilidade: cada troca de área move o foco para o título; ações em listas
   têm nome único para o leitor de tela; mover itens mantém o foco no botão
   usado e anuncia a nova posição; exclusões pedem confirmação.
   ========================================================================== */
(function () {
  'use strict';

  var api = window.BriefingApi;
  var VI = window.VI || { anunciar: function () {}, abrirDialogo: function (d) { d.showModal(); }, prepararDialogo: function () {}, definirAtalho: function () {} };

  var area = document.getElementById('area-painel');
  var titulo = document.getElementById('titulo-pagina');
  var alerta = document.getElementById('alerta-painel');

  var TIPOS = {
    texto_curto: 'Texto curto (uma linha)',
    texto_longo: 'Texto longo (várias linhas)',
    escolha_unica: 'Escolha única',
    multipla_escolha: 'Múltipla escolha'
  };
  var SITUACOES = {
    pendente: { texto: 'Ainda não aberto', classe: 'badge badge-pendente' },
    em_andamento: { texto: 'Respondendo', classe: 'badge badge-plan' },
    enviado: { texto: 'Enviado', classe: 'badge badge-ok' }
  };

  var estado = { secoes: [], perguntas: [], convites: [] };

  /* ---------- Utilidades ---------- */
  function el(tag, attrs, filhos) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') n.textContent = v;
        else if (k === 'class') n.className = v;
        else if (v === true) n.setAttribute(k, '');
        else n.setAttribute(k, v);
      });
    }
    (filhos || []).forEach(function (f) {
      if (f === null || f === undefined || f === false) return;
      n.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
    });
    return n;
  }
  function sr(texto) { return el('span', { class: 'sr-only', text: texto }); }
  function botao(texto, extra, attrs) {
    var b = el('button', Object.assign({ type: 'button', class: 'btn btn-secondary btn-pequeno' }, attrs || {}), [texto, extra ? sr(' ' + extra) : null]);
    return b;
  }
  function dataHora(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' às ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function focar(alvo) {
    if (!alvo) return;
    if (!alvo.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) alvo.setAttribute('tabindex', '-1');
    alvo.focus({ preventScroll: true });
    alvo.scrollIntoView({ block: 'nearest' });
  }
  function mostrarAlerta(msg) {
    alerta.textContent = '';
    setTimeout(function () { alerta.textContent = msg; }, 50);
    alerta.hidden = false;
  }
  function limparAlerta() { alerta.textContent = ''; alerta.hidden = true; }
  function limparArea() { area.textContent = ''; }
  function linkDoConvite(c) { return window.location.origin + '/briefing/?c=' + c.token; }
  function porOrdem(a, b) { return (a.ordem - b.ordem) || (a.criado_em < b.criado_em ? -1 : 1); }
  function perguntasDa(secaoId) { return estado.perguntas.filter(function (p) { return p.secao_id === secaoId; }).sort(porOrdem); }
  function secoesOrdenadas() { return estado.secoes.slice().sort(porOrdem); }
  function falha(erro) {
    if (erro && erro.codigo === 'sessao_expirada') { mostrarLogin(erro.message); return; }
    mostrarAlerta((erro && erro.message) || 'Ocorreu um erro inesperado.');
  }

  function copiar(texto, mensagem) {
    var feito = navigator.clipboard && window.isSecureContext
      ? navigator.clipboard.writeText(texto)
      : Promise.reject();
    return feito.then(function () { VI.anunciar(mensagem); }, function () {
      VI.anunciar('Não foi possível copiar automaticamente. Selecione o texto e use Ctrl + C.');
    });
  }

  /* ---------- Diálogos ---------- */
  var dlgConfirmar = document.getElementById('dialogo-confirmar');
  var dlgPergunta = document.getElementById('dialogo-pergunta');
  var dlgSecao = document.getElementById('dialogo-secao');
  [dlgConfirmar, dlgPergunta, dlgSecao].forEach(function (d) { VI.prepararDialogo(d, { fecharNoFundo: false }); });

  function confirmar(opts, opener) {
    return new Promise(function (resolve) {
      document.getElementById('titulo-confirmar').textContent = opts.titulo;
      document.getElementById('texto-confirmar').textContent = opts.texto;
      var ok = document.getElementById('btn-confirmar-ok');
      ok.textContent = opts.botao;
      var decidido = false;
      function aoClicar() { decidido = true; dlgConfirmar.close(); }
      function aoFechar() {
        ok.removeEventListener('click', aoClicar);
        dlgConfirmar.removeEventListener('close', aoFechar);
        resolve(decidido);
      }
      ok.addEventListener('click', aoClicar);
      dlgConfirmar.addEventListener('close', aoFechar);
      VI.abrirDialogo(dlgConfirmar, opener);
    });
  }

  /* Erros de formulário: mensagem junto do campo + foco no primeiro campo com erro. */
  function erroCampo(campo, mensagem) {
    var id = 'erro-' + campo.id;
    var msg = document.getElementById(id);
    if (!msg) {
      msg = el('p', { class: 'msg-erro', id: id });
      campo.parentNode.insertBefore(msg, campo);
    }
    msg.textContent = mensagem;
    campo.setAttribute('aria-invalid', 'true');
    var ids = (campo.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    if (ids.indexOf(id) === -1) ids.unshift(id);
    campo.setAttribute('aria-describedby', ids.join(' '));
  }
  function limparErros(container) {
    Array.prototype.forEach.call(container.querySelectorAll('.msg-erro'), function (m) {
      var campoId = m.id.replace(/^erro-/, '');
      var campo = document.getElementById(campoId);
      if (campo) {
        campo.removeAttribute('aria-invalid');
        var ids = (campo.getAttribute('aria-describedby') || '').split(' ').filter(function (i) { return i && i !== m.id; });
        if (ids.length) campo.setAttribute('aria-describedby', ids.join(' ')); else campo.removeAttribute('aria-describedby');
      }
      m.remove();
    });
  }

  /* ======================================================================
     Login, recuperação e troca de senha
     ====================================================================== */
  function mostrarLogin(mensagem) {
    api.sair();
    titulo.textContent = 'Entrar no painel';
    document.title = 'Entrar · Painel do questionário · Visão Integrada';
    limparArea();
    limparAlerta();
    var form = el('form', { class: 'login form-grid', novalidate: true, 'aria-labelledby': 'titulo-pagina' }, [
      el('p', { text: 'Área restrita para administrar o questionário de briefing.' }),
      el('div', { class: 'campo' }, [
        el('label', { for: 'login-email', text: 'E-mail' }),
        el('input', { type: 'email', id: 'login-email', class: 'campo-texto', autocomplete: 'username', required: true, spellcheck: 'false' })
      ]),
      el('div', { class: 'campo' }, [
        el('label', { for: 'login-senha', text: 'Senha' }),
        el('input', { type: 'password', id: 'login-senha', class: 'campo-texto', autocomplete: 'current-password', required: true })
      ]),
      el('div', { class: 'check' }, [
        el('input', { type: 'checkbox', id: 'login-mostrar' }),
        el('label', { for: 'login-mostrar', text: 'Mostrar senha' })
      ]),
      el('div', { class: 'acoes' }, [
        el('button', { type: 'submit', class: 'btn btn-primary', text: 'Entrar' }),
        el('button', { type: 'button', class: 'link-button', id: 'btn-esqueci', text: 'Esqueci minha senha' })
      ])
    ]);
    area.appendChild(form);
    var email = form.querySelector('#login-email');
    var senha = form.querySelector('#login-senha');
    form.querySelector('#login-mostrar').addEventListener('change', function (e) { senha.type = e.target.checked ? 'text' : 'password'; });
    form.querySelector('#btn-esqueci').addEventListener('click', function () { mostrarRecuperacao(email.value); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      limparErros(form);
      limparAlerta();
      var primeiro = null;
      if (!email.value.trim()) { erroCampo(email, 'Informe o e-mail.'); primeiro = email; }
      if (!senha.value) { erroCampo(senha, 'Informe a senha.'); primeiro = primeiro || senha; }
      if (primeiro) { focar(primeiro); return; }
      var btn = form.querySelector('button[type="submit"]');
      btn.setAttribute('aria-disabled', 'true');
      btn.textContent = 'Entrando…';
      api.entrar(email.value.trim(), senha.value).then(function () {
        return iniciarPainel(true);
      }).catch(function (erro) {
        btn.removeAttribute('aria-disabled');
        btn.textContent = 'Entrar';
        mostrarAlerta(erro.message);
        focar(senha);
      });
    });
    if (mensagem) mostrarAlerta(mensagem);
  }

  function mostrarRecuperacao(emailInicial) {
    titulo.textContent = 'Recuperar senha';
    limparArea();
    limparAlerta();
    var form = el('form', { class: 'login form-grid', novalidate: true, 'aria-labelledby': 'titulo-pagina' }, [
      el('p', { text: 'Informe o e-mail da sua conta. Se ele estiver cadastrado, você receberá um link para criar uma nova senha.' }),
      el('div', { class: 'campo' }, [
        el('label', { for: 'rec-email', text: 'E-mail' }),
        el('input', { type: 'email', id: 'rec-email', class: 'campo-texto', autocomplete: 'username', required: true, spellcheck: 'false', value: emailInicial || '' })
      ]),
      el('div', { class: 'acoes' }, [
        el('button', { type: 'submit', class: 'btn btn-primary', text: 'Enviar link' }),
        el('button', { type: 'button', class: 'link-button', id: 'btn-voltar-login', text: 'Voltar para o login' })
      ])
    ]);
    area.appendChild(form);
    var email = form.querySelector('#rec-email');
    form.querySelector('#btn-voltar-login').addEventListener('click', function () { mostrarLogin(); focar(titulo); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      limparErros(form);
      if (!email.value.trim()) { erroCampo(email, 'Informe o e-mail.'); focar(email); return; }
      api.recuperarSenha(email.value.trim(), window.location.origin + '/painel/').then(function () {
        limparArea();
        area.appendChild(el('div', { class: 'aviso aviso-ok' }, [
          el('p', { text: 'Pronto. Se o e-mail estiver cadastrado, o link chegará em alguns minutos. Confira também a caixa de spam.' })
        ]));
        var voltar = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Voltar para o login' });
        voltar.addEventListener('click', function () { mostrarLogin(); focar(titulo); });
        area.appendChild(voltar);
        focar(titulo);
      }, function (erro) { mostrarAlerta(erro.message); });
    });
    focar(titulo);
  }

  function mostrarNovaSenha() {
    titulo.textContent = 'Criar nova senha';
    limparArea();
    limparAlerta();
    var form = el('form', { class: 'login form-grid', novalidate: true, 'aria-labelledby': 'titulo-pagina' }, [
      el('div', { class: 'campo' }, [
        el('label', { for: 'nova-senha', text: 'Nova senha' }),
        el('p', { class: 'hint', id: 'hint-nova-senha', text: 'Use pelo menos 10 caracteres, misturando letras, números e símbolos.' }),
        el('input', { type: 'password', id: 'nova-senha', class: 'campo-texto', autocomplete: 'new-password', required: true, 'aria-describedby': 'hint-nova-senha' })
      ]),
      el('div', { class: 'campo' }, [
        el('label', { for: 'nova-senha-2', text: 'Repita a nova senha' }),
        el('input', { type: 'password', id: 'nova-senha-2', class: 'campo-texto', autocomplete: 'new-password', required: true })
      ]),
      el('div', { class: 'acoes' }, [el('button', { type: 'submit', class: 'btn btn-primary', text: 'Salvar nova senha' })])
    ]);
    area.appendChild(form);
    var s1 = form.querySelector('#nova-senha');
    var s2 = form.querySelector('#nova-senha-2');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      limparErros(form);
      if (s1.value.length < 10) { erroCampo(s1, 'A senha precisa ter pelo menos 10 caracteres.'); focar(s1); return; }
      if (s1.value !== s2.value) { erroCampo(s2, 'As duas senhas não são iguais.'); focar(s2); return; }
      api.trocarSenha(s1.value).then(function () {
        VI.anunciar('Senha alterada.');
        return iniciarPainel(true);
      }, falha);
    });
    focar(titulo);
  }

  /* ======================================================================
     Painel
     ====================================================================== */
  function carregarTudo() {
    return Promise.all([
      api.listar('secoes', 'select=*&order=ordem.asc,criado_em.asc'),
      api.listar('perguntas', 'select=*&order=ordem.asc,criado_em.asc'),
      api.listar('convites', 'select=id,token,nome_contato,organizacao,email,notas,ativo,status,iniciado_em,enviado_em,criado_em&order=criado_em.desc')
    ]).then(function (r) {
      estado.secoes = r[0] || [];
      estado.perguntas = r[1] || [];
      estado.convites = r[2] || [];
    });
  }

  function iniciarPainel(focarTitulo) {
    return api.listar('admins', 'select=user_id').then(function (linhas) {
      if (!linhas || !linhas.length) {
        mostrarLogin('Esta conta não tem acesso ao painel.');
        return;
      }
      return carregarTudo().then(function () {
        montarEstrutura();
        rotear(focarTitulo);
      });
    }).catch(falha);
  }

  var conteudoView = null;
  function montarEstrutura() {
    titulo.textContent = 'Painel do questionário';
    limparArea();
    limparAlerta();
    var sessao = api.sessao() || {};
    var sair = el('button', { type: 'button', class: 'btn btn-secondary btn-pequeno', text: 'Sair' });
    sair.addEventListener('click', function () {
      api.sair().then(function () { history.replaceState(null, '', '/painel/'); mostrarLogin(); VI.anunciar('Você saiu do painel.'); focar(titulo); });
    });
    area.appendChild(el('div', { class: 'painel-topo' }, [
      el('p', { text: sessao.email ? 'Conectado como ' + sessao.email + '.' : 'Conectado.' }),
      sair
    ]));
    area.appendChild(el('nav', { class: 'abas', 'aria-label': 'Áreas do painel' }, [
      el('ul', { role: 'list' }, [
        el('li', {}, [el('a', { href: '#clientes', 'data-aba': 'clientes', text: 'Clientes e links' })]),
        el('li', {}, [el('a', { href: '#perguntas', 'data-aba': 'perguntas', text: 'Perguntas' })]),
        el('li', {}, [el('a', { href: '#respostas', 'data-aba': 'respostas', text: 'Respostas' })])
      ])
    ]));
    conteudoView = el('div', { id: 'conteudo-painel' });
    // Um único ouvinte para as ações da área de perguntas (os botões são recriados a cada mudança).
    conteudoView.addEventListener('click', aoAgirPerguntas);
    area.appendChild(conteudoView);
  }

  function rotear(focarTitulo) {
    if (!conteudoView) return;
    var partes = (window.location.hash.slice(1) || 'clientes').split('/');
    var aba = ['clientes', 'perguntas', 'respostas'].indexOf(partes[0]) === -1 ? 'clientes' : partes[0];
    Array.prototype.forEach.call(area.querySelectorAll('.abas a'), function (a) {
      if (a.getAttribute('data-aba') === aba) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    conteudoView.textContent = '';
    limparAlerta();
    if (aba === 'perguntas') viewPerguntas();
    else if (aba === 'respostas') viewRespostas(partes[1]);
    else viewClientes();
    var nomes = { clientes: 'Clientes e links', perguntas: 'Perguntas', respostas: 'Respostas' };
    document.title = nomes[aba] + ' · Painel do questionário · Visão Integrada';
    if (focarTitulo) focar(conteudoView.querySelector('h2'));
  }

  window.addEventListener('hashchange', function () {
    if (window.location.hash.indexOf('access_token=') !== -1) return;
    if (api.sessao()) rotear(true);
  });

  /* ---------- Clientes e links ---------- */
  function viewClientes() {
    var v = conteudoView;
    v.appendChild(el('h2', { tabindex: '-1', text: 'Clientes e links' }));
    v.appendChild(el('p', { text: 'Cada cliente recebe um link próprio. O cliente pode salvar e continuar depois; quando envia, as respostas ficam bloqueadas para edição.' }));

    var form = el('form', { class: 'caixa form-grid', novalidate: true, 'aria-labelledby': 'titulo-novo-link' }, [
      el('h3', { id: 'titulo-novo-link', text: 'Criar novo link' }),
      el('div', { class: 'campo' }, [
        el('label', { for: 'novo-nome' }, ['Nome do contato ', el('span', { class: 'obrigatoria', text: '(obrigatório)' })]),
        el('input', { type: 'text', id: 'novo-nome', class: 'campo-texto', required: true, maxlength: '200', autocomplete: 'off' })
      ]),
      el('div', { class: 'campo' }, [
        el('label', { for: 'novo-org', text: 'Organização' }),
        el('input', { type: 'text', id: 'novo-org', class: 'campo-texto', maxlength: '200', autocomplete: 'off' })
      ]),
      el('div', { class: 'campo' }, [
        el('label', { for: 'novo-email', text: 'E-mail do contato' }),
        el('input', { type: 'email', id: 'novo-email', class: 'campo-texto', maxlength: '320', autocomplete: 'off', spellcheck: 'false' })
      ]),
      el('div', { class: 'campo' }, [
        el('label', { for: 'novo-notas', text: 'Anotações internas' }),
        el('p', { class: 'hint', id: 'hint-novo-notas', text: 'Só você vê. O cliente nunca tem acesso a este campo.' }),
        el('textarea', { id: 'novo-notas', class: 'campo-area', rows: '3', maxlength: '4000', 'aria-describedby': 'hint-novo-notas' })
      ]),
      el('div', { class: 'acoes' }, [el('button', { type: 'submit', class: 'btn btn-primary', text: 'Criar link' })]),
      el('div', { id: 'resultado-link' })
    ]);
    v.appendChild(form);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      limparErros(form);
      var nome = form.querySelector('#novo-nome');
      var emailCampo = form.querySelector('#novo-email');
      if (!nome.value.trim()) { erroCampo(nome, 'Informe o nome do contato.'); focar(nome); return; }
      if (emailCampo.value.trim() && !emailCampo.checkValidity()) { erroCampo(emailCampo, 'Informe um e-mail válido, como nome@exemplo.com.br, ou deixe em branco.'); focar(emailCampo); return; }
      api.inserir('convites', {
        nome_contato: nome.value.trim(),
        organizacao: form.querySelector('#novo-org').value.trim() || null,
        email: emailCampo.value.trim() || null,
        notas: form.querySelector('#novo-notas').value.trim() || null
      }).then(function (c) {
        estado.convites.unshift(c);
        form.reset();
        mostrarLinkGerado(c);
        desenharListaConvites();
      }, falha);
    });

    v.appendChild(el('h3', { id: 'titulo-lista-links', text: 'Links criados' }));
    v.appendChild(el('div', { id: 'lista-convites' }));
    desenharListaConvites();
  }

  function mostrarLinkGerado(c) {
    var alvo = document.getElementById('resultado-link');
    alvo.textContent = '';
    var link = linkDoConvite(c);
    var btn = el('button', { type: 'button', class: 'btn btn-primary', text: 'Copiar link' });
    btn.addEventListener('click', function () { copiar(link, 'Link copiado.'); });
    var h = el('h4', { tabindex: '-1', text: 'Link criado para ' + c.nome_contato });
    alvo.appendChild(el('div', { class: 'aviso aviso-ok link-gerado' }, [
      h,
      el('label', { for: 'link-gerado', text: 'Link do questionário' }),
      el('input', { type: 'text', id: 'link-gerado', class: 'campo-texto', readonly: true, value: link }),
      el('div', { class: 'acoes' }, [btn])
    ]));
    focar(h);
  }

  function desenharListaConvites(focoDepois) {
    var alvo = document.getElementById('lista-convites');
    var tituloLista = document.getElementById('titulo-lista-links');
    if (!alvo) return;
    alvo.textContent = '';
    tituloLista.textContent = 'Links criados (' + estado.convites.length + ')';
    if (!estado.convites.length) {
      alvo.appendChild(el('p', { text: 'Nenhum link criado ainda.' }));
      return;
    }
    var ul = el('ul', { class: 'lista-cartoes', role: 'list' });
    estado.convites.forEach(function (c) {
      var nome = c.nome_contato + (c.organizacao ? ' (' + c.organizacao + ')' : '');
      var sit = SITUACOES[c.status];
      var meta = el('dl', { class: 'meta' }, [
        el('dt', { text: 'Situação' }), el('dd', {}, [el('span', { class: sit.classe, text: sit.texto })]),
        el('dt', { text: 'Link' }), el('dd', { text: c.ativo ? 'Ativo' : 'Desativado' }),
        el('dt', { text: 'Criado em' }), el('dd', { text: dataHora(c.criado_em) })
      ]);
      if (c.enviado_em) { meta.appendChild(el('dt', { text: 'Enviado em' })); meta.appendChild(el('dd', { text: dataHora(c.enviado_em) })); }
      if (c.email) { meta.appendChild(el('dt', { text: 'E-mail' })); meta.appendChild(el('dd', { text: c.email })); }
      if (c.notas) { meta.appendChild(el('dt', { text: 'Anotações' })); meta.appendChild(el('dd', { text: c.notas })); }

      var bCopiar = botao('Copiar link', 'de ' + nome, { 'data-acao': 'copiar', 'data-id': c.id });
      var aResp = el('a', { class: 'btn btn-secondary btn-pequeno', href: '#respostas/' + c.id }, ['Ver respostas', sr(' de ' + nome)]);
      var bReabrir = c.status === 'enviado' ? botao('Reabrir para edição', 'o questionário de ' + nome, { 'data-acao': 'reabrir', 'data-id': c.id }) : null;
      var bAtivo = botao(c.ativo ? 'Desativar link' : 'Reativar link', 'de ' + nome, { 'data-acao': 'ativo', 'data-id': c.id });
      var bExcluir = botao('Excluir', 'o link e as respostas de ' + nome, { 'data-acao': 'excluir', 'data-id': c.id, class: 'btn btn-perigo btn-pequeno' });

      ul.appendChild(el('li', { class: c.ativo ? '' : 'cartao-oculto' }, [
        el('h4', { id: 'convite-' + c.id, tabindex: '-1', text: nome }),
        meta,
        el('div', { class: 'acoes' }, [bCopiar, aResp, bReabrir, bAtivo, bExcluir])
      ]));
    });
    alvo.appendChild(ul);
    ul.addEventListener('click', aoAgirConvite);
    if (focoDepois) focar(alvo.querySelector(focoDepois) || tituloLista);
  }

  function aoAgirConvite(e) {
    var b = e.target.closest('button[data-acao]');
    if (!b) return;
    var c = estado.convites.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
    if (!c) return;
    var acao = b.getAttribute('data-acao');
    var seletor = 'button[data-acao="' + acao + '"][data-id="' + c.id + '"]';

    if (acao === 'copiar') { copiar(linkDoConvite(c), 'Link de ' + c.nome_contato + ' copiado.'); return; }

    if (acao === 'reabrir') {
      confirmar({ titulo: 'Reabrir o questionário?', texto: c.nome_contato + ' poderá alterar as respostas e enviar de novo pelo mesmo link.', botao: 'Reabrir' }, b).then(function (ok) {
        if (!ok) return;
        api.atualizar('convites', c.id, { status: 'em_andamento', enviado_em: null }).then(function (n) {
          Object.assign(c, n);
          desenharListaConvites('#convite-' + c.id);
          VI.anunciar('Questionário de ' + c.nome_contato + ' reaberto para edição.');
        }, falha);
      });
      return;
    }

    if (acao === 'ativo') {
      api.atualizar('convites', c.id, { ativo: !c.ativo }).then(function (n) {
        Object.assign(c, n);
        desenharListaConvites(seletor);
        VI.anunciar(c.ativo ? 'Link de ' + c.nome_contato + ' reativado.' : 'Link de ' + c.nome_contato + ' desativado. Quem abrir o link verá uma mensagem de link desativado.');
      }, falha);
      return;
    }

    if (acao === 'excluir') {
      confirmar({
        titulo: 'Excluir o link de ' + c.nome_contato + '?',
        texto: 'O link deixará de funcionar e todas as respostas dele serão apagadas. Esta ação não pode ser desfeita. Se quiser só impedir o acesso, use "Desativar link".',
        botao: 'Excluir definitivamente'
      }, b).then(function (ok) {
        if (!ok) return;
        api.excluir('convites', c.id).then(function () {
          estado.convites = estado.convites.filter(function (x) { return x.id !== c.id; });
          desenharListaConvites('#titulo-lista-links');
          focar(document.getElementById('titulo-lista-links'));
          VI.anunciar('Link de ' + c.nome_contato + ' excluído.');
        }, falha);
      });
    }
  }

  /* ---------- Perguntas ---------- */
  function viewPerguntas(focoDepois) {
    var v = conteudoView;
    v.textContent = '';
    v.appendChild(el('h2', { tabindex: '-1', text: 'Perguntas do questionário' }));
    v.appendChild(el('p', { text: 'As alterações valem na hora para todos os links que ainda não foram enviados. As respostas já recebidas guardam o texto da pergunta como estava quando foram dadas.' }));
    var bNovaSecao = el('button', { type: 'button', class: 'btn btn-primary', 'data-acao': 'nova-secao', text: 'Nova seção' });
    v.appendChild(el('div', { class: 'acoes' }, [bNovaSecao]));

    var secoes = secoesOrdenadas();
    if (!secoes.length) v.appendChild(el('p', { text: 'Nenhuma seção criada ainda. Comece criando uma seção.' }));

    var totalPergunta = 0;
    secoes.forEach(function (s, i) {
      var nSec = i + 1;
      var lista = perguntasDa(s.id);
      var bloco = el('section', { class: 'secao-admin', 'aria-labelledby': 'adm-secao-' + s.id });
      var acoesSecao = el('div', { class: 'acoes' }, [
        botao('Editar seção', nSec, { 'data-acao': 'editar-secao', 'data-id': s.id }),
        botao('Subir', 'seção ' + nSec, { 'data-acao': 'subir-secao', 'data-id': s.id, 'aria-disabled': i === 0 ? 'true' : null }),
        botao('Descer', 'seção ' + nSec, { 'data-acao': 'descer-secao', 'data-id': s.id, 'aria-disabled': i === secoes.length - 1 ? 'true' : null }),
        botao('Nova pergunta', 'na seção ' + nSec, { 'data-acao': 'nova-pergunta', 'data-id': s.id }),
        botao('Excluir seção', nSec, { 'data-acao': 'excluir-secao', 'data-id': s.id, class: 'btn btn-perigo btn-pequeno' })
      ]);
      bloco.appendChild(el('div', { class: 'cabecalho' }, [
        el('h3', { id: 'adm-secao-' + s.id, tabindex: '-1', text: 'Seção ' + nSec + ': ' + s.titulo })
      ]));
      if (s.descricao) bloco.appendChild(el('p', { class: 'hint', text: s.descricao }));
      bloco.appendChild(acoesSecao);

      if (!lista.length) {
        bloco.appendChild(el('p', { text: 'Esta seção ainda não tem perguntas. Ela não aparece para os clientes enquanto estiver vazia.' }));
      } else {
        var ol = el('ol', { class: 'lista-cartoes', role: 'list' });
        lista.forEach(function (p, j) {
          totalPergunta++;
          var rotulo = 'pergunta ' + nSec + '.' + (j + 1);
          var etiquetas = el('ul', { class: 'etiquetas', role: 'list' }, [
            el('li', {}, [el('span', { class: 'badge badge-cat', text: TIPOS[p.tipo] })]),
            p.obrigatoria ? el('li', {}, [el('span', { class: 'badge badge-plan', text: 'Obrigatória' })]) : null,
            p.ativa ? null : el('li', {}, [el('span', { class: 'badge badge-oculta', text: 'Oculta para os clientes' })])
          ]);
          ol.appendChild(el('li', { class: p.ativa ? '' : 'cartao-oculto' }, [
            el('h4', { id: 'adm-pergunta-' + p.id, tabindex: '-1' }, [
              el('span', { class: 'ordem-num', text: 'Pergunta ' + nSec + '.' + (j + 1) + ': ' }),
              p.texto
            ]),
            p.ajuda ? el('p', { class: 'hint', text: 'Ajuda: ' + p.ajuda }) : null,
            p.opcoes && p.opcoes.length ? el('p', { class: 'hint', text: 'Opções: ' + p.opcoes.join('; ') + (p.permite_outro ? '; e "Outra resposta"' : '') + '.' }) : null,
            etiquetas,
            el('div', { class: 'acoes' }, [
              botao('Editar', rotulo, { 'data-acao': 'editar-pergunta', 'data-id': p.id }),
              botao('Subir', rotulo, { 'data-acao': 'subir-pergunta', 'data-id': p.id, 'aria-disabled': j === 0 ? 'true' : null }),
              botao('Descer', rotulo, { 'data-acao': 'descer-pergunta', 'data-id': p.id, 'aria-disabled': j === lista.length - 1 ? 'true' : null }),
              botao(p.ativa ? 'Ocultar' : 'Mostrar', rotulo, { 'data-acao': 'ativa-pergunta', 'data-id': p.id }),
              botao('Excluir', rotulo, { 'data-acao': 'excluir-pergunta', 'data-id': p.id, class: 'btn btn-perigo btn-pequeno' })
            ])
          ]));
        });
        bloco.appendChild(ol);
      }
      v.appendChild(bloco);
    });

    v.querySelector('h2').textContent = 'Perguntas do questionário (' + totalPergunta + ')';
    if (focoDepois) focar(v.querySelector(focoDepois) || v.querySelector('h2'));
  }

  function proximaOrdem(lista) {
    return lista.reduce(function (m, x) { return Math.max(m, x.ordem || 0); }, 0) + 10;
  }

  /* Reordena uma lista e grava só os itens que mudaram de posição. */
  function gravarOrdem(tabela, lista) {
    var mudancas = [];
    lista.forEach(function (item, i) {
      var nova = (i + 1) * 10;
      if (item.ordem !== nova) { item.ordem = nova; mudancas.push(api.atualizar(tabela, item.id, { ordem: nova })); }
    });
    return Promise.all(mudancas);
  }

  function mover(tabela, lista, item, delta, botaoUsado, descricao) {
    var i = lista.indexOf(item);
    var j = i + delta;
    if (j < 0 || j >= lista.length) {
      VI.anunciar(delta < 0 ? descricao + ' já está na primeira posição.' : descricao + ' já está na última posição.');
      return;
    }
    lista.splice(i, 1);
    lista.splice(j, 0, item);
    gravarOrdem(tabela, lista).then(function () {
      viewPerguntas('button[data-acao="' + botaoUsado.getAttribute('data-acao') + '"][data-id="' + item.id + '"]');
      VI.anunciar(descricao + ' movida para a posição ' + (j + 1) + ' de ' + lista.length + '.');
    }, function (erro) { falha(erro); carregarTudo().then(function () { viewPerguntas(); }); });
  }

  function aoAgirPerguntas(e) {
    var b = e.target.closest('button[data-acao]');
    if (!b) return;
    var acao = b.getAttribute('data-acao');
    var id = b.getAttribute('data-id');
    var secao = estado.secoes.filter(function (s) { return s.id === id; })[0];
    var pergunta = estado.perguntas.filter(function (p) { return p.id === id; })[0];

    if (acao === 'nova-secao') return abrirSecao(null, b);
    if (acao === 'editar-secao') return abrirSecao(secao, b);
    if (acao === 'nova-pergunta') return abrirPergunta(null, secao.id, b);
    if (acao === 'editar-pergunta') return abrirPergunta(pergunta, pergunta.secao_id, b);
    if (acao === 'subir-secao' || acao === 'descer-secao') {
      return mover('secoes', secoesOrdenadas(), secao, acao === 'subir-secao' ? -1 : 1, b, 'Seção ' + secao.titulo);
    }
    if (acao === 'subir-pergunta' || acao === 'descer-pergunta') {
      return mover('perguntas', perguntasDa(pergunta.secao_id), pergunta, acao === 'subir-pergunta' ? -1 : 1, b, 'Pergunta');
    }
    if (acao === 'ativa-pergunta') {
      api.atualizar('perguntas', pergunta.id, { ativa: !pergunta.ativa }).then(function (n) {
        Object.assign(pergunta, n);
        viewPerguntas('button[data-acao="ativa-pergunta"][data-id="' + pergunta.id + '"]');
        VI.anunciar(pergunta.ativa ? 'Pergunta visível para os clientes.' : 'Pergunta oculta. Os clientes não a verão mais, e as respostas já dadas continuam guardadas.');
      }, falha);
      return;
    }
    if (acao === 'excluir-pergunta') {
      confirmar({
        titulo: 'Excluir esta pergunta?',
        texto: '"' + pergunta.texto + '" será removida do questionário. Respostas que já foram dadas a ela continuam guardadas, com o texto da pergunta. Se preferir poder voltar atrás, use "Ocultar".',
        botao: 'Excluir pergunta'
      }, b).then(function (ok) {
        if (!ok) return;
        var secaoId = pergunta.secao_id;
        api.excluir('perguntas', pergunta.id).then(function () {
          estado.perguntas = estado.perguntas.filter(function (p) { return p.id !== pergunta.id; });
          viewPerguntas('#adm-secao-' + secaoId);
          VI.anunciar('Pergunta excluída.');
        }, falha);
      });
      return;
    }
    if (acao === 'excluir-secao') {
      var n = perguntasDa(secao.id).length;
      confirmar({
        titulo: 'Excluir a seção "' + secao.titulo + '"?',
        texto: n ? 'As ' + n + ' perguntas desta seção também serão excluídas. Respostas já dadas continuam guardadas, com o texto das perguntas. Esta ação não pode ser desfeita.' : 'A seção está vazia. Esta ação não pode ser desfeita.',
        botao: 'Excluir seção'
      }, b).then(function (ok) {
        if (!ok) return;
        api.excluir('secoes', secao.id).then(function () {
          estado.secoes = estado.secoes.filter(function (s) { return s.id !== secao.id; });
          estado.perguntas = estado.perguntas.filter(function (p) { return p.secao_id !== secao.id; });
          viewPerguntas('h2');
          VI.anunciar('Seção excluída.');
        }, falha);
      });
    }
  }

  /* Diálogo de seção */
  var formSecao = document.getElementById('form-secao');
  var secaoEditando = null;
  function abrirSecao(secao, opener) {
    secaoEditando = secao;
    limparErros(formSecao);
    document.getElementById('titulo-dialogo-secao').textContent = secao ? 'Editar seção' : 'Nova seção';
    formSecao.querySelector('#secao-titulo').value = secao ? secao.titulo : '';
    formSecao.querySelector('#secao-descricao').value = secao ? (secao.descricao || '') : '';
    VI.abrirDialogo(dlgSecao, opener);
  }
  formSecao.addEventListener('submit', function (e) {
    e.preventDefault();
    limparErros(formSecao);
    var t = formSecao.querySelector('#secao-titulo');
    if (!t.value.trim()) { erroCampo(t, 'Informe o título da seção.'); focar(t); return; }
    var dadosSecao = { titulo: t.value.trim(), descricao: formSecao.querySelector('#secao-descricao').value.trim() || null };
    var acao = secaoEditando
      ? api.atualizar('secoes', secaoEditando.id, dadosSecao)
      : api.inserir('secoes', Object.assign({ ordem: proximaOrdem(estado.secoes) }, dadosSecao));
    acao.then(function (s) {
      if (secaoEditando) Object.assign(secaoEditando, s); else estado.secoes.push(s);
      dlgSecao.close();
      viewPerguntas('#adm-secao-' + s.id);
      VI.anunciar(secaoEditando ? 'Seção salva.' : 'Seção criada.');
    }, falha);
  });

  /* Diálogo de pergunta */
  var formPergunta = document.getElementById('form-pergunta');
  var perguntaEditando = null;
  var campoOpcoesBloco = document.getElementById('bloco-opcoes');
  var campoOutroBloco = document.getElementById('bloco-permite-outro');

  function tipoSelecionado() {
    var r = formPergunta.querySelector('input[name="pergunta-tipo"]:checked');
    return r ? r.value : 'texto_longo';
  }
  function atualizarCamposDoTipo() {
    var escolha = tipoSelecionado() === 'escolha_unica' || tipoSelecionado() === 'multipla_escolha';
    campoOpcoesBloco.hidden = !escolha;
    campoOutroBloco.hidden = !escolha;
  }
  formPergunta.addEventListener('change', function (e) { if (e.target.name === 'pergunta-tipo') atualizarCamposDoTipo(); });

  function abrirPergunta(pergunta, secaoId, opener) {
    perguntaEditando = pergunta;
    limparErros(formPergunta);
    document.getElementById('titulo-dialogo-pergunta').textContent = pergunta ? 'Editar pergunta' : 'Nova pergunta';
    var sel = formPergunta.querySelector('#pergunta-secao');
    sel.textContent = '';
    secoesOrdenadas().forEach(function (s, i) {
      var o = el('option', { value: s.id, text: 'Seção ' + (i + 1) + ': ' + s.titulo });
      if (s.id === secaoId) o.selected = true;
      sel.appendChild(o);
    });
    formPergunta.querySelector('#pergunta-texto').value = pergunta ? pergunta.texto : '';
    formPergunta.querySelector('#pergunta-ajuda').value = pergunta ? (pergunta.ajuda || '') : '';
    var tipo = pergunta ? pergunta.tipo : 'texto_longo';
    formPergunta.querySelector('input[name="pergunta-tipo"][value="' + tipo + '"]').checked = true;
    formPergunta.querySelector('#pergunta-opcoes').value = pergunta ? (pergunta.opcoes || []).join('\n') : '';
    formPergunta.querySelector('#pergunta-obrigatoria').checked = pergunta ? pergunta.obrigatoria : false;
    formPergunta.querySelector('#pergunta-outro').checked = pergunta ? pergunta.permite_outro : false;
    formPergunta.querySelector('#pergunta-ativa').checked = pergunta ? pergunta.ativa : true;
    atualizarCamposDoTipo();
    VI.abrirDialogo(dlgPergunta, opener);
  }

  formPergunta.addEventListener('submit', function (e) {
    e.preventDefault();
    limparErros(formPergunta);
    var texto = formPergunta.querySelector('#pergunta-texto');
    var opcoesCampo = formPergunta.querySelector('#pergunta-opcoes');
    var tipo = tipoSelecionado();
    var escolha = tipo === 'escolha_unica' || tipo === 'multipla_escolha';
    var vistas = {};
    var opcoes = escolha ? opcoesCampo.value.split('\n').map(function (o) { return o.trim(); }).filter(function (o) {
      if (!o || vistas[o.toLowerCase()]) return false;
      vistas[o.toLowerCase()] = true;
      return true;
    }) : [];
    var primeiro = null;
    if (!texto.value.trim()) { erroCampo(texto, 'Escreva o texto da pergunta.'); primeiro = texto; }
    if (escolha && !opcoes.length) { erroCampo(opcoesCampo, 'Escreva pelo menos uma opção, uma por linha.'); primeiro = primeiro || opcoesCampo; }
    if (opcoes.length > 40) { erroCampo(opcoesCampo, 'Use no máximo 40 opções.'); primeiro = primeiro || opcoesCampo; }
    if (opcoes.some(function (o) { return o.length > 200; })) { erroCampo(opcoesCampo, 'Cada opção pode ter no máximo 200 caracteres.'); primeiro = primeiro || opcoesCampo; }
    if (primeiro) { focar(primeiro); return; }

    var secaoId = formPergunta.querySelector('#pergunta-secao').value;
    var dadosPergunta = {
      secao_id: secaoId,
      texto: texto.value.trim(),
      ajuda: formPergunta.querySelector('#pergunta-ajuda').value.trim() || null,
      tipo: tipo,
      opcoes: opcoes,
      obrigatoria: formPergunta.querySelector('#pergunta-obrigatoria').checked,
      permite_outro: escolha && formPergunta.querySelector('#pergunta-outro').checked,
      ativa: formPergunta.querySelector('#pergunta-ativa').checked
    };
    var mudouSecao = perguntaEditando && perguntaEditando.secao_id !== secaoId;
    if (!perguntaEditando || mudouSecao) dadosPergunta.ordem = proximaOrdem(perguntasDa(secaoId));
    var acao = perguntaEditando
      ? api.atualizar('perguntas', perguntaEditando.id, dadosPergunta)
      : api.inserir('perguntas', dadosPergunta);
    acao.then(function (p) {
      if (perguntaEditando) Object.assign(perguntaEditando, p); else estado.perguntas.push(p);
      dlgPergunta.close();
      viewPerguntas('#adm-pergunta-' + p.id);
      VI.anunciar(perguntaEditando ? 'Pergunta salva.' : 'Pergunta criada no fim da seção.');
    }, falha);
  });

  /* ---------- Respostas ---------- */
  function viewRespostas(conviteId) {
    var v = conteudoView;
    if (!conviteId) {
      v.appendChild(el('h2', { tabindex: '-1', text: 'Respostas' }));
      var comResposta = estado.convites.filter(function (c) { return c.status !== 'pendente'; });
      if (!comResposta.length) {
        v.appendChild(el('p', { text: 'Nenhum cliente começou a responder ainda.' }));
        return;
      }
      v.appendChild(el('p', { text: 'Clientes que já enviaram ou começaram a responder, do mais recente para o mais antigo.' }));
      var ul = el('ul', { class: 'lista-cartoes', role: 'list' });
      comResposta.forEach(function (c) {
        var nome = c.nome_contato + (c.organizacao ? ' (' + c.organizacao + ')' : '');
        var sit = SITUACOES[c.status];
        ul.appendChild(el('li', {}, [
          el('h3', {}, [el('a', { href: '#respostas/' + c.id, text: nome })]),
          el('p', {}, [el('span', { class: sit.classe, text: sit.texto }), c.enviado_em ? ' em ' + dataHora(c.enviado_em) : ''])
        ]));
      });
      v.appendChild(ul);
      return;
    }

    var c = estado.convites.filter(function (x) { return x.id === conviteId; })[0];
    if (!c) {
      v.appendChild(el('h2', { tabindex: '-1', text: 'Cliente não encontrado' }));
      v.appendChild(el('p', {}, [el('a', { href: '#respostas', text: 'Voltar para a lista de respostas' })]));
      return;
    }
    var nome = c.nome_contato + (c.organizacao ? ' (' + c.organizacao + ')' : '');
    v.appendChild(el('h2', { tabindex: '-1', text: 'Respostas de ' + nome }));
    v.appendChild(el('p', { class: 'nao-imprimir' }, [el('a', { href: '#respostas', text: 'Voltar para a lista de respostas' })]));
    var corpo = el('div', {}, [el('p', { class: 'carregando', text: 'Carregando respostas…' })]);
    v.appendChild(corpo);

    api.listar('respostas', 'select=*&convite_id=eq.' + encodeURIComponent(c.id)).then(function (respostas) {
      corpo.textContent = '';
      var sit = SITUACOES[c.status];
      var meta = el('dl', { class: 'meta' }, [
        el('dt', { text: 'Situação' }), el('dd', {}, [el('span', { class: sit.classe, text: sit.texto })])
      ]);
      if (c.iniciado_em) { meta.appendChild(el('dt', { text: 'Começou em' })); meta.appendChild(el('dd', { text: dataHora(c.iniciado_em) })); }
      if (c.enviado_em) { meta.appendChild(el('dt', { text: 'Enviado em' })); meta.appendChild(el('dd', { text: dataHora(c.enviado_em) })); }
      if (c.email) { meta.appendChild(el('dt', { text: 'E-mail' })); meta.appendChild(el('dd', { text: c.email })); }
      corpo.appendChild(meta);
      if (c.status !== 'enviado') corpo.appendChild(el('p', { class: 'aviso', text: 'Este cliente ainda não enviou o questionário. As respostas abaixo são as que ele já salvou e podem mudar.' }));

      var porPergunta = {};
      (respostas || []).forEach(function (r) { if (r.pergunta_id) porPergunta[r.pergunta_id] = r; });
      var linhasTexto = ['Respostas de ' + nome, ''];

      var bImprimir = el('button', { type: 'button', class: 'btn btn-secondary btn-pequeno', text: 'Imprimir ou salvar em PDF' });
      bImprimir.addEventListener('click', function () { window.print(); });
      var bCopiar = el('button', { type: 'button', class: 'btn btn-secondary btn-pequeno', text: 'Copiar tudo como texto' });
      corpo.appendChild(el('div', { class: 'acoes nao-imprimir' }, [bImprimir, bCopiar]));

      var respondidas = 0;
      secoesOrdenadas().forEach(function (s) {
        var lista = perguntasDa(s.id).filter(function (p) { return p.ativa || porPergunta[p.id]; });
        if (!lista.length) return;
        var dl = el('dl', { class: 'respostas-lista' });
        linhasTexto.push('== ' + s.titulo + ' ==');
        lista.forEach(function (p) {
          var r = porPergunta[p.id];
          var textoP = r ? r.pergunta_texto : p.texto;
          var valor = r ? formatarValor(r.valor) : '';
          if (valor) respondidas++;
          dl.appendChild(el('dt', { text: textoP }));
          dl.appendChild(valor ? el('dd', { text: valor }) : el('dd', { class: 'sem-resposta', text: 'Sem resposta' }));
          linhasTexto.push(textoP, valor || '(sem resposta)', '');
        });
        corpo.appendChild(el('section', { class: 'respostas-secao', 'aria-label': s.titulo }, [el('h3', { text: s.titulo }), dl]));
      });

      var orfas = (respostas || []).filter(function (r) { return !r.pergunta_id; });
      if (orfas.length) {
        var dlO = el('dl', { class: 'respostas-lista' });
        linhasTexto.push('== Perguntas excluídas depois da resposta ==');
        orfas.sort(function (a, b) { return (a.secao_ordem - b.secao_ordem) || (a.pergunta_ordem - b.pergunta_ordem); }).forEach(function (r) {
          var valor = formatarValor(r.valor);
          respondidas++;
          dlO.appendChild(el('dt', { text: r.pergunta_texto + ' (seção ' + r.secao_titulo + ')' }));
          dlO.appendChild(el('dd', { text: valor }));
          linhasTexto.push(r.pergunta_texto, valor, '');
        });
        corpo.appendChild(el('section', { class: 'respostas-secao', 'aria-label': 'Perguntas excluídas depois da resposta' }, [el('h3', { text: 'Perguntas excluídas depois da resposta' }), dlO]));
      }
      meta.appendChild(el('dt', { text: 'Respondidas' }));
      meta.appendChild(el('dd', { text: String(respondidas) }));
      bCopiar.addEventListener('click', function () { copiar(linhasTexto.join('\n'), 'Respostas copiadas como texto.'); });
    }, falha);
  }

  function formatarValor(v) {
    if (!v) return '';
    if (v.texto) return v.texto;
    if (v.opcao) return v.opcao === '__outro__' ? 'Outra resposta: ' + (v.outro || '') : v.opcao;
    var partes = (v.opcoes || []).slice();
    if (v.outro) partes.push('Outra resposta: ' + v.outro);
    return partes.join('; ');
  }

  /* ---------- Atalho Alt+3 nesta página ---------- */
  VI.definirAtalho('3', 'Ir para o título da área atual do painel', function () {
    focar((conteudoView && conteudoView.querySelector('h2')) || titulo);
  });

  /* ---------- Início ---------- */
  (function iniciar() {
    var hash = window.location.hash.slice(1);
    if (hash.indexOf('access_token=') !== -1) {
      var params = new URLSearchParams(hash);
      api.adotarSessaoDaUrl(params);
      history.replaceState(null, '', '/painel/');
      if (params.get('type') === 'recovery') { mostrarNovaSenha(); return; }
      iniciarPainel(true);
      return;
    }
    if (hash.indexOf('error=') !== -1) {
      history.replaceState(null, '', '/painel/');
      mostrarLogin('O link de recuperação expirou ou já foi usado. Peça um novo em "Esqueci minha senha".');
      return;
    }
    if (api.sessao()) iniciarPainel(false); else mostrarLogin();
  })();
})();
