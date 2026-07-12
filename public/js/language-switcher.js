(function () {
  'use strict';

  var STORAGE_KEY = 'crcls-locale';

  var selects = document.querySelectorAll('[data-lang-switcher]');
  for (var i = 0; i < selects.length; i++) {
    selects[i].addEventListener('change', function (event) {
      var href = event.currentTarget.value;
      var match = href.match(/^\/([a-z]{2})(\/|$)/);
      try {
        localStorage.setItem(STORAGE_KEY, match ? match[1] : 'en');
      } catch (e) {
        /* localStorage unavailable — navigation still proceeds */
      }
      window.location.href = href;
    });
  }
})();
