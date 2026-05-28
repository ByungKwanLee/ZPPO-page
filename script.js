/* =============================================================
   NVIDIA-ZPPO project page — interactivity
   ============================================================= */

// ---------- Theme toggle ----------
(() => {
  const root = document.documentElement;
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('zppo-theme', next); } catch (e) {}
  });
})();

// ---------- TL;DR · Performance "Train" interactive animation ----------
// User picks a student model size (0.8B / 2B / 4B / 9B), then clicks "Train".
// Bars grow from center 0 outward, numbers count up from +0.0 to their final
// Δ-pp value (computed live from DATA), and an "RL Training 0% → 100%"
// progress indicator advances in sync.
(() => {
  const panel = document.querySelector('.perf');
  if (!panel) return;
  // Train button has been retired — clicking a Student Size button is now the
  // sole user trigger for training (plus a one-shot auto-train when the panel
  // first scrolls into view). We still defensively look up the old elements in
  // case stray markup ever ships, and guard every use with optional chaining.
  const btn        = panel.querySelector('#perfTrainBtn');
  const btnLabel   = panel.querySelector('.perf__train-label');
  const progFill   = panel.querySelector('#perfProgressFill');
  const progNum    = panel.querySelector('#perfProgressNum');
  const chip       = panel.querySelector('#perfSizeChip');
  const footSize   = document.getElementById('perfFootSize');
  if (!progFill || !progNum) return;
  // Headline impact-bar (the slim 4-segment strip below the TL;DR panel).
  // We capture its live elements so the same Train animation can drive its
  // numbers and the size labels in lock-step with the per-cell counters.
  const impactBar      = document.getElementById('impactBar');
  const impactValEls   = impactBar
    ? Array.from(impactBar.querySelectorAll('.impact-bar__val[data-fam]'))
    : [];
  const impactSizeEls  = impactBar
    ? Array.from(impactBar.querySelectorAll('.impact-bar__size'))
    : [];

  // Map row data-method → key in DATA tables (replay-buffer variants only)
  const METHOD_KEY_TO_DATA = {
    off:  'Off-Distill†',
    on:   'On-Distill†',
    grpo: 'GRPO†',
    zppo: 'ZPPO',
  };
  const FAMILIES = ['LLM', 'VLM', 'Video']; // column order in the perf table

  // Currently selected size. Starts at 0.8B to match the static HTML.
  let currentSize = '0.8B';

  // Paper-canonical Δ values that override the per-cell average computation.
  // Re-averaging 1-dp DATA arrays produces small cumulative rounding drift
  // versus the paper's reported deltas (e.g. ZPPO VLM @ 0.8B computes to 9.24
  // → rounds to 9.2, but the paper reports +9.3). Hardcode the figure values
  // here so what the user sees matches the manuscript exactly.
  const DELTA_OVERRIDES = {
    '0.8B': {
      VLM:   { off:  0.5, on:  1.3, grpo:  4.4, zppo:  9.3 },
      LLM:   { off: -2.7, on: -2.0, grpo:  3.5, zppo:  7.9 },
      Video: { off: -3.3, on: -2.5, grpo:  2.2, zppo:  4.5 },
    },
    '2B': {
      VLM:   { off:  0.5, on:  1.2, grpo:  2.4, zppo:  5.2 },
      LLM:   { off: -2.2, on: -1.6, grpo:  2.0, zppo:  5.1 },
      Video: { off: -2.0, on: -1.4, grpo:  1.3, zppo:  2.6 },
    },
    '4B': {
      VLM:   { off: -0.4, on:  0.9, grpo:  1.8, zppo:  4.0 },
      LLM:   { off: -0.9, on: -0.4, grpo:  1.1, zppo:  3.9 },
      Video: { off: -1.8, on: -1.2, grpo:  0.3, zppo:  0.3 },
    },
    '9B': {
      VLM:   { off: -0.3, on:  0.7, grpo:  1.2, zppo:  2.8 },
      LLM:   { off: -0.2, on:  0.2, grpo:  1.3, zppo:  3.9 },
      Video: { off: -1.3, on: -0.7, grpo: -0.4, zppo:  0.4 },
    },
  };

  function computeDeltas(size) {
    // Assumes the global `DATA` const (declared later in this file) is in scope
    // by the time this runs — i.e. on user interaction or via deferred init.
    const override = DELTA_OVERRIDES[size];
    const out = {};
    for (const fam of FAMILIES) {
      const base = DATA[fam][size]['Base'];
      const baseAvg = base.reduce((a, b) => a + b, 0) / base.length;
      out[fam] = {};
      for (const [k, full] of Object.entries(METHOD_KEY_TO_DATA)) {
        if (override && override[fam] && override[fam][k] != null) {
          out[fam][k] = override[fam][k];
          continue;
        }
        const arr = DATA[fam][size][full];
        const av  = arr.reduce((a, b) => a + b, 0) / arr.length;
        out[fam][k] = Math.round((av - baseAvg) * 10) / 10;
      }
    }
    return out;
  }

  function maxAbsDelta(deltas) {
    let m = 0;
    for (const fam of FAMILIES) for (const k in deltas[fam]) {
      m = Math.max(m, Math.abs(deltas[fam][k]));
    }
    return Math.max(m, 1); // floor at 1pp so micro-bars still render
  }

  // Format a delta value:
  //   - rounds to 1 dp (so very small swings stay readable)
  //   - returns plain "0.0" without sign when the rounded result is zero
  //   - prefixes "+" for positive and "−" (U+2212) for negative
  function fmtVal(v) {
    const r = Math.round(v * 10) / 10;
    if (r === 0) return '0.0';
    const sign = r > 0 ? '+' : '−';
    return sign + Math.abs(r).toFixed(1);
  }
  // Apply the sign-based color class to a value element:
  //   v > 0  → perf__val--pos  (green, or perf__val--zppo for ZPPO row)
  //   v < 0  → perf__val--neg  (red)
  //   v ≈ 0  → no class        (neutral / default fg color)
  function applyValColor(el, v, method) {
    const r = Math.round(v * 10) / 10;
    el.classList.remove('perf__val--pos', 'perf__val--neg', 'perf__val--zppo');
    if (r === 0) return;
    if (r > 0) {
      el.classList.add(method === 'zppo' ? 'perf__val--zppo' : 'perf__val--pos');
    } else {
      el.classList.add('perf__val--neg');
    }
  }

  function applySize(size) {
    let deltas, scale;
    try {
      // DATA is a top-level const declared later in this file — it's in lexical
      // scope here (resolved at call time, well after the script has finished
      // parsing), but we still wrap in try/catch so any data-shape mismatch
      // gets reported instead of silently breaking the click handler.
      deltas = computeDeltas(size);
      scale  = maxAbsDelta(deltas);
    } catch (err) {
      console.error('[perf] applySize failed for size =', size, err);
      return;
    }

    currentSize = size;

    panel.querySelectorAll('.perf__row[data-method]').forEach(row => {
      const method = row.getAttribute('data-method');
      const cells  = row.querySelectorAll('.perf__cell');
      FAMILIES.forEach((fam, i) => {
        const cell = cells[i];
        if (!cell) return;
        const d        = deltas[fam][method];
        const sign     = d >= 0 ? 'pos' : 'neg';
        const widthPct = (Math.abs(d) / scale) * 100;
        const finalStr = fmtVal(d);

        cell.setAttribute('data-sign', sign);

        const fill = cell.querySelector('.perf__fill');
        if (fill) {
          fill.style.setProperty('--w', widthPct.toFixed(1) + '%');
          fill.setAttribute('data-final', finalStr);
          if (method !== 'zppo') {
            fill.classList.remove('perf__fill--pos', 'perf__fill--neg');
            fill.classList.add(sign === 'pos' ? 'perf__fill--pos' : 'perf__fill--neg');
          }
        }
        const val = cell.querySelector('.perf__val');
        if (val) {
          val.setAttribute('data-final', finalStr);
          // Color is decided dynamically as the value crosses zero during the
          // training animation — see applyValColor in runTraining/resetUI.
          val.classList.remove('perf__val--pos', 'perf__val--neg', 'perf__val--zppo');
        }
      });
    });

    if (chip)     chip.textContent     = size;
    if (footSize) footSize.textContent = size;

    // Impact-bar (slim NVIDIA-green stats strip) tracks the ZPPO Δ for the
    // currently-selected student size, so its hero numbers stay in sync with
    // the table above.
    impactValEls.forEach(el => {
      const fam = el.getAttribute('data-fam');
      if (!fam || !deltas[fam]) return;
      el.setAttribute('data-final', fmtVal(deltas[fam].zppo));
    });
    impactSizeEls.forEach(el => { el.textContent = size; });

    resetUI();
    if (btn) {
      btn.classList.remove('is-done');
      btn.disabled = false;
    }
    if (btnLabel) btnLabel.textContent = 'VLM Training';
  }

  // Total run duration must match the longest staggered CSS animation:
  //   max delay (ZPPO = 700ms) + animation duration (3600ms) = 4300ms
  const DURATION   = 3600;
  const DELAYS     = { off: 200, on: 350, grpo: 500, zppo: 700 };
  const TOTAL_RUN  = 4300;
  const ease       = t => 1 - Math.pow(1 - t, 3);

  const valEls = Array.from(panel.querySelectorAll('.perf__val'));

  function formatVal(v) {
    const sign = v >= 0 ? '+' : '−';
    return sign + Math.abs(v).toFixed(1);
  }
  function parseFinal(el) {
    const s = (el.getAttribute('data-final') || '+0.0').replace('−', '-').replace('+', '');
    return parseFloat(s) || 0;
  }

  // Monotonic token that identifies the currently-active training run.
  // Any in-flight requestAnimationFrame ticks compare this against their own
  // captured token and self-cancel if a newer run (or a size change) has
  // started in the meantime — that's how we let the user re-click Train or
  // switch Student Size mid-training without leftover frames stomping on the
  // fresh state.
  let runToken = 0;

  function resetUI() {
    panel.classList.remove('is-visible');
    progFill.style.width = '0%';
    progNum.textContent  = '0%';
    valEls.forEach(el => {
      el.textContent = '0.0';
      el.classList.remove('perf__val--pos', 'perf__val--neg', 'perf__val--zppo');
    });
    // Reset the headline impact-bar back to neutral 0.0 so each Train run
    // visibly counts those numbers up from scratch.
    impactValEls.forEach(el => { el.textContent = '0.0'; });
  }

  function runTraining() {
    // Bump the token so any previous in-flight ticks bail out on their next
    // frame; the new run then proceeds with a clean slate.
    runToken += 1;
    const myToken = runToken;

    if (btn) btn.classList.remove('is-done');
    panel.classList.add('is-training');
    resetUI();

    // Force reflow so CSS animations restart cleanly on repeat clicks
    void panel.offsetWidth;
    panel.classList.add('is-visible');

    // Animate per-cell counter, respecting each row's stagger delay.
    // Each frame we also re-classify the value as positive (green) or
    // negative (red) so the color flips the moment the number crosses zero.
    panel.querySelectorAll('.perf__row[data-method]').forEach(row => {
      const method = row.getAttribute('data-method');
      const delay  = DELAYS[method] ?? 200;
      row.querySelectorAll('.perf__val').forEach(el => {
        const finalNum = parseFinal(el);
        const start    = performance.now() + delay;
        const tick = (now) => {
          if (myToken !== runToken) return; // run was cancelled / superseded
          const t = Math.min(1, Math.max(0, (now - start) / DURATION));
          const v = finalNum * ease(t);
          el.textContent = formatVal(v);
          applyValColor(el, v, method);
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    });

    // Headline impact-bar: count each ZPPO number up alongside the table.
    // We reuse the ZPPO row's stagger delay so the hero strip and the table
    // both finish at the same moment.
    const impactDelay = DELAYS.zppo;
    impactValEls.forEach(el => {
      const finalNum = parseFinal(el);
      const start    = performance.now() + impactDelay;
      const tick = (now) => {
        if (myToken !== runToken) return;
        const t = Math.min(1, Math.max(0, (now - start) / DURATION));
        const v = finalNum * ease(t);
        el.textContent = formatVal(v);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    // Global RL Training progress (0% → 100%) — spans the full run
    const start = performance.now();
    const progressTick = (now) => {
      if (myToken !== runToken) return; // run was cancelled / superseded
      const t = Math.min(1, Math.max(0, (now - start) / TOTAL_RUN));
      const pct = Math.round(t * 100);
      progFill.style.width = pct + '%';
      progNum.textContent  = pct + '%';
      if (t < 1) requestAnimationFrame(progressTick);
      else {
        if (btn) btn.classList.add('is-done');
        panel.classList.remove('is-training');
        // Training run finished — bars settle at their final Δ-pp values.
        // The next training run starts whenever the user picks a Student
        // Size, or never again if they leave it alone.
      }
    };
    requestAnimationFrame(progressTick);
  }

  // Size selector wire-up — use event delegation on the controls container so
  // a single listener covers all current/future .perf__size buttons even if
  // the DOM gets re-rendered later. With the Train button retired, picking a
  // Student Size *is* the train trigger: every click swaps in the new size's
  // deltas and immediately runs a fresh training animation.
  const sizesGroup = panel.querySelector('.perf__sizes-group') || panel;
  sizesGroup.addEventListener('click', (ev) => {
    const b = ev.target && ev.target.closest && ev.target.closest('.perf__size');
    if (!b || !sizesGroup.contains(b)) return;
    const size = b.dataset.size;
    if (!size) return;
    // Always refresh the visual highlight, even on re-click of the same size,
    // so the active state stays in sync with the DOM after any external mutation.
    sizesGroup.querySelectorAll('.perf__size').forEach(x => {
      x.classList.remove('is-active');
      x.setAttribute('aria-checked', 'false');
    });
    b.classList.add('is-active');
    b.setAttribute('aria-checked', 'true');
    // Cancel any in-flight run, swap in the new size's deltas (applySize also
    // calls resetUI so bars + numbers return to 0.0), then start a fresh
    // training animation. Clicking the same size that's already active also
    // re-runs — that's a natural "play again" affordance now that there's no
    // dedicated button.
    runToken += 1;
    panel.classList.remove('is-training');
    applySize(size);
    runTraining();
  });

  // Honor reduced-motion: skip animation, snap to final values + colors
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    panel.classList.add('is-visible');
    valEls.forEach(el => {
      const v   = parseFinal(el);
      const row = el.closest('.perf__row[data-method]');
      const method = row ? row.getAttribute('data-method') : null;
      el.textContent = formatVal(v);
      applyValColor(el, v, method);
    });
    impactValEls.forEach(el => {
      const v = parseFinal(el);
      el.textContent = formatVal(v);
    });
    progFill.style.width = '100%';
    progNum.textContent  = '100%';
    if (btn) btn.classList.add('is-done');
    return;
  }

  // No explicit Train button anymore — training fires from:
  //   (1) the auto-train IntersectionObserver below (first time the panel
  //       scrolls into view, with the default 0.8B size), and
  //   (2) the Student Size click delegate above (every subsequent pick).

  // Auto-train on first scroll-into-view.
  // Wire up an IntersectionObserver so that as soon as the TL;DR panel is
  // ~30% visible in the viewport, the Train run kicks off automatically (with
  // the default 0.8B student size). After the first auto-trigger we disconnect
  // the observer — subsequent training runs only happen via explicit Train
  // clicks or Student-size changes.
  if ('IntersectionObserver' in window) {
    let autoStarted = false;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        if (autoStarted) continue;
        autoStarted = true;
        // Small delay so the entrance feels intentional and the bars/numbers
        // animate after the panel has visually settled.
        setTimeout(() => runTraining(), 280);
        io.disconnect();
        break;
      }
    }, { threshold: 0.3 });
    io.observe(panel);
  }
})();

// ---------- Scroll progress bar ----------
(() => {
  const bar = document.getElementById('navProgress');
  if (!bar) return;
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const h = document.documentElement;
      const scrolled = h.scrollTop || document.body.scrollTop;
      const total = (h.scrollHeight - h.clientHeight) || 1;
      bar.style.width = Math.min(100, (scrolled / total) * 100) + '%';
      ticking = false;
    });
  };
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();

/* =============================================================
   TL;DR · Training trajectory animation
   Endpoint Δ (pp) values from Fig. 1 at Qwen3.5 0.8B.
   Curves are illustrative monotonic interpolations.
   ============================================================= */
(() => {
  const root = document.getElementById('trajectory');
  if (!root) return;

  // Final Δ (pp) at 0.8B from Fig. 1
  const ENDPOINTS = {
    LLM:   { off: -2.7, on: -2.0, grpo: 3.5, zppo: 7.9 },
    VLM:   { off:  0.5, on:  1.3, grpo: 4.4, zppo: 9.3 },
    Video: { off: -3.3, on: -2.5, grpo: 2.2, zppo: 4.5 },
  };

  // Per-chart y-range with comfortable headroom
  const YRANGE = {
    LLM:   { min: -5, max: 10 },
    VLM:   { min: -3, max: 11 },
    Video: { min: -5, max: 6 },
  };

  const METHODS = ['off', 'on', 'grpo', 'zppo'];

  // Curve shape per method — same monotonic family, different easing
  function curveValue(method, final, t) {
    // helpers
    const ss   = t * t * (3 - 2 * t);          // smoothstep
    const eOut2 = 1 - (1 - t) ** 2;             // ease-out quad
    const eOut3 = 1 - (1 - t) ** 3;             // ease-out cubic
    const wave = Math.sin(Math.PI * t);         // 0→1→0
    const small = Math.sin(2 * Math.PI * t) * (1 - t); // small wiggle that decays
    switch (method) {
      case 'zppo':
        // accelerating ramp with tiny ripple
        return final * ss + 0.10 * small;
      case 'grpo':
        // fast rise → plateau
        return final * eOut2 - 0.06 * small;
      case 'on':
        if (final >= 0) {
          // gentle rise with tiny early dip
          return final * eOut3 - 0.45 * wave * 0.4;
        }
        // tiny positive bump then decay toward final negative
        return Math.min(0.45, 0.45 * wave * (1 - t)) + final * (t * t);
      case 'off':
        if (final >= 0) {
          return final * eOut3 - 0.7 * wave * 0.4;
        }
        return Math.min(0.55, 0.55 * wave * (1 - t)) + final * (t ** 1.8);
    }
    return 0;
  }

  // SVG namespace
  const NS = 'http://www.w3.org/2000/svg';
  const VB_W = 360, VB_H = 230;
  const PAD = { left: 36, right: 64, top: 32, bottom: 30 };
  const PLOT_W = VB_W - PAD.left - PAD.right;
  const PLOT_H = VB_H - PAD.top - PAD.bottom;
  const N_SAMPLES = 80;

  function yScale(modality, value) {
    const { min, max } = YRANGE[modality];
    const norm = (value - min) / (max - min);
    return PAD.top + (1 - norm) * PLOT_H;
  }
  function xScale(t) {
    return PAD.left + t * PLOT_W;
  }

  function buildPath(modality, method, final) {
    const pts = [];
    for (let i = 0; i <= N_SAMPLES; i++) {
      const t = i / N_SAMPLES;
      const v = curveValue(method, final, t);
      pts.push(`${xScale(t).toFixed(2)},${yScale(modality, v).toFixed(2)}`);
    }
    return 'M' + pts.join(' L');
  }

  function el(name, attrs = {}, parent) {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function buildChart(container) {
    const modality = container.dataset.modality;
    const label    = container.dataset.label || modality;
    const data     = ENDPOINTS[modality];
    const yr       = YRANGE[modality];

    // chart label
    const tag = document.createElement('div');
    tag.className = 'traj-chart__label';
    tag.textContent = label;
    container.appendChild(tag);

    const svg = el('svg', {
      viewBox: `0 0 ${VB_W} ${VB_H}`,
      role: 'img',
      'aria-label': `${label}: Δ vs training progress`
    }, container);

    // y gridlines + zero line
    const gridValues = [];
    for (let v = Math.ceil(yr.min); v <= Math.floor(yr.max); v++) {
      if (v % 2 === 0) gridValues.push(v);
    }
    gridValues.forEach(v => {
      const y = yScale(modality, v);
      el('line', {
        class: v === 0 ? 'traj-zero' : 'traj-grid',
        x1: PAD.left, y1: y, x2: VB_W - PAD.right, y2: y
      }, svg);
      el('text', {
        class: 'traj-axis-label',
        x: PAD.left - 6, y: y + 3.5,
        'text-anchor': 'end'
      }, svg).textContent = (v > 0 ? '+' : '') + v;
    });

    // x-axis baseline
    el('line', {
      class: 'traj-axis',
      x1: PAD.left, y1: VB_H - PAD.bottom,
      x2: VB_W - PAD.right, y2: VB_H - PAD.bottom
    }, svg);
    // x labels
    [['0%', PAD.left], ['50%', PAD.left + PLOT_W / 2], ['100%', PAD.left + PLOT_W]]
      .forEach(([txt, x]) => {
        el('text', {
          class: 'traj-axis-label',
          x, y: VB_H - PAD.bottom + 14,
          'text-anchor': 'middle'
        }, svg).textContent = txt;
      });
    // x axis title
    el('text', {
      class: 'traj-axis-label',
      x: PAD.left + PLOT_W / 2, y: VB_H - 4,
      'text-anchor': 'middle'
    }, svg).textContent = 'Training progress';
    // y axis title (Δ pp)
    el('text', {
      class: 'traj-axis-label',
      x: 8, y: PAD.top - 10,
    }, svg).textContent = 'Δ (pp)';

    // method lines + endpoint dots/labels
    const lines = {};
    const dots = {};
    const labels = {};
    METHODS.forEach(m => {
      const final = data[m];
      const d = buildPath(modality, m, final);
      const p = el('path', {
        class: `traj-line traj-line--${m}`,
        d,
        'pathLength': 1,
      }, svg);
      // dasharray = 1 (uniform), offset is animated 1→0
      p.style.strokeDasharray = '1 1';
      p.style.strokeDashoffset = '1';
      lines[m] = p;

      // endpoint dot
      const ex = xScale(1);
      const ey = yScale(modality, final);
      const dot = el('circle', {
        class: `traj-enddot traj-enddot--${m}`,
        cx: ex, cy: ey, r: m === 'zppo' ? 4.2 : 3,
        fill: getComputedStyle(document.documentElement).getPropertyValue(`--traj-${m}`).trim() || '#76B900',
        stroke: 'rgba(0,0,0,0.35)',
        'stroke-width': 0.5
      }, svg);
      dots[m] = dot;

      // endpoint label (e.g., "+7.9")
      const sign = final > 0 ? '+' : '';
      const txt = el('text', {
        class: `traj-endlabel traj-endlabel--${m}`,
        x: ex + 6,
        y: ey + (m === 'zppo' ? -4 : 4),
        'text-anchor': 'start'
      }, svg);
      txt.textContent = sign + final.toFixed(1);
      labels[m] = txt;
    });

    return { svg, lines, dots, labels };
  }

  // Build all charts
  const charts = [...root.querySelectorAll('.traj-chart')].map(buildChart);
  const barFill = root.querySelector('.trajectory__bar-fill');
  const pctNum  = root.querySelector('[data-progress]');

  // ----- Animation loop -----
  const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DELAY_IN     = 350;    // pause before drawing
  const DRAW_DUR     = 3600;   // draw lines over this much
  const HOLD_DUR     = 5200;   // hold final state (long enough to read endpoints)
  const FADE_OUT     = 450;    // fade out before reset
  const PERIOD       = DELAY_IN + DRAW_DUR + HOLD_DUR + FADE_OUT;

  function easeInOut(t) { return t * t * (3 - 2 * t); }

  let startTs = null;
  let visible = true; // start running by default; IO will pause when off-screen
  let raf = 0;

  function setState(progress, opacity, endVis) {
    // line: stroke-dashoffset goes from 1 → 0 as progress increases
    charts.forEach(({ lines, dots, labels }) => {
      METHODS.forEach(m => {
        const ln = lines[m];
        ln.style.strokeDashoffset = String(1 - progress);
        ln.style.opacity = String(opacity);
        const ev = endVis * (progress > 0.94 ? 1 : 0);
        dots[m].style.opacity = String(ev);
        labels[m].style.opacity = String(ev);
      });
    });
    barFill.style.transform = `scaleX(${progress})`;
    barFill.style.opacity = String(opacity);
    if (pctNum) pctNum.textContent = String(Math.round(progress * 100));
  }

  if (REDUCE_MOTION) {
    // Render static final state
    setState(1, 1, 1);
    return;
  }

  function frame(ts) {
    if (!visible) { raf = 0; return; }
    if (startTs == null) startTs = ts;
    const elapsed = (ts - startTs) % PERIOD;

    let progress = 0;
    let opacity = 1;
    let endVis = 0;

    if (elapsed < DELAY_IN) {
      progress = 0; opacity = 0; endVis = 0;
    } else if (elapsed < DELAY_IN + DRAW_DUR) {
      const t = (elapsed - DELAY_IN) / DRAW_DUR;
      progress = easeInOut(t);
      opacity = Math.min(1, (elapsed - DELAY_IN) / 220);
      endVis  = progress > 0.94 ? (progress - 0.94) / 0.06 : 0;
    } else if (elapsed < DELAY_IN + DRAW_DUR + HOLD_DUR) {
      progress = 1; opacity = 1; endVis = 1;
    } else {
      const t = (elapsed - DELAY_IN - DRAW_DUR - HOLD_DUR) / FADE_OUT;
      progress = 1; opacity = Math.max(0, 1 - t); endVis = opacity;
    }

    setState(progress, opacity, endVis);
    raf = requestAnimationFrame(frame);
  }

  // Auto-start so the chart is always alive (also works in headless capture);
  // IO toggles pause/resume to save CPU when off-screen.
  raf = requestAnimationFrame(frame);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (!visible) {
            visible = true;
            if (!raf) { startTs = null; raf = requestAnimationFrame(frame); }
          }
        } else {
          visible = false;
          if (raf) { cancelAnimationFrame(raf); raf = 0; }
        }
      });
    }, { threshold: 0.15 });
    io.observe(root);
  }
})();

