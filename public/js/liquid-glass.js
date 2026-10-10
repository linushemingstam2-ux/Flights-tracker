// Liquid Glass with real refraction, drawn on the GPU.
//
// Every .glass element gets a canvas behind its content. Each frame, right after the aircraft layer
// has drawn, a WebGL renderer rebuilds what lies under the glass – the map tiles (with the dark
// style's colour filter) and the aircraft canvas – as a texture, and blurs copies of it. Then it
// draws each piece of glass the way light passes through it: bent inwards by the curved rim, with
// a hint of colour dispersion, magnified a touch in the middle, frosted and tinted, lit by a
// specular edge, and glowing where a finger presses it.
//
// Map tiles must be readable (served with CORS) for this to work. Wherever it can't run – no
// WebGL 2, unreadable tiles, a slow device, or "Reduce Transparency" – the CSS glass in app.css
// shows instead.

const SCENE_SCALE_MAX = 1.5; // texture pixels per CSS pixel for what lies under the glass
const GLASS_SCALE_MAX = 2; // canvas pixels per CSS pixel for the glass itself

// ── Shaders ──────────────────────────────────────────────────────────────

// A rectangle in target pixels (top-left origin), drawn as a strip without vertex buffers.
const QUAD_VS = `#version 300 es
uniform vec4 u_rect;
uniform vec2 u_target;
out vec2 v_uv;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  v_uv = corner;
  vec2 px = u_rect.xy + corner * u_rect.zw;
  gl_Position = vec4(px.x / u_target.x * 2.0 - 1.0, 1.0 - px.y / u_target.y * 2.0, 0.0, 1.0);
}`;

