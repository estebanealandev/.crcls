/* Project index (ProjectList.astro): cursor-follow preview + scroll reveal.
 *
 * The preview is a WebGL sheet that bends like a liquid while it is dragged:
 * its edges trail the motion through a damped spring, so it wobbles back into
 * shape when the cursor stops. Switching rows dissolves between textures.
 * Without WebGL (or with reduced motion) it falls back to the DOM image stack.
 *
 * The sheet sits beside the pointer (right of it, or left when there is no
 * room), so the row being browsed stays readable, and each row change plays a
 * short synthesized click on desktop.
 */
(() => {
  const lists = document.querySelectorAll('[data-project-list]');
  if (!lists.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  // Frame-rate independent version of `v += (target - v) * k` tuned at 60fps.
  const approach = (k, dt) => 1 - Math.pow(1 - k, dt * 60);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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

  /* ---------- WebGL renderer ---------- */

  const VERTEX = `
    attribute vec2 aUv;
    uniform vec2 uRes;
    uniform vec2 uCenter;
    uniform vec2 uSize;
    uniform vec2 uDeform;
    uniform float uReveal;
    uniform float uTime;
    varying vec2 vUv;
    varying float vShade;

    void main() {
      vec2 p = aUv - 0.5;
      vec2 pos = p * uSize * mix(0.82, 1.0, uReveal);

      // Bend: the far edges trail the motion while the centre leads, like a
      // sheet dragged through water. Quadratic falloff keeps the centre still.
      float fy = p.y * p.y * 4.0;
      float fx = p.x * p.x * 4.0;
      vec2 bend = vec2(uDeform.x * fy, uDeform.y * fx);

      // A soft ripple runs across the sheet, scaled by how hard it is dragged.
      float speed = length(uDeform);
      vec2 dir = speed > 0.001 ? uDeform / speed : vec2(0.0);
      float along = dot(p, dir);
      float ripple = sin(along * 8.0 - uTime * 7.0) * speed * 0.045 * (fx + fy);

      // Slight stretch along the drag direction.
      vec2 stretch = dir * along * speed * 0.18;

      vec2 world = uCenter + pos - bend + dir * ripple + stretch;
      vec2 clip = world / uRes * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);

      vUv = aUv;
      // Trailing folds catch less light.
      vShade = 1.0 - 0.2 * clamp(length(bend) / (uSize.x * 0.3), 0.0, 1.0);
    }
  `;

  const FRAGMENT = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform sampler2D uTexA;
    uniform sampler2D uTexB;
    uniform vec2 uCoverA;
    uniform vec2 uCoverB;
    uniform float uMix;
    uniform vec2 uShift;
    uniform float uAlpha;
    uniform float uFlow;
    varying vec2 vUv;
    varying float vShade;

    vec2 cover(vec2 uv, vec2 s) { return (uv - 0.5) * s + 0.5; }

    // Chromatic split along the drag: red and blue lag behind green.
    vec3 sampleSplit(sampler2D t, vec2 uv, vec2 s) {
      return vec3(
        texture2D(t, cover(uv + uShift, s)).r,
        texture2D(t, cover(uv, s)).g,
        texture2D(t, cover(uv - uShift, s)).b
      );
    }

    // Slowly drifting 0..1 field that shapes the swap's wave front.
    float field(vec2 uv) {
      float a = sin(uv.x * 5.0 + uFlow * 1.3) * sin(uv.y * 4.0 - uFlow * 1.1);
      float b = sin((uv.x + uv.y) * 9.0 - uFlow * 1.1) * 0.35;
      return clamp((a + b) * 0.38 + 0.5, 0.0, 1.0);
    }

    void main() {
      // Liquid swap: a soft front sweeps through the field, and pixels are
      // pushed sideways while it passes, like ink moving through water.
      float n = field(vUv);
      const float W = 0.18;
      float m = smoothstep(n - W, n + W, uMix * (1.0 + 2.0 * W) - W);
      float front = m * (1.0 - m) * 4.0;
      vec2 flow = vec2(cos(n * 6.2832), sin(n * 6.2832)) * 0.06 * front;
      vec3 a = sampleSplit(uTexA, vUv + flow, uCoverA);
      vec3 b = sampleSplit(uTexB, vUv - flow, uCoverB);
      vec3 col = mix(a, b, m) * vShade;
      gl_FragColor = vec4(col * uAlpha, uAlpha);
    }
  `;

  const createGLRenderer = (preview, images) => {
    const canvas = document.createElement('canvas');
    canvas.className = 'pl-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    if (!gl) return null;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);

    // Subdivided plane, so the bend reads as a curve instead of a fold.
    const SX = 48;
    const SY = 28;
    const verts = new Float32Array((SX + 1) * (SY + 1) * 2);
    for (let j = 0, k = 0; j <= SY; j++) {
      for (let i = 0; i <= SX; i++) {
        verts[k++] = i / SX;
        verts[k++] = j / SY;
      }
    }
    const idx = new Uint16Array(SX * SY * 6);
    for (let j = 0, k = 0; j < SY; j++) {
      for (let i = 0; i < SX; i++) {
        const a = j * (SX + 1) + i;
        const b = a + SX + 1;
        idx.set([a, b, a + 1, a + 1, b, b + 1], k);
        k += 6;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    const aUv = gl.getAttribLocation(program, 'aUv');
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    const u = {};
    ['uRes', 'uCenter', 'uSize', 'uDeform', 'uReveal', 'uTime', 'uTexA', 'uTexB', 'uCoverA', 'uCoverB', 'uMix', 'uShift', 'uAlpha', 'uFlow']
      .forEach((name) => { u[name] = gl.getUniformLocation(program, name); });
    gl.uniform1i(u.uTexA, 0);
    gl.uniform1i(u.uTexB, 1);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    const newTexture = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    };

    // Until an image arrives its slot samples the site's #111 placeholder.
    const placeholder = newTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([17, 17, 17, 255]));
    const textures = images.map(() => ({ tex: placeholder, aspect: 16 / 9 }));

    let width = 0;
    let height = 0;
    let planeW = 1;
    let planeH = 1;

    images.forEach((img, i) => {
      // The DOM stack is invisible in GL mode, so lazy loading can't be trusted
      // to kick in; images only start once the preview is un-hidden near the list.
      img.loading = 'eager';
      const upload = () => {
        if (!img.naturalWidth) return;
        const slot = textures[i];
        if (slot.tex === placeholder) slot.tex = newTexture();
        gl.bindTexture(gl.TEXTURE_2D, slot.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        slot.aspect = img.naturalWidth / img.naturalHeight;
      };
      if (img.complete) upload();
      img.addEventListener('load', upload);
    });

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      const r = preview.getBoundingClientRect();
      planeW = r.width || 1;
      planeH = r.height || 1;
    };
    window.addEventListener('resize', resize, { passive: true });

    let lost = false;
    let lostHandler = () => {};
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      lost = true;
      lostHandler();
    });

    let from = 0;
    let to = 0;
    let mixT = 1;
    let cleared = true;

    const coverScale = (aspect) => {
      const plane = planeW / planeH;
      return aspect > plane ? [plane / aspect, 1] : [1, aspect / plane];
    };

    document.body.appendChild(canvas);
    resize();

    return {
      kind: 'gl',
      onLost(fn) { lostHandler = fn; },
      setActive(index, instant) {
        if (index === to) return;
        // Restarting mid-swap: keep whichever image currently dominates.
        if (mixT >= 0.5) from = to;
        to = index;
        mixT = instant ? 1 : 0;
      },
      // Returns true while it still has frames to draw.
      draw(s, dt) {
        if (lost) return false;
        mixT = Math.min(1, mixT + dt / 0.9);
        const settled = s.reveal < 0.002 && !s.visible;
        if (settled) {
          if (!cleared) {
            gl.clear(gl.COLOR_BUFFER_BIT);
            cleared = true;
          }
          return false;
        }
        cleared = false;
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(u.uRes, width, height);
        gl.uniform2f(u.uCenter, s.cx, s.cy);
        gl.uniform2f(u.uSize, planeW, planeH);
        gl.uniform2f(u.uDeform, s.dx, s.dy);
        const reveal = easeInOut(clamp(s.reveal, 0, 1));
        gl.uniform1f(u.uReveal, reveal);
        gl.uniform1f(u.uAlpha, reveal);
        gl.uniform1f(u.uTime, s.time);
        gl.uniform1f(u.uFlow, s.time);
        gl.uniform1f(u.uMix, easeInOut(mixT));
        gl.uniform2f(u.uShift, clamp(s.dx / planeW, -0.3, 0.3) * 0.045, clamp(s.dy / planeH, -0.3, 0.3) * 0.045);
        const a = textures[from];
        const b = textures[to];
        gl.uniform2fv(u.uCoverA, coverScale(a.aspect));
        gl.uniform2fv(u.uCoverB, coverScale(b.aspect));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, a.tex);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, b.tex);
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
        return true;
      },
      needsFrame() { return mixT < 1; },
      planeSize() { return [planeW, planeH]; },
      // How far the sheet's bottom-left corner sits from its resting place:
      // the vertex shader's maths at p = (-0.5, 0.5), so the pill rides the bend.
      cornerOffset(s) {
        const grow = 0.82 + 0.18 * easeInOut(clamp(s.reveal, 0, 1));
        const px = -0.5;
        const py = 0.5;
        const fx = 4 * px * px;
        const fy = 4 * py * py;
        const speed = Math.hypot(s.dx, s.dy);
        const dirX = speed > 0.001 ? s.dx / speed : 0;
        const dirY = speed > 0.001 ? s.dy / speed : 0;
        const along = px * dirX + py * dirY;
        const ripple = Math.sin(along * 8 - s.time * 7) * speed * 0.045 * (fx + fy);
        const stretch = along * speed * 0.18;
        return [
          px * planeW * (grow - 1) - s.dx * fy + dirX * (ripple + stretch),
          py * planeH * (grow - 1) - s.dy * fx + dirY * (ripple + stretch),
        ];
      },
      destroy() {
        window.removeEventListener('resize', resize);
        canvas.remove();
      },
    };
  };

  /* ---------- DOM fallback renderer ---------- */

  const createDomRenderer = (preview, frame, images) => {
    let active = -1;
    return {
      kind: 'dom',
      setActive(index) {
        if (index === active) return;
        active = index;
        images.forEach((img, i) => img.classList.toggle('is-active', i === index));
      },
      draw(s) {
        frame.style.rotate = `${clamp(s.dx * 0.05, -8, 8).toFixed(3)}deg`;
        return s.visible;
      },
      needsFrame() { return false; },
      planeSize() {
        const r = preview.getBoundingClientRect();
        return [r.width, r.height];
      },
      cornerOffset(s) {
        const [w, h] = this.planeSize();
        const a = (clamp(s.dx * 0.05, -8, 8) * Math.PI) / 180;
        const cx = -w / 2;
        const cy = h / 2;
        return [cx * Math.cos(a) - cy * Math.sin(a) - cx, cx * Math.sin(a) + cy * Math.cos(a) - cy];
      },
    };
  };

  /* ---------- Row click sound ---------- */

  // A short synthesized tick (Web Audio, no file to load): band-passed noise
  // for the transient plus a falling sine for body, with slight pitch jitter so
  // a sweep doesn't sound mechanical. Browsers only allow audio after the
  // visitor's first click or key press on the page, so the context is created
  // or resumed on that gesture; until then rows switch silently.
  const createClickSound = () => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return () => {};
    let ctx = null;
    let noise = null;
    let lastAt = 0;

    const unlock = () => {
      try {
        if (!ctx) {
          ctx = new AudioCtx({ latencyHint: 'interactive' });
          const length = Math.round(ctx.sampleRate * 0.04);
          noise = ctx.createBuffer(1, length, ctx.sampleRate);
          const data = noise.getChannelData(0);
          for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);
        }
        if (ctx.state === 'suspended') ctx.resume();
      } catch {
        ctx = null;
      }
    };
    ['pointerdown', 'keydown'].forEach((type) =>
      window.addEventListener(type, unlock, { capture: true, passive: true })
    );

    return () => {
      if (!ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (now - lastAt < 0.05) return; // fast sweeps tick, they don't buzz
      lastAt = now;
      const jitter = 0.92 + Math.random() * 0.16;

      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.playbackRate.value = jitter;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2600 * jitter;
      band.Q.value = 1.4;
      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.0001, now);
      clickGain.gain.exponentialRampToValueAtTime(0.16, now + 0.002);
      clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      src.connect(band).connect(clickGain).connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.045);

      const body = ctx.createOscillator();
      body.type = 'sine';
      body.frequency.setValueAtTime(1500 * jitter, now);
      body.frequency.exponentialRampToValueAtTime(420 * jitter, now + 0.025);
      const bodyGain = ctx.createGain();
      bodyGain.gain.setValueAtTime(0.0001, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.05, now + 0.002);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      body.connect(bodyGain).connect(ctx.destination);
      body.start(now);
      body.stop(now + 0.045);
    };
  };

  /* ---------- Preview controller ---------- */

  const initPreview = (list) => {
    const preview = list.querySelector('[data-pl-preview]');
    const frame = preview?.querySelector('[data-pl-frame]');
    const images = preview ? [...preview.querySelectorAll('[data-pl-media]')] : [];
    const rows = [...list.querySelectorAll('[data-pl-row]')];
    const rowList = list.querySelector('.pl__list');
    if (!preview || !frame || !rows.length || !rowList) return;

    // Webflow IX transforms section ancestors on scroll, which would turn
    // position:fixed into "fixed to that section"; live under <body> instead.
    document.body.appendChild(preview);

    // Motion state: (x, y) chases the pointer; (cx, cy) is the sheet's centre,
    // `off` px beside it; (dx, dy) is the deformation, driven by a damped
    // spring toward the current lag.
    const s = { x: 0, y: 0, off: 0, cx: 0, cy: 0, dx: 0, dy: 0, reveal: 0, visible: false, time: 0 };
    let side = 1; // 1: sheet right of the pointer, -1: left of it (no room on the right)
    let vx = 0;
    let vy = 0;
    let tx = 0;
    let ty = 0;
    let raf = 0;
    let last = 0;
    let activeRow = null;
    let activeIndex = -1;
    let pointerKnown = false;

    let renderer = null;
    const useDom = () => {
      renderer?.destroy?.();
      preview.classList.remove('is-gl');
      renderer = createDomRenderer(preview, frame, images);
      if (activeIndex >= 0) renderer.setActive(activeIndex);
    };

    // Build the renderer lazily, once the list is close to the viewport.
    const arm = () => {
      if (renderer) return;
      preview.hidden = false;
      // Touch-only devices never see the preview (CSS hides it), so they skip
      // the GL context and the eager image loads entirely.
      const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const gl = reduceMotion.matches || !finePointer ? null : createGLRenderer(preview, images);
      if (gl) {
        preview.classList.add('is-gl');
        renderer = gl;
        gl.onLost(useDom);
      } else {
        useDom();
      }
    };

    let near = !('IntersectionObserver' in window);
    if (near) {
      arm();
    } else {
      new IntersectionObserver(
        (entries) => {
          near = entries[entries.length - 1].isIntersecting;
          if (near) arm();
        },
        { rootMargin: '75% 0px' }
      ).observe(list);
    }

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const playClick = finePointer.matches ? createClickSound() : () => {};

    const GAP = 28; // px between the pointer and the sheet's near edge
    const EDGE = 16; // px kept clear of the viewport edge
    // Pick the side with room, with hysteresis so it can't flicker at the boundary.
    const updateSide = (w) => {
      const room = window.innerWidth - (GAP + w + EDGE);
      if (side > 0 && tx > room) side = -1;
      else if (side < 0 && tx < room - 80) side = 1;
      return side * (GAP + w / 2);
    };

    const STIFFNESS = 170;
    const DAMPING = 11; // under-damped (ζ≈0.42): a short jelly wobble when the cursor stops
    const STEP = 1 / 120;

    const tick = (now) => {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60);
      last = now;
      // Wrap at 20π: every wave rate used in the shaders (7, 1.3, 1.1) completes
      // whole cycles there, so the wrap is seamless and precision never degrades.
      s.time = (s.time + dt) % (20 * Math.PI);
      const still = reduceMotion.matches;

      const follow = still ? 1 : approach(0.17, dt);
      s.x += (tx - s.x) * follow;
      s.y += (ty - s.y) * follow;

      const [w, h] = renderer ? renderer.planeSize() : [1, 1];
      const offTarget = updateSide(w);
      s.off += (offTarget - s.off) * (still ? 1 : approach(0.14, dt));
      s.cx = s.x + s.off;
      s.cy = s.y;

      // Lag behind the pointer, plus any side switch in progress, bends the sheet.
      const targetX = still ? 0 : clamp(tx - s.x + offTarget - s.off, -w * 0.32, w * 0.32);
      const targetY = still ? 0 : clamp(ty - s.y, -h * 0.42, h * 0.42);
      for (let t = 0; t < dt; t += STEP) {
        const h2 = Math.min(STEP, dt - t);
        vx += (STIFFNESS * (targetX - s.dx) - DAMPING * vx) * h2;
        vy += (STIFFNESS * (targetY - s.dy) - DAMPING * vy) * h2;
        s.dx += vx * h2;
        s.dy += vy * h2;
      }

      s.reveal += ((s.visible ? 1 : 0) - s.reveal) * approach(s.visible ? 0.1 : 0.16, dt);

      preview.style.transform = `translate3d(${s.cx.toFixed(2)}px, ${s.cy.toFixed(2)}px, 0)`;
      if (renderer) {
        const [ox, oy] = renderer.cornerOffset(s);
        preview.style.setProperty('--pl-ox', `${ox.toFixed(2)}px`);
        preview.style.setProperty('--pl-oy', `${oy.toFixed(2)}px`);
      }
      const drawing = renderer ? renderer.draw(s, dt) : false;
      const moving = Math.abs(vx) + Math.abs(vy) > 0.5 || Math.abs(s.dx) + Math.abs(s.dy) > 0.25;

      if (s.visible || drawing || moving || renderer?.needsFrame()) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
        last = 0;
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const show = (row) => {
      if (!renderer) arm();
      if (row !== activeRow) {
        activeIndex = rows.indexOf(row);
        // First appearance shows the image straight away; later switches dissolve.
        renderer.setActive(activeIndex, !s.visible && s.reveal < 0.05);
        preview.toggleAttribute('data-linked', row.tagName === 'A');
        activeRow = row;
        playClick();
      }
      if (s.visible) return;
      if (s.reveal < 0.05) {
        // Appear at the pointer instead of flying in from the last spot,
        // with a small upward kick so the sheet settles in with a wobble.
        s.x = tx;
        s.y = ty;
        side = 1; // a fresh appearance prefers the right, flipping only if it must
        if (renderer) s.off = updateSide(renderer.planeSize()[0]);
        s.cx = s.x + s.off;
        s.cy = s.y;
        s.dx = 0;
        s.dy = 0;
        vx = 0;
        vy = reduceMotion.matches ? 0 : -260;
      }
      s.visible = true;
      preview.classList.add('is-visible');
      kick();
    };

    const hide = () => {
      if (!s.visible) return;
      s.visible = false;
      activeRow = null;
      preview.classList.remove('is-visible');
      kick();
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

      // Keyboard users get the same preview, parked beside the project name.
      row.addEventListener('focus', () => {
        if (!row.matches(':focus-visible')) return;
        const r = row.getBoundingClientRect();
        tx = r.left + r.width * 0.34;
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
      if (s.visible) kick();
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
