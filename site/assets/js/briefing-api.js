/* ==========================================================================
   Questionário de briefing · comunicação com o Supabase
   Cliente mínimo, sem bibliotecas externas (a CSP do site só permite scripts
   do próprio domínio). A chave publicável é pública por natureza: o acesso
   aos dados é controlado pelo banco (RLS e funções que validam o token).
   ========================================================================== */
(function () {
  'use strict';

  var URL_BASE = 'https://anwbexgrubprahnebudg.supabase.co';
  var CHAVE = 'sb_publishable_tpIqBnfc-NBzSHkYWV3BFQ_YVnLaWU4';
  var CHAVE_SESSAO = 'vi-painel-sessao-v1';

  /* Mensagens claras para os erros conhecidos do banco e da autenticação. */
  var MENSAGENS = {
    link_invalido: 'Este link não é válido ou foi desativado.',
    ja_enviado: 'Este questionário já foi enviado e não pode mais ser alterado.',
    dados_invalidos: 'Não foi possível entender os dados enviados. Recarregue a página e tente de novo.',
    dados_grandes_demais: 'As respostas ultrapassaram o tamanho permitido. Encurte os textos mais longos e tente de novo.',
    invalid_credentials: 'E-mail ou senha incorretos.',
    email_not_confirmed: 'Este e-mail ainda não foi confirmado.',
    over_request_rate_limit: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.',
    over_email_send_rate_limit: 'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.',
    same_password: 'A nova senha precisa ser diferente da atual.',
    weak_password: 'Senha fraca. Use pelo menos 10 caracteres, misturando letras, números e símbolos.',
    sessao_expirada: 'Sua sessão expirou. Entre novamente.',
    sem_conexao: 'Sem conexão com o servidor. Verifique a internet e tente de novo.'
  };

  function ErroApi(codigo, mensagem, status) {
    this.codigo = codigo;
    this.message = MENSAGENS[codigo] || mensagem || 'Ocorreu um erro inesperado. Tente de novo.';
    this.status = status || 0;
  }
  ErroApi.prototype = Object.create(Error.prototype);

  function lerErro(resposta) {
    return resposta.text().then(function (texto) {
      var dados = {};
      try { dados = JSON.parse(texto); } catch (e) { dados = {}; }
      // PostgREST: { message: 'link_invalido', code: 'P0001' } · Auth: { error_code, msg }
      var codigo = dados.error_code || dados.message || dados.error || '';
      if (resposta.status === 401 && !dados.error_code) codigo = 'sessao_expirada';
      throw new ErroApi(codigo, dados.msg || dados.error_description || dados.message, resposta.status);
    });
  }

  function requisicao(caminho, opcoes) {
    opcoes = opcoes || {};
    var cabecalhos = { apikey: CHAVE, 'Content-Type': 'application/json' };
    if (opcoes.token) cabecalhos.Authorization = 'Bearer ' + opcoes.token;
    if (opcoes.prefer) cabecalhos.Prefer = opcoes.prefer;
    return fetch(URL_BASE + caminho, {
      method: opcoes.metodo || 'GET',
      headers: cabecalhos,
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
      credentials: 'omit',
      cache: 'no-store'
    }).then(function (resposta) {
      if (!resposta.ok) return lerErro(resposta);
      if (resposta.status === 204) return null;
      return resposta.text().then(function (t) { return t ? JSON.parse(t) : null; });
    }, function () {
      throw new ErroApi('sem_conexao');
    });
  }

  /* ---------- Sessão do administrador ---------- */
  function lerSessao() {
    try { return JSON.parse(window.sessionStorage.getItem(CHAVE_SESSAO) || 'null'); } catch (e) { return null; }
  }
  function gravarSessao(dados) {
    var sessao = dados ? {
      access_token: dados.access_token,
      refresh_token: dados.refresh_token,
      expira_em: Date.now() + (Number(dados.expires_in) || 3600) * 1000,
      email: (dados.user && dados.user.email) || (lerSessao() || {}).email || ''
    } : null;
    try {
      if (sessao) window.sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
      else window.sessionStorage.removeItem(CHAVE_SESSAO);
    } catch (e) { /* armazenamento indisponível: a sessão vale até fechar a página */ }
    memoria = sessao;
    return sessao;
  }
  var memoria = lerSessao();

  var renovando = null;
  function renovar() {
    if (!memoria || !memoria.refresh_token) return Promise.reject(new ErroApi('sessao_expirada'));
    if (!renovando) {
      renovando = requisicao('/auth/v1/token?grant_type=refresh_token', {
        metodo: 'POST', corpo: { refresh_token: memoria.refresh_token }
      }).then(function (dados) {
        renovando = null;
        return gravarSessao(dados);
      }, function (erro) {
        renovando = null;
        gravarSessao(null);
        throw new ErroApi('sessao_expirada', erro.message, 401);
      });
    }
    return renovando;
  }

  function tokenValido() {
    if (!memoria) return Promise.reject(new ErroApi('sessao_expirada'));
    if (memoria.expira_em - Date.now() > 60000) return Promise.resolve(memoria.access_token);
    return renovar().then(function (s) { return s.access_token; });
  }

  /* Requisição autenticada: renova o token uma vez se o servidor recusar. */
  function autenticada(caminho, opcoes) {
    opcoes = opcoes || {};
    return tokenValido().then(function (token) {
      opcoes.token = token;
      return requisicao(caminho, opcoes).catch(function (erro) {
        if (erro.status !== 401) throw erro;
        return renovar().then(function (s) {
          opcoes.token = s.access_token;
          return requisicao(caminho, opcoes);
        });
      });
    });
  }

  window.BriefingApi = {
    ErroApi: ErroApi,

    /* Questionário do cliente (sem login) */
    carregar: function (token) {
      return requisicao('/rest/v1/rpc/briefing_carregar', { metodo: 'POST', corpo: { p_token: token } });
    },
    salvar: function (token, respostas, enviar) {
      return requisicao('/rest/v1/rpc/briefing_salvar', {
        metodo: 'POST', corpo: { p_token: token, p_respostas: respostas, p_enviar: !!enviar }
      });
    },

    /* Painel */
    sessao: function () { return memoria; },
    entrar: function (email, senha) {
      return requisicao('/auth/v1/token?grant_type=password', {
        metodo: 'POST', corpo: { email: email, password: senha }
      }).then(gravarSessao);
    },
    adotarSessaoDaUrl: function (params) {
      return gravarSessao({
        access_token: params.get('access_token'),
        refresh_token: params.get('refresh_token'),
        expires_in: params.get('expires_in')
      });
    },
    sair: function () {
      var token = memoria && memoria.access_token;
      gravarSessao(null);
      if (!token) return Promise.resolve();
      return requisicao('/auth/v1/logout', { metodo: 'POST', token: token }).catch(function () {});
    },
    recuperarSenha: function (email, destino) {
      return requisicao('/auth/v1/recover?redirect_to=' + encodeURIComponent(destino), {
        metodo: 'POST', corpo: { email: email }
      });
    },
    trocarSenha: function (novaSenha) {
      return autenticada('/auth/v1/user', { metodo: 'PUT', corpo: { password: novaSenha } });
    },
    usuario: function () {
      return autenticada('/auth/v1/user').then(function (u) {
        if (memoria && u && u.email) {
          memoria.email = u.email;
          try { window.sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(memoria)); } catch (e) { /* sem armazenamento */ }
        }
        return u;
      });
    },
    /* Acesso às tabelas (só funciona para administradores, por RLS) */
    listar: function (tabela, consulta) {
      return autenticada('/rest/v1/' + tabela + '?' + consulta);
    },
    inserir: function (tabela, dados) {
      return autenticada('/rest/v1/' + tabela, { metodo: 'POST', corpo: dados, prefer: 'return=representation' })
        .then(function (linhas) { return linhas && linhas[0]; });
    },
    atualizar: function (tabela, id, dados) {
      return autenticada('/rest/v1/' + tabela + '?id=eq.' + encodeURIComponent(id), {
        metodo: 'PATCH', corpo: dados, prefer: 'return=representation'
      }).then(function (linhas) { return linhas && linhas[0]; });
    },
    excluir: function (tabela, id) {
      return autenticada('/rest/v1/' + tabela + '?id=eq.' + encodeURIComponent(id), { metodo: 'DELETE' });
    }
  };
})();