// Map tiles and the aircraft canvas. Night style mirrors the CSS filter on the dark map's tile
// pane: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9) saturate(0.35).
const IMAGE_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform float u_opacity;
uniform bool u_night;
in vec2 v_uv;
out vec4 o;
const mat3 HUE_180 = mat3(-0.574, 1.430, 0.144, 0.426, 0.430, 0.144, 0.426, 1.430, -0.856);
const mat3 SATURATE_035 = mat3(0.48845, 0.46475, 0.0468, 0.13845, 0.81475, 0.0468, 0.13845, 0.46475, 0.3968);
vec3 night(vec3 c) {
  c = 1.0 - c;
  c = clamp(c * HUE_180, 0.0, 1.0);
  c = clamp(c * 0.85, 0.0, 1.0);
  c = clamp(c * 0.9 + 0.05, 0.0, 1.0);
  return clamp(c * SATURATE_035, 0.0, 1.0);
}
void main() {
  vec4 t = texture(u_tex, v_uv);
  vec3 c = t.a > 0.0 ? t.rgb / t.a : vec3(0.0);
  if (u_night) c = night(c);
  float a = t.a * u_opacity;
  o = vec4(c * a, a);
}`;

// Copy (halving the size gives an exact 2×2 box filter) or a 9-tap Gaussian along u_dir.
const BLUR_FS = `#version 300 es
precision mediump float;
uniform sampler2D u_src;
uniform vec2 u_dir;
in vec2 v_uv;
out vec4 o;
void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  if (u_dir == vec2(0.0)) { o = texture(u_src, uv); return; }
  vec4 s = texture(u_src, uv) * 0.2270;
  s += (texture(u_src, uv + u_dir) + texture(u_src, uv - u_dir)) * 0.1945;
  s += (texture(u_src, uv + u_dir * 2.0) + texture(u_src, uv - u_dir * 2.0)) * 0.1216;
  s += (texture(u_src, uv + u_dir * 3.0) + texture(u_src, uv - u_dir * 3.0)) * 0.0540;
  s += (texture(u_src, uv + u_dir * 4.0) + texture(u_src, uv - u_dir * 4.0)) * 0.0162;
  o = s;
}`;

// One piece of glass. Lengths are in CSS pixels; p is the position within the element.
const GLASS_FS = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform sampler2D u_frost1;
uniform sampler2D u_frost2;
uniform vec2 u_view;
uniform vec4 u_screen;
uniform vec2 u_size;
uniform float u_radius;
uniform float u_bezel;
uniform float u_refract;
uniform float u_frost;
uniform vec4 u_tint;
uniform float u_adapt;
uniform float u_light;
uniform vec3 u_glow;
uniform float u_pxScale;
in vec2 v_uv;
out vec4 o;

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Outward direction of the nearest edge.
vec2 edgeNormal(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  vec2 g = (q.x > 0.0 || q.y > 0.0) ? normalize(max(q, 0.0)) : (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  return g * vec2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
}

vec2 sceneUv(vec2 local) {
  vec2 s = u_screen.xy + local * (u_screen.zw / u_size);
  return vec2(s.x / u_view.x, 1.0 - s.y / u_view.y);
}

void main() {
  vec2 p = v_uv * u_size;
  vec2 halfSize = u_size * 0.5;
  vec2 c = p - halfSize;
  float r = min(u_radius, min(halfSize.x, halfSize.y));
  float d = sdRoundRect(c, halfSize, r);
  float cover = clamp(0.5 - d * u_pxScale, 0.0, 1.0);
  if (cover <= 0.0) { o = vec4(0.0); return; }

  vec2 n = edgeNormal(c, halfSize, r);
  float inside = max(-d, 0.0);
  float t = clamp(inside / u_bezel, 0.0, 1.0); // 0 on the rim, 1 where the glass is flat
  float rim = 1.0 - t;

  // Light through the curved rim bends inwards, so the very edge shows what lies a little further
  // in; the flat middle magnifies only faintly.
  vec2 look = halfSize + c * 0.99;
  vec2 bend = -n * u_refract * pow(rim, 2.5);
  vec3 sharp = vec3(
    texture(u_scene, sceneUv(look + bend * 0.97)).r,
    texture(u_scene, sceneUv(look + bend)).g,
    texture(u_scene, sceneUv(look + bend * 1.03)).b);
  vec3 frosted = u_frost > 1.5 ? texture(u_frost2, sceneUv(look + bend)).rgb : texture(u_frost1, sceneUv(look + bend)).rgb;
  // Regular glass is lightly frosted in the middle, thick glass fully; the lens rim stays sharp.
  float frost = (u_frost > 1.5 ? 1.0 : u_frost * 0.65) * smoothstep(0.1, 0.9, t);
  vec3 col = mix(sharp, frosted, frost);

  // Glass deepens colour a little; light glass lifts what is behind it, dark glass dims it.
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, 1.25);
  col = u_light > 0.5 ? col + 0.025 : col * 0.88;
  // Like Apple's glass, adapt to what is behind to keep content legible: light glass grows more
  // opaque over dark scenery, dark glass over bright scenery.
  float behind = dot(texture(u_frost2, sceneUv(look)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float contrastNeed = u_light > 0.5 ? 1.0 - behind : behind;
  col = mix(col, u_tint.rgb, clamp(u_tint.a + contrastNeed * u_adapt, 0.0, 0.92));

  // Light from the upper left: a fine specular line on the rim, a soft glint across the bevel,
  // light escaping at the far edge, and a little shade where the glass is thick at the bottom.
  vec2 lightDir = normalize(vec2(-0.5, -0.86));
  float facing = max(dot(n, lightDir), 0.0);
  float away = max(dot(n, -lightDir), 0.0);
  float edge = smoothstep(1.4, 0.0, inside);
  float shine = u_light > 0.5 ? 0.85 : 0.6;
  col += edge * (0.15 + 0.85 * pow(facing, 1.5)) * shine;
  col += edge * pow(away, 2.0) * 0.4 * shine;
  col += pow(rim, 3.0) * pow(facing, 2.0) * 0.14;
  col -= pow(rim, 3.0) * max(n.y, 0.0) * (u_light > 0.5 ? 0.06 : 0.12);

  // A glow under the finger.
  vec2 dg = p - u_glow.xy;
  float sigma = 0.45 * min(u_size.x, u_size.y);
  col += u_glow.z * 0.3 * exp(-dot(dg, dg) / (2.0 * sigma * sigma));

  col = clamp(col, 0.0, 1.0);
  o = vec4(col * cover, cover);
}`;

