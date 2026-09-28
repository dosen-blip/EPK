import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  NEON_FAULT_KEYFRAMES,
  NEON_HUM_KEYFRAMES,
  NEON_IGNITION_KEYFRAMES,
  NEON_LETTERS,
  NEON_SETTLE_KEYFRAMES,
  neonLitAt,
  neonTubeLevel,
  planNeonIgnition,
  NEON_DRAMATIC_PACE,
  neonDropOffset,
  neonDropEnd,
  readNeonLevels,
  sampleNeonStops,
} from "../app/_hero/neon-timeline.mjs";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

/** Parses `@keyframes name { 0% { --prop: v; } 64%, 100% { ... } }` into sorted [offset, value] stops. */
function cssStops(name, property) {
  const match = css.match(new RegExp(`@keyframes ${name} \\{(.*)\\}\\s*$`, "m"));
  assert.ok(match, `missing @keyframes ${name}`);
  const stops = [];
  for (const [, selectors, body] of match[1].matchAll(/([\d.,%\s]+)\{([^}]*)\}/g)) {
    const value = Number(body.match(new RegExp(`${property}:\\s*([\\d.]+)`))[1]);
    for (const selector of selectors.split(",")) stops.push([Math.round(Number(selector.trim().replace("%", "")) * 10) / 1000, value]);
  }
  return stops.sort((a, b) => a[0] - b[0]);
}

test("CSS tubes and the WebGL sign share identical keyframes", () => {
  assert.deepEqual(NEON_LETTERS, ["D", "O", "S", "E", "N"]);
  for (const [name, stops] of Object.entries(NEON_IGNITION_KEYFRAMES)) assert.deepEqual(cssStops(`neon-ignite-${name}`, "--neon-level"), stops, name);
  for (const [name, stops] of Object.entries(NEON_FAULT_KEYFRAMES)) assert.deepEqual(cssStops(`neon-fault-${name}`, "--neon-level"), stops, name);
  assert.deepEqual(cssStops("neon-hum", "opacity"), NEON_HUM_KEYFRAMES);
  assert.deepEqual(cssStops("neon-settle", "opacity"), NEON_SETTLE_KEYFRAMES);
});

test("samples keyframes the way CSS step-end and linear timing do", () => {
  const snap = NEON_IGNITION_KEYFRAMES.snap;
  assert.equal(sampleNeonStops(snap, 0.19), 0);
  assert.equal(sampleNeonStops(snap, 0.2), 1);
  assert.equal(sampleNeonStops(snap, 0.45), 0.5);
  assert.equal(sampleNeonStops(snap, 1), 1);
  assert.ok(Math.abs(sampleNeonStops(NEON_IGNITION_KEYFRAMES.warm, 0.05, true) - 0.075) < 1e-9);
  const tube = { delay: 0.4, duration: 1, ignition: "snap" };
  assert.equal(neonTubeLevel(tube, 0.3), 0);
  assert.equal(neonTubeLevel(tube, 0.65), 1);
  assert.equal(neonTubeLevel(tube, 2), 1);
});

test("plans a random, CSS-rounded ignition and reads levels from the shared clock", () => {
  const tubes = planNeonIgnition();
  assert.equal(tubes.length, 5);
  for (const tube of tubes) {
    assert.equal(tube.delay, Math.round(tube.delay * 100) / 100);
    assert.equal(tube.duration, Math.round(tube.duration * 100) / 100);
  }
  const out = new Float32Array(5);
  const clock = { still: false, tubes, start: 1000, lit: null, fault: null };
  readNeonLevels(clock, 1000, out);
  assert.deepEqual([...out], [0, 0, 0, 0, 0]);
  readNeonLevels(clock, 1000 + neonLitAt(tubes) * 1000 + 1, out);
  assert.deepEqual([...out], [1, 1, 1, 1, 1]);
  clock.lit = 5000;
  clock.fault = { index: 2, kind: "blip", at: 6000 };
  readNeonLevels(clock, 6100, out);
  assert.equal(out[2], 0);
  assert.equal(readNeonLevels({ ...clock, still: true }, 6100, out), 1);
  assert.deepEqual([...out], [1, 1, 1, 1, 1]);
});

test("the dramatic pace starts later, spaces the letters out and always ends on the stubborn tube", () => {
  const random = () => 0.5;
  const normal = planNeonIgnition(random);
  const dramatic = planNeonIgnition(random, NEON_DRAMATIC_PACE);
  assert.ok(Math.min(...dramatic.map((tube) => tube.delay)) > Math.min(...normal.map((tube) => tube.delay)));
  assert.ok(neonLitAt(dramatic) > neonLitAt(normal));
  const last = dramatic.reduce((a, b) => (b.delay > a.delay ? b : a));
  assert.equal(last.ignition, "stubborn");
});

test("the phone intro's letters wait up high, drop in turn, overshoot and land", () => {
  const clock = { still: false, tubes: null, start: 0, lit: null, fault: null, intro: { dy: -200 } };
  assert.equal(neonDropOffset(clock, 500, 0, 70), -200);
  clock.lit = 1000;
  assert.equal(neonDropOffset(clock, 1000 + 640, 0, 70), -200);
  const midFirst = neonDropOffset(clock, 1000 + 1100, 0, 70);
  const midLast = neonDropOffset(clock, 1000 + 1100, 4, 70);
  assert.ok(midFirst > -200 && midFirst < 0 && midLast < midFirst);
  const landed = 1000 + (0.65 + 0.78 * 1.2) * 1000;
  assert.ok(Math.abs(neonDropOffset(clock, landed, 0, 70) - 4.9) < 0.05);
  assert.equal(neonDropOffset(clock, 1000 + neonDropEnd() * 1000, 4, 70), 0);
  assert.equal(neonDropOffset({ ...clock, intro: null }, 1100, 0, 70), 0);
});
