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

  /* ---------- Cursor grid reveal (WebGL2 → WebGL1 → Canvas2D) ---------- */
  const createMouseFx = () => {
    if (!canvas || reduceMotion || coarsePointer) return null;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let cssW = 0;
    let cssH = 0;
    let mx = 0.5;
    let my = 0.45;
    let tx = 0.5;
    let ty = 0.45;
    let px = 0.5;
    let py = 0.45;
    let raf = 0;
    let running = false;
    let inside = false;

    const setTargetFromEvent = (e) => {
      const rect = hero.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const nextInside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
      if (!nextInside) {
        if (inside) {
          inside = false;
          hideCursorLabel();
        }
        return;
      }
      inside = true;
      tx = Math.min(1, Math.max(0, x));
      ty = Math.min(1, Math.max(0, y));
      showCursorLabel(e.clientX, e.clientY);
    };

    const resize = () => {
      const rect = hero.getBoundingClientRect();
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = Math.max(1, Math.floor(cssW * dpr));
      h = Math.max(1, Math.floor(cssH * dpr));
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    };

    const makeWebGL = (version) => {
      const gl = canvas.getContext(version === 2 ? 'webgl2' : 'webgl', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
      });
      if (!gl) return null;

      const is2 = version === 2;
      const vs = is2
        ? `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`
        : `attribute vec2 a_pos;
varying vec2 v_uv;
void main(){
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

      const fs = is2
        ? `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_res;
uniform vec2 u_mouse;
uniform vec2 u_mouse_prev;
uniform float u_time;
uniform float u_active;
out vec4 fragColor;

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main(){
  vec2 px = v_uv * u_res;
  float cell = max(8.0, min(u_res.x, u_res.y) / 64.0);
  vec2 gid = floor(px / cell);
  vec2 guv = fract(px / cell) - 0.5;

  float ring = abs(length(guv) - 0.22);
  float glyph = smoothstep(0.08, 0.015, ring);
  glyph = max(glyph, smoothstep(0.1, 0.0, length(guv)) * 0.35);
  glyph *= step(0.18, hash(gid + 3.1));

  float line = step(0.46, abs(guv.x)) + step(0.46, abs(guv.y));
  line = clamp(line, 0.0, 1.0) * 0.22;

  float d = distance(px, u_mouse * u_res);
  float dPrev = distance(px, u_mouse_prev * u_res);
  float radius = min(u_res.x, u_res.y) * 0.22;
  float trail = exp(-d * d / (2.0 * radius * radius));
  trail = max(trail, exp(-dPrev * dPrev / (2.0 * (radius * 0.55) * (radius * 0.55))) * 0.7);
  trail *= u_active;

  float veil = mix(0.72, 0.08, trail);
  float ink = (0.12 + glyph * 0.55 + line) * (1.0 - trail * 0.85);
  float alpha = clamp(veil + ink * 0.35, 0.05, 0.88);

  vec3 col = mix(vec3(0.04, 0.045, 0.05), vec3(0.86, 0.82, 0.74), ink * 0.55);
  fragColor = vec4(col, alpha);
}`
        : `precision highp float;
varying vec2 v_uv;
uniform vec2 u_res;
uniform vec2 u_mouse;
uniform vec2 u_mouse_prev;
uniform float u_time;
uniform float u_active;

float hash(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main(){
  vec2 px = v_uv * u_res;
  float cell = max(8.0, min(u_res.x, u_res.y) / 64.0);
  vec2 gid = floor(px / cell);
  vec2 guv = fract(px / cell) - 0.5;

  float ring = abs(length(guv) - 0.22);
  float glyph = smoothstep(0.08, 0.015, ring);
  glyph = max(glyph, smoothstep(0.1, 0.0, length(guv)) * 0.35);
  glyph *= step(0.18, hash(gid + 3.1));

  float line = step(0.46, abs(guv.x)) + step(0.46, abs(guv.y));
  line = clamp(line, 0.0, 1.0) * 0.22;

  float d = distance(px, u_mouse * u_res);
  float dPrev = distance(px, u_mouse_prev * u_res);
  float radius = min(u_res.x, u_res.y) * 0.22;
  float trail = exp(-d * d / (2.0 * radius * radius));
  trail = max(trail, exp(-dPrev * dPrev / (2.0 * (radius * 0.55) * (radius * 0.55))) * 0.7);
  trail *= u_active;

  float veil = mix(0.72, 0.08, trail);
  float ink = (0.12 + glyph * 0.55 + line) * (1.0 - trail * 0.85);
  float alpha = clamp(veil + ink * 0.35, 0.05, 0.88);

  vec3 col = mix(vec3(0.04, 0.045, 0.05), vec3(0.86, 0.82, 0.74), ink * 0.55);
  gl_FragColor = vec4(col, alpha);
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

      const aPos = gl.getAttribLocation(prog, 'a_pos');
      const uRes = gl.getUniformLocation(prog, 'u_res');
      const uMouse = gl.getUniformLocation(prog, 'u_mouse');
      const uMousePrev = gl.getUniformLocation(prog, 'u_mouse_prev');
      const uTime = gl.getUniformLocation(prog, 'u_time');
      const uActive = gl.getUniformLocation(prog, 'u_active');

      return {
        resize() {
          gl.viewport(0, 0, w, h);
        },
        draw(t) {
          gl.useProgram(prog);
          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
          gl.uniform2f(uRes, w, h);
          gl.uniform2f(uMouse, mx, 1.0 - my);
          gl.uniform2f(uMousePrev, px, 1.0 - py);
          gl.uniform1f(uTime, t * 0.001);
          gl.uniform1f(uActive, inside ? 1 : 0.35);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        },
      };
    };

    const makeCanvas2D = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      return {
        resize() {},
        draw() {
          ctx.clearRect(0, 0, w, h);
          const cell = Math.max(10, Math.min(w, h) / 64);
          const cols = Math.ceil(w / cell);
          const rows = Math.ceil(h / cell);
          const cx = mx * w;
          const cy = my * h;
          const radius = Math.min(w, h) * 0.22;
          const active = inside ? 1 : 0.35;

          for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < cols; x += 1) {
              const px0 = x * cell;
              const py0 = y * cell;
              const dx = px0 + cell * 0.5 - cx;
              const dy = py0 + cell * 0.5 - cy;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const trail = Math.exp(-(dist * dist) / (2 * radius * radius)) * active;
              const veil = 0.72 - trail * 0.64;
              const ink = (0.1 + ((x * 13 + y * 7) % 5 === 0 ? 0.35 : 0.08)) * (1 - trail * 0.85);
              ctx.fillStyle = `rgba(12, 13, 14, ${Math.min(0.88, Math.max(0.08, veil + ink * 0.25))})`;
              ctx.fillRect(px0, py0, cell + 0.5, cell + 0.5);
              if (ink > 0.2 && trail < 0.75) {
                ctx.beginPath();
                ctx.strokeStyle = `rgba(220, 210, 190, ${0.18 * (1 - trail)})`;
                ctx.lineWidth = Math.max(1, cell * 0.06);
                ctx.arc(px0 + cell * 0.5, py0 + cell * 0.5, cell * 0.18, 0, Math.PI * 2);
                ctx.stroke();
              }
            }
          }
        },
      };
    };

    const renderer = makeWebGL(2) || makeWebGL(1) || makeCanvas2D();
    if (!renderer) return null;

    const tick = (t) => {
      px += (mx - px) * 0.12;
      py += (my - py) * 0.12;
      mx += (tx - mx) * 0.22;
      my += (ty - my) * 0.22;
      renderer.draw(t);
      raf = requestAnimationFrame(tick);
    };

    const onMove = (e) => setTargetFromEvent(e);
    const onLeaveWindow = () => {
      inside = false;
      hideCursorLabel();
    };

    return {
      start() {
        if (running) return;
        running = true;
        resize();
        renderer.resize();
        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('blur', onLeaveWindow, { passive: true });
        window.addEventListener('resize', () => {
          resize();
          renderer.resize();
        }, { passive: true });
        raf = requestAnimationFrame(tick);
      },
      stop() {
        running = false;
        cancelAnimationFrame(raf);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('blur', onLeaveWindow);
        hideCursorLabel();
      },
    };
  };

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
  const mouseFx = createMouseFx();
  if (mouseFx) mouseFx.start();
  else if (canvas) canvas.style.display = 'none';
})();
