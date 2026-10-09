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
  neonLandingPulse,
  neonDolly,
  neonDollyArrival,
  neonDollyEnd,
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



test("the phone intro's sign waits centred and enlarged, glides back into place in one move, then hits", () => {
  const tubes = planNeonIgnition(() => 0.5, NEON_DRAMATIC_PACE);
  const clock = { still: false, tubes, start: 1000, lit: null, fault: null, intro: { dy: -200, scale: 1.07 } };
  assert.deepEqual(neonDolly(clock, 2000), { offset: -200, offsetX: 0, scale: 1.07, progress: 0 });
  clock.lit = 5000;
  assert.equal(neonDolly(clock, 5000 + 490).offset, -200);
  const mid = neonDolly(clock, 5000 + 1200);
  assert.ok(mid.offset > -200 && mid.offset < 0 && mid.scale < 1.07 && mid.scale > 1);
  const arrived = neonDolly(clock, 5000 + neonDollyArrival() * 1000);
  assert.ok(Math.abs(arrived.offset - 3) < 0.05 && arrived.scale === 1);
  assert.deepEqual(neonDolly(clock, 5000 + neonDollyEnd() * 1000), { offset: 0, offsetX: 0, scale: 1, progress: 1 });
  assert.deepEqual(neonDolly({ ...clock, intro: null }, 6000), { offset: 0, offsetX: 0, scale: 1, progress: 1 });
  // Desktop starts centred across too: it glides sideways into place with the same curve, without overshoot.
  const wide = { ...clock, intro: { dy: -200, dx: 300, scale: 1.1 } };
  const midWide = neonDolly(wide, 5000 + 1200);
  assert.ok(midWide.offsetX > 0 && midWide.offsetX < 300);
  assert.equal(neonDolly(wide, 5000 + neonDollyArrival() * 1000).offsetX, 0);
  const hit = 5000 + neonDollyArrival() * 1000;
  assert.equal(neonLandingPulse(clock, hit - 10), 0);
  assert.ok(neonLandingPulse(clock, hit + 60) > 0.6);
  assert.ok(neonLandingPulse(clock, hit + 1500) < 0.01);
});
