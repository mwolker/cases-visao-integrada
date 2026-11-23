/* Aplica as preferências salvas antes da primeira pintura, evitando "piscar" de tema ou tamanho. */
(function () {
  var root = document.documentElement;
  root.classList.add('js');
  var prefs = {};
  try {
    prefs = JSON.parse(window.localStorage.getItem('vi-prefs-v1') || '{}') || {};
  } catch (e) { prefs = {}; }
  var map = {
    tema: 'auto', tamanho: '100', fonte: 'padrao', linha: 'padrao',
    letras: 'padrao', palavras: 'padrao', largura: 'padrao'
  };
  for (var k in map) {
    root.setAttribute('data-' + k, typeof prefs[k] === 'string' ? prefs[k] : map[k]);
  }
  var flags = ['destacarLinks', 'focoAmpliado', 'semEfeitos', 'cursorAmpliado', 'regua'];
  for (var i = 0; i < flags.length; i++) {
    if (prefs[flags[i]] === true) root.classList.add('pref-' + flags[i]);
  }
  if (prefs.reduzirMovimento === true) root.classList.add('pref-reduzirMovimento');
  if (prefs.reduzirMovimento === false) root.classList.add('pref-permitirMovimento');
})();
