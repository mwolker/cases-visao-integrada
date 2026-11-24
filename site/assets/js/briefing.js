/* ==========================================================================
   Questionário de briefing · página do cliente (/briefing/?c=TOKEN)
   Princípios: campos nativos com rótulo visível, obrigatoriedade escrita por
   extenso, erros listados num resumo com links e repetidos junto do campo,
   salvamento automático silencioso (sem interromper o leitor de tela) e
   confirmação antes do envio definitivo.
   ========================================================================== */
(function () {
  'use strict';

  var api = window.BriefingApi;
  var VI = window.VI || { anunciar: function () {}, abrirDialogo: function (d) { d.showModal(); }, prepararDialogo: function () {}, definirAtalho: function () {} };

  var area = document.getElementById('area-briefing');
  var titulo = document.getElementById('titulo-pagina');
  var carregando = document.getElementById('msg-carregando');
  var dialogoEnvio = document.getElementById('dialogo-enviar');
  var textoEnvio = document.getElementById('texto-envio');
  var btnConfirmarEnvio = document.getElementById('btn-confirmar-envio');

  var token = new URLSearchParams(window.location.search).get('c') || '';
  var dados = null;          // retorno de briefing_carregar
  var perguntas = [];        // lista plana, na ordem de exibição
  var form = null;
  var sujo = false;          // há alterações ainda não salvas
  var salvando = null;       // promessa do salvamento em andamento
  var timerSalvar = null;
  var enviado = false;

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
  function hora(d) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function dataHora(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) + ', às ' + hora(d);
  }
  function focar(alvo) {
    if (!alvo) return;
    if (!alvo.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) alvo.setAttribute('tabindex', '-1');
    alvo.focus({ preventScroll: true });
    alvo.scrollIntoView({ block: 'center' });
  }

  /* ---------- Estados da página ---------- */
  function mostrarErroFatal(tituloTexto, mensagem) {
    titulo.textContent = tituloTexto;
    document.title = tituloTexto + ' · Questionário de briefing · Visão Integrada';
    limparArea();
    area.appendChild(el('p', { text: mensagem }));
    area.appendChild(el('p', {}, [
      'Se precisar de ajuda, escreva para ',
      el('a', { href: 'mailto:contato@visaointegrada.net.br?subject=Questionário%20de%20briefing', text: 'contato@visaointegrada.net.br' }),
      '.'
    ]));
    focar(titulo);
  }
  function limparArea() {
    Array.prototype.slice.call(area.children).forEach(function (c) { if (c !== titulo) c.remove(); });
  }

  /* ---------- Valores das respostas ---------- */
  function lerValor(p) {
    var nome = 'q-' + p.id;
    if (p.tipo === 'texto_curto' || p.tipo === 'texto_longo') {
      var campo = document.getElementById('campo-' + p.id);
      var t = campo ? campo.value.trim() : '';
      return t ? { texto: campo.value } : null;
    }
    var outroCampo = document.getElementById('outro-' + p.id);
    var outro = outroCampo ? outroCampo.value.trim() : '';
    if (p.tipo === 'escolha_unica') {
      var marcado = form.querySelector('input[name="' + nome + '"]:checked');
      if (!marcado) return null;
      if (marcado.value === '__outro__') return outro ? { opcao: '__outro__', outro: outro } : null;
      return { opcao: marcado.value };
    }
    var opcoes = Array.prototype.map.call(form.querySelectorAll('input[name="' + nome + '"]:checked'), function (i) { return i.value; });
    if (!opcoes.length && !outro) return null;
    var v = { opcoes: opcoes };
    if (outro) v.outro = outro;
    return v;
  }
  function coletar() {
    var r = {};
    perguntas.forEach(function (p) { r[p.id] = lerValor(p) || {}; });
    return r;
  }
  function formatarValor(p, v) {
    if (!v) return '';
    if (v.texto) return v.texto;
    if (v.opcao) return v.opcao === '__outro__' ? 'Outra resposta: ' + (v.outro || '') : v.opcao;
    var partes = (v.opcoes || []).slice();
    if (v.outro) partes.push('Outra resposta: ' + v.outro);
    return partes.join('; ');
  }

  /* ---------- Montagem do formulário ---------- */
  function rotuloObrigatoria(p) {
    return p.obrigatoria ? el('span', { class: 'obrigatoria', text: ' (obrigatória)' }) : null;
  }

  function montarPergunta(p, numero, valor) {
    var idHint = p.ajuda ? 'hint-' + p.id : null;
    var idErro = 'erro-' + p.id;
    var textoRotulo = numero + '. ' + p.texto;
    var bloco;

    if (p.tipo === 'texto_curto' || p.tipo === 'texto_longo') {
      var campo = p.tipo === 'texto_curto'
        ? el('input', { type: 'text', class: 'campo-texto', id: 'campo-' + p.id, name: 'q-' + p.id, maxlength: '500', autocomplete: 'off', 'aria-describedby': idHint, required: p.obrigatoria })
        : el('textarea', { class: 'campo-area', id: 'campo-' + p.id, name: 'q-' + p.id, rows: '5', maxlength: '10000', 'aria-describedby': idHint, required: p.obrigatoria });
      campo.value = (valor && valor.texto) || '';
      bloco = el('div', { class: 'pergunta', id: 'q-' + p.id, 'data-pergunta': p.id }, [
        el('label', { for: 'campo-' + p.id }, [textoRotulo, rotuloObrigatoria(p)]),
        idHint ? el('p', { class: 'hint', id: idHint, text: p.ajuda }) : null,
        el('p', { class: 'msg-erro', id: idErro, hidden: true }),
        campo
      ]);
      return bloco;
    }

    var tipoInput = p.tipo === 'escolha_unica' ? 'radio' : 'checkbox';
    var selecionadas = valor ? (valor.opcoes || (valor.opcao ? [valor.opcao] : [])) : [];
    var lista = el('ul', { class: 'lista-opcoes', role: 'list' });
    p.opcoes.forEach(function (op, i) {
      var id = 'op-' + p.id + '-' + i;
      var input = el('input', { type: tipoInput, id: id, name: 'q-' + p.id, value: op });
      input.checked = selecionadas.indexOf(op) !== -1;
      lista.appendChild(el('li', {}, [el('label', { class: 'opcao', for: id }, [input, el('span', { text: op })])]));
    });

    var blocoOutro = null;
    if (p.permite_outro) {
      var campoOutro = el('input', { type: 'text', class: 'campo-texto campo-limite', id: 'outro-' + p.id, maxlength: '2000', autocomplete: 'off' });
      campoOutro.value = (valor && valor.outro) || '';
      if (p.tipo === 'escolha_unica') {
        var idOutroRadio = 'op-' + p.id + '-outro';
        var radioOutro = el('input', { type: 'radio', id: idOutroRadio, name: 'q-' + p.id, value: '__outro__' });
        radioOutro.checked = valor && valor.opcao === '__outro__';
        lista.appendChild(el('li', {}, [el('label', { class: 'opcao', for: idOutroRadio }, [radioOutro, el('span', { text: 'Outra resposta' })])]));
        // Digitar no campo marca automaticamente a opção "Outra resposta".
        campoOutro.addEventListener('input', function () { if (campoOutro.value.trim()) radioOutro.checked = true; });
        blocoOutro = el('div', { class: 'outro' }, [el('label', { for: 'outro-' + p.id, text: 'Descreva a outra resposta' }), campoOutro]);
      } else {
        blocoOutro = el('div', { class: 'outro' }, [el('label', { for: 'outro-' + p.id, text: 'Outras respostas (opcional)' }), campoOutro]);
      }
    }

    bloco = el('fieldset', { class: 'pergunta', id: 'q-' + p.id, 'data-pergunta': p.id, 'aria-describedby': idHint }, [
      el('legend', {}, [textoRotulo, rotuloObrigatoria(p)]),
      idHint ? el('p', { class: 'hint', id: idHint, text: p.ajuda }) : null,
      el('p', { class: 'msg-erro', id: idErro, hidden: true }),
      lista,
      blocoOutro
    ]);
    if (p.obrigatoria && tipoInput === 'radio') {
      // Leitores de tela anunciam "obrigatório" no grupo de botões de opção.
      lista.querySelectorAll('input').forEach(function (i) { i.required = true; });
    }
    return bloco;
  }

  function montarFormulario() {
    var c = dados.convite;
    var saudacao = 'Olá' + (c.nome_contato ? ', ' + c.nome_contato : '') + '!';
    titulo.textContent = 'Questionário de briefing';
    limparArea();

    area.appendChild(el('p', { class: 'lead' }, [
      saudacao + ' Este questionário reúne as informações que eu preciso para preparar a proposta do seu projeto' +
      (c.organizacao ? ' para ' + c.organizacao : '') + '.'
    ]));

    var total = perguntas.length;
    var obrigatorias = perguntas.filter(function (p) { return p.obrigatoria; }).length;

    var caixa = el('div', { class: 'caixa' }, [
      el('h2', { text: 'Como responder' }),
      el('ul', {}, [
        el('li', { text: 'São ' + total + ' perguntas, divididas em ' + dados.secoes.length + ' seções. ' + (obrigatorias === 1 ? 'Apenas 1 é obrigatória' : 'Apenas ' + obrigatorias + ' são obrigatórias') + ' e estão indicadas pela palavra "obrigatória".' }),
        el('li', { text: 'Responda no seu ritmo. As respostas são salvas automaticamente sempre que você sai de um campo. Você também pode usar o botão "Salvar respostas", no fim da página.' }),
        el('li', { text: 'Pode fechar a página e voltar depois pelo mesmo link: as respostas salvas estarão aqui.' }),
        el('li', {}, ['O atalho ', el('kbd', { text: 'Alt' }), ' + ', el('kbd', { text: '3' }), ' leva à próxima pergunta sem resposta. O botão "Acessibilidade", no topo, ajusta fonte, cores e espaçamentos.'])
      ]),
      el('p', { class: 'progresso', id: 'progresso' }),
      el('div', { class: 'barra', 'aria-hidden': 'true' }, [el('span', { id: 'barra-progresso' })]),
      el('p', { class: 'salvamento', id: 'salvamento', text: 'Nenhuma alteração feita nesta visita.' })
    ]);
    area.appendChild(caixa);

    var indiceLista = el('ol');
    dados.secoes.forEach(function (s, i) {
      indiceLista.appendChild(el('li', {}, [
        el('a', { href: '#secao-' + (i + 1) }, [s.titulo, el('span', { class: 'contagem', id: 'contagem-secao-' + (i + 1) })])
      ]));
    });
    area.appendChild(el('nav', { class: 'indice caixa', 'aria-labelledby': 'titulo-indice' }, [
      el('h2', { id: 'titulo-indice', text: 'Seções do questionário' }),
      indiceLista
    ]));

    area.appendChild(el('div', { id: 'resumo-erros', class: 'resumo-erros', hidden: true }));

    form = el('form', { id: 'form-briefing', novalidate: true, 'aria-labelledby': 'titulo-pagina' });
    var numero = 0;
    dados.secoes.forEach(function (s, i) {
      var sec = el('section', { class: 'secao-form', id: 'secao-' + (i + 1), 'aria-labelledby': 'titulo-secao-' + (i + 1) }, [
        el('h2', { id: 'titulo-secao-' + (i + 1), tabindex: '-1', text: (i + 1) + '. ' + s.titulo }),
        s.descricao ? el('p', { class: 'descricao', text: s.descricao }) : null
      ]);
      s.perguntas.forEach(function (p) {
        numero++;
        p.numero = numero;
        p.secaoIndice = i + 1;
        sec.appendChild(montarPergunta(p, numero, dados.respostas[p.id]));
      });
      form.appendChild(sec);
    });

    form.appendChild(el('div', { class: 'acoes acoes-fim' }, [
      el('button', { type: 'button', class: 'btn btn-secondary', id: 'btn-salvar', text: 'Salvar respostas' }),
      el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-revisar', text: 'Revisar e enviar' })
    ]));
    area.appendChild(form);

    form.addEventListener('input', aoDigitar);
    form.addEventListener('change', aoMudar);
    form.addEventListener('submit', aoEnviar);
    document.getElementById('btn-salvar').addEventListener('click', function () { salvarAgora(true); });

    // Links do índice levam o foco ao título da seção.
    indiceLista.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      focar(document.getElementById('titulo-' + a.getAttribute('href').slice(1)));
    });

    atualizarProgresso();
    VI.definirAtalho('3', 'Ir para a próxima pergunta sem resposta', irParaProximaSemResposta);
  }

  /* ---------- Progresso (atualizado em silêncio, sem região viva) ---------- */
  function atualizarProgresso() {
    var respondidas = 0;
    var porSecao = {};
    perguntas.forEach(function (p) {
      var ok = !!lerValor(p);
      if (ok) respondidas++;
      porSecao[p.secaoIndice] = porSecao[p.secaoIndice] || { feitas: 0, total: 0 };
      porSecao[p.secaoIndice].total++;
      if (ok) porSecao[p.secaoIndice].feitas++;
    });
    var total = perguntas.length;
    document.getElementById('progresso').textContent = respondidas + ' de ' + total + ' perguntas respondidas.';
    document.getElementById('barra-progresso').style.width = (total ? Math.round(respondidas / total * 100) : 0) + '%';
    Object.keys(porSecao).forEach(function (i) {
      var s = porSecao[i];
      var alvo = document.getElementById('contagem-secao-' + i);
      if (alvo) alvo.textContent = '(' + s.feitas + ' de ' + s.total + (s.total === 1 ? ' respondida)' : ' respondidas)');
    });
  }

  function irParaProximaSemResposta() {
    if (!form) return;
    var atual = document.activeElement && document.activeElement.closest ? document.activeElement.closest('[data-pergunta]') : null;
    var inicio = 0;
    if (atual) {
      for (var k = 0; k < perguntas.length; k++) if (perguntas[k].id === atual.getAttribute('data-pergunta')) { inicio = k + 1; break; }
    }
    for (var n = 0; n < perguntas.length; n++) {
      var p = perguntas[(inicio + n) % perguntas.length];
      if (!lerValor(p)) {
        var bloco = document.getElementById('q-' + p.id);
        focar(bloco.querySelector('input, textarea'));
        return;
      }
    }
    VI.anunciar('Todas as perguntas foram respondidas.');
    focar(document.getElementById('btn-revisar'));
  }

  /* ---------- Salvamento ---------- */
  function aoDigitar() {
    sujo = true;
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(function () { salvarAgora(false); }, 4000);
  }
  function aoMudar(e) {
    sujo = true;
    atualizarProgresso();
    var bloco = e.target.closest('[data-pergunta]');
    if (bloco && bloco.classList.contains('tem-erro')) {
      var p = perguntas.filter(function (x) { return x.id === bloco.getAttribute('data-pergunta'); })[0];
      if (p && lerValor(p)) limparErroPergunta(p);
    }
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(function () { salvarAgora(false); }, 600);
  }

  /* manual = true: o resultado é anunciado; false: só atualiza o texto visível. */
  function salvarAgora(manual) {
    clearTimeout(timerSalvar);
    if (enviado) return Promise.resolve();
    if (salvando) return salvando.then(function () { return salvarAgora(manual); });
    if (!sujo && !manual) return Promise.resolve();
    var status = document.getElementById('salvamento');
    var btn = document.getElementById('btn-salvar');
    if (manual && btn) btn.setAttribute('aria-disabled', 'true');
    sujo = false;
    salvando = api.salvar(token, coletar(), false).then(function () {
      var msg = 'Respostas salvas às ' + hora(new Date()) + '.';
      if (status) status.textContent = (manual ? '' : 'Salvamento automático: ') + msg;
      if (manual) VI.anunciar(msg);
    }, function (erro) {
      sujo = true;
      var msg = 'Não foi possível salvar: ' + erro.message;
      if (status) status.textContent = msg;
      VI.anunciar(msg);
      if (erro.codigo === 'ja_enviado' || erro.codigo === 'link_invalido') carregar();
    }).then(function () {
      salvando = null;
      if (btn) btn.removeAttribute('aria-disabled');
    });
    return salvando;
  }

  window.addEventListener('beforeunload', function (e) {
    if (!enviado && (sujo || salvando)) {
      salvarAgora(false);
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ---------- Validação e envio ---------- */
  function mensagemObrigatoria(p) {
    if (p.tipo === 'escolha_unica') return 'Esta pergunta é obrigatória. Escolha uma opção.';
    if (p.tipo === 'multipla_escolha') return 'Esta pergunta é obrigatória. Marque pelo menos uma opção.';
    return 'Esta pergunta é obrigatória. Escreva uma resposta.';
  }
  function primeiroCampo(p) {
    return document.getElementById('q-' + p.id).querySelector('input, textarea');
  }
  function marcarErroPergunta(p) {
    var bloco = document.getElementById('q-' + p.id);
    var msg = document.getElementById('erro-' + p.id);
    msg.textContent = mensagemObrigatoria(p);
    msg.hidden = false;
    bloco.classList.add('tem-erro');
    var alvoDescricao = bloco.tagName === 'FIELDSET' ? bloco : primeiroCampo(p);
    var ids = (alvoDescricao.getAttribute('aria-describedby') || '').split(' ').filter(Boolean);
    if (ids.indexOf('erro-' + p.id) === -1) ids.unshift('erro-' + p.id);
    alvoDescricao.setAttribute('aria-describedby', ids.join(' '));
    if (bloco.tagName !== 'FIELDSET') primeiroCampo(p).setAttribute('aria-invalid', 'true');
  }
  function limparErroPergunta(p) {
    var bloco = document.getElementById('q-' + p.id);
    var msg = document.getElementById('erro-' + p.id);
    msg.hidden = true;
    msg.textContent = '';
    bloco.classList.remove('tem-erro');
    var alvoDescricao = bloco.tagName === 'FIELDSET' ? bloco : primeiroCampo(p);
    var ids = (alvoDescricao.getAttribute('aria-describedby') || '').split(' ').filter(function (i) { return i && i !== 'erro-' + p.id; });
    if (ids.length) alvoDescricao.setAttribute('aria-describedby', ids.join(' '));
    else alvoDescricao.removeAttribute('aria-describedby');
    if (bloco.tagName !== 'FIELDSET') primeiroCampo(p).removeAttribute('aria-invalid');
    // Atualiza o resumo de erros, se ainda houver outros.
    var item = document.getElementById('item-erro-' + p.id);
    if (item) item.remove();
    var resumo = document.getElementById('resumo-erros');
    if (resumo && !resumo.hidden) {
      var restantes = resumo.querySelectorAll('li').length;
      if (!restantes) { resumo.hidden = true; resumo.textContent = ''; }
      else resumo.querySelector('h2').textContent = tituloResumo(restantes);
    }
  }
  function tituloResumo(n) {
    return n === 1 ? 'Falta responder 1 pergunta obrigatória' : 'Faltam responder ' + n + ' perguntas obrigatórias';
  }

  function mostrarErros(lista) {
    perguntas.forEach(function (p) { if (lista.indexOf(p) === -1 && document.getElementById('q-' + p.id).classList.contains('tem-erro')) limparErroPergunta(p); });
    lista.forEach(marcarErroPergunta);
    var resumo = document.getElementById('resumo-erros');
    resumo.textContent = '';
    var ul = el('ul');
    lista.forEach(function (p) {
      var a = el('a', { href: '#q-' + p.id, text: 'Pergunta ' + p.numero + ': ' + p.texto });
      a.addEventListener('click', function (e) { e.preventDefault(); focar(primeiroCampo(p)); });
      ul.appendChild(el('li', { id: 'item-erro-' + p.id }, [a]));
    });
    resumo.appendChild(el('h2', { tabindex: '-1', text: tituloResumo(lista.length) }));
    resumo.appendChild(el('p', { text: 'Use os links abaixo para ir direto a cada pergunta. As demais respostas já estão salvas.' }));
    resumo.appendChild(ul);
    resumo.hidden = false;
    focar(resumo.querySelector('h2'));
  }

  function aoEnviar(e) {
    e.preventDefault();
    var faltando = perguntas.filter(function (p) { return p.obrigatoria && !lerValor(p); });
    if (faltando.length) {
      salvarAgora(false);
      mostrarErros(faltando);
      return;
    }
    var respondidas = perguntas.filter(function (p) { return !!lerValor(p); }).length;
    textoEnvio.textContent = 'Você respondeu ' + respondidas + ' de ' + perguntas.length + ' perguntas. ' +
      'Depois do envio, as respostas não poderão mais ser alteradas por este link. ' +
      'Se quiser conferir algo antes, escolha "Voltar e revisar".';
    salvarAgora(false);
    VI.abrirDialogo(dialogoEnvio, document.getElementById('btn-revisar'));
  }

  btnConfirmarEnvio.addEventListener('click', function () {
    btnConfirmarEnvio.setAttribute('aria-disabled', 'true');
    btnConfirmarEnvio.textContent = 'Enviando…';
    var esperar = salvando || Promise.resolve();
    esperar.then(function () {
      return api.salvar(token, coletar(), true);
    }).then(function (r) {
      if (r && r.ok) {
        enviado = true;
        sujo = false;
        dialogoEnvio.close();
        return carregar(true);
      }
      dialogoEnvio.close();
      var ids = (r && r.faltando) || [];
      mostrarErros(perguntas.filter(function (p) { return ids.indexOf(p.id) !== -1; }));
    }, function (erro) {
      dialogoEnvio.close();
      VI.anunciar('Não foi possível enviar: ' + erro.message);
      var status = document.getElementById('salvamento');
      if (status) status.textContent = 'Não foi possível enviar: ' + erro.message;
      if (erro.codigo === 'ja_enviado') carregar();
    }).then(function () {
      btnConfirmarEnvio.removeAttribute('aria-disabled');
      btnConfirmarEnvio.textContent = 'Enviar agora';
    });
  });

  /* ---------- Questionário já enviado: resumo para consulta e impressão ---------- */
  function montarEnviado(acabouDeEnviar) {
    var c = dados.convite;
    enviado = true;
    titulo.textContent = acabouDeEnviar ? 'Questionário enviado. Obrigado!' : 'Questionário já enviado';
    document.title = titulo.textContent + ' · Visão Integrada';
    limparArea();
    area.appendChild(el('div', { class: 'aviso aviso-ok' }, [
      el('p', {}, [
        el('strong', { text: 'Recebi suas respostas' }),
        c.enviado_em ? ' em ' + dataHora(c.enviado_em) + '.' : '.'
      ]),
      el('p', { text: 'Vou analisar tudo e entrar em contato para conversar sobre a proposta. Se precisar corrigir alguma resposta, escreva para contato@visaointegrada.net.br.' })
    ]));
    var btnImprimir = el('button', { type: 'button', class: 'btn btn-secondary nao-imprimir', text: 'Imprimir ou salvar em PDF' });
    btnImprimir.addEventListener('click', function () { window.print(); });
    area.appendChild(el('div', { class: 'acoes' }, [btnImprimir]));
    area.appendChild(el('h2', { text: 'Suas respostas', class: 'respostas-titulo' }));

    dados.secoes.forEach(function (s, i) {
      var dl = el('dl', { class: 'respostas-lista' });
      s.perguntas.forEach(function (p) {
        var v = formatarValor(p, dados.respostas[p.id]);
        dl.appendChild(el('dt', { text: p.texto }));
        dl.appendChild(v ? el('dd', { text: v }) : el('dd', { class: 'sem-resposta', text: 'Sem resposta' }));
      });
      area.appendChild(el('section', { class: 'respostas-secao', 'aria-labelledby': 'resp-secao-' + i }, [
        el('h3', { id: 'resp-secao-' + i, text: s.titulo }), dl
      ]));
    });
    VI.definirAtalho('3', 'Ir para as respostas enviadas', function () { focar(area.querySelector('h2')); });
    focar(titulo);
  }

  /* ---------- Carregamento ---------- */
  function carregar(acabouDeEnviar) {
    if (!/^[0-9a-f]{48}$/.test(token)) {
      mostrarErroFatal('Link incompleto', 'O endereço aberto não tem o código do questionário. Confira se o link foi copiado inteiro, incluindo a parte depois de "?c=".');
      return Promise.resolve();
    }
    return api.carregar(token).then(function (r) {
      dados = r;
      perguntas = [];
      dados.secoes.forEach(function (s) { s.perguntas.forEach(function (p) { perguntas.push(p); }); });
      if (dados.convite.status === 'enviado') {
        montarEnviado(acabouDeEnviar);
        return;
      }
      montarFormulario();
      VI.anunciar('Questionário carregado.');
    }, function (erro) {
      if (erro.codigo === 'link_invalido') {
        mostrarErroFatal('Link inválido ou desativado', 'Este link de questionário não existe mais ou foi desativado.');
      } else {
        mostrarErroFatal('Não foi possível carregar o questionário', erro.message);
      }
    });
  }

  VI.prepararDialogo(dialogoEnvio, { fecharNoFundo: false });
  if (carregando) carregando.textContent = 'Carregando o questionário…';
  carregar(false);
})();
