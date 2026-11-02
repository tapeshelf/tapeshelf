// Before the first paint: the theme picked in this browser (vs.theme), else the
// device's. ThemeService takes over once the app starts; a file, not inline, for the CSP.
(function () {
  var pref = null;
  try {
    pref = localStorage.getItem('vs.theme');
  } catch (e) {}
  var dark =
    pref === 'dark' ||
    (pref !== 'light' && !!window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
