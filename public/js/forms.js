(function () {
  'use strict';

  var loadedAt = Date.now();
  var ENDPOINTS = { contact: '/api/contact', subscribe: '/api/subscribe' };

  function setPending(form, isPending) {
    var submit = form.querySelector('input[type="submit"], button[type="submit"]');
    if (!submit) return;
    if (isPending) {
      submit.dataset.originalValue = submit.value || submit.textContent;
      var waitText = submit.getAttribute('data-wait');
      if (waitText) {
        if ('value' in submit) submit.value = waitText;
        else submit.textContent = waitText;
      }
      submit.disabled = true;
    } else {
      submit.disabled = false;
      if (submit.dataset.originalValue) {
        if ('value' in submit) submit.value = submit.dataset.originalValue;
        else submit.textContent = submit.dataset.originalValue;
      }
    }
  }

  function showMessage(form, kind) {
    var successEl = document.getElementById(form.id + '-success');
    var errorEl = document.getElementById(form.id + '-error');
    if (kind === 'success') {
      form.style.display = 'none';
      if (successEl) successEl.style.display = 'block';
      if (errorEl) errorEl.style.display = 'none';
    } else {
      if (errorEl) errorEl.style.display = 'block';
      if (successEl) successEl.style.display = 'none';
    }
  }

  function handleSubmit(event) {
    var form = event.currentTarget;
    event.preventDefault();

    var kind = form.getAttribute('data-circles-form');
    var endpoint = ENDPOINTS[kind];
    if (!endpoint) return;

    var payload = Object.fromEntries(new FormData(form).entries());
    payload.elapsedMs = Date.now() - loadedAt;

    setPending(form, true);

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok && data.ok, data: data };
        });
      })
      .then(function (result) {
        setPending(form, false);
        if (result.ok) {
          showMessage(form, 'success');
        } else {
          showMessage(form, 'error');
        }
      })
      .catch(function () {
        setPending(form, false);
        showMessage(form, 'error');
      });
  }

  var forms = document.querySelectorAll('[data-circles-form]');
  for (var i = 0; i < forms.length; i++) {
    forms[i].addEventListener('submit', handleSubmit);
  }
})();