// ── Small WebGL helpers ──────────────────────────────────────────────────

function compile(gl, vsSource, fsSource) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vsSource], [gl.FRAGMENT_SHADER, fsSource]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const { name } = gl.getActiveUniform(program, i);
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return { program, u: uniforms };
}

function newTexture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** An off-screen render target (resized on demand). */
function renderTarget(gl) {
  const target = { tex: newTexture(gl), fb: gl.createFramebuffer(), w: 0, h: 0 };
  target.size = (w, h) => {
    w = Math.max(1, Math.ceil(w));
    h = Math.max(1, Math.ceil(h));
    if (w === target.w && h === target.h) return target;
    target.w = w;
    target.h = h;
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.tex, 0);
    return target;
  };
  return target;
}

function parseColor(value) {
  const s = value.trim();
  let m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [m[1] / 255, m[2] / 255, m[3] / 255, a];
  }
  m = s.match(/^#([\da-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
  }
  return [0, 0, 0, 0];
}

// ── The renderer ─────────────────────────────────────────────────────────

/**
 * Starts Liquid Glass for every .glass element. `layer` is the aircraft layer (it fires 'frame'
 * after each draw and exposes getCanvas()). `keepOn` skips the check that turns it off on devices
 * too slow for it. Returns null where it can't run.
 */