/* =============================================================
   Results table: interactive selection by (size × family)
   ============================================================= */

// Benchmark column orders
const COLS = {
  VLM: ['AI2D','BabyV','CharXiv','DynaM','EmbSp','InfoVQA','MVerse','MVision','MVista','MMMU^Pro','MM-Vet','OCR^EN','OCR^ZH','VisP','VBlind','WeMath'],
  LLM: ['AIME25','AIME26','CEval','GPQA-D','HLE','IMO-AB','MMLU','MMLU-Pro','MMLU-Rd','MultiCh'],
  Video: ['MMVU','MVBench','VMME','VMME^S','VMMMU']
};

// All data rows keyed by [family][size][method]
// Source: Table 1, 2 (0.8B/2B main); Table appendix_table1, appendix_table2 (4B/9B).
// Methods order: Base, Off-Distill, Off-Distill†, On-Distill, On-Distill†, GRPO, GRPO†, ZPPO
const DATA = {
  VLM: {
    '0.8B': {
      'Base':        [65.6,6.7,54.3,17.8,67.9,68.6,43.5,16.4,60.7,26.8,53.2,40.0,17.0,20.5,42.8,54.4],
      'Off-Distill': [66.3,6.7,55.1,19.4,65.8,66.0,45.3,17.3,62.0,27.6,51.5,38.9,16.2,20.0,41.8,55.9],
      'Off-Distill†':[66.7,6.7,56.0,20.1,65.8,66.8,45.8,17.9,62.2,29.0,51.8,39.5,15.9,20.8,42.2,56.4],
      'On-Distill':  [67.6,7.5,56.0,20.0,66.7,67.1,45.8,19.4,62.7,28.2,52.7,39.6,16.7,21.2,41.5,57.7],
      'On-Distill†': [68.6,7.8,56.4,21.1,67.1,67.6,47.4,18.7,63.6,28.8,52.5,39.1,16.7,20.9,42.3,58.6],
      'GRPO':        [69.5,8.6,57.0,21.3,69.2,71.0,47.7,20.1,65.2,29.9,55.6,40.9,17.0,24.2,43.2,60.6],
      'GRPO†':       [71.2,9.8,59.9,23.6,69.4,72.4,51.1,20.9,68.3,30.5,57.5,41.3,17.5,27.8,43.6,62.5],
      'ZPPO':        [76.5,13.9,63.9,31.1,71.5,75.3,59.3,29.2,73.2,37.6,59.9,42.5,18.7,35.0,44.7,71.7],
    },
    '2B': {
      'Base':        [81.9,11.6,71.6,41.1,78.2,81.2,69.7,38.4,78.6,46.2,69.7,44.7,24.0,38.3,55.2,77.9],
      'Off-Distill': [82.5,11.9,71.0,43.2,77.2,80.2,70.8,40.4,77.9,47.4,69.2,44.4,23.0,38.4,53.7,79.5],
      'Off-Distill†':[82.9,12.5,71.4,43.7,77.4,80.4,71.4,41.8,77.8,47.9,69.2,44.5,23.7,37.8,54.6,79.3],
      'On-Distill':  [82.6,13.1,71.7,44.5,77.6,81.1,71.9,41.9,78.2,48.8,69.2,45.3,23.9,38.8,54.9,79.3],
      'On-Distill†': [83.4,12.8,71.7,44.9,77.5,80.9,72.0,42.7,77.9,49.3,69.4,45.5,24.5,38.8,55.6,80.6],
      'GRPO':        [83.5,13.7,72.8,45.6,78.3,82.4,72.3,43.1,79.0,49.3,72.3,46.1,24.9,39.2,56.5,80.4],
      'GRPO†':       [83.8,14.4,73.0,45.9,78.7,83.1,72.8,43.4,79.3,49.6,74.0,46.4,25.2,40.3,57.0,80.7],
      'ZPPO':        [85.3,18.6,73.9,52.7,79.5,84.6,76.0,50.5,80.5,53.2,77.1,48.8,26.0,42.0,60.5,82.6],
    },
    '4B': {
      'Base':        [88.7,16.0,78.7,59.3,82.1,88.5,83.1,64.3,83.9,64.0,78.4,50.8,28.9,47.4,66.4,89.2],
      'Off-Distill': [87.2,17.5,80.3,60.9,80.6,86.4,83.7,67.0,83.0,64.8,76.8,51.0,29.4,47.6,66.9,90.2],
      'Off-Distill†':[87.0,17.7,80.0,60.7,81.1,86.8,83.7,67.5,82.9,65.1,77.7,52.0,28.3,48.8,67.4,90.6],
      'On-Distill':  [87.1,17.5,80.7,61.5,81.0,87.2,83.9,67.8,84.0,65.6,78.2,51.3,29.5,48.2,67.8,90.6],
      'On-Distill†': [88.2,17.4,80.5,61.6,80.5,87.7,84.5,67.6,83.8,65.6,78.2,52.0,30.0,48.7,67.8,91.4],
      'GRPO':        [88.4,18.9,80.5,61.5,81.3,88.0,84.6,68.3,84.1,66.0,78.7,52.2,30.6,49.2,68.4,90.8],
      'GRPO†':       [88.5,20.9,81.4,61.4,82.0,88.1,84.5,68.3,85.3,65.5,78.4,52.4,30.4,51.0,69.4,91.8],
      'ZPPO':        [89.6,27.8,82.8,63.9,82.4,88.8,85.7,72.2,85.4,67.1,79.8,54.6,33.0,54.5,74.9,92.6],
    },
    '9B': {
      'Base':        [90.2,22.9,82.9,62.5,82.1,87.8,86.9,70.8,86.3,67.7,83.0,50.0,31.7,55.3,71.7,90.9],
      'Off-Distill': [89.1,23.0,82.0,64.7,80.9,88.1,85.7,73.2,85.5,67.9,81.4,51.1,32.4,54.4,73.4,91.0],
      'Off-Distill†':[89.2,23.4,82.6,64.8,80.7,88.6,86.1,72.8,85.5,68.6,81.1,51.6,32.2,55.2,73.7,91.5],
      'On-Distill':  [89.5,24.3,82.2,64.6,81.0,89.5,86.5,72.9,86.4,69.1,82.8,51.6,32.6,54.1,73.3,91.5],
      'On-Distill†': [89.1,24.0,83.0,64.6,80.9,89.5,86.4,73.5,86.4,69.6,82.9,52.0,32.5,55.6,73.6,91.8],
      'GRPO':        [89.8,24.7,83.4,65.3,80.4,89.6,87.4,74.3,86.0,69.1,83.2,52.2,32.9,55.9,73.3,91.8],
      'GRPO†':       [90.2,24.0,83.2,65.1,81.4,89.6,87.9,75.0,87.3,68.9,83.0,52.2,32.9,55.7,74.3,92.2],
      'ZPPO':        [90.8,26.3,83.7,66.7,82.1,91.4,88.1,75.9,87.5,70.2,83.9,56.7,35.6,56.4,79.4,92.9],
    }
  },
  LLM: {
    '0.8B': {
      'Base':        [3.3,0.0,52.3,12.1,2.2,3.3,57.7,41.7,62.5,16.6],
      'Off-Distill†':[0.0,0.0,47.9,10.1,2.1,2.9,52.6,38.3,56.9,14.7],
      'On-Distill†': [0.0,0.0,49.2,10.6,2.8,4.0,53.8,38.8,58.2,14.9],
      'GRPO†':       [3.3,0.0,54.5,25.5,3.5,7.0,59.9,47.1,65.1,20.8],
      'ZPPO':        [3.3,0.0,57.6,42.4,5.0,10.5,63.0,51.7,69.0,28.6],
    },
    '2B': {
      'Base':        [26.7,30.0,71.1,53.5,3.5,11.3,74.6,66.2,80.4,35.8],
      'Off-Distill†':[26.7,26.7,68.2,50.3,2.0,10.9,71.2,63.8,77.5,34.0],
      'On-Distill†': [23.3,30.0,69.3,51.9,3.8,11.5,72.2,63.8,77.9,34.0],
      'GRPO†':       [26.7,33.3,72.4,56.5,4.2,19.3,75.4,67.3,81.4,37.3],
      'ZPPO':        [26.7,40.0,74.0,60.6,5.1,29.5,76.4,68.2,82.9,40.6],
    },
    '4B': {
      'Base':        [53.3,63.3,83.6,69.7,7.8,35.5,85.3,79.4,89.5,48.9],
      'Off-Distill†':[53.3,63.3,83.0,68.2,6.3,35.7,83.7,77.3,88.1,48.1],
      'On-Distill†': [53.3,63.3,82.6,69.3,7.8,35.8,85.0,77.8,88.6,48.2],
      'GRPO†':       [53.3,63.3,84.6,73.5,7.1,40.6,85.9,79.2,88.9,50.7],
      'ZPPO':        [56.7,66.7,86.1,77.3,8.3,48.0,86.0,79.7,90.1,56.0],
    },
    '9B': {
      'Base':        [60.0,70.0,84.0,77.3,8.9,38.8,87.3,81.1,90.5,50.8],
      'Off-Distill†':[60.0,70.0,84.5,76.8,8.4,39.3,87.5,79.9,89.5,51.0],
      'On-Distill†': [60.0,70.0,84.2,77.4,9.2,39.4,87.2,81.2,90.5,52.1],
      'GRPO†':       [63.3,70.0,85.3,77.8,8.8,43.6,87.4,81.3,90.9,53.0],
      'ZPPO':        [70.0,73.3,87.2,78.8,9.8,49.8,88.1,82.0,91.7,56.8],
    }
  },
  Video: {
    '0.8B': {
      'Base':        [39.0,51.6,50.3,51.6,48.8],
      'Off-Distill†':[35.4,48.9,46.8,48.5,45.4],
      'On-Distill†': [36.8,49.2,47.8,49.6,45.7],
      'GRPO†':       [41.3,53.5,52.2,53.0,52.5],
      'ZPPO':        [42.5,56.6,53.9,54.9,56.4],
    },
    '2B': {
      'Base':        [53.7,60.7,59.9,61.2,67.6],
      'Off-Distill†':[51.5,59.2,57.9,59.0,65.4],
      'On-Distill†': [52.4,59.9,58.6,59.4,65.5],
      'GRPO†':       [56.7,61.7,61.2,62.6,67.3],
      'ZPPO':        [59.0,62.7,62.4,63.9,68.1],
    },
    '4B': {
      'Base':        [69.2,70.2,68.1,69.9,80.3],
      'Off-Distill†':[67.9,67.4,66.4,68.8,78.2],
      'On-Distill†': [68.7,67.8,67.0,69.3,78.9],
      'GRPO†':       [69.2,69.1,68.2,68.7,79.4],
      'ZPPO':        [70.6,69.6,68.5,70.2,80.2],
    },
    '9B': {
      'Base':        [73.8,71.4,70.5,72.4,80.9],
      'Off-Distill†':[72.5,69.6,68.5,71.5,80.8],
      'On-Distill†': [73.0,70.4,69.6,71.6,80.7],
      'GRPO†':       [73.1,71.5,69.3,71.2,82.0],
      'ZPPO':        [74.2,71.7,70.2,72.8,82.1],
    }
  }
};

