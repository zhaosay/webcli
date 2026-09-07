  (function () {
    var t = localStorage.getItem('webcli-theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  })();
