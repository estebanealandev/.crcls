/* Project index (ProjectList.astro): cursor-follow preview + scroll reveal. */
(() => {
  const lists = document.querySelectorAll('[data-project-list]');
  if (!lists.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const initReveal = (list) => {
    if (reduceMotion.matches || !('IntersectionObserver' in window)) return;
    // Only arm the hidden state for lists still below the fold, so nothing
    // already on screen ever blinks out.
    if (list.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    list.setAttribute('data-reveal', '');
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        list.classList.add('is-inview');
        io.disconnect();
      },
      { rootMargin: '0px 0px -12% 0px' }
    );
    io.observe(list);
  };

  const initPreview = (list) => {
    const preview = list.querySelector('[data-pl-preview]');
    const frame = preview?.querySelector('[data-pl-frame]');
    const media = preview ? [...preview.querySelectorAll('[data-pl-media]')] : [];
    const rows = [...list.querySelectorAll('[data-pl-row]')];
    const rowList = list.querySelector('.pl__list');
    if (!preview || !frame || !rows.length || !rowList) return;

    // Webflow IX transforms section ancestors on scroll, which would turn
    // position:fixed into "fixed to that section"; live under <body> instead.
    document.body.appendChild(preview);

    // Images are lazy: only un-hide the preview (and so let them load) once
    // the list is close to the viewport. `near` also gates the scroll sync.
    let near = !('IntersectionObserver' in window);
    if (near) {
      preview.hidden = false;
    } else {
      new IntersectionObserver(
        (entries) => {
          near = entries[entries.length - 1].isIntersecting;
          if (near) preview.hidden = false;
        },
        { rootMargin: '75% 0px' }
      ).observe(list);
    }

    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    let rot = 0;
    let raf = 0;
    let visible = false;
    let activeRow = null;
    let pointerKnown = false;

    const frameLoop = () => {
      const still = reduceMotion.matches;
      const dx = tx - x;
      x = still ? tx : x + dx * 0.16;
      y = still ? ty : y + (ty - y) * 0.16;
      // Tilt with horizontal velocity, like the site's other cursor-driven media.
      rot += ((still ? 0 : clamp(dx * 0.06, -8, 8)) - rot) * 0.12;
      preview.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      frame.style.rotate = `${rot.toFixed(3)}deg`;
      raf = visible ? requestAnimationFrame(frameLoop) : 0;
    };

    const show = (row) => {
      if (row !== activeRow) {
        const index = rows.indexOf(row);
        media.forEach((img, i) => img.classList.toggle('is-active', i === index));
        preview.toggleAttribute('data-linked', row.tagName === 'A');
        activeRow = row;
      }
      if (visible) return;
      // Appear at the pointer instead of flying in from the last spot.
      x = tx;
      y = ty;
      rot = 0;
      visible = true;
      preview.classList.add('is-visible');
      if (!raf) raf = requestAnimationFrame(frameLoop);
    };

    const hide = () => {
      if (!visible) return;
      visible = false;
      activeRow = null;
      preview.classList.remove('is-visible');
    };

    const isMouse = (e) => e.pointerType === 'mouse' || e.pointerType === 'pen';

    rows.forEach((row) => {
      row.addEventListener('pointerenter', (e) => {
        if (!isMouse(e)) return;
        tx = e.clientX;
        ty = e.clientY;
        pointerKnown = true;
        show(row);
      });

      // Keyboard users get the same preview, parked over the focused row.
      row.addEventListener('focus', () => {
        if (!row.matches(':focus-visible')) return;
        const r = row.getBoundingClientRect();
        tx = r.left + r.width * 0.62;
        ty = r.top + r.height / 2;
        show(row);
      });
      row.addEventListener('blur', hide);
    });

    // Track the pointer page-wide so the scroll sync below never reads a stale position.
    document.addEventListener('pointermove', (e) => {
      if (!isMouse(e)) return;
      tx = e.clientX;
      ty = e.clientY;
      pointerKnown = true;
    }, { passive: true });

    rowList.addEventListener('pointerleave', hide);

    // Rows scroll under a resting pointer without firing pointerenter/leave
    // reliably, so re-resolve the row under the pointer on scroll.
    let scrollQueued = false;
    window.addEventListener('scroll', () => {
      if (!near || !pointerKnown || scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        const hit = document.elementFromPoint(tx, ty);
        const row = hit && hit.closest('[data-pl-row]');
        if (row && rows.includes(row)) show(row);
        else hide();
      });
    }, { passive: true });

    // Rows open the live site in a new tab; don't leave the preview stuck on return.
    window.addEventListener('blur', hide);
    document.documentElement.addEventListener('mouseleave', hide);
  };

  lists.forEach((list) => {
    initReveal(list);
    initPreview(list);
  });
})();