// Method display
// Without-replay-buffer variants removed (Off-Distill, On-Distill, GRPO) — replay buffer is the canonical setup
const METHODS_FULL = ['Base','Off-Distill†','On-Distill†','GRPO†','ZPPO'];

const avg = arr => arr.reduce((a,b)=>a+b,0) / arr.length;
const round1 = x => Math.round(x*10)/10;

function makeSuper(label){
  // Render columns like 'OCR^EN' as 'OCR' + <sup>EN</sup>
  const idx = label.indexOf('^');
  if (idx < 0) return label;
  return label.slice(0, idx) + '<sup>' + label.slice(idx+1) + '</sup>';
}

let CURRENT = { size: '0.8B', fam: 'VLM' };

function methodCell(m){
  // ZPPO row gets a special class via row; just render label here
  if (m === 'ZPPO') return '<span class="method-pill"><strong>+ ZPPO</strong></span>';
  if (m === 'Base') return `<span class="method-pill">Qwen3.5-${CURRENT.size}</span>`;
  return `<span class="method-pill">+ ${m.replace('†','<span class="dagger">†</span>')}</span>`;
}

function renderTable() {
  const head = document.getElementById('resultsHead');
  const body = document.getElementById('resultsBody');
  if (!head || !body) return;

  const fam = CURRENT.fam;
  const size = CURRENT.size;

  // Build column list. Last column is ALWAYS the Avg column (highlighted).
  // For ALL family, 'Macro Avg' IS the average column — no extra Avg appended.
  let cols;
  if (fam === 'ALL') {
    cols = ['VLM Avg', 'LLM Avg', 'Video Avg', 'Macro Avg'];
  } else {
    cols = [...COLS[fam], 'Avg'];
  }

  // Head
  let html = `<th class="col-method">Method</th>`;
  cols.forEach((c, i) => {
    const isAvg = (i === cols.length - 1);
    html += `<th${isAvg ? ' class="col-avg"' : ''}>${makeSuper(c)}</th>`;
  });
  head.innerHTML = html;

  // Methods present at this (fam,size)
  let methods;
  if (fam === 'LLM' || fam === 'Video') {
    // only 5 methods reported at these (Base, Off†, On†, GRPO†, ZPPO)
    methods = ['Base','Off-Distill†','On-Distill†','GRPO†','ZPPO'];
  } else if (fam === 'VLM') {
    methods = METHODS_FULL.slice();
  } else { // ALL
    methods = ['Base','Off-Distill†','On-Distill†','GRPO†','ZPPO'];
  }

  // helper to get row values for a method at current size & family
  function rowVals(method) {
    if (fam === 'ALL') {
      // Macro avg over families that exist for this method
      const fams = ['VLM','LLM','Video'];
      const vals = fams.map(f => {
        const row = DATA[f][size][method];
        return row ? avg(row) : null;
      });
      const macroSrc = vals.filter(v => v !== null);
      const macro = macroSrc.length ? avg(macroSrc) : null;
      return [...vals, macro];
    }
    const v = DATA[fam][size][method];
    return v ? [...v, avg(v)] : null;
  }

  // For Δ on the Avg column, find strongest non-ZPPO method
  function strongestNonZppo(colIndex) {
    let max = -Infinity;
    methods.forEach(m => {
      if (m === 'ZPPO') return;
      const vals = rowVals(m);
      if (!vals) return;
      const v = vals[colIndex];
      if (typeof v === 'number' && v > max) max = v;
    });
    return max;
  }

  // Build tbody
  let rows = '';
  methods.forEach(m => {
    const vals = rowVals(m);
    if (!vals) return;
    const isZPPO = m === 'ZPPO';
    const isBase = m === 'Base';
    const trClass = isZPPO ? 'row-zppo' : (isBase ? 'row-base' : '');
    let tr = `<tr class="${trClass}"><td class="col-method">${methodCell(m)}</td>`;
    vals.forEach((v, i) => {
      const isAvg = (i === vals.length - 1);
      const cls = isAvg ? ' cell-avg' : '';
      tr += `<td class="${cls.trim()}">${round1(v).toFixed(1)}</td>`;
    });
    tr += `</tr>`;
    rows += tr;
  });

  // Δ row (only when ZPPO present and >1 method)
  const zppoVals = rowVals('ZPPO');
  if (zppoVals && methods.length > 1) {
    let dr = `<tr class="row-delta"><td class="col-method"><span class="method-pill">Δ</span></td>`;
    zppoVals.forEach((zv, i) => {
      const opp = strongestNonZppo(i);
      let delta = (zv - opp);
      delta = Math.round(delta * 10) / 10;
      let cls, text;
      if (delta > 0) { cls = 'delta-pos'; text = `+${delta.toFixed(1)}`; }
      else if (delta < 0) { cls = 'delta-neg'; text = `−${Math.abs(delta).toFixed(1)}`; }
      else { cls = 'delta-zero'; text = '0.0'; }
      const isAvg = (i === zppoVals.length - 1);
      dr += `<td class="${cls}${isAvg ? ' cell-avg' : ''}">${text}</td>`;
    });
    dr += `</tr>`;
    rows += dr;
  }

  body.innerHTML = rows;
}

