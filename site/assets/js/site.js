/* ==========================================================================
   Visão Integrada · Cases — comportamento
   Tudo aqui é aprimoramento progressivo: sem JavaScript, o conteúdo, os links
   e a navegação continuam funcionando. Nenhum atributo ARIA do conteúdo é
   reescrito em tempo de execução; o painel só muda a aparência.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var STORAGE_KEY = 'vi-prefs-v1';

  var DEFAULTS = {
    tema: 'auto', tamanho: '100', fonte: 'padrao', linha: 'padrao',
    letras: 'padrao', palavras: 'padrao', largura: 'padrao',
    destacarLinks: false, focoAmpliado: false, semEfeitos: false,
    cursorAmpliado: false, regua: false, atalhos: true,
    reduzirMovimento: null /* null = seguir o sistema */
  };
  var RADIO_KEYS = ['tema', 'tamanho', 'fonte', 'linha', 'letras', 'palavras', 'largura'];
  var FLAG_KEYS = ['destacarLinks', 'focoAmpliado', 'semEfeitos', 'cursorAmpliado', 'regua'];

  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  /* ---------- Armazenamento seguro ---------- */
  function load() {
    var saved = {};
    try { saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch (e) { saved = {}; }
    var prefs = {};
    for (var k in DEFAULTS) prefs[k] = Object.prototype.hasOwnProperty.call(saved, k) ? saved[k] : DEFAULTS[k];
    return prefs;
  }
  function save(prefs) {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (e) { /* armazenamento indisponível: preferências valem só nesta visita */ }
  }

  var prefs = load();

  /* ---------- Aplicação das preferências ---------- */
  function apply() {
    RADIO_KEYS.forEach(function (k) { root.setAttribute('data-' + k, String(prefs[k])); });
    FLAG_KEYS.forEach(function (k) { root.classList.toggle('pref-' + k, prefs[k] === true); });
    root.classList.toggle('pref-reduzirMovimento', prefs.reduzirMovimento === true);
    root.classList.toggle('pref-permitirMovimento', prefs.reduzirMovimento === false);
    if (!prefs.regua) hideRuler();
  }

  function systemReducesMotion() { return !!(mqReduce && mqReduce.matches); }

  /* ---------- Anúncios para leitores de tela ---------- */
  var announceTimer;
  function announce(msg) {
    var openDialog = document.querySelector('dialog[open]');
    var region = (openDialog && openDialog.querySelector('[data-anunciador]')) || document.getElementById('anunciador');
    if (!region) return;
    region.textContent = '';
    clearTimeout(announceTimer);
    announceTimer = setTimeout(function () { region.textContent = msg; }, 60);
  }

  /* ---------- Formulário do painel ---------- */
  var form = document.getElementById('form-prefs');

  function syncForm() {
    if (!form) return;
    RADIO_KEYS.forEach(function (k) {
      var input = form.querySelector('input[name="' + k + '"][value="' + prefs[k] + '"]');
      if (input) input.checked = true;
    });
    FLAG_KEYS.concat(['atalhos']).forEach(function (k) {
      var cb = form.querySelector('input[name="' + k + '"]');
      if (cb) cb.checked = prefs[k] === true;
    });
    var rm = form.querySelector('input[name="reduzirMovimento"]');
    if (rm) rm.checked = prefs.reduzirMovimento === null ? systemReducesMotion() : prefs.reduzirMovimento === true;
  }

  if (form) {
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    form.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.name) return;
      if (t.type === 'radio') prefs[t.name] = t.value;
      else if (t.type === 'checkbox') prefs[t.name] = t.checked;
      apply();
      save(prefs);
      renderShortcuts();
    });
  }

  var btnRestore = document.getElementById('btn-restaurar');
  if (btnRestore) {
    btnRestore.addEventListener('click', function () {
      prefs = JSON.parse(JSON.stringify(DEFAULTS));
      apply();
      save(prefs);
      syncForm();
      renderShortcuts();
      announce('Preferências restauradas para o padrão.');
    });
  }

  if (mqReduce && mqReduce.addEventListener) {
    mqReduce.addEventListener('change', function () { if (prefs.reduzirMovimento === null) syncForm(); });
  }

  /* ---------- Diálogos nativos ---------- */
  var openers = new WeakMap();

  function openDialog(dialog, opener) {
    if (!dialog || typeof dialog.showModal !== 'function') return;
    var current = document.querySelector('dialog[open]');
    if (current && current !== dialog) {
      // Ao abrir um diálogo a partir de outro, lembramos de quem abriu o primeiro.
      opener = opener || openers.get(current);
      openers.delete(current); // evita que o fechamento devolva o foco para trás do novo diálogo
      current.close();
    }
    if (dialog.open) return;
    openers.set(dialog, opener || document.activeElement);
    if (dialog.id === 'painel-acessibilidade') syncForm();
    dialog.showModal();
    var title = dialog.querySelector('h2[tabindex="-1"]');
    if (title) title.focus();
  }

  function wireDialog(dialog, options) {
    if (!dialog) return;
    var closeOnBackdrop = !(options && options.fecharNoFundo === false);
    dialog.addEventListener('close', function () {
      var opener = openers.get(dialog);
      openers.delete(dialog);
      if (opener && document.contains(opener) && typeof opener.focus === 'function') {
        opener.focus();
      }
    });
    dialog.addEventListener('click', function (e) {
      if (closeOnBackdrop && e.target === dialog) dialog.close(); // clique fora do conteúdo (fundo)
    });
    Array.prototype.forEach.call(dialog.querySelectorAll('[data-fechar]'), function (b) {
      b.addEventListener('click', function () { dialog.close(); });
    });
  }

  var panel = document.getElementById('painel-acessibilidade');
  var shortcutsDialog = document.getElementById('dialogo-atalhos');
  var btnA11y = document.getElementById('btn-acessibilidade');
  wireDialog(panel);
  wireDialog(shortcutsDialog);

  if (btnA11y) btnA11y.addEventListener('click', function () { openDialog(panel, btnA11y); });
  Array.prototype.forEach.call(document.querySelectorAll('[data-abrir-atalhos]'), function (b) {
    b.addEventListener('click', function () {
      // Se aberto a partir do painel, o foco volta para o botão do painel original.
      var fromPanel = panel && panel.open;
      openDialog(shortcutsDialog, fromPanel ? btnA11y : b);
    });
  });

  /* ---------- Menu em telas estreitas (padrão disclosure) ---------- */
  var nav = document.querySelector('.site-nav');
  var toggle = nav && nav.querySelector('.menu-toggle');
  function setMenu(open) {
    if (!nav || !toggle) return;
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (toggle) {
    toggle.addEventListener('click', function () { setMenu(toggle.getAttribute('aria-expanded') !== 'true'); });
    nav.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        toggle.focus();
      }
    });
    nav.querySelectorAll('.nav-list a').forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
  }
  function menuIsCollapsed() { return !!(toggle && window.getComputedStyle(toggle).display !== 'none'); }

  /* ---------- Destino de âncoras: mover o foco para o título da seção ---------- */
  function focusSection(id) {
    var section = document.getElementById(id);
    if (!section) return false;
    var heading = section.querySelector('h1[tabindex="-1"], h2[tabindex="-1"]');
    var target = heading || section;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    var smooth = !root.classList.contains('pref-reduzirMovimento') && !(systemReducesMotion() && !root.classList.contains('pref-permitirMovimento'));
    section.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
    return true;
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var id = a.getAttribute('href').slice(1);
    if (!id) return;
    var section = document.getElementById(id);
    if (!section || !section.querySelector('h1[tabindex="-1"], h2[tabindex="-1"]')) return; // deixa o navegador cuidar (ex.: links pulados)
    e.preventDefault();
    if (history.pushState) history.pushState(null, '', '#' + id);
    focusSection(id);
  });

  /* ---------- Indicação da seção atual no menu (aria-current) ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-list a'));
  if ('IntersectionObserver' in window && navLinks.length) {
    var byId = {};
    navLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && byId[en.target.id]) {
          navLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
          byId[en.target.id].setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- Filtro de cases ---------- */
  var filterInputs = document.querySelectorAll('input[name="filtro"]');
  var caseItems = Array.prototype.slice.call(document.querySelectorAll('#lista-cases > li'));
  var countEl = document.getElementById('contagem-cases');
  var labels = { sistemas: 'Sistemas', acessibilidade: 'Acessibilidade', infraestrutura: 'Infraestrutura', sites: 'Sites e formulários' };
  function filterCases(value) {
    var shown = 0;
    caseItems.forEach(function (li) {
      var cats = (li.getAttribute('data-categorias') || '').split(/\s+/);
      var visible = value === 'todos' || cats.indexOf(value) !== -1;
      li.hidden = !visible;
      if (visible) shown++;
    });
    if (countEl) {
      countEl.textContent = value === 'todos'
        ? 'Mostrando todos os ' + caseItems.length + ' cases.'
        : 'Mostrando ' + shown + (shown === 1 ? ' case' : ' cases') + ' de ' + caseItems.length + ' na categoria ' + labels[value] + '.';
    }
  }
  Array.prototype.forEach.call(filterInputs, function (input) {
    input.addEventListener('change', function () { if (input.checked) filterCases(input.value); });
  });

  /* ---------- Régua de leitura ---------- */
  var ruler = document.querySelector('.ruler');
  function placeRuler(y) {
    if (!ruler || !prefs.regua) return;
    var h = parseFloat(getComputedStyle(document.body).fontSize) * 4.5;
    var top = Math.max(0, y - h / 2);
    ruler.style.setProperty('--ruler-top', top + 'px');
    ruler.style.setProperty('--ruler-h', h + 'px');
  }
  function hideRuler() { if (ruler) { ruler.style.removeProperty('--ruler-top'); } }
  document.addEventListener('pointermove', function (e) { if (prefs.regua && e.pointerType === 'mouse') placeRuler(e.clientY); }, { passive: true });
  document.addEventListener('focusin', function (e) {
    if (!prefs.regua || !e.target.getBoundingClientRect) return;
    var r = e.target.getBoundingClientRect();
    placeRuler(r.top + Math.min(r.height, 64) / 2);
  });

  /* ---------- Atalhos de teclado ---------- */
  /* Páginas internas (questionário, painel) não têm todas as seções da página inicial:
     nesses casos o atalho leva ao destino equivalente ou abre a página inicial. */
  function focusMain() {
    if (focusSection('inicio')) return;
    var h1 = document.querySelector('main h1');
    var target = h1 || document.getElementById('conteudo');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start' });
  }
  function focusOrGoHome(id) {
    if (!focusSection(id)) window.location.href = '/#' + id;
  }

  var SHORTCUTS = [
    { key: '1', label: 'Ir para o conteúdo principal', run: focusMain },
    { key: '2', label: 'Ir para o menu de navegação', run: function () {
        if (menuIsCollapsed()) { setMenu(true); }
        var first = document.querySelector('.nav-list a');
        if (first) first.focus();
      } },
    { key: '3', label: 'Ir para os cases', run: function () { focusOrGoHome('cases'); } },
    { key: '4', label: 'Ir para o rodapé', run: function () { var f = document.getElementById('rodape'); if (f) { f.focus({ preventScroll: true }); f.scrollIntoView({ block: 'end' }); } } },
    { key: '5', label: 'Abrir as preferências de leitura', run: function () { openDialog(panel, btnA11y); } },
    { key: '6', label: 'Ativar ou desativar o alto contraste', run: function () { toggleContrast(); } },
    { key: '7', label: 'Ir para a declaração de acessibilidade', run: function () { focusOrGoHome('declaracao'); } },
    { key: '0', label: 'Mostrar esta lista de atalhos', run: function () { openDialog(shortcutsDialog, document.activeElement); } }
  ];

  function toggleContrast() {
    var isHC = String(prefs.tema).indexOf('contraste') === 0;
    if (isHC) {
      prefs.tema = prefs._temaAnterior || 'auto';
      delete prefs._temaAnterior;
    } else {
      prefs._temaAnterior = prefs.tema;
      var darkNow = prefs.tema === 'escuro' || (prefs.tema === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      prefs.tema = darkNow ? 'contraste-escuro' : 'contraste-claro';
    }
    apply();
    save(prefs);
    syncForm();
    announce(isHC ? 'Alto contraste desativado.' : 'Alto contraste ativado.');
  }

  function renderShortcuts() {
    var rows = SHORTCUTS.map(function (s) {
      return '<tr><td><kbd>Alt</kbd> + <kbd>' + s.key + '</kbd></td><td>' + s.label + '</td></tr>';
    }).join('') +
      '<tr><td><kbd>Esc</kbd></td><td>Fechar o painel, a lista de atalhos ou o menu aberto</td></tr>';
    Array.prototype.forEach.call(document.querySelectorAll('[data-atalhos-tbody]'), function (tb) { tb.innerHTML = rows; });
    var st = document.querySelector('[data-status-atalhos]');
    if (st) st.textContent = prefs.atalhos
      ? 'Os atalhos estão ativados. No Firefox, use Alt + Shift + número; no Mac, Option + número.'
      : 'Os atalhos estão desativados. Para ativá-los, abra as preferências de leitura.';
  }

  function isEditable(el) {
    if (!el) return false;
    var tag = el.tagName;
    if (el.isContentEditable) return true;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].indexOf(el.type) !== -1;
    return false;
  }

  document.addEventListener('keydown', function (e) {
    if (!prefs.atalhos || !e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    var m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code || '');
    if (!m || isEditable(e.target)) return;
    var sc = SHORTCUTS.filter(function (s) { return s.key === m[1]; })[0];
    if (!sc) return;
    e.preventDefault();
    var open = document.querySelector('dialog[open]');
    if (open && sc.key !== '5' && sc.key !== '0' && sc.key !== '6') open.close();
    sc.run();
  });

  /* ---------- Interface para os scripts das páginas internas ----------
     Permite reaproveitar os diálogos (foco preso e devolvido a quem abriu),
     a região de anúncios e trocar o destino de um atalho na página atual. */
  window.VI = {
    anunciar: announce,
    abrirDialogo: openDialog,
    prepararDialogo: wireDialog,
    definirAtalho: function (key, label, run) {
      SHORTCUTS.forEach(function (s) {
        if (s.key === key) { s.label = label; s.run = run; }
      });
      renderShortcuts();
    }
  };

  /* ---------- Início ---------- */
  apply();
  syncForm();
  renderShortcuts();
})();
