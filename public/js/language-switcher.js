/* Language menu (LanguageSwitcher.astro). The <details> element already opens
 * and closes on its own; this adds dismissal (outside click, Escape, focus
 * leaving), arrow-key navigation, a close animation, and remembers the choice. */
(function () {
  'use strict';

  var STORAGE_KEY = 'crcls-locale';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  var menus = document.querySelectorAll('[data-lang-switcher]');
  for (var i = 0; i < menus.length; i++) init(menus[i]);

  function init(menu) {
    var trigger = menu.querySelector('summary');
    var options = Array.prototype.slice.call(menu.querySelectorAll('a[data-locale]'));
    var closing = false;

    function close(restoreFocus) {
      if (!menu.open || closing) return;
      if (restoreFocus) trigger.focus();
      if (reduceMotion.matches) {
        menu.open = false;
        return;
      }
      // Let the exit animation play before <details> hides the panel.
      closing = true;
      menu.classList.add('is-closing');
      var done = function () {
        if (!closing) return;
        closing = false;
        menu.classList.remove('is-closing');
        menu.open = false;
      };
      menu.querySelector('.lang-switcher__panel').addEventListener('animationend', done, { once: true });
      window.setTimeout(done, 250); // in case the animation never runs
    }

    trigger.addEventListener('click', function (event) {
      if (!menu.open) return;
      // Closing through the trigger also gets the exit animation.
      event.preventDefault();
      close(false);
    });

    menu.addEventListener('toggle', function () {
      if (!menu.open) return;
      // Opened from the keyboard: start on the current language.
      if (document.activeElement === trigger && trigger.matches(':focus-visible')) {
        var current = menu.querySelector('a[aria-current]') || options[0];
        if (current) current.focus();
      }
    });

    menu.addEventListener('keydown', function (event) {
      if (!menu.open) return;
      var index = options.indexOf(document.activeElement);
      var next = null;
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          close(true);
          return;
        case 'ArrowDown':
          next = options[index < 0 ? 0 : (index + 1) % options.length];
          break;
        case 'ArrowUp':
          next = options[index <= 0 ? options.length - 1 : index - 1];
          break;
        case 'Home':
          next = options[0];
          break;
        case 'End':
          next = options[options.length - 1];
          break;
        default:
          return;
      }
      event.preventDefault();
      if (next) next.focus();
    });

    document.addEventListener('pointerdown', function (event) {
      if (menu.open && !menu.contains(event.target)) close(false);
    });

    menu.addEventListener('focusout', function (event) {
      if (menu.open && event.relatedTarget && !menu.contains(event.relatedTarget)) close(false);
    });

    options.forEach(function (option) {
      option.addEventListener('click', function () {
        try {
          localStorage.setItem(STORAGE_KEY, option.getAttribute('data-locale'));
        } catch (e) {
          /* localStorage unavailable; navigation still proceeds */
        }
      });
    });
  }
})();