// Wire controls
(() => {
  const sizeSeg = document.getElementById('sizeSeg');
  const famSeg = document.getElementById('famSeg');
  if (!sizeSeg || !famSeg) return;

  sizeSeg.addEventListener('click', e => {
    const btn = e.target.closest('.seg__btn');
    if (!btn) return;
    sizeSeg.querySelectorAll('.seg__btn').forEach(b => { b.classList.remove('is-active'); b.setAttribute('aria-selected','false'); });
    btn.classList.add('is-active');
    btn.setAttribute('aria-selected','true');
    CURRENT.size = btn.dataset.size;
    renderTable();
  });
  famSeg.addEventListener('click', e => {
    const btn = e.target.closest('.seg__btn');
    if (!btn) return;
    famSeg.querySelectorAll('.seg__btn').forEach(b => { b.classList.remove('is-active'); b.setAttribute('aria-selected','false'); });
    btn.classList.add('is-active');
    btn.setAttribute('aria-selected','true');
    CURRENT.fam = btn.dataset.fam;
    renderTable();
  });
  renderTable();
})();


/* =============================================================
   Qualitative carousel
   ============================================================= */

const QUAL = [
  {
    id: 'banana',
    scale: '2B',
    domain: 'Visual Counting',
    img: 'assets/qualitative/banana_0.png',
    question: 'How many bananas have stickers on them?',
    ref: '2',
    studentWrong: 'Plain rollouts: 0 / 8 correct (all answer 3 — counting every banana in the bunch)',
    bcq: {
      verdict: 'ok',
      text: `<think>
The two candidates are anonymized, so I cannot tell which is teacher-correct from the label. Candidate A asserts a uniform "each of the three" without per-position evidence; Candidate B distinguishes the top and the bottom from the middle and the side. The per-position decomposition is concrete and falsifiable in a way a blanket "three" is not, so I commit to Candidate B on reasoning quality alone: top and bottom stickered, middle and side bare. ... Answer: 2.
</think>

\\boxed{2}   ✓`
    },
    ncq: {
      verdict: 'ok',
      text: `<think>
All eight listed candidates report 3 with the same generic "each banana has a sticker" justification; none localises which banana is stickered. The prompt rules 3 out, which means the consensus over-counts a specific position rather than the count being arbitrarily off. The position most consistent with being silently absorbed by such a generic sweep is the middle one — correcting this specific failure mode, not eliminating from a closed answer set, yields 2. ... Answer: 2.
</think>

\\boxed{2}   ✓`
    },
    caption: 'BCQ contrasts a uniform “each of three” claim against a per-position decomposition (top/bottom stickered, middle/side bare); NCQ names which position the consensus is silently over-counting and corrects that specific failure mode.'
  },
  {
    id: 'coat',
    scale: '2B',
    domain: 'Scene QA (MCQ)',
    img: 'assets/qualitative/coat_0.png',
    question: 'What\'s attached to the coat?  A. belt   B. button   C. pocket   D. rope',
    ref: 'D (rope)',
    studentWrong: 'Plain rollouts: 0 / 8 correct  ·  6 × C (pocket flap), 2 × B (button)',
    bcq: {
      verdict: 'ok',
      text: `<think>
Anonymized, Candidate A reads small circular shapes as buttons — a generic feature with no count or location — while Candidate B names a singular feature with a specific texture (braiding), colour (white), and configuration (a knot at the chest). A specific, harder-to-fabricate commitment outranks a generic reading on reasoning quality alone. ... Answer: D (rope).
</think>

\\boxed{D}   ✓`
    },
    ncq: {
      verdict: 'ok',
      text: `<think>
The prompt rules out B (button) and C (pocket); A (belt) and D (rope) remain. The decision between the two is not by exclusion alone: a belt is a long horizontal strap running across the waist, whereas the listed wrong candidates' own descriptions consistently localise the attachment at the chest with a knot-like configuration. The remaining option that matches this named configuration is rope. ... Answer: D (rope).
</think>

\\boxed{D}   ✓`
    },
    caption: 'BCQ contrasts a generic “buttons” misread against a positionally-named braided cord; NCQ rules out both wrong answer modes (B and C) and matches the chest-knot configuration the listed traces themselves describe to the remaining option D.'
  },
  {
    id: 'books',
    scale: '4B',
    domain: 'Visual Counting',
    img: 'assets/qualitative/books_0.png',
    question: 'How many books are standing upright on the bookshelf next to the floor lamp on the right?',
    ref: '4',
    studentWrong: 'Plain rollouts: 0 / 8 correct (all answer 3 — undercount one spine in the alternating sequence)',
    bcq: {
      verdict: 'ok',
      text: `<think>
Anonymized side by side, Candidate A reports three spines without further structure, while Candidate B commits to an explicit colour sequence (White, Dark, White, Dark). The four-element alternation is a structural commitment: if only three spines existed, the sequence would not balance. I commit to Candidate B because its reasoning survives this internal consistency check, not because of any label. ... Answer: 4.
</think>

\\boxed{4}   ✓`
    },
    ncq: {
      verdict: 'ok',
      text: `<think>
All eight listed candidates report 3 with the same "row of three" justification, and none mentions a colour or position pattern. The consensus failure mode is therefore collapsing two adjacent spines into a single one, consistent with the absence of any colour-by-colour decomposition in the listed traces. Correcting this off-by-one error yields 4 — arrived at by naming the failure mode, not by exclusion from a closed answer set. ... Answer: 4.
</think>

\\boxed{4}   ✓`
    },
    caption: 'A 4B student fails on every plain rollout (all answer 3); BCQ leans on an internal consistency check of the alternating White/Dark/White/Dark sequence, while NCQ names the “collapse two adjacent spines into one” failure mode and corrects it without access to the teacher.'
  },
  {
    id: 'straws',
    scale: '0.8B',
    domain: 'Visual Counting  ·  BCQ ✓ / NCQ ✗',
    img: 'assets/qualitative/straws_0.png',
    question: 'How many straws are in the photo?',
    ref: '3',
    studentWrong: 'Plain rollouts: 0 / 8 correct (all answer 0 — “no straws in the meal scene”)',
    bcq: {
      verdict: 'ok',
      text: `<think>
Candidate A performs a global "no straws in the meal scene" sweep without naming a location, while Candidate B commits to a specific region (the right edge of the frame), a specific shape (cylindrical), a specific colour (white), and a specific count of three. A positionally-grounded specific commitment is harder to fabricate than a blanket negative, so I commit to Candidate B on falsifiability, not the label. ... Answer: 3.
</think>

\\boxed{3}   ✓`
    },
    ncq: {
      verdict: 'no',
      text: `<think>
All eight listed candidates conclude 0 with the same global "no straws in the scene" reasoning, and none describes a region or shape that the consensus might have missed. The prompt rules 0 out, but without a single localised cue in the listed traces I have no foothold for identifying where a missed cluster would be. I revert to the consensus. Answer: 0.
</think>

\\boxed{0}   ✗
(entire 0/8 NCQ group fails — the qualitative shape of the 0.8B match-neg row)`
    },
    caption: 'A 0.8B student lacks the capacity to override its own consensus when every listed trace is a generic global negative; only the teacher-grounded BCQ branch, which contributes a positionally-specific anchor (right-edge cluster, cylindrical/white, count of three), recovers the count.'
  },
  {
    id: 'airplane',
    scale: '9B',
    domain: 'Chart Reading',
    img: 'assets/qualitative/airplane_0.png',
    question: 'The graph shows the relationship between the distance an airplane has covered (y-axis, miles) and the time it has been flying (x-axis, hours). What is the speed of the airplane in miles per hour?',
    ref: '500',
    studentWrong: 'Plain rollouts: 0 / 8 correct (all answer 400 — misreading the line at x=1 as y=400 rather than y=500)',
    bcq: {
      verdict: 'ok',
      text: `<think>
Both candidates assert specific grid readings, so the choice cannot be made by length or order. Candidate A's endpoint (4, 1600) would leave the line two labelled rows below the top of the y-axis. Candidate B's chain (2, 1000) and (4, 2000) lies on exact labelled intersections, with (4, 2000) coinciding with the arrowhead's terminating position. Only Candidate B's chain is consistent on falsifiability grounds. ... Answer: 500.
</think>

\\boxed{500}   ✓`
    },
    ncq: {
      verdict: 'ok',
      text: `<think>
All listed candidates commit to slope 400 via (1, 400), (2, 800), (4, 1600). The answer is open-ended numeric, so elimination from a closed set is unavailable — I have to re-derive. Re-anchoring on two exact-intersection points — (2, 1000) and the arrowhead terminating near (4, 2000) — gives slope 500. The consensus failed by snapping the unlabelled y=500 at x=1 down to the labelled 400-row. ... Answer: 500.
</think>

\\boxed{500}   ✓`
    },
    caption: 'A 9B student plain-fails by down-snapping the unlabelled y=500 at x=1 to the labelled 400-row. BCQ contrasts that 400-row chain against one anchored on exact-intersection grid points and the arrowhead’s terminating position; NCQ, even without the teacher trace, re-derives 500 by positional grounding — elimination is unavailable on an open-ended numeric answer space.'
  }
];

