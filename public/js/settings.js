// User preferences, remembered in this browser.

const KEY = 'tracker.settings.v1';

export const DEFAULTS = Object.freeze({
  mapStyle: 'dark',
  allTrails: false,
  filters: Object.freeze({ hideGround: false, militaryOnly: false, altMin: 0, altMax: 60000, text: '' }),
});

export function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    // Storage unavailable (private mode, blocked cookies): fall back to defaults.
  }
  // Only keep choices that still exist (older versions also saved units, colours, source, labels).
  const kept = Object.fromEntries(Object.keys(DEFAULTS).filter((k) => k in saved).map((k) => [k, saved[k]]));
  return {
    ...DEFAULTS,
    ...kept,
    filters: { ...DEFAULTS.filters, ...(saved.filters || {}) },
  };
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Ignore: settings just won't persist.
  }
}

/** Build a predicate for the active filters. */
export function makeFilter(f) {
  const terms = f.text
    .toUpperCase()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => new RegExp('^' + t.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')));
  const altActive = f.altMin > 0 || f.altMax < DEFAULTS.filters.altMax;
  return (ac) => {
    if (f.hideGround && ac.onGround) return false;
    if (f.militaryOnly && !ac.military) return false;
    if (altActive && !ac.onGround) {
      if (ac.alt == null || ac.alt < f.altMin || ac.alt > f.altMax) return false;
    }
    if (altActive && ac.onGround && f.altMin > 0) return false;
    if (terms.length) {
      const fields = [ac.callsign, ac.reg, ac.type, ac.hex.toUpperCase(), ac.operator?.toUpperCase()].filter(Boolean);
      if (!terms.some((re) => fields.some((v) => re.test(v.toUpperCase())))) return false;
    }
    return true;
  };
}
