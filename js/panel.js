// The selected flight: a bottom card on phones (tap or swipe up for everything, swipe down to
// close), a side panel on wider screens.

import { distanceNm } from './shared/geo.js';
import { flagEmoji } from './shared/countries.js';
import { svgIcon, shapeFor } from './icons.js?v=9';
import {
  formatAlt,
  formatSpeed,
  formatVRate,
  formatTrack,
  formatDistance,
  formatCoord,
  formatAgo,
  EMERGENCY_SQUAWKS,
  isEmergency,
} from './format.js';

const $ = (id) => document.getElementById(id);

function setText(id, text) {
  const el = $(id);
  if (el.textContent !== text) el.textContent = text;
}

export class Panel {
  constructor({ onClose, onFollow, onZoom, onResize = () => {} }) {
    this.el = $('panel');
    this.hex = null;
    this.route = null;
    this.note = ''; // subtitle override, e.g. for demo aircraft
    this.onClose = onClose;
    this.onResize = onResize;
    $('p-close').addEventListener('click', onClose);
    $('p-follow').addEventListener('click', onFollow);
    $('p-zoom').addEventListener('click', onZoom);
    this._bindGestures();
  }

  get expanded() {
    return this.el.classList.contains('expanded');
  }

  setExpanded(on) {
    this.el.classList.toggle('expanded', on);
    $('p-handle').setAttribute('aria-expanded', String(on));
    $('p-handle').setAttribute('aria-label', on ? 'Show less' : 'Show more details');
    if (!on) this.el.querySelector('.flight-body').scrollTop = 0;
    this.onResize();
  }

  // Tap the grip or header to expand/collapse; swipe up to expand, down to collapse or close.
  _bindGestures() {
    let start = null;
    const down = (e) => {
      if (e.target.closest('button:not(#p-handle), a')) return;
      start = { y: e.clientY, t: Date.now() };
      // Keep receiving the pointer after it leaves the header, so the release is seen here.
      e.currentTarget.setPointerCapture?.(e.pointerId);
    };
    const up = (e) => {
      if (!start) return;
      const dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dy) < 10) this.setExpanded(!this.expanded);
      else if (dy < 0) this.setExpanded(true);
      else if (this.expanded) this.setExpanded(false);
      else this.onClose();
    };
    for (const el of [$('p-handle'), this.el.querySelector('.flight-head')]) {
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', () => (start = null));
    }
    // Keyboard users: the grip is a button.
    $('p-handle').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.setExpanded(!this.expanded);
      }
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
    this.setExpanded(false);
    document.body.classList.add('panel-open');
    $('p-icon').innerHTML = svgIcon(shapeFor(ac));
    $('p-route').hidden = true;
    $('p-route-warning').hidden = true;
    $('p-photo-wrap').hidden = true;
    $('p-photo').removeAttribute('src');
    this.note = demo ? 'Simulated aircraft (demo mode)' : '';
    this.airline = '';
    setText('p-owner', '—');
    const link = $('p-external');
    link.hidden = demo || ac.hex.startsWith('~');
    link.href = `https://globe.adsb.lol/?icao=${encodeURIComponent(ac.hex)}`;
  }

  hide() {
    this.hex = null;
    this.route = null;
    this.el.hidden = true;
    document.body.classList.remove('panel-open');
  }

  setFollowing(on) {
    $('p-follow').classList.toggle('active', on);
    $('p-follow').setAttribute('aria-pressed', String(on));
  }

  setRoute(route) {
    this.route = route;
    this.airline = route?.airline?.name || '';
    $('p-route').hidden = !route;
    if (!route) return;
    const { origin: o, destination: d } = route;
    setText('p-orig-code', o.iata || o.icao);
    setText('p-orig-city', o.city || o.name);
    $('p-orig-code').title = o.name;
    setText('p-dest-code', d.iata || d.icao);
    setText('p-dest-city', d.city || d.name);
    $('p-dest-code').title = d.name;
  }

  setDetails({ info, photo }) {
    if (info?.owner) setText('p-owner', info.owner);
    if (photo?.thumb) {
      const img = $('p-photo');
      img.src = photo.thumb;
      img.alt = 'Photo of the aircraft';
      $('p-photo-wrap').hidden = false;
      const credit = $('p-photo-credit');
      credit.textContent = '';
      const a = document.createElement('a');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (photo.link) a.href = photo.link;
      a.textContent = photo.photographer ? `© ${photo.photographer} · planespotters.net` : 'Photo';
      credit.append(a);
    }
  }

  /** Refresh the live values. `pos` is the current display position. */
  update(ac, pos, { metric, now }) {
    setText('p-callsign', ac.callsign || ac.reg || ac.hex.toUpperCase());
    setText('p-airline', this.note || this.airline || ac.desc || ac.operator || (ac.reg && ac.callsign ? ac.reg : ''));
    setText('p-chip', ac.type);
    setText('p-type', ac.desc || ac.type || 'Unknown type');
    setText('p-alt', formatAlt(ac, metric));
    setText('p-vrate', ac.onGround ? '—' : formatVRate(ac.vrate, metric));
    setText('p-speed', formatSpeed(ac.gs, metric));
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
      setText('p-flown', `${formatDistance(flown, metric)} flown`);
      setText('p-left', `${formatDistance(left, metric)} to go`);
      // Callsign-based routes can be stale; say so when the aircraft is far off the line.
      $('p-route-warning').hidden = flown + left <= total * 1.25 + 60;
    }
  }
}