(() => {
  const track = document.getElementById('qualTrack');
  const dots = document.getElementById('qualDots');
  const prev = document.getElementById('qualPrev');
  const next = document.getElementById('qualNext');
  const carousel = document.getElementById('qualCarousel');
  if (!track || !dots) return;

  let idx = 0;

  // Helper: turn the raw rollout text (which contains literal "<think>" and
  // "\boxed{...}" markers, just like a real model output) into safe, styled
  // HTML. We first escape the angle brackets so the `<think>` tags are not
  // parsed as HTML, then re-promote the specific tokens we *do* want styled
  // (think markers, boxed answers, math fragments) into <span>s.
  function pretty(text) {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped
      .replace(/&lt;think&gt;/g, '<span class="think-tag">&lt;think&gt;</span>')
      .replace(/&lt;\/think&gt;/g, '<span class="think-tag">&lt;/think&gt;</span>')
      .replace(/\\boxed\{([^}]*)\}/g, '<span class="boxed">$1</span>')
      .replace(/\$\\bar r_x\s*=\s*0\$/g, '<span class="math">r̄<sub>x</sub> = 0</span>')
      .replace(/\$\\bar r_x\s*&lt;\s*0\.5\$/g, '<span class="math">r̄<sub>x</sub> &lt; 0.5</span>')
      .replace(/\$\\bar r_x\s*\\geq\s*0\.5\$/g, '<span class="math">r̄<sub>x</sub> ≥ 0.5</span>');
  }

  // Render slides
  track.innerHTML = QUAL.map((q, i) => `
    <article class="qual__slide ${i===0?'is-active':''}" role="listitem" data-i="${i}">
      <div class="qual__media">
        <img src="${q.img}" alt="Qualitative example: ${q.id}" loading="lazy">
        <div class="qual__q"><strong>Q.</strong> ${q.question}</div>
        <div class="qual__meta">
          <span class="qual__chip">Student: Qwen3.5-${q.scale}</span>
          <span class="qual__chip">${q.domain}</span>
          <span class="qual__chip qual__chip--ref">Ref: ${q.ref}</span>
          <span class="qual__chip qual__chip--bad">${q.studentWrong}</span>
        </div>
        <p style="margin:6px 0 0;font-size:13px;color:var(--fg-3);line-height:1.55">${q.caption}</p>
      </div>
      <div class="qual__cards">
        <div class="qual__card qual__card--bcq">
          <h4>BCQ <span class="badge">teacher-correct + student-wrong (anonymized)</span></h4>
          <div class="trace">${pretty(q.bcq.text)}</div>
          <span class="verdict ${q.bcq.verdict==='ok'?'verdict--ok':'verdict--no'}">
            ${q.bcq.verdict==='ok' ? '✓ Recovered correct answer' : '✗ Stayed wrong'}
          </span>
        </div>
        <div class="qual__card qual__card--ncq">
          <h4>NCQ <span class="badge">all 8 student wrongs · no teacher</span></h4>
          <div class="trace">${pretty(q.ncq.text)}</div>
          <span class="verdict ${q.ncq.verdict==='ok'?'verdict--ok':'verdict--no'}">
            ${q.ncq.verdict==='ok' ? '✓ Recovered correct answer' : '✗ Stayed wrong'}
          </span>
        </div>
      </div>
    </article>
  `).join('');

  // Dots
  dots.innerHTML = QUAL.map((_, i) => `<button class="qual__dot ${i===0?'is-active':''}" role="tab" aria-label="Go to example ${i+1}" data-i="${i}"></button>`).join('');

  // Layout: stack slides absolutely so we can fade between them
  const slides = [...track.querySelectorAll('.qual__slide')];

  function applyLayout(){
    // Use position: relative on the active slide; absolute on others so the carousel sizes to active.
    slides.forEach((s,i)=>{
      if (i === idx) {
        s.style.position = 'relative';
        s.style.left = '0';
        s.style.right = '0';
        s.style.top = '0';
        s.classList.add('is-active');
      } else {
        s.style.position = 'absolute';
        s.style.left = '0';
        s.style.right = '0';
        s.style.top = '0';
        s.style.pointerEvents = 'none';
        s.classList.remove('is-active');
      }
    });
    // Re-enable pointer for active
    slides[idx].style.pointerEvents = 'auto';
  }

  function go(i){
    idx = (i + slides.length) % slides.length;
    applyLayout();
    dots.querySelectorAll('.qual__dot').forEach((d, k) => d.classList.toggle('is-active', k===idx));
  }

  // Make the track relative-positioned so absolute slides stack inside it.
  track.style.position = 'relative';
  track.style.minHeight = '480px';
  track.style.overflow = 'visible';
  track.style.scrollSnapType = 'none';
  applyLayout();

  prev?.addEventListener('click', () => go(idx-1));
  next?.addEventListener('click', () => go(idx+1));
  dots.addEventListener('click', e => {
    const b = e.target.closest('.qual__dot');
    if (!b) return;
    go(+b.dataset.i);
  });

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    // Only handle when carousel is visible or focused
    const rect = carousel.getBoundingClientRect();
    const visible = rect.top < window.innerHeight && rect.bottom > 0;
    if (!visible) return;
    if (e.key === 'ArrowLeft') { go(idx-1); }
    else if (e.key === 'ArrowRight') { go(idx+1); }
  });

  // Touch swipe
  let startX = null, startY = null, startT = 0;
  carousel.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    startX = t.clientX; startY = t.clientY; startT = Date.now();
  }, { passive: true });
  carousel.addEventListener('touchend', e => {
    if (startX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const dt = Date.now() - startT;
    startX = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && dt < 700) {
      if (dx < 0) go(idx+1); else go(idx-1);
    }
  }, { passive: true });
})();

/* =============================================================
   Reveal-on-scroll for sections
   ============================================================= */
(() => {
  if (!('IntersectionObserver' in window)) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('is-in');
        obs.unobserve(en.target);
      }
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.section, .hero__teaser, .impact__card, .ps__card, .pill, .figure, .hp-card').forEach(el => {
    el.classList.add('to-reveal');
    obs.observe(el);
  });
})();
