// The selected flight. On phones: a floating card that follows the finger and settles on a spring
// at three heights — small (just the aircraft's photo with its callsign, type and airports), half
// (adds the actions and live numbers) and full (everything, scrollable). Swiping the small card
// down closes it. On wider screens: a side panel, always fully open.

import { distanceNm } from './shared/geo.js';
import { flagEmoji } from './shared/countries.js';
import { svgIcon, shapeFor } from './icons.js?v=14';
import {
  formatAlt,
  formatSpeed,
  formatVRate,
  formatTrack,
  formatDistance,
  formatCoord,
  formatAgo,
  formatType,
  EMERGENCY_SQUAWKS,
  isEmergency,
} from './format.js?v=2';

const $ = (id) => document.getElementById(id);

function setText(id, text) {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
}

const WIDE = window.matchMedia('(min-width: 761px)');
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const SILHOUETTE = '#3d4653'; // the aircraft seen from below, when there is no photo

// ── The phone card's motion ───────────────────────────────────────────────

const ORDER = ['full', 'half', 'peek', 'closed'];
const STIFFNESS = 420;
const DAMPING = 2 * Math.sqrt(STIFFNESS) * 0.84; // a touch under critical: settles without a wobble
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Resistance past an edge, as on iOS: the further you pull, the less it gives. */
const rubber = (over, dim) => (1 - 1 / ((over * 0.55) / dim + 1)) * dim;
const unrubber = (shown, dim) => (dim / 0.55) * (1 / (1 - Math.min(shown / dim, 0.95)) - 1);

/**
 * `y` is how far the card's top sits below its full height, so the card shows H − y pixels. It
 * grows and shrinks rather than sliding off the screen, so it always floats with four round
 * corners; below its small size it slides away whole. `s` scrolls the details inside it.
 */
class CardMotion {
  constructor({ el, hero, content, more, scrim, onDismiss }) {
    Object.assign(this, { el, hero, content, more, scrim, onDismiss });
    this.rest = 'closed';
    this.y = 0;
    this.s = 0;
    this.H = 0;
    this.maxS = 0;
    this.det = { full: 0, half: 0, peek: 0, closed: 0 };
    this.anim = { raf: 0, last: 0, y: null, s: null };
    this.drag = null;
    this.swallowClick = false;
    this.afterClose = null;
    this._bind();
  }

  get active() {
    return !WIDE.matches;
  }

  measure() {
    const search = document.querySelector('.search');
    const top = Math.max(0, (search ? search.getBoundingClientRect().bottom : 60) - 6);
    const bottom = parseFloat(getComputedStyle(this.el).bottom) || 8;
    this.H = Math.max(200, window.innerHeight - bottom - top);
    const heroH = Math.min(this.hero.offsetHeight, this.H);
    const half = Math.min(this.H, heroH + this.more.offsetTop - 2);
    this.det = { full: 0, half: this.H - half, peek: this.H - heroH, closed: this.H + 30 };
    this.maxS = Math.max(0, this.content.offsetHeight - (this.H - heroH));
  }

  paint() {
    const y = Math.max(this.det.full, this.y);
    const small = this.H - this.det.peek;
    const shown = this.H - y;
    this.el.style.height = `${Math.max(shown, small).toFixed(1)}px`;
    this.el.style.transform = shown < small ? `translate3d(0, ${(small - shown).toFixed(1)}px, 0)` : '';
    this.content.style.transform = this.s ? `translate3d(0, ${(-this.s).toFixed(1)}px, 0)` : '';
    const dim = clamp((this.det.half - y) / Math.max(1, this.det.half - this.det.full), 0, 1);
    this.scrim.style.opacity = (dim * 0.3).toFixed(3);
    this.scrim.classList.toggle('active', dim > 0.6);
  }

  /** Back to plain CSS layout (wide screens, or a hidden card). */
  reset() {
    this._stop();
    this.rest = 'closed';
    this.s = 0;
    this.el.style.height = '';
    this.el.style.transform = '';
    this.content.style.transform = '';
    this.scrim.style.opacity = '';
    this.scrim.classList.remove('active');
  }

