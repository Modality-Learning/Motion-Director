/* Motion Director kit: the screening-room player every film uses.
 * A film page holds <main id="player"><div id="stage">…</div></main> and calls Motion.mountPlayer(opts)
 * once its render(t) is defined. The player builds the poster, transport, scene list and background
 * switch around the stage, fits the stage to the page, and publishes window.__film for the render and
 * storyboard scripts. The stage is 1920×1080 unless the film sets --stage-w / --stage-h on #stage
 * (1080×1920 for a vertical film).
 *
 * opts: { duration, poster, scenes: [[name, start]], keys: [{ t, name, note }], render(t), invalidate() }
 *   poster      the frame shown before playing (pick the most telling moment)
 *   invalidate  called when fonts load or the tab returns, so the film can re-measure its layout
 *
 * URL options: ?t=12.4 opens at that time; ?still shows the stage alone, fitted to the window (used by
 * the renderer); ?board shows the storyboard, every key moment in a grid. The background is the
 * film's "background" parameter (white or textured; see promo/render/params.mjs). */
(() => {
  const { el, clamp } = window.Motion;
  const ICON_PLAY = '<path d="M7 4l13 8-13 8z"/>', ICON_PAUSE = '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>';

  function mountPlayer(opts) {
    const { duration, render, scenes = [], keys = [] } = opts;
    const invalidate = opts.invalidate || (() => {});
    const q = new URLSearchParams(location.search);
    const board = q.has('board');
    const still = q.has('still') || board;
    const embedded = window.parent !== window && /^https?:$/.test(location.protocol);
    // inside the studio the page is just the stage and its transport: no title, the stage fills the space
    if (embedded && !still) document.documentElement.classList.add('embedded');
    if (embedded) document.documentElement.classList.add('in-studio');
    // ?bare: the stage alone, no transport (the studio's Edit tab plays and scrubs from its own timeline)
    if (q.has('bare')) document.documentElement.classList.add('bare');
    const root = document.getElementById('player'), stage = document.getElementById('stage');
    const fmtS = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
    const W = stage.offsetWidth || 1920, H = stage.offsetHeight || 1080;

    /* ── chrome ── */
    const viewport = el('div', 'viewport', null);
    stage.replaceWith(viewport); viewport.appendChild(stage);
    if (!still) viewport.style.aspectRatio = `${W} / ${H}`; // ?still and ?board size the viewport themselves
    if (H > W) root.classList.add('portrait');
    stage.setAttribute('aria-hidden', 'true');
    let poster = null, playBtn, playLbl, playIco, scrub, timeLbl, sceneBtns = [];
    if (still) {
      document.documentElement.classList.add(board ? 'board' : 'still');
    } else {
      const top = el('div', 'top', `<h1></h1><p></p>`);
      top.querySelector('h1').textContent = root.dataset.title || document.title;
      top.querySelector('p').textContent = root.dataset.subtitle || '';
      root.prepend(top);
      viewport.id = 'viewport'; viewport.tabIndex = 0;
      viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', 'Film preview. Press space to play or pause.');
      poster = el('div', 'poster', `<button type="button"><svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="15" fill="#ececee"/><path d="M12 9.5l9 5.5-9 5.5z" fill="#111113"/></svg>Play the film \u00b7 ${fmtS(duration)}</button>`, viewport);
      const controls = el('div', 'controls', `
        <button class="cbtn primary" type="button" aria-label="Play"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICON_PLAY}</svg><span>Play</span></button>
        <span class="time"></span>
        <input type="range" min="0" max="${duration}" step="0.01" value="0" aria-label="Scrub through the film">
        <button class="cbtn" type="button" aria-label="Full screen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>`);
      viewport.after(controls);
      [playBtn, timeLbl, scrub] = controls.children;
      playLbl = playBtn.querySelector('span'); playIco = playBtn.querySelector('svg');
      const fsBtn = controls.lastElementChild;
      // ?bare leaves the scene list out (the studio's Edit tab has its own timeline, with the beats)
      if (scenes.length && !q.has('bare')) {
        const list = el('div', 'scenes', null); controls.after(list);
        list.style.setProperty('--n', scenes.length);
        sceneBtns = scenes.map(([name, s], i) => {
          const b = el('button', 'scene', `<b></b><span>${fmtS(s)}\u2013${fmtS(i < scenes.length - 1 ? scenes[i + 1][1] : duration)}</span><i></i>`, list);
          b.querySelector('b').textContent = name;
          b.type = 'button'; b.addEventListener('click', () => { seek(s); play(); });
          return b;
        });
      }
      playBtn.addEventListener('click', toggle);
      poster.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); play(); });
      // in the studio a click picks an element instead (see the studio link below); play with the button or space
      viewport.addEventListener('click', () => { if (embedded) return; if (poster.hidden) toggle(); else play(); });
      // read the dragged value before pausing: pause() re-syncs the slider to the old playhead
      scrub.addEventListener('input', () => { const v = parseFloat(scrub.value); playing = false; stopAudio(); seek(v); });
      document.addEventListener('keydown', (e) => {
        if (e.target === scrub) return;
        if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); toggle(); }
        if (e.key === 'ArrowRight') { pause(); seek(t + .5); }
        if (e.key === 'ArrowLeft') { pause(); seek(t - .5); }
      });
      fsBtn.addEventListener('click', () => {
        try { const r = document.fullscreenElement ? document.exitFullscreen() : viewport.requestFullscreen(); if (r && r.catch) r.catch(() => {}); } catch (_) {}
      });
    }

    /* ── transport ── */
    // ?t= opens at that time; in the studio (which passes the remembered playhead) nothing given means the start;
    // on its own, a film opens on its poster frame
    let t = q.has('t') ? clamp(parseFloat(q.get('t')) || 0, 0, duration) : embedded ? 0 : (opts.poster ?? 0);
    // the studio scrubs and picks, so it opens straight on the stage rather than behind the poster
    let playing = false, last = 0, started = still || q.has('t') || embedded;
    if (started && poster) poster.hidden = true;
    function syncUI() {
      if (still) return;
      playLbl.textContent = playing ? 'Pause' : (t >= duration ? 'Replay' : 'Play');
      playBtn.setAttribute('aria-label', playLbl.textContent);
      playIco.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      scrub.value = t; timeLbl.textContent = `${fmt(t)} / ${fmtS(duration)}`;
      sceneBtns.forEach((b, i) => {
        const a = scenes[i][1], isLast = i === scenes.length - 1, z = isLast ? duration : scenes[i + 1][1];
        b.classList.toggle('on', started && t >= a && t < z + (isLast ? 1 : 0));
        b.querySelector('i').style.width = started ? `${clamp((t - a) / (z - a)) * 100}%` : '0';
      });
    }
    function frame(now) {
      if (!playing) return;
      // with sound, the audio clock leads, so picture and sound stay together
      const at = audioTime();
      t = Math.min(duration, at ?? t + Math.min(.1, (now - last) / 1000)); last = now;
      render(t); syncUI(); afterRender(); tell({ type: 'time', t, playing: true });
      if (t >= duration) { playing = false; stopAudio(); syncUI(); tell({ type: 'time', t, playing: false }); return; }
      requestAnimationFrame(frame);
    }
    function play() {
      if (!started) { started = true; t = 0; }
      if (t >= duration) t = 0;
      if (poster) poster.hidden = true;
      playing = true; last = performance.now(); startAudio(t); syncUI(); tell({ type: 'time', t, playing: true }); requestAnimationFrame(frame);
    }
    function pause() { playing = false; stopAudio(); syncUI(); tell({ type: 'time', t, playing: false }); }

    /* ── sound: in the studio, the film's cues play with the preview. The studio sends voices (one per
     * cue per moment time, see kit/sound.mjs) with the URL of each sound; speed changes that keep pitch
     * arrive already stretched, so here a voice is a trimmed buffer at a time, a volume and fades. ── */
    const AU = { voices: [], ctx: null, out: null, bufs: new Map(), nodes: [], t0: 0, c0: null };
    const dbToGain = (db) => Math.pow(10, db / 20);
    function audioCtx() {
      if (!AU.ctx) {
        AU.ctx = new AudioContext(); AU.out = AU.ctx.createGain(); AU.out.connect(AU.ctx.destination);
        // what the studio's level meter reads: the mix as it plays
        AU.meter = AU.ctx.createAnalyser(); AU.meter.fftSize = 256; AU.meter.smoothingTimeConstant = 0.7; AU.out.connect(AU.meter);
      }
      return AU.ctx;
    }
    function loadBuffer(url) {
      if (!AU.bufs.has(url)) {
        const p = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then((b) => audioCtx().decodeAudioData(b)).then((buf) => { p.buf = buf; return buf; }).catch(() => null);
        AU.bufs.set(url, p);
      }
      return AU.bufs.get(url);
    }
    function audioTime() { return AU.c0 == null ? null : AU.t0 + Math.max(0, AU.ctx.currentTime - AU.c0); }
    function stopAudio() {
      for (const n of AU.nodes) { try { n.stop(); } catch { /* not started */ } }
      AU.nodes = []; AU.c0 = null;
    }
    function startAudio(from) {
      stopAudio();
      if (!AU.voices.length) return;
      const ctx = audioCtx(); ctx.resume().catch(() => {});
      // until the browser lets sound start (it needs a click), the picture plays on its own clock, silently;
      // the sound joins in where the picture is as soon as it is allowed
      if (ctx.state !== 'running') { ctx.onstatechange = () => { if (playing && ctx.state === 'running') startAudio(t); }; return; }
      const now = ctx.currentTime + 0.05; AU.t0 = from; AU.c0 = now;
      for (const v of AU.voices) {
        const buf = AU.bufs.get(v.url)?.buf;
        if (!buf) continue; // still loading; it joins on the next play
        const end = Math.min(v.to ?? buf.duration, buf.duration), len = Math.max(0, (end - v.from) / v.rate);
        if (v.at + len <= from || len <= 0) continue;
        const into = Math.max(0, from - v.at), when = now + Math.max(0, v.at - from);
        const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = v.rate;
        const g = ctx.createGain(), level = dbToGain(v.gain);
        // the volume envelope in the voice's own time: fade in, hold, fade out
        const fi = Math.min(v.fadeIn || 0, len), fo = Math.min(v.fadeOut || 0, len - fi);
        const env = (x) => level * (fi && x < fi ? x / fi : 1) * (fo && x > len - fo ? Math.max(0, (len - x) / fo) : 1);
        g.gain.setValueAtTime(env(into), when);
        for (const x of [fi, len - fo, len]) if (x > into) g.gain.linearRampToValueAtTime(env(x), when + x - into);
        src.connect(g).connect(AU.out);
        src.start(when, v.from + into * v.rate, (len - into) * v.rate);
        src.stop(when + len - into + 0.02);
        AU.nodes.push(src);
      }
    }
    function setVoices(voices) {
      AU.voices = Array.isArray(voices) ? voices : [];
      Promise.all(AU.voices.map((v) => loadBuffer(v.url))).then(() => { if (playing) startAudio(t); });
      if (playing) startAudio(t);
    }
    function toggle() { playing ? pause() : play(); }
    function seek(v) { started = true; if (poster) poster.hidden = true; t = clamp(v, 0, duration); render(t); syncUI(); afterRender(); tell({ type: 'time', t }); }
    // anything drawn over the stage (the selected object's boundary) catches up after each new moment
    let afterRender = () => {};

    /* ── background: a parameter, white by default; textured is the grain-and-blobs look ── */
    function setBg(v) { stage.classList.toggle('plain', v !== 'textured'); }
    setBg(window.Motion.param('background', q.get('bg') || 'white'));

    /* ── fit the 1920×1080 stage to its frame ──
     * In the studio's Edit tab (?bare) the view can also be zoomed and panned, like a compositor's viewer: the
     * studio's view bar sends zoom steps, Fit and 100%; a pinch (or ⌘/Ctrl-scroll) zooms about the pointer;
     * scrolling, a middle-button drag or the hand tool pans. Fit follows the frame as it resizes; a zoom you
     * chose stays put. Measuring reads positions in stage units, so the view never changes a measurement. */
    const viewable = q.has('bare') && embedded;
    const view = { fit: true, scale: 1, x: 0, y: 0, hand: false };
    const STEPS = [0.125, 0.25, 0.33, 0.5, 0.66, 0.75, 1, 1.5, 2, 3, 4];
    let toldView = '';
    let onView = () => {}; // set below: the hover outline follows the stage as it pans and zooms
    function applyView() {
      stage.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.scale})`;
      onView();
      const msg = JSON.stringify([Math.round(view.scale * 1000) / 1000, view.fit]);
      if (viewable && msg !== toldView) { toldView = msg; tell({ type: 'view', scale: view.scale, fit: view.fit }); }
    }
    // keeps some of the stage on screen, however far it is panned
    function clampPan() {
      const cw = viewport.clientWidth, ch = viewport.clientHeight, sw = W * view.scale, sh = H * view.scale, keep = 48;
      view.x = Math.min(cw - keep, Math.max(keep - sw, view.x));
      view.y = Math.min(ch - keep, Math.max(keep - sh, view.y));
    }
    function fit() {
      const cw = viewport.clientWidth, ch = viewport.clientHeight;
      if (view.fit || !viewable) {
        const sc = Math.min(cw / W, ch / H);
        Object.assign(view, { scale: sc, x: (cw - W * sc) / 2, y: (ch - H * sc) / 2 });
      } else clampPan();
      applyView();
      if (cw > 0) { render(t); afterRender(); }
    }
    /** Zooms to a scale (stage px → screen px) about a point in the viewport (its centre by default). */
    function zoomTo(scale, ax = viewport.clientWidth / 2, ay = viewport.clientHeight / 2) {
      const s = Math.min(8, Math.max(0.05, scale));
      view.x = ax - (ax - view.x) * (s / view.scale); view.y = ay - (ay - view.y) * (s / view.scale);
      view.scale = s; view.fit = false; clampPan(); applyView();
    }
    function viewCommand(m) {
      if (m.do === 'fit') { view.fit = true; fit(); }
      else if (m.do === 'set' && m.scale > 0) zoomTo(m.scale);
      else if (m.do === 'in') zoomTo(STEPS.find((v) => v > view.scale * 1.001) ?? view.scale * 1.5);
      else if (m.do === 'out') zoomTo([...STEPS].reverse().find((v) => v < view.scale * 0.999) ?? view.scale / 1.5);
      if (m.hand !== undefined) { view.hand = !!m.hand; document.documentElement.classList.toggle('hand', view.hand); }
    }
    new ResizeObserver(fit).observe(viewport); fit();
    if (viewable) {
      const local = (e) => { const r = viewport.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      viewport.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomTo(view.scale * Math.exp(-e.deltaY * 0.01), ...local(e)); return; }
        if (view.fit) return; // a fitted view has nothing to pan
        e.preventDefault(); view.x -= e.deltaX; view.y -= e.deltaY; clampPan(); applyView();
      }, { passive: false });
      // Safari's pinch
      let g0 = 1;
      viewport.addEventListener('gesturestart', (e) => { e.preventDefault(); g0 = view.scale; });
      viewport.addEventListener('gesturechange', (e) => { e.preventDefault(); zoomTo(g0 * e.scale, ...local(e)); });
      // panning: the hand tool's drag, or a middle-button drag; a pan is never also a click on the film
      let pan = null, panned = false;
      viewport.addEventListener('pointerdown', (e) => {
        if (!(view.hand && e.button === 0) && e.button !== 1) return;
        e.preventDefault(); e.stopPropagation(); viewport.setPointerCapture(e.pointerId);
        pan = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; panned = false;
        if (view.fit) { view.fit = false; tell({ type: 'view', scale: view.scale, fit: false }); }
        document.documentElement.classList.add('panning');
      }, true);
      viewport.addEventListener('pointermove', (e) => {
        if (!pan) return;
        e.stopPropagation();
        view.x = pan.vx + e.clientX - pan.x; view.y = pan.vy + e.clientY - pan.y; panned = true; clampPan(); applyView();
      }, true);
      const endPan = () => { pan = null; document.documentElement.classList.remove('panning'); };
      viewport.addEventListener('pointerup', endPan, true); viewport.addEventListener('pointercancel', endPan, true);
      viewport.addEventListener('click', (e) => { if (view.hand || panned) { e.stopPropagation(); e.preventDefault(); panned = false; } }, true);
      viewport.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); }, true);
      // with the hand tool nothing under the pointer is outlined or picked
      viewport.addEventListener('mousemove', (e) => { if (view.hand || pan) e.stopPropagation(); }, true);
    }
    const refresh = () => { invalidate(); render(t); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => {
      refresh();
      if (board) buildBoard();
      document.documentElement.dataset.ready = '1';
      // tell the studio what this page covers, then where it is
      if (embedded && !board) setInspect(true);
      tell({ type: 'ready', mode: board ? 'board' : 'motion', duration, keys, moments: window.Motion.moments, scopes: window.Motion.scopes.map(({ host, ...sc }) => ({ ...sc, ranges: sc.ranges.map(([a, b]) => [a, Number.isFinite(b) ? b : duration]) })) });
      if (!board) tell({ type: 'time', t });
    });

    /* ── the studio link: when the page is embedded in the promo studio, it reports the time and the
     * scopes on screen, takes live parameter values, and lets the studio inspect and highlight. ── */
    // in the studio, elements with parameters can be hovered and clicked (the storyboard's frames, and pages
    // the Edit tab doesn't put in select mode)
    let inspecting = false;
    function tell(msg) { if (embedded) parent.postMessage({ source: 'promo-film', ...msg }, location.origin); }
    function highlight(id) {
      document.querySelectorAll('.promo-hl').forEach((n) => n.classList.remove('promo-hl'));
      if (id) document.querySelectorAll(`[data-scope="${CSS.escape(id)}"]`).forEach((n) => n.classList.add('promo-hl'));
    }
    function setInspect(on) {
      inspecting = !!on && !board;
      document.documentElement.classList.toggle('inspecting', inspecting);
      if (!inspecting) { highlight(null); hoverAt(null); }
    }
    /* Whether the viewer can see an element. Hit-testing still finds elements the film has hidden: faded to
     * nothing (usually through a parent's opacity), visibility hidden, or on a fold face turned away
     * (backface-visibility hidden). Walks from root down, so a turned face hides everything on it. */
    function seen(n, root) {
      const chain = [];
      for (let e = n; e; e = e.parentElement) { chain.unshift(e); if (e === root) break; }
      let opacity = 1, m = new DOMMatrix();
      for (const e of chain) {
        const cs = getComputedStyle(e);
        opacity *= +cs.opacity;
        if (opacity < 0.04 || cs.visibility !== 'visible') return false;
        if (cs.transform !== 'none') m = m.multiply(new DOMMatrix(cs.transform));
        if (cs.backfaceVisibility === 'hidden' && m.m33 < 0.01) return false;
      }
      return true;
    }
    // the visible element with parameters at a point, looking through full-frame layers (titles, backgrounds)
    function scopedAt(x, y, root) {
      for (const n of document.elementsFromPoint(x, y)) {
        const hit = root.contains(n) && n.closest('[data-scope]');
        if (hit && root.contains(hit) && seen(n, root) && seen(hit, root)) return hit;
      }
      return null;
    }
    const scopeAt = (x, y) => scopedAt(x, y, stage)?.dataset.scope || null;
    /* comment mode in the preview: an element picker like the browser's. Elements with parameters snap to
     * the whole element; anything else is the innermost visible box; full-frame layers are the background,
     * which means the video at this moment. */
    let picking = false, frozen = false, labels = {};
    const pick = el('div', 'promo-pick', '<span class="promo-pick-tag"></span>', document.body);
    pick.hidden = true;
    const pickTag = pick.firstElementChild;
    function elementAt(x, y) {
      const sr = stage.getBoundingClientRect(), stageArea = sr.width * sr.height;
      for (let n of document.elementsFromPoint(x, y)) {
        if (!stage.contains(n) || n === stage || !seen(n, stage)) continue;
        const scoped = n.closest('[data-scope]');
        if (scoped && stage.contains(scoped)) { if (seen(scoped, stage)) return { el: scoped, scope: scoped.dataset.scope }; continue; }
        if (n instanceof SVGElement && n.ownerSVGElement) n = n.ownerSVGElement; // an icon, not its path
        const r = n.getBoundingClientRect();
        // too small to mean anything, or the size of the stage (a background); thin bars and lines still count
        if (r.width < 1 || r.height < 1 || r.width * r.height < 12 || r.width * r.height > stageArea * 0.85) continue;
        return { el: n };
      }
      return null;
    }
    // a short selector up to the nearest id, for finding the element in the film's code
    function selectorOf(n) {
      const parts = [];
      for (let e = n; e && e !== stage && parts.length < 4; e = e.parentElement) {
        if (e.id) { parts.unshift(`#${e.id}`); break; }
        const cls = [...e.classList].filter((c) => !c.startsWith('promo-')).slice(0, 2);
        parts.unshift(e.tagName.toLowerCase() + cls.map((c) => `.${c}`).join(''));
      }
      return parts.join(' > ');
    }
    const textOf = (n) => (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    let shownPick = null;
    function showPick(tg) {
      shownPick = tg;
      if (!tg) { pick.hidden = true; return; }
      const box = tg.el ? tg.el.getBoundingClientRect() : stage.getBoundingClientRect();
      const scale = stage.getBoundingClientRect().width / W;
      Object.assign(pick.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
      const txt = tg.el && !tg.scope ? textOf(tg.el) : '';
      const name = !tg.el ? `The video at ${fmt(t)}` : tg.scope ? (labels[tg.scope] || tg.scope) : txt ? `\u201c${txt.length > 44 ? `${txt.slice(0, 44)}\u2026` : txt}\u201d` : selectorOf(tg.el).split(' > ').pop();
      pickTag.textContent = tg.el ? `${name}  ${Math.round(box.width / scale)} \u00d7 ${Math.round(box.height / scale)}` : name;
      pick.classList.toggle('below', box.top < 30);
      pick.classList.toggle('frozen', frozen);
      pick.hidden = false;
    }
    // the outline is drawn over the page, so a pan or zoom moves it with the element it outlines
    onView = () => { if (shownPick && !pick.hidden) showPick(shownPick); };
    let pickNow = null;
    function setPicking(on) {
      picking = !!on && !board; frozen = false;
      document.documentElement.classList.toggle('picking', picking);
      if (picking) { pause(); hoverAt(null); } else { pickNow = null; showPick(null); }
    }
    /* select mode (the studio's Edit tab): hovering outlines any element you can see, like the comment
     * picker; a click picks it, so the studio can draw how it moves across the film (motionCurve). */
    let sounding = false, soundEl = null;
    function setSounding(on) {
      sounding = !!on && !board;
      document.documentElement.classList.toggle('sounding', sounding);
      if (!sounding) showPick(null);
    }
    const elementName = (n) => { const txt = textOf(n); return txt ? `\u201c${txt.length > 44 ? `${txt.slice(0, 44)}\u2026` : txt}\u201d` : selectorOf(n).split(' > ').pop(); };
    /* where an element is, precisely enough to find it again: up to the nearest id, each step by its place
     * among siblings of its kind (#aMsgs > div:nth-of-type(7) > div:nth-of-type(2)) */
    function addressOf(n) {
      const parts = [];
      for (let e = n; e && e !== stage; e = e.parentElement) {
        if (e.id) { parts.unshift(`#${CSS.escape(e.id)}`); break; }
        const same = [...e.parentElement.children].filter((x) => x.tagName === e.tagName);
        parts.unshift(`${e.tagName.toLowerCase()}${same.length > 1 ? `:nth-of-type(${same.indexOf(e) + 1})` : ''}`);
      }
      return parts[0]?.startsWith('#') ? parts.join(' > ') : `#stage > ${parts.join(' > ')}`;
    }
    const find = (address) => { try { const n = document.querySelector(address); return n && stage.contains(n) ? n : null; } catch { return null; } };
    /* the selected object, marked with a plain box drawn over the preview (an outline on the element itself
     * would be cut off by anything that clips it). It follows the element and shows only while the element
     * can be seen, by the pickers' own test (seen: opacity, visibility, fold faces turned away). */
    const selBox = el('div', 'promo-selbox', null, document.body);
    selBox.hidden = true;
    let selLoop = 0, measuring = false;
    function drawSel() {
      cancelAnimationFrame(selLoop);
      if (!soundEl || !document.contains(soundEl)) { selBox.hidden = true; return; }
      if (!measuring) {
        const r = soundEl.getBoundingClientRect();
        selBox.hidden = !(seen(soundEl, stage) && r.width >= 1 && r.height >= 1);
        if (!selBox.hidden) Object.assign(selBox.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
      }
      selLoop = requestAnimationFrame(drawSel); // keeps up with playing, scrubbing and resizing
    }
    afterRender = () => { if (soundEl) drawSel(); };
    function pickSoundEl(n) {
      soundEl = n || null;
      drawSel();
    }
    /* how an element is turned, in degrees, from its transforms and its parents' inside the stage: its spin in
     * the plane (rotate) and how far its face is tilted away (rotateX/Y, a flap swinging, a card flipping) */
    function turnOf(n) {
      const chain = [];
      for (let e = n; e && e !== stage; e = e.parentElement) chain.unshift(e);
      let m = new DOMMatrix();
      // only the rotation in each transform: moves, perspective and scale say nothing about which way it faces
      // (a parent's 2D scale stretches x and y but not depth, and would flatten a tilt), so each axis is unit length
      for (const e of chain) {
        const tf = getComputedStyle(e).transform; if (tf === 'none') continue;
        const t = new DOMMatrix(tf);
        for (const c of [1, 2, 3]) {
          const len = Math.hypot(t[`m${c}1`], t[`m${c}2`], t[`m${c}3`]) || 1;
          for (const r of [1, 2, 3]) t[`m${c}${r}`] /= len;
        }
        t.m14 = t.m24 = t.m34 = t.m41 = t.m42 = t.m43 = 0; t.m44 = 1;
        m = m.multiply(t);
      }
      const spin = (Math.atan2(m.m12, m.m11) * 180) / Math.PI;
      // the face's normal (its x axis crossed with its y axis); a face turned past edge-on reads as tilted back
      const nx = m.m12 * m.m23 - m.m13 * m.m22, ny = m.m13 * m.m21 - m.m11 * m.m23, nz = m.m11 * m.m22 - m.m12 * m.m21;
      const tilt = (Math.acos(Math.min(1, Math.abs(nz) / (Math.hypot(nx, ny, nz) || 1))) * 180) / Math.PI;
      return [spin, tilt];
    }
    /* how much of an element shows: its opacity times every parent's, 0 when hidden */
    function shown(n) {
      let o = 1;
      for (let e = n; e && e !== document.documentElement; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.visibility !== 'visible' || cs.display === 'none') return 0;
        o *= +cs.opacity;
      }
      return o;
    }
    /* The picked element across the whole film: [t, x, y, w, h, shown, spin, tilt] (stage pixels, degrees),
     * Rendered in batches between paints, ending back where the preview was, so nothing visibly jumps. */
    async function motionCurve(step = 0.04, address = null) {
      const target = address ? find(address) : soundEl;
      if (!target || !document.contains(target)) return null;
      // a preview that isn't laid out (its tab hidden) has no sizes: only fades would register, so nothing is measured
      const box = stage.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return null;
      const keep = t, out = [];
      measuring = true; // the boundary holds still while every moment is rendered for measuring
      pause();
      for (let i = 0, n = Math.floor(duration / step); i <= n; i++) {
        const s = Math.min(duration, i * step);
        render(s);
        const r = target.getBoundingClientRect(), sr = stage.getBoundingClientRect(), k = sr.width / W;
        out.push([s, (r.left - sr.left + r.width / 2) / k, (r.top - sr.top + r.height / 2) / k, r.width / k, r.height / k, shown(target), ...turnOf(target)]);
        if (i % 120 === 119) { render(keep); await new Promise((ok) => setTimeout(ok)); }
      }
      render(keep); measuring = false; afterRender(); // the boundary catches up once measuring is done
      return out;
    }
    function showMoment(id) {
      document.querySelectorAll('.promo-hl').forEach((n) => n.classList.remove('promo-hl'));
      if (id) document.querySelectorAll('[data-moments]').forEach((n) => { if (n.dataset.moments.split(' ').includes(id)) n.classList.add('promo-hl'); });
    }
    let hovered = null;
    function hoverAt(id) {
      if (id === hovered) return;
      document.querySelectorAll('.promo-hover').forEach((n) => n.classList.remove('promo-hover'));
      if (id) document.querySelectorAll(`[data-scope="${CSS.escape(id)}"]`).forEach((n) => n.classList.add('promo-hover'));
      stage.style.cursor = id ? 'pointer' : '';
      hovered = id;
    }
    if (embedded) {
      viewport.addEventListener('mousemove', (e) => {
        if (sounding && !picking) { const tg = elementAt(e.clientX, e.clientY); showPick(tg); if (tg) pickTag.textContent = tg.scope ? (labels[tg.scope] || elementName(tg.el)) : elementName(tg.el); return; }
        if (!picking || frozen) return;
        const tg = elementAt(e.clientX, e.clientY);
        pickNow = tg || { el: null };
        showPick(pickNow);
      });
      viewport.addEventListener('mouseleave', () => { if (picking ? !frozen : sounding) showPick(null); });
      viewport.addEventListener('click', (e) => {
        if (sounding && !picking) {
          e.stopPropagation(); e.preventDefault();
          const tg = elementAt(e.clientX, e.clientY);
          pickSoundEl(tg?.el);
          // an element with parameters also says which, so the studio can show them
          tell({ type: 'elementPick', label: tg ? (tg.scope && labels[tg.scope]) || elementName(tg.el) : null, address: tg ? addressOf(tg.el) : null, scope: tg?.scope || null });
          return;
        }
        if (!picking) return;
        e.stopPropagation(); e.preventDefault();
        const tg = elementAt(e.clientX, e.clientY) || { el: null };
        pickNow = tg; frozen = true; showPick(tg);
        tell({ type: 'commentAt', view: 'motion', t, scope: tg.scope || null, selector: tg.el && !tg.scope ? selectorOf(tg.el) : null, text: tg.el && !tg.scope ? textOf(tg.el) || null : null, client: { x: e.clientX, y: e.clientY } });
      }, true);
      stage.addEventListener('click', (e) => {
        if (!inspecting || picking || sounding) return;
        e.stopPropagation();
        const id = scopeAt(e.clientX, e.clientY);
        highlight(id);
        if (id) tell({ type: 'pick', id });
      }, true);
      stage.addEventListener('mousemove', (e) => { if (inspecting && !picking && !sounding) hoverAt(scopeAt(e.clientX, e.clientY)); });
      if (board) {
        document.addEventListener('mousemove', (e) => { if (commenting) showCommentTarget(commentTargetAt(e.clientX, e.clientY)); });
        document.addEventListener('mouseleave', () => showCommentTarget(null));
        /* text beside the frames (the brief's beats) takes comments too: select some in comment mode and the
         * studio opens a comment on that text, quoting it, with the beat it belongs to */
        document.addEventListener('mouseup', (e) => {
          if (!commenting) return;
          const sel = document.getSelection(), text = sel ? sel.toString().replace(/\s+/g, ' ').trim() : '';
          const row = sel && sel.anchorNode ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest('.beat-row') : null;
          if (!text || !row || !row.querySelector('.beat-text')?.contains(sel.anchorNode)) return;
          const i = [...row.parentElement.children].indexOf(row), r = sel.getRangeAt(0).getBoundingClientRect();
          const beat = row.__beat;
          tell({ type: 'commentQuote', text: text.slice(0, 600), t: beat ? +beat.from : 0, beat: beat ? { time: beat.time || row.querySelector('.beat-time').textContent, title: beat.title || null } : { time: row.querySelector('.beat-time').textContent, title: null }, index: i, client: { x: r.left + r.width / 2, y: r.bottom } });
        });
      }
      /* comment mode's cursor: the pointer stays as it is (an arrow, or a text cursor over words you can
       * select) and a small speech bubble follows it */
      const bubble = el('div', 'comment-bubble', '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M4 4h20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H11l-6 5v-5H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>', document.body);
      bubble.hidden = true;
      document.addEventListener('mousemove', (e) => {
        const on = commenting || picking;
        bubble.hidden = !on;
        if (on) bubble.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 14}px)`;
      });
      document.addEventListener('mouseleave', () => { bubble.hidden = true; });
      // the studio's shortcuts work while focus is in the preview: C toggles comment mode, Esc leaves it
      document.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
        if (e.key === 'c' || e.key === 'C' || e.key === 'Escape') tell({ type: 'key', key: e.key === 'Escape' ? 'Escape' : 'c' });
      });
      stage.addEventListener('mouseleave', () => hoverAt(null));
      window.addEventListener('message', (e) => {
        if (e.origin !== location.origin || e.source !== parent || e.data?.source !== 'promo-studio') return;
        const m = e.data;
        if (m.type === 'commentMode') {
          commenting = !!m.on && board;
          document.documentElement.classList.toggle('commenting', commenting);
          if (!commenting) showCommentTarget(null);
          if (!board) setPicking(m.on);
          if (!m.on) bubble.hidden = true;
        } else if (m.type === 'commentDone') { frozen = false; showPick(null); }
        else if (m.type === 'labels') labels = m.labels || {};
        else if (m.type === 'params') {
          window.__promoLive = { ...(window.__promoLive || {}), ...m.values };
          if ('background' in m.values) setBg(m.values.background);
          refresh();
          if (board) refreshBoard();
        } else if (m.type === 'highlight') highlight(m.id);
        else if (m.type === 'seek' && !board) { playing = false; stopAudio(); seek(m.t); syncUI(); }
        else if (m.type === 'play' && !board) { if (Number.isFinite(m.from)) seek(m.from); play(); }
        else if (m.type === 'pause' && !board) pause();
        else if (m.type === 'audio' && !board) setVoices(m.voices);
        else if (m.type === 'soundMode' && !board) setSounding(m.on);
        else if (m.type === 'moment') showMoment(m.id);
        else if (m.type === 'toggle' && !board) toggle();
        else if (m.type === 'view' && viewable) viewCommand(m);
        else if (m.type === 'beats' && board) layoutBoard(m.beats);
        else if (m.type === 'elementClear') pickSoundEl(null);
        else if (m.type === 'selectElement') pickSoundEl(find(m.address));
      });
    }

    /* ── ?board: the storyboard. Each key moment is rendered, then the stage is cloned as it stands,
     * so the board is the film itself at those times, not a separate drawing. ── */
    /* comments (storyboard): what a click would comment on, an element with parameters or the whole frame */
    let commenting = false;
    function commentTargetAt(x, y) {
      const cell = document.elementFromPoint(x, y)?.closest('.board-cell');
      if (!cell) return null;
      const clone = cell.querySelector('#stage');
      const hit = scopedAt(x, y, clone);
      return { cell, scope: hit ? hit.dataset.scope : null };
    }
    function showCommentTarget(tg) {
      document.querySelectorAll('.promo-hover').forEach((n) => n.classList.remove('promo-hover'));
      document.querySelectorAll('.board-cell.frame-hover').forEach((c) => c.classList.remove('frame-hover'));
      if (!tg) return;
      if (tg.scope) tg.cell.querySelectorAll(`[data-scope="${CSS.escape(tg.scope)}"]`).forEach((n) => n.classList.add('promo-hover'));
      else tg.cell.classList.add('frame-hover');
    }
    function buildBoard() {
      const cw = H > W ? 300 : 600, sec = el('section', 'board', null, root);
      sec.style.setProperty('--cell', cw + 'px'); sec.style.setProperty('--cell-h', (cw * H / W) + 'px');
      const h1 = el('h1', null, null, sec);
      h1.textContent = `${root.dataset.title || document.title} \u00b7 storyboard`;
      const grid = el('div', 'board-grid', null, sec);
      for (const k of keys) {
        const cell = el('figure', 'board-cell', null, grid);
        const frame = el('div', 'board-frame', null, cell);
        const clone = snapshot(k, cw);
        frame.appendChild(clone);
        cell.dataset.key = k.name;
        cell.addEventListener('click', (e) => {
          grid.querySelectorAll('.board-cell.sel').forEach((c) => c.classList.remove('sel')); cell.classList.add('sel');
          tell({ type: 'time', t: k.t, key: k.name });
          const hit = scopedAt(e.clientX, e.clientY, frame.firstElementChild);
          if (commenting) tell({ type: 'commentAt', key: k.name, t: k.t, scope: hit ? hit.dataset.scope : null, client: { x: e.clientX, y: e.clientY } });
          else if (hit) tell({ type: 'pick', id: hit.dataset.scope });
        });
        const cap = el('figcaption', null, '<b></b><span></span><p></p>', cell);
        cap.querySelector('b').textContent = k.name;
        cap.querySelector('span').textContent = fmt(k.t);
        cap.querySelector('p').textContent = k.note || '';
      }
      if (boardBeats) layoutBoard(boardBeats); else render(t);
    }
    /* The brief's beats (the studio reads them from BRIEF.md and sends them): the frames are laid out beat by
     * beat, each beat's time above it, its title and what happens on the left, and the frames whose time falls
     * in it on the right. Frames outside every beat get rows of their own; with no beats, the grid. The cells
     * are moved, not rebuilt, so clicking, comments and the selection carry on as before. */
    let boardBeats = null;
    // a beat's title and text as the brief wrote them: **bold** and *italic* kept, everything else as text
    function inlineInto(node, text) {
      const re = /\*\*([^*]+)\*\*|(?<![\w*])[*_]([^*_]+)[*_](?![\w*])/g;
      let last = 0, m;
      while ((m = re.exec(text))) {
        if (m.index > last) node.append(text.slice(last, m.index));
        const b = document.createElement(m[1] ? 'strong' : 'em'); b.textContent = m[1] || m[2]; node.append(b);
        last = m.index + m[0].length;
      }
      if (last < text.length) node.append(text.slice(last));
      return node;
    }
    // the frames' size beside the beats: as wide as their column, up to a limit (a vertical film's stays shorter)
    const beatCell = (sec) => {
      const col = sec.querySelector('.beat-frames'), w = col ? col.clientWidth : 0;
      return Math.round(Math.max(H > W ? 180 : 320, Math.min(w || (H > W ? 280 : 560), H > W ? 380 : 960)));
    };
    let beatsSized = 0;
    const beatsResize = new ResizeObserver(() => {
      const sec = document.querySelector('section.board.with-beats'); if (!sec) return;
      const cw = beatCell(sec);
      if (Math.abs(cw - beatsSized) < 8) return;
      beatsSized = cw; sec.style.setProperty('--cell', cw + 'px'); sec.style.setProperty('--cell-h', (cw * H / W) + 'px'); refreshBoard();
    });
    function layoutBoard(beats) {
      boardBeats = Array.isArray(beats) && beats.length ? beats : null;
      const sec = document.querySelector('section.board'); if (!sec) return;
      const cells = [...sec.querySelectorAll('.board-cell')];
      sec.querySelector('.board-grid')?.remove(); sec.querySelector('.board-beats')?.remove();
      sec.classList.toggle('with-beats', !!boardBeats);
      if (!boardBeats) {
        beatsResize.disconnect();
        const cw = H > W ? 300 : 600;
        sec.style.setProperty('--cell', cw + 'px'); sec.style.setProperty('--cell-h', (cw * H / W) + 'px');
        const grid = el('div', 'board-grid', null, sec); cells.forEach((c) => grid.appendChild(c)); refreshBoard(); return;
      }
      const rows = boardBeats.map((b) => ({ from: +b.from, to: +b.to, beat: b, cells: [] }));
      keys.forEach((k, i) => {
        const row = rows.find((r) => k.t >= r.from - 1e-6 && k.t < r.to - 1e-6) || rows.find((r) => Math.abs(k.t - r.to) < 1e-6 && r.to >= duration - 1e-6);
        if (row) row.cells.push(cells[i]); else rows.push({ from: k.t, to: null, beat: null, cells: [cells[i]] });
      });
      rows.sort((a, b) => a.from - b.from);
      const list = el('div', 'board-beats', null, sec);
      for (const r of rows) {
        const row = el('article', 'beat-row', null, list);
        row.__beat = r.beat;
        el('header', 'beat-time', null, row).textContent = r.to == null ? fmt(r.from) : `${fmt(r.from)} \u2013 ${fmt(r.to)}`;
        const txt = el('div', 'beat-text', null, row);
        // its on-screen title when the brief gives one; otherwise the storyboard's names for its frames
        if (r.beat?.title) inlineInto(el('h2', null, null, txt), r.beat.title);
        else if (r.cells.length) el('h2', 'beat-name', null, txt).textContent = r.cells.map((c) => c.dataset.key).join(' \u00b7 ');
        if (r.beat?.text) inlineInto(el('p', null, null, txt), r.beat.text);
        for (const x of r.beat?.extra || []) { const p = el('p', 'beat-extra', null, txt); el('b', null, null, p).textContent = x.label; inlineInto(p, ` ${x.value}`); }
        if (!r.beat) el('p', 'beat-none', null, txt).textContent = 'Not in a beat of the brief.';
        const frames = el('div', 'beat-frames', null, row);
        if (r.cells.length) r.cells.forEach((c) => frames.appendChild(c));
        else el('p', 'beat-none', null, frames).textContent = 'No storyboard frame in this beat yet.';
      }
      beatsSized = beatCell(sec);
      sec.style.setProperty('--cell', beatsSized + 'px'); sec.style.setProperty('--cell-h', (beatsSized * H / W) + 'px');
      beatsResize.disconnect(); beatsResize.observe(sec);
      refreshBoard();
    }
    /* one key's frame: the stage rendered at that moment and cloned as it stands */
    function snapshot(k, cw) {
        render(k.t);
        const clone = stage.cloneNode(true);
        // SVG filters, masks and gradients are found by id: give each clone its own, so it keeps the
        // settings it had at this moment instead of following the live stage
        clone.querySelectorAll('filter[id], mask[id], clipPath[id], linearGradient[id], radialGradient[id]').forEach((d) => {
          const old = d.id, neu = `${old}-k${keys.indexOf(k)}`;
          d.id = neu;
          clone.querySelectorAll('[filter],[mask],[clip-path],[fill],[stroke]').forEach((n) => {
            for (const a of ['filter', 'mask', 'clip-path', 'fill', 'stroke']) {
              const v = n.getAttribute(a);
              if (v && v.includes(`#${old})`)) n.setAttribute(a, v.replace(`#${old})`, `#${neu})`));
            }
          });
        });
        clone.style.transform = `scale(${cw / W})`;
        // in the studio, clicking a frame shows that moment's parameters; clicking an element focuses its own
        clone.style.pointerEvents = 'auto';
        return clone;
    }
    /* a parameter changed in the studio: each frame is drawn again where it is, so the board updates as you
     * type, keeping its place and selection (it isn't reloaded) */
    let boardSoon = 0;
    function refreshBoard() {
      clearTimeout(boardSoon);
      boardSoon = setTimeout(() => {
        const sec = document.querySelector('section.board'); if (!sec) return;
        const cw = parseFloat(sec.style.getPropertyValue('--cell')) || (H > W ? 300 : 600);
        sec.querySelectorAll('.board-cell').forEach((cell) => {
          const k = keys.find((x) => x.name === cell.dataset.key), frame = cell.querySelector('.board-frame');
          if (k && frame) frame.replaceChildren(snapshot(k, cw));
        });
        render(t);
      }, 60);
    }

    render(t); syncUI();
    /* the contract the render and storyboard scripts rely on */
    window.__film = Object.assign(window.__film || {}, { duration, size: { w: W, h: H }, keys, scenes, seek, render, setBg, invalidate: refresh, time: () => t, motionCurve,
      audio: () => ({ state: AU.ctx?.state || 'none', voices: AU.voices.length, loaded: [...AU.bufs.values()].filter((p) => p.buf).length, scheduled: AU.nodes.length }),
      // the mix's spectrum right now (0–255 per band, low to high), or null when nothing is playing
      meter: () => { if (!AU.meter || !playing || AU.c0 == null) return null; const a = new Uint8Array(AU.meter.frequencyBinCount); AU.meter.getByteFrequencyData(a); return a; } });
    return window.__film;
  }

  window.Motion.mountPlayer = mountPlayer;
})();
