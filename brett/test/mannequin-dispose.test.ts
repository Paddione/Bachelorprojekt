// brett/test/mannequin-dispose.test.ts — SEC bug #4 (T000660)
//
// three.js dispose-leak: figures are removed from the scene graph on snapshot
// reset (ws-client.ts:226 → scene.remove(f.root)) and on figure-delete, but
// their geometries / materials / textures are NEVER disposed → GPU memory grows
// unboundedly across reloads. There must be a `disposeMannequin(fig)` that walks
// fig.root and calls dispose() on every geometry, material and texture.
//
// makeMannequin() needs a live WebGL scene + DOM (document.createElement, a real
// renderer via getScene()), which node:test cannot provide headlessly. So we
// build a synthetic fig whose root mirrors what makeMannequin produces (a Group
// of Meshes with geometries + materials + a CanvasTexture-like map) and assert
// the dispose contract against it using dispose spies.
import { test } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';

import { disposeMannequin } from '../src/client/mannequin';

function buildSyntheticFig(): { fig: any; disposed: { geo: number; mat: number; tex: number } } {
  const disposed = { geo: 0, mat: 0, tex: 0 };
  const root = new THREE.Group();

  function spyGeometry(g: THREE.BufferGeometry): THREE.BufferGeometry {
    const orig = g.dispose.bind(g);
    g.dispose = () => { disposed.geo++; orig(); };
    return g;
  }
  function spyMaterial(m: any): any {
    const orig = m.dispose.bind(m);
    m.dispose = () => { disposed.mat++; orig(); };
    return m;
  }
  function spyTexture(t: any): any {
    const orig = t.dispose.bind(t);
    t.dispose = () => { disposed.tex++; orig(); };
    return t;
  }

  // Body mesh (geometry + material).
  const torso = new THREE.Mesh(
    spyGeometry(new THREE.BoxGeometry(0.5, 0.7, 0.25)),
    spyMaterial(new THREE.MeshLambertMaterial({ color: 0xb8c0a8 })),
  );
  root.add(torso);

  // Sprite carrying a texture map (mirrors labelSprite/freezeSprite).
  const tex = spyTexture(new THREE.Texture());
  const spriteMat = spyMaterial(new THREE.SpriteMaterial({ map: tex }));
  const labelSprite = new THREE.Sprite(spriteMat);
  root.add(labelSprite);

  const fig = { id: 'synthetic-1', type: 'mannequin', root };
  return { fig, disposed };
}

test('disposeMannequin: is exported and is a function', () => {
  assert.strictEqual(typeof disposeMannequin, 'function');
});

test('disposeMannequin: disposes geometries, materials and textures under fig.root', () => {
  const { fig, disposed } = buildSyntheticFig();
  disposeMannequin(fig);
  assert.ok(disposed.geo >= 1, `expected ≥1 geometry disposed, got ${disposed.geo}`);
  assert.ok(disposed.mat >= 1, `expected ≥1 material disposed, got ${disposed.mat}`);
  assert.ok(disposed.tex >= 1, `expected ≥1 texture (material.map) disposed, got ${disposed.tex}`);
});