  /** Rises from below the screen, or from wherever it is, to the small card. */
  open() {
    this.afterClose = null;
    if (!this.active) return this.reset();
    this.measure();
    if (this.rest === 'closed' && !this.anim.y) {
      this.y = this.det.closed;
      this.s = 0;
      this.paint(); // start below the screen, not at the stylesheet's height
    }
    this.settleTo('peek');
  }

  close(done) {
    this.afterClose = done;
    if (!this.active || REDUCED.matches) {
      this.rest = 'closed';
      return this._finishClose();
    }
    if (this.rest !== 'closed' || !this.anim.y) this.settleTo('closed');
  }

  _finishClose() {
    const done = this.afterClose;
    this.afterClose = null;
    done?.();
  }

  /** Content or screen size changed: keep the card at the same height, re-measured. */
  refresh({ animate = true } = {}) {
    if (!this.active || this.el.hidden || this.drag || this.rest === 'closed') return;
    this.measure();
    if (this.anim.y) this.anim.y.target = this.det[this.rest];
    else if (animate && !REDUCED.matches && Math.abs(this.det[this.rest] - this.y) > 0.5) this.settleTo(this.rest);
    else {
      this.y = this.det[this.rest];
      this.s = clamp(this.s, 0, this.rest === 'full' ? this.maxS : 0);
      this.paint();
    }
  }

  settleTo(name, v = 0) {
    this.measure();
    this.rest = name;
    this.anim.y = { mode: 'spring', target: this.det[name], v };
    if (name !== 'full' && this.s !== 0) this.anim.s = { mode: 'spring', target: 0, v: 0 };
    this._start();
  }

  cycle() {
    if (this.rest === 'closed') return; // on its way out
    this.settleTo({ peek: 'half', half: 'full', full: 'peek' }[this.rest] || 'peek');
  }

  _start() {
    if (REDUCED.matches) {
      if (this.anim.y) this.y = this.anim.y.target;
      this.s = this.anim.s?.mode === 'spring' ? this.anim.s.target : clamp(this.s, 0, this.maxS);
      this.anim.y = this.anim.s = null;
      this.paint();
      if (this.rest === 'closed') this._finishClose();
      return;
    }
    if (!this.anim.raf) {
      this.anim.last = performance.now();
      this.anim.raf = requestAnimationFrame((t) => this._tick(t));
    }
  }

  _stop() {
    cancelAnimationFrame(this.anim.raf);
    const was = Boolean(this.anim.y || this.anim.s);
    this.anim.raf = 0;
    this.anim.y = this.anim.s = null;
    return was;
  }

  _tick(now) {
    const dt = Math.min(0.064, (now - this.anim.last) / 1000);
    this.anim.last = now;
    const steps = Math.max(1, Math.ceil(dt * 240));
    for (let i = 0; i < steps; i++) {
      this._step('y', dt / steps);
      this._step('s', dt / steps);
    }
    this.paint();
    if (this.anim.y || this.anim.s) {
      this.anim.raf = requestAnimationFrame((t) => this._tick(t));
    } else {
      this.anim.raf = 0;
      if (this.rest === 'closed') this._finishClose();
    }
  }

  _step(key, h) {
    const a = this.anim[key];
    if (!a) return;
    let pos = this[key];
    if (a.mode === 'decay') {
      // Momentum scrolling, slowing as iOS does; it bounces off either end.
      a.v *= Math.pow(0.998, h * 1000);
      pos += a.v * h;
      if (pos < 0 || pos > this.maxS) {
        a.mode = 'spring';
        a.target = pos < 0 ? 0 : this.maxS;
      } else if (Math.abs(a.v) < 12) {
        this.anim[key] = null;
      }
    } else {
      a.v += (-STIFFNESS * (pos - a.target) - DAMPING * a.v) * h;
      pos += a.v * h;
      if (Math.abs(pos - a.target) < 0.25 && Math.abs(a.v) < 6) {
        pos = a.target;
        this.anim[key] = null;
      }
    }
    this[key] = pos;
  }