export function startLiquidGlass({ map, layer, keepOn = false }) {
  if (window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches) return null;
  const glCanvas = document.createElement('canvas');
  const gl = glCanvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  let programs;
  try {
    programs = {
      image: compile(gl, QUAD_VS, IMAGE_FS),
      blur: compile(gl, QUAD_VS, BLUR_FS),
      glass: compile(gl, QUAD_VS, GLASS_FS),
    };
  } catch (err) {
    console.warn('Liquid Glass unavailable:', err.message);
    return null;
  }

  const root = document.documentElement;
  const mapEl = map.getContainer();
  const maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);
  const scene = renderTarget(gl);
  const half = renderTarget(gl);
  const quarter = renderTarget(gl);
  const eighth = renderTarget(gl);
  const blurTmp1 = renderTarget(gl);
  const frost1 = renderTarget(gl);
  const blurTmp2 = renderTarget(gl);
  const frost2 = renderTarget(gl);
  const aircraftTex = newTexture(gl);
  const aircraftCanvas = document.createElement('canvas');
  const aircraftCtx = aircraftCanvas.getContext('2d');
  const tileTextures = new Map(); // tile <img> → { tex, used }

  // The glass pieces, each with its own canvas behind its content.
  const surfaces = [...document.querySelectorAll('.glass')].map((el) => {
    const canvas = document.createElement('canvas');
    canvas.className = 'lg-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    return { el, canvas, ctx: canvas.getContext('2d'), glow: 0, rect: null, params: null };
  });

  let paramsDirty = true;
  let mapBg = [0, 0, 0, 1];
  let light = false;
  let night = false;
  const refreshParams = () => {
    paramsDirty = false;
    light = root.dataset.theme === 'light';
    night = mapEl.classList.contains('map-dark');
    mapBg = parseColor(getComputedStyle(mapEl).backgroundColor);
    for (const s of surfaces) {
      const cs = getComputedStyle(s.el);
      const num = (name, fallback) => {
        const v = parseFloat(cs.getPropertyValue(name));
        return Number.isFinite(v) ? v : fallback;
      };
      s.params = {
        adapt: num('--lg-adapt', 0.3),
        frost: num('--lg-frost', 1),
        bezel: num('--lg-bezel', 14),
        refract: num('--lg-refract', 12),
        tint: parseColor(cs.getPropertyValue('--lg-tint')),
        radius: cs.borderTopLeftRadius,
      };
    }
  };
  const observer = new MutationObserver(() => (paramsDirty = true));
  observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  observer.observe(mapEl, { attributes: true, attributeFilter: ['class'] });
  for (const s of surfaces) observer.observe(s.el, { attributes: true, attributeFilter: ['class', 'aria-expanded'] });
  addEventListener('resize', () => (paramsDirty = true));

  let mapMoving = false;
  map.on('movestart zoomstart', () => (mapMoving = true));
  map.on('moveend zoomend', () => (mapMoving = false));

  let state = 'starting'; // 'on', 'paused' (tiles unreadable), 'off' (for good)
  let frame = 0;
  const setOn = (on) => root.classList.toggle('lg-on', on);
  const stop = (why) => {
    state = 'off';
    setOn(false);
    console.warn('Liquid Glass off:', why);
  };
  glCanvas.addEventListener('webglcontextlost', () => stop('WebGL context lost'));

  // Frame pacing: if this device can't keep up, the CSS glass is kinder to it.
  const slowFrames = [];
  let lastRender = 0;

  function tileTexture(img) {
    let entry = tileTextures.get(img);
    if (!entry) {
      const tex = newTexture(gl);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img); // throws if not readable
      entry = { tex, used: frame };
      tileTextures.set(img, entry);
    }
    entry.used = frame;
    return entry.tex;
  }

  function useProgram(p, target) {
    gl.useProgram(p.program);
    gl.uniform2f(p.u.u_target, target.w, target.h);
  }

  function drawRect(p, x, y, w, h) {
    gl.uniform4f(p.u.u_rect, x, y, w, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function bindTarget(target) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : glCanvas.width, target ? target.h : glCanvas.height);
  }

  /** What lies under the glass: tiles, then aircraft. False if the tiles can't be read. */
  function drawScene(vw, vh) {
    const k = Math.min(devicePixelRatio || 1, SCENE_SCALE_MAX);
    scene.size(vw * k, vh * k);
    bindTarget(scene);
    gl.clearColor(mapBg[0], mapBg[1], mapBg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const p = programs.image;
    useProgram(p, scene);
    gl.uniform1i(p.u.u_tex, 0);
    gl.activeTexture(gl.TEXTURE0);

    // Tiles, lower zoom levels first (as Leaflet stacks them).
    const tiles = [...mapEl.querySelectorAll('.leaflet-tile-pane img.leaflet-tile-loaded')];
    tiles.sort((a, b) => (+a.parentNode.style.zIndex || 0) - (+b.parentNode.style.zIndex || 0));
    gl.uniform1i(p.u.u_night, night ? 1 : 0);
    for (const img of tiles) {
      if (!img.complete || !img.naturalWidth) continue;
      if (img.crossOrigin == null) return false; // loaded without CORS: its pixels are off limits
      const r = img.getBoundingClientRect();
      if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
      gl.bindTexture(gl.TEXTURE_2D, tileTexture(img));
      gl.uniform1f(p.u.u_opacity, img.style.opacity === '' ? 1 : +img.style.opacity);
      drawRect(p, r.left * k, r.top * k, r.width * k, r.height * k);
    }

    // The aircraft, scaled down to the scene's resolution first.
    const ac = layer.getCanvas();
    if (ac) {
      if (aircraftCanvas.width !== scene.w || aircraftCanvas.height !== scene.h) {
        aircraftCanvas.width = scene.w;
        aircraftCanvas.height = scene.h;
      } else {
        aircraftCtx.clearRect(0, 0, scene.w, scene.h);
      }
      const r = ac.getBoundingClientRect();
      aircraftCtx.drawImage(ac, r.left * k, r.top * k, r.width * k, r.height * k);
      gl.bindTexture(gl.TEXTURE_2D, aircraftTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, aircraftCanvas);
      gl.uniform1i(p.u.u_night, 0);
      gl.uniform1f(p.u.u_opacity, 1);
      drawRect(p, 0, 0, scene.w, scene.h);
    }
    gl.disable(gl.BLEND);
    return true;
  }

  /** Two frosted copies of the scene: about 8 and 18 CSS px of blur. */
  function drawFrost() {
    const p = programs.blur;
    gl.useProgram(p.program);
    gl.uniform1i(p.u.u_src, 0);
    gl.activeTexture(gl.TEXTURE0);
    const pass = (src, dst, dx, dy) => {
      bindTarget(dst);
      gl.uniform2f(p.u.u_target, dst.w, dst.h);
      gl.uniform2f(p.u.u_dir, dx, dy);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      drawRect(p, 0, 0, dst.w, dst.h);
    };
    half.size(scene.w / 2, scene.h / 2);
    quarter.size(half.w / 2, half.h / 2);
    blurTmp1.size(quarter.w, quarter.h);
    frost1.size(quarter.w, quarter.h);
    eighth.size(quarter.w / 2, quarter.h / 2);
    blurTmp2.size(eighth.w, eighth.h);
    frost2.size(eighth.w, eighth.h);
    pass(scene, half, 0, 0);
    pass(half, quarter, 0, 0);
    pass(quarter, blurTmp1, 1.5 / quarter.w, 0);
    pass(blurTmp1, frost1, 0, 1.5 / quarter.h);
    pass(frost1, eighth, 0, 0);
    pass(eighth, blurTmp2, 1.5 / eighth.w, 0);
    pass(blurTmp2, frost2, 0, 1.5 / eighth.h);
  }

  function radiusPx(spec, w, h) {
    const v = parseFloat(spec) || 0;
    return spec.trim().endsWith('%') ? (v / 100) * Math.min(w, h) : v;
  }

  function render() {
    if (state === 'off') return;
    try {
      renderFrame();
    } catch (err) {
      stop(err.message);
    }
  }

  function renderFrame() {
    frame++;
    if (state === 'paused' && frame % 60) return; // check again now and then
    if (document.hidden) return;
    if (paramsDirty) refreshParams();
    const vw = mapEl.clientWidth;
    const vh = mapEl.clientHeight;
    const scale = Math.min(devicePixelRatio || 1, GLASS_SCALE_MAX);

    // Which glass is showing, and where.
    let moved = false;
    const visible = [];
    for (const s of surfaces) {
      if (s.canvas.parentNode !== s.el) s.el.prepend(s.canvas); // content was replaced
      const rects = s.el.getClientRects();
      if (!rects.length) {
        s.rect = null;
        continue;
      }
      const r = s.el.getBoundingClientRect();
      if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
      const w = s.el.offsetWidth;
      const h = s.el.offsetHeight;
      if (!s.rect || s.rect.left !== r.left || s.rect.top !== r.top || s.rect.width !== r.width || s.rect.height !== r.height) moved = true;
      s.rect = r;
      // A pressed piece glows where it was touched (main.js sets .pressed and --px/--py).
      const pressed = s.el.classList.contains('pressed');
      const target = pressed ? 1 : 0;
      s.glow += (target - s.glow) * (target > s.glow ? 0.35 : 0.12);
      if (Math.abs(target - s.glow) > 0.01) moved = true;
      const gx = (parseFloat(s.el.style.getPropertyValue('--px')) || 50) / 100;
      const gy = (parseFloat(s.el.style.getPropertyValue('--py')) || 50) / 100;
      visible.push({ s, w, h, cw: Math.max(1, Math.round(w * scale)), ch: Math.max(1, Math.round(h * scale)), gx: gx * w, gy: gy * h });
    }
    if (!visible.length) return;
    // While nothing moves, 30 frames a second is plenty for the slow drift of aircraft beneath.
    if (!moved && !mapMoving && frame % 2 && state === 'on') return;

    const now = performance.now();
    if (lastRender && state === 'on' && !keepOn) {
      slowFrames.push(now - lastRender > 50 ? 1 : 0);
      if (slowFrames.length > 120) slowFrames.shift();
      if (slowFrames.length === 120 && slowFrames.reduce((a, b) => a + b, 0) > 60) {
        stop('too slow on this device');
        return;
      }
    }
    lastRender = now;

    try {
      if (!drawScene(vw, vh)) {
        state = 'paused';
        setOn(false);
        return;
      }
    } catch {
      // A tile that can't be read (no CORS): fall back until the map style changes.
      state = 'paused';
      setOn(false);
      return;
    }
    drawFrost();

    // Lay the pieces out side by side on the GL canvas, draw them, then copy each into place.
    let x = 0;
    let y = 0;
    let rowH = 0;
    let needW = 0;
    for (const v of visible) {
      if (x + v.cw > maxSize) {
        x = 0;
        y += rowH + 2;
        rowH = 0;
      }
      v.ax = x;
      v.ay = y;
      x += v.cw + 2;
      rowH = Math.max(rowH, v.ch);
      needW = Math.max(needW, x);
    }
    const needH = Math.min(maxSize, y + rowH);
    if (glCanvas.width < needW || glCanvas.height < needH) {
      glCanvas.width = Math.max(glCanvas.width, needW);
      glCanvas.height = Math.max(glCanvas.height, needH);
    }
    bindTarget(null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const p = programs.glass;
    gl.useProgram(p.program);
    gl.uniform2f(p.u.u_target, glCanvas.width, glCanvas.height);
    gl.uniform2f(p.u.u_view, vw, vh);
    gl.uniform1f(p.u.u_light, light ? 1 : 0);
    gl.uniform1f(p.u.u_pxScale, scale);
    gl.uniform1i(p.u.u_scene, 0);
    gl.uniform1i(p.u.u_frost1, 1);
    gl.uniform1i(p.u.u_frost2, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, frost1.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, frost2.tex);
    for (const v of visible) {
      const { s } = v;
      const q = s.params;
      gl.uniform4f(p.u.u_screen, s.rect.left, s.rect.top, s.rect.width, s.rect.height);
      gl.uniform2f(p.u.u_size, v.w, v.h);
      gl.uniform1f(p.u.u_radius, radiusPx(q.radius, v.w, v.h));
      gl.uniform1f(p.u.u_bezel, q.bezel);
      gl.uniform1f(p.u.u_refract, q.refract);
      gl.uniform1f(p.u.u_frost, q.frost);
      gl.uniform4f(p.u.u_tint, q.tint[0], q.tint[1], q.tint[2], q.tint[3]);
      gl.uniform1f(p.u.u_adapt, q.adapt);
      gl.uniform3f(p.u.u_glow, v.gx, v.gy, s.glow);
      drawRect(p, v.ax, v.ay, v.cw, v.ch);
    }
    for (const v of visible) {
      const { canvas, ctx } = v.s;
      if (canvas.width !== v.cw || canvas.height !== v.ch) {
        canvas.width = v.cw;
        canvas.height = v.ch;
      } else {
        ctx.clearRect(0, 0, v.cw, v.ch);
      }
      ctx.drawImage(glCanvas, v.ax, v.ay, v.cw, v.ch, 0, 0, v.cw, v.ch);
    }

    // Forget tiles that have left the map.
    if (frame % 120 === 0) {
      for (const [img, entry] of tileTextures) {
        if (frame - entry.used > 240) {
          gl.deleteTexture(entry.tex);
          tileTextures.delete(img);
        }
      }
    }
    if (state !== 'on') {
      state = 'on';
      setOn(true);
    }
  }

  layer.on('frame', render);
  return { stop: () => stop('stopped') };
}
