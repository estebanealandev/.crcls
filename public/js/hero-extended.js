(() => {
  const hero = document.querySelector('[data-hx-hero]');
  if (!hero) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const backdrop = hero.querySelector('[data-hx-backdrop]');
  const preview = hero.querySelector('[data-hx-preview]');
  const canvas = hero.querySelector('[data-hx-canvas]');
  const sticky = hero.querySelector('[data-hx-sticky]');
  const stickyToggle = hero.querySelector('[data-hx-sticky-toggle]');
  const stickyMark = hero.querySelector('[data-hx-sticky-mark]');
  const stickyPreview = sticky?.querySelector('[data-hx-open-showreel]');
  const cursorLabel = document.querySelector('[data-hx-cursor-label]');
  const cursorText = document.querySelector('[data-hx-cursor-text]');
  const modal = document.querySelector('[data-hx-modal]');
  const modalVideo = document.querySelector('[data-hx-modal-video]');
  const playToggle = document.querySelector('[data-hx-play-toggle]');
  const muteToggle = document.querySelector('[data-hx-mute-toggle]');
  const seekBtn = document.querySelector('[data-hx-seek]');
  const seekFill = document.querySelector('[data-hx-seek-fill]');
  const timeEl = document.querySelector('[data-hx-time]');
  const openBtns = document.querySelectorAll('[data-hx-open-showreel]');
  const closeBtns = document.querySelectorAll('[data-hx-close-showreel]');

  let labels = [];
  try {
    labels = JSON.parse(hero.dataset.cursorLabels || '[]');
  } catch {
    labels = [];
  }

  const readyVideos = () => {
    const markReady = (video) => {
      if (!video) return;
      const onReady = () => video.classList.add('is-ready');
      if (video.readyState >= 2) onReady();
      else video.addEventListener('loadeddata', onReady, { once: true });
      video.play?.().catch(() => {});
    };
    markReady(backdrop);
    markReady(preview);
  };

  const revealHero = () => {
    requestAnimationFrame(() => hero.classList.add('is-ready'));
  };

  /* ---------- Sticky collapse ---------- */
  let stickyOpen = true;
  const setStickyOpen = (open) => {
    stickyOpen = open;
    if (stickyMark) stickyMark.textContent = open ? '-' : '+';
    stickyToggle?.setAttribute('aria-expanded', String(open));
    if (stickyPreview) stickyPreview.hidden = !open;
  };

  stickyToggle?.addEventListener('click', () => setStickyOpen(!stickyOpen));

  /* ---------- Cursor labels ---------- */
  let labelIndex = 0;
  let labelTimer = 0;
  let cursorVisible = false;

  const rotateLabel = () => {
    if (!cursorText || !labels.length) return;
    cursorText.textContent = labels[labelIndex % labels.length];
    labelIndex += 1;
  };

  const showCursorLabel = (x, y) => {
    if (!cursorLabel || coarsePointer || reduceMotion) return;
    cursorLabel.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, calc(-100% - 0.75rem))`;
    if (!cursorVisible) {
      cursorVisible = true;
      cursorLabel.classList.add('is-visible');
      rotateLabel();
      window.clearInterval(labelTimer);
      labelTimer = window.setInterval(rotateLabel, 2200);
    }
  };

  const hideCursorLabel = () => {
    if (!cursorLabel) return;
    cursorVisible = false;
    cursorLabel.classList.remove('is-visible');
    window.clearInterval(labelTimer);
  };

  /* ---------- WebGL grid / cursor ---------- */
  const webgl = (() => {
    if (!canvas || reduceMotion || coarsePointer) return null;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) return null;

    const vs = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

    const fs = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_res;
uniform vec2 u_mouse;
uniform vec2 u_mouse_prev;
uniform float u_time;
uniform float u_strength;
out vec4 fragColor;

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main(){
  vec2 uv = v_uv;
  vec2 px = uv * u_res;
  float cell = max(10.0, min(u_res.x, u_res.y) / 72.0);
  vec2 gid = floor(px / cell);
  vec2 guv = fract(px / cell);

  // Circles mark: concentric ring cell pattern
  vec2 c = guv - 0.5;
  float ring = abs(length(c) - 0.28);
  float disk = smoothstep(0.08, 0.02, ring);
  float core = smoothstep(0.12, 0.0, length(c));
  float glyph = max(disk, core * 0.35);
  glyph *= step(0.08, hash(gid + 0.2));

  float d1 = distance(px, u_mouse);
  float d0 = distance(px, u_mouse_prev);
  float trail = exp(-d1 * d1 / (2.0 * pow(140.0 + 40.0 * sin(u_time), 2.0)));
  trail = max(trail, exp(-d0 * d0 / (2.0 * pow(90.0, 2.0))) * 0.65);

  float veil = 0.78 - trail * u_strength * 0.85;
  veil = clamp(veil, 0.08, 0.86);

  float gridLine = step(0.94, max(guv.x, guv.y)) * 0.08;
  float ink = mix(0.04, 0.22, glyph) + gridLine;
  float alpha = veil + ink * (1.0 - trail * 0.5);

  fragColor = vec4(vec3(0.04 + ink * 0.2), alpha);
}`;

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn('[hx] shader', gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vsh = compile(gl.VERTEX_SHADER, vs);
    const fsh = compile(gl.FRAGMENT_SHADER, fs);
    if (!vsh || !fsh) return null;

    const prog = gl.createProgram();
    gl.attachShader(prog, vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[hx] program', gl.getProgramInfoLog(prog));
      return null;
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    const uMousePrev = gl.getUniformLocation(prog, 'u_mouse_prev');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uStrength = gl.getUniformLocation(prog, 'u_strength');

    let w = 0;
    let h = 0;
    let dpr = 1;
    let mx = 0;
    let my = 0;
    let mxPrev = 0;
    let myPrev = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;
    let running = false;

    const resize = () => {
      const rect = hero.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      w = Math.max(1, Math.floor(rect.width * dpr));
      h = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      gl.viewport(0, 0, w, h);
      if (!mx && !my) {
        mx = w * 0.5;
        my = h * 0.45;
        tx = mx;
        ty = my;
        mxPrev = mx;
        myPrev = my;
      }
    };

    const draw = (t) => {
      mxPrev += (mx - mxPrev) * 0.08;
      myPrev += (my - myPrev) * 0.08;
      mx += (tx - mx) * 0.18;
      my += (ty - my) * 0.18;

      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(uRes, w, h);
      gl.uniform2f(uMouse, mx, h - my);
      gl.uniform2f(uMousePrev, mxPrev, h - myPrev);
      gl.uniform1f(uTime, t * 0.001);
      gl.uniform1f(uStrength, 1);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(draw);
    };

    const onMove = (e) => {
      const rect = hero.getBoundingClientRect();
      tx = (e.clientX - rect.left) * dpr;
      ty = (e.clientY - rect.top) * dpr;
      showCursorLabel(e.clientX, e.clientY);
    };

    const start = () => {
      if (running) return;
      running = true;
      resize();
      hero.addEventListener('pointermove', onMove, { passive: true });
      hero.addEventListener('pointerleave', hideCursorLabel, { passive: true });
      window.addEventListener('resize', resize, { passive: true });
      raf = requestAnimationFrame(draw);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', hideCursorLabel);
      window.removeEventListener('resize', resize);
      hideCursorLabel();
    };

    return { start, stop, resize };
  })();

  /* ---------- Modal / showreel ---------- */
  const formatTime = (s) => {
    if (!Number.isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const syncControls = () => {
    if (!modalVideo || !playToggle || !muteToggle) return;
    playToggle.textContent = modalVideo.paused
      ? playToggle.dataset.labelPlay
      : playToggle.dataset.labelPause;
    muteToggle.textContent = modalVideo.muted
      ? muteToggle.dataset.labelUnmute
      : muteToggle.dataset.labelMute;
    if (seekFill && modalVideo.duration) {
      seekFill.style.width = `${(modalVideo.currentTime / modalVideo.duration) * 100}%`;
    }
    if (timeEl) {
      timeEl.textContent = `${formatTime(modalVideo.currentTime)} / ${formatTime(modalVideo.duration || 0)}`;
    }
  };

  const pickShowreelSrc = () => {
    if (!modalVideo) return '';
    const mobile = window.matchMedia('(max-width: 999px)').matches;
    return mobile ? modalVideo.dataset.srcMobile : modalVideo.dataset.srcDesktop;
  };

  const openModal = async () => {
    if (!modal || !modalVideo) return;
    const src = pickShowreelSrc();
    if (src && modalVideo.dataset.activeSrc !== src) {
      modalVideo.src = src;
      modalVideo.dataset.activeSrc = src;
    }
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('is-open'));
    document.body.classList.add('hx-modal-open');
    modalVideo.muted = false;
    try {
      await modalVideo.play();
    } catch {
      modalVideo.muted = true;
      await modalVideo.play().catch(() => {});
    }
    syncControls();
    closeBtns[0]?.focus?.();
  };

  const closeModal = () => {
    if (!modal || !modalVideo) return;
    modal.classList.remove('is-open');
    document.body.classList.remove('hx-modal-open');
    modalVideo.pause();
    window.setTimeout(() => {
      if (!modal.classList.contains('is-open')) modal.hidden = true;
    }, 350);
  };

  openBtns.forEach((btn) => btn.addEventListener('click', openModal));
  closeBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
    });
  });

  modal?.addEventListener('click', (e) => {
    if (e.target === modal || e.target?.classList?.contains('hx-modal__stage')) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('is-open')) closeModal();
  });

  playToggle?.addEventListener('click', () => {
    if (!modalVideo) return;
    if (modalVideo.paused) modalVideo.play().catch(() => {});
    else modalVideo.pause();
    syncControls();
  });

  muteToggle?.addEventListener('click', () => {
    if (!modalVideo) return;
    modalVideo.muted = !modalVideo.muted;
    syncControls();
  });

  seekBtn?.addEventListener('click', (e) => {
    if (!modalVideo?.duration) return;
    const rect = seekBtn.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    modalVideo.currentTime = ratio * modalVideo.duration;
    syncControls();
  });

  modalVideo?.addEventListener('timeupdate', syncControls);
  modalVideo?.addEventListener('play', syncControls);
  modalVideo?.addEventListener('pause', syncControls);
  modalVideo?.addEventListener('volumechange', syncControls);

  /* ---------- Boot ---------- */
  readyVideos();
  revealHero();
  if (webgl) webgl.start();
  else if (canvas) canvas.style.display = 'none';
})();