  /** Where a released finger sends the card (v in px/s, positive downwards). */
  _release(v) {
    this.measure();
    // At full height, a flick up or an already scrolled list moves the details, not the card.
    if (this.y <= this.det.full + 0.5 && this.maxS > 0 && (this.s > 0.5 || v < 0)) {
      this.rest = 'full';
      this.anim.s = { mode: 'decay', v: -v };
      return this._start();
    }
    const projected = this.y + v * 0.15;
    let best = 'peek';
    for (const name of ORDER) {
      if (Math.abs(this.det[name] - projected) < Math.abs(this.det[best] - projected)) best = name;
    }
    this.settleTo(best, v);
    if (best === 'closed') this.onDismiss();
  }

  _bind() {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      if (!this.active || e.button > 0 || this.rest === 'closed') return;
      const interrupted = this._stop();
      this.measure();
      const yOver = this.y - this.det.closed;
      const sOver = this.s - this.maxS;
      this.drag = {
        id: e.pointerId,
        startY: e.clientY,
        lastY: e.clientY,
        moved: false,
        interrupted,
        samples: [[e.timeStamp, e.clientY]],
        rawY: yOver > 0 ? this.det.closed + unrubber(yOver, this.H) : this.y,
        rawS: sOver > 0 ? this.maxS + unrubber(sOver, this.H) : this.s,
      };
    });

    el.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      if (!d.moved) {
        if (Math.abs(e.clientY - d.startY) < 6) return;
        d.moved = true;
        d.lastY = e.clientY;
        el.setPointerCapture(e.pointerId);
      }
      const dy = e.clientY - d.lastY;
      d.lastY = e.clientY;
      d.samples.push([e.timeStamp, e.clientY]);
      while (d.samples.length > 1 && e.timeStamp - d.samples[0][0] > 150) d.samples.shift();
      if (dy < 0) {
        // Finger going up: raise the card first, then scroll what is inside it.
        const take = Math.max(dy, -Math.max(0, d.rawY - this.det.full));
        d.rawY += take;
        d.rawS -= dy - take;
      } else {
        // Finger going down: scroll back to the top first, then lower the card.
        const take = Math.min(dy, Math.max(0, d.rawS));
        d.rawS -= take;
        d.rawY += dy - take;
      }
      const { closed } = this.det;
      this.y = d.rawY > closed ? closed + rubber(d.rawY - closed, this.H) : d.rawY;
      this.s = d.rawS > this.maxS ? this.maxS + rubber(d.rawS - this.maxS, this.H) : d.rawS;
      this.paint();
    });

    const end = (e, cancelled) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      if (!d.moved) {
        if (d.interrupted) this._release(0);
        return;
      }
      // The finger dragged, so whatever it went down on was not tapped.
      this.swallowClick = true;
      setTimeout(() => (this.swallowClick = false), 0);
      // Speed over the last 100 ms up to the release: a finger that paused before lifting has none.
      let v = 0;
      const recent = [...d.samples, [e.timeStamp, e.clientY]].filter(([t]) => e.timeStamp - t <= 100);
      const [t0, y0] = recent[0];
      const [t1, y1] = recent[recent.length - 1];
      if (!cancelled && t1 - t0 > 8) v = ((y1 - y0) / (t1 - t0)) * 1000;
      this._release(clamp(v, -6000, 6000));
    };
    el.addEventListener('pointerup', (e) => end(e, false));
    el.addEventListener('pointercancel', (e) => end(e, true));
    el.addEventListener(
      'click',
      (e) => {
        if (!this.swallowClick) return;
        e.stopPropagation();
        e.preventDefault();
      },
      true,
    );

    // Mouse wheel or trackpad on a narrow window: scroll at full height, else step between heights.
    let wheelLock = 0;
    el.addEventListener(
      'wheel',
      (e) => {
        if (!this.active || this.rest === 'closed') return;
        e.preventDefault();
        if (this.rest === 'full' && !(this.s <= 0 && e.deltaY < 0)) {
          this._stop();
          this.measure();
          this.y = this.det.full;
          this.s = clamp(this.s + e.deltaY, 0, this.maxS);
          this.paint();
          return;
        }
        if (e.timeStamp < wheelLock || Math.abs(e.deltaY) < 4) return;
        wheelLock = e.timeStamp + 450;
        const next = ORDER[clamp(ORDER.indexOf(this.rest) + (e.deltaY > 0 ? -1 : 1), 0, 2)];
        this.settleTo(next);
      },
      { passive: false },
    );

    this.scrim.addEventListener('click', () => this.settleTo('half'));
  }
}

