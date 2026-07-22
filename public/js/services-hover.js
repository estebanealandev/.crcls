(() => {
  const section = document.querySelector('.content-effect._02 .section._01, .section._01');
  if (!section) return;

  const cards = [...section.querySelectorAll('.service-card[data-svc-media]')];
  if (!cards.length) return;

  const mediaEls = Object.fromEntries(
    [...section.querySelectorAll('[data-svc-bg]')].map((el) => [el.dataset.svcBg, el])
  );

  const allMedia = Object.values(mediaEls).filter(Boolean);

  const setShown = (el, on) => {
    if (!el) return;
    el.classList.toggle('is-active', on);
    el.style.setProperty('opacity', on ? '1' : '0', 'important');
    el.style.setProperty('visibility', 'visible', 'important');
  };

  const setItems = (card, on) => {
    const items = card.querySelector('[data-svc-items], .font-change');
    if (!items) return;
    items.style.setProperty('opacity', on ? '0.75' : '0', 'important');
    items.style.setProperty('visibility', 'visible', 'important');
    items.style.setProperty('transform', 'none', 'important');
    items.querySelectorAll('*').forEach((node) => {
      node.style.setProperty('opacity', on ? '1' : '0', 'important');
      node.style.setProperty('visibility', 'visible', 'important');
      node.style.setProperty('transform', 'none', 'important');
      node.style.setProperty('overflow', 'visible', 'important');
    });
  };

  let active = null;

  const clearMedia = () => {
    allMedia.forEach((el) => setShown(el, false));
  };

  const activate = (card) => {
    if (active === card) return;
    if (active) {
      active.classList.remove('is-active');
      setItems(active, false);
    }
    active = card;
    card.classList.add('is-active');
    setItems(card, true);
    clearMedia();
    setShown(mediaEls[card.dataset.svcMedia], true);
  };

  const deactivate = (card) => {
    if (active !== card) return;
    card.classList.remove('is-active');
    setItems(card, false);
    clearMedia();
    active = null;
  };

  // Immediate init: hide lists + media (beat any leftover IX inline styles)
  clearMedia();
  cards.forEach((card) => {
    card.style.setProperty('opacity', '1', 'important');
    setItems(card, false);
    card.addEventListener('pointerenter', () => activate(card), { passive: true });
    card.addEventListener('pointerleave', () => deactivate(card), { passive: true });
  });
})();
