// Aplica o tema salvo antes de desenhar a tela (evita piscar). Sem salvar, segue o sistema.
(function () {
  try {
    var t = localStorage.getItem('garimpo_theme');
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* sem armazenamento: segue o sistema */ }
})();