// ── The panel ─────────────────────────────────────────────────────────────

export class Panel {
  constructor({ onClose, onFollow, onZoom }) {
    this.el = $('panel');
    this.hex = null;
    this.route = null;
    this.note = ''; // added to the type line, e.g. for demo aircraft
    this.airline = '';
    this.onClose = onClose;
    this.motion = new CardMotion({
      el: this.el,
      hero: $('p-hero'),
      content: $('p-content'),
      more: $('p-more'),
      scrim: $('flight-scrim'),
      onDismiss: () => onClose(),
    });
    $('p-close').addEventListener('click', onClose);
    $('p-follow').addEventListener('click', onFollow);
    $('p-zoom').addEventListener('click', onZoom);

    // Tapping the photo or its grip steps through the heights.
    $('p-hero').addEventListener('click', (e) => {
      if (!this.motion.active || e.target.closest('a, button:not(#p-handle)')) return;
      this.motion.cycle();
    });

    const photo = $('p-photo');
    photo.addEventListener('load', () => $('p-hero').classList.toggle('has-photo', Boolean(photo.getAttribute('src'))));
    // A photo that fails to load leaves the silhouette in its place.
    photo.addEventListener('error', () => $('p-hero').classList.remove('has-photo'));

    WIDE.addEventListener('change', () => {
      if (this.el.hidden) return;
      if (WIDE.matches) this.motion.reset();
      else this.motion.open();
    });
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this.motion.refresh({ animate: false }), 100);
    });
  }

  get open() {
    return !this.el.hidden;
  }

  /** Show a newly selected aircraft (static fields); live values come via update(). */
  show(ac, { demo }) {
    this.hex = ac.hex;
    this.route = null;
    this.el.hidden = false;
    document.body.classList.add('panel-open');
    $('p-art').innerHTML = svgIcon(shapeFor(ac), SILHOUETTE);
    $('p-hero').classList.remove('has-photo');
    $('p-photo').removeAttribute('src');
    $('p-photo').alt = '';
    $('p-photo-credit').textContent = '';
    $('p-route').hidden = true;
    $('p-route-warning').hidden = true;
    $('p-flown-row').hidden = true;
    $('p-left-row').hidden = true;
    $('p-airline-row').hidden = true;
    this.note = demo ? 'Simulated' : '';
    this.airline = '';
    setText('p-owner', '—');
    const link = $('p-external');
    link.hidden = demo || ac.hex.startsWith('~');
    link.href = `https://globe.adsb.lol/?icao=${encodeURIComponent(ac.hex)}`;
    this.motion.open();
  }

  hide() {
    this.hex = null;
    this.route = null;
    document.body.classList.remove('panel-open');
    if (this.el.hidden) return;
    this.motion.close(() => {
      if (this.hex) return; // another aircraft was picked while the card went down
      this.el.hidden = true;
      this.motion.reset();
    });
  }

  setFollowing(on) {
    $('p-follow').classList.toggle('active', on);
    $('p-follow').setAttribute('aria-pressed', String(on));
  }

  setRoute(route) {
    this.route = route;
    this.airline = route?.airline?.name || '';
    $('p-route').hidden = !route;
    $('p-flown-row').hidden = !route;
    $('p-left-row').hidden = !route;
    $('p-airline-row').hidden = !this.airline;
    setText('p-airline', this.airline || '—');
    if (route) {
      const { origin: o, destination: d } = route;
      setText('p-orig-code', o.iata || o.icao);
      setText('p-orig-city', o.city || o.name);
      $('p-orig-code').title = o.name;
      setText('p-dest-code', d.iata || d.icao);
      setText('p-dest-city', d.city || d.name);
      $('p-dest-code').title = d.name;
    }
    this.motion.refresh();
  }

  setDetails({ info, photo }) {
    if (info?.owner) setText('p-owner', info.owner);
    if (photo?.thumb) {
      const img = $('p-photo');
      img.alt = 'Photo of the aircraft';
      img.src = photo.thumb;
      const credit = $('p-photo-credit');
      credit.textContent = '';
      const a = document.createElement('a');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (photo.link) a.href = photo.link;
      a.textContent = photo.photographer ? `© ${photo.photographer}` : 'planespotters.net';
      a.title = photo.photographer ? `Photo © ${photo.photographer}, planespotters.net` : 'Photo from planespotters.net';
      credit.append(a);
    }
  }

  /** Refresh the live values. `pos` is the current display position. */
  update(ac, pos, { now }) {
    setText('p-callsign', ac.callsign || ac.reg || ac.hex.toUpperCase());
    const type = formatType(ac.desc, ac.type) || 'Unknown type';
    setText('p-type', this.note ? `${type} · ${this.note}` : type);
    setText('p-alt', formatAlt(ac));
    setText('p-vrate', ac.onGround ? '—' : formatVRate(ac.vrate));
    setText('p-speed', formatSpeed(ac.gs));
    setText('p-track', formatTrack(ac.track));
    const sq = ac.squawk ? `${ac.squawk}${EMERGENCY_SQUAWKS[ac.squawk] ? ` · ${EMERGENCY_SQUAWKS[ac.squawk]}` : ''}` : '—';
    setText('p-squawk', ac.emergency && !EMERGENCY_SQUAWKS[ac.squawk] ? `${sq} · ${ac.emergency}` : sq);
    $('p-squawk').classList.toggle('danger', isEmergency(ac));
    setText('p-reg', ac.reg || '—');
    setText('p-typecode', ac.type || '—');
    setText('p-hex', ac.hex.toUpperCase());
    const country = ac.countryInfo ? `${flagEmoji(ac.countryInfo.code)} ${ac.countryInfo.name}` : ac.country || '—';
    setText('p-country', country);
    if (ac.operator && $('p-owner').textContent === '—') setText('p-owner', ac.operator);
    setText('p-source', [ac.source, ac.military ? 'Military' : ''].filter(Boolean).join(' · ') || '—');
    setText('p-pos', formatCoord(pos[0], pos[1]));
    setText('p-seen', formatAgo(now - ac.posTime));

    const r = this.route;
    if (r) {
      const total = distanceNm(r.origin.lat, r.origin.lon, r.destination.lat, r.destination.lon);
      const flown = distanceNm(r.origin.lat, r.origin.lon, pos[0], pos[1]);
      const left = distanceNm(pos[0], pos[1], r.destination.lat, r.destination.lon);
      const pct = Math.round((flown / Math.max(1, flown + left)) * 100);
      $('p-progress').style.width = `${pct}%`;
      $('p-progress-plane').style.left = `${pct}%`;
      setText('p-flown', formatDistance(flown));
      setText('p-left', formatDistance(left));
      // Callsign-based routes can be stale; say so when the aircraft is far off the line.
      const stale = flown + left > total * 1.25 + 60;
      if ($('p-route-warning').hidden === stale) {
        $('p-route-warning').hidden = !stale;
        this.motion.refresh();
      }
    }
  }
}
