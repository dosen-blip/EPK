import assert from "node:assert/strict";
import test from "node:test";
import {
  AMBIENCE_DEFAULTS,
  AMBIENCE_IDS,
  MAX_HUE_SHIFT,
  analyzeFrame,
  createStrobeDetector,
  exposureAmount,
  hueShift,
  resolveAmbienceToggles,
  roomTint,
  strobeBlip,
  strobeSag,
} from "../app/_hero/ambience-model.mjs";

const allOff = Object.fromEntries(AMBIENCE_IDS.map((id) => [id, false]));

test("resolves ambience toggles from defaults, saved choices and the query", () => {
  assert.deepEqual(resolveAmbienceToggles(null, null), AMBIENCE_DEFAULTS);
  assert.deepEqual(resolveAmbienceToggles("none", null), allOff);
  assert.deepEqual(resolveAmbienceToggles("exposure,hue", null), { ...allOff, exposure: true, hue: true });
  assert.deepEqual(resolveAmbienceToggles("-strobe", null), { ...AMBIENCE_DEFAULTS, strobe: false });
  assert.deepEqual(resolveAmbienceToggles("none,-strobe", null), allOff);
  const saved = JSON.stringify({ ...AMBIENCE_DEFAULTS, reflection: false });
  assert.deepEqual(resolveAmbienceToggles(null, saved), { ...AMBIENCE_DEFAULTS, reflection: false });
  assert.deepEqual(resolveAmbienceToggles("all", saved), AMBIENCE_DEFAULTS);
  assert.deepEqual(resolveAmbienceToggles(null, "{not json"), AMBIENCE_DEFAULTS);
});

test("analyses frame brightness, the band behind the wordmark, and the room hue", () => {
  const width = 4;
  const height = 2;
  const data = new Uint8ClampedArray(width * height * 4);
  // Left half dark grey, right half saturated green (a laser wash).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (x < 2) data.set([20, 20, 20, 255], i);
      else data.set([0, 255, 0, 255], i);
    }
  }
  const stats = analyzeFrame(data, width, height, { x0: 2, y0: 0, x1: 4, y1: 2 });
  assert.ok(stats.bandLuma > 0.7, "band behind the wordmark is the bright green half");
  assert.ok(stats.luma > 0.3 && stats.luma < stats.bandLuma);
  const tint = roomTint(stats.hueX, stats.hueY);
  assert.ok(Math.abs(tint.hue - 1 / 3) < 0.01, "green reads as a third of a turn");
  assert.equal(tint.strength, 1);
});

test("caps the hue shift and scales it by strength", () => {
  assert.equal(hueShift(0.57, 0.57, 1), 0);
  assert.equal(hueShift(0.57, 0.1, 1), -MAX_HUE_SHIFT);
  assert.equal(hueShift(0.57, 0.9, 1), MAX_HUE_SHIFT);
  assert.ok(Math.abs(hueShift(0.98, 0.02, 1) - 0.04) < 1e-9, "wraps the short way round through red");
  assert.equal(hueShift(0.57, 0.9, 0), 0);
});

test("maps band brightness to exposure", () => {
  assert.equal(exposureAmount(0), 0);
  assert.equal(exposureAmount(1), 1);
  assert.ok(exposureAmount(0.25) > 0.3 && exposureAmount(0.25) < 0.7);
});

test("fires once per strobe and rests through the cooldown", () => {
  const detect = createStrobeDetector();
  assert.equal(detect(0.1, 0, 0), 0);
  assert.equal(detect(0.1, 0.07, 0.07), 0);
  const hit = detect(0.4, 0.14, 0.07);
  assert.ok(hit > 0.9);
  assert.equal(detect(0.1, 0.21, 0.07), 0);
  assert.equal(detect(0.4, 0.5, 0.07), 0, "still cooling down");
  assert.equal(detect(0.1, 1.6, 0.07), 0);
  assert.ok(detect(0.4, 1.7, 0.07) > 0, "fires again after the cooldown");
});

test("sags and blips recover to full brightness", () => {
  assert.equal(strobeSag(0.02, 0.5), 0.5);
  assert.ok(strobeSag(0.4, 0.5) > 0.95);
  assert.equal(strobeSag(1, 0.5), 1);
  assert.equal(strobeSag(-0.1, 0.5), 1);
  assert.equal(strobeBlip(0.03), 0.12);
  assert.equal(strobeBlip(0.3), 1);
});
