import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, modelIdFor } from '../public/js/aircraft-models.js';

test('every aircraft model has plausible geometry', () => {
  for (const [id, m] of Object.entries(MODELS)) {
    if (m.kind === 'heli') {
      assert.ok(m.R > 1 && m.Lf > 3 && m.Wc > 0.5 && m.blades >= 2, id);
      continue;
    }
    if (m.kind === 'balloon' || m.kind === 'ground' || m.kind === 'fighter') continue;
    const { L, S, W, wing, ht, fin } = m;
    assert.ok(L > 5 && S > 5 && W > 0.5 && W < L / 4, `${id}: overall dimensions`);
    assert.ok(m.nose.len < L / 3 && m.tailLen < L / 1.5, `${id}: nose/tail cone`);
    assert.ok(wing.y > 0 && wing.y + wing.cr < L, `${id}: wing root inside the fuselage`);
    assert.ok(wing.ct <= wing.cr && wing.sweep >= 0 && wing.sweep < 50, `${id}: wing planform`);
    if (ht) {
      assert.ok(ht.y > wing.y + wing.cr, `${id}: tailplane behind the wing`);
      assert.ok(ht.y < L, `${id}: tailplane on the aircraft`);
      assert.ok(ht.span < S, `${id}: tailplane narrower than the wing`);
    }
    if (fin) assert.ok(fin.y > wing.y && fin.y + fin.len <= L + 0.5, `${id}: fin on the tail`);
    for (const e of m.fans || []) assert.ok(e.x > W / 2 && e.x < S / 2 - 1, `${id}: wing engine within the span`);
    for (const e of m.rear || []) assert.ok(e.y > wing.y && e.y + e.len < L, `${id}: rear engine on the fuselage`);
    for (const p of m.props || []) {
      assert.ok(p.x > W / 2 && p.x < S / 2, `${id}: propeller within the span`);
      assert.ok(p.front < wing.y + 1, `${id}: propeller ahead of the wing`);
    }
  }
});

test('type designators map to models, with sensible fallbacks', () => {
  assert.equal(modelIdFor({ type: 'A20N' }), 'a20n');
  assert.equal(modelIdFor({ type: 'B77W' }), 'b77w');
  assert.equal(modelIdFor({ type: 'A388' }), 'a388');
  assert.equal(modelIdFor({ type: 'AT76' }), 'at76');
  assert.equal(modelIdFor({ type: 'EC35' }), 'h135');
  assert.equal(modelIdFor({ type: 'ZZZZ', category: 'A5' }), 'b789');
  assert.equal(modelIdFor({ type: '', category: 'A7' }), 'h145');
  assert.equal(modelIdFor({ category: 'C1' }), 'ground');
  assert.equal(modelIdFor({}), 'a320');
  for (const t of ['A319', 'B738', 'B744', 'CRJ9', 'E190', 'DH8D', 'C172', 'GLF6', 'R44', 'F16', 'C17']) {
    assert.ok(MODELS[modelIdFor({ type: t })], t);
  }
});
