// OWNER: B (world). Marlow: a controller box on a post. A slit display, one green dot. No face, no screen text.
import * as THREE from 'three';
import { ANCHORS, BEDS } from '../core/layout.js';
import { Batch, box, xf, col, mix, shade, paint, extrude, tube, V, ball, cyl } from './kit.js';

export function buildMarlow(ctx) {
  const m = ANCHORS.marlow.pos, b = new Batch(), f = new Batch(), body = col('marlowBox');
  b.add(box(0.075, m.y - 0.2, 0.075), 'barrelBand', xf(m.x, (m.y - 0.2) / 2, m.z - 0.03));
  b.add(box(0.2, 0.03, 0.2), 'barrelBand', xf(m.x, 0.015, m.z - 0.03));
  b.add(box(0.42, 0.52, 0.2), (p, n) => n.z > 0.5 ? body : n.y > 0.5 ? mix('marlowBox', 'chalk', 0.2) : shade('marlowBox', 0.85), xf(m.x, m.y, m.z));
  b.add(box(0.35, 0.3, 0.012), mix('marlowBox', 'parapet', 0.5), xf(m.x, m.y - 0.08, m.z + 0.104));                 // the door
  b.add(box(0.025, 0.08, 0.02), 'barrelBand', xf(m.x - 0.13, m.y - 0.08, m.z + 0.115));                              // its latch
  b.add(extrude([[-0.25, 0], [0.25, 0], [0.25, 0.03], [-0.25, 0.1]], 0.3), mix('marlowBox', 'barrelBand', 0.5), xf(m.x, m.y + 0.26, m.z + 0.03, 0, Math.PI / 2));   // rain hood
  b.add(box(0.26, 0.07, 0.012), shade('barrelBand', 0.8), xf(m.x, m.y + 0.16, m.z + 0.104));                         // display bezel
  // conduit: down the post, along the deck to the beds
  const z = BEDS[0].z + BEDS[0].d / 2 + 0.1;
  b.add(tube([V(m.x + 0.12, m.y - 0.26, m.z - 0.04), V(m.x + 0.12, 0.06, m.z - 0.04), V(m.x + 0.12, 0.03, m.z - 0.1), V(m.x + 0.12, 0.03, z)], 0.02, 5), 'barrelBand');
  f.add(box(0.2, 0.034, 0.01), 'marlow', xf(m.x, m.y + 0.16, m.z + 0.112));
  f.add(ball(0.024, 8, 6), 'marlow', xf(m.x + 0.14, m.y - 0.19, m.z + 0.105));
  const mesh = b.mesh(paint.lit()), lights = f.mesh(paint.flat(), { cast: false, receive: false });
  const group = new THREE.Group(); group.add(mesh, lights);
  return { group, materials: [mesh.material] };
}
