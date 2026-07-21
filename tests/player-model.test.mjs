import assert from "node:assert/strict";
import test from "node:test";

import {
  createSingleFileSegments,
  ESCAPADE_SEGMENTS,
  getAudioDuration,
  locateAudioSegment,
} from "../app/player-model.mjs";

test("models the complete segmented Escapade recording", () => {
  assert.equal(ESCAPADE_SEGMENTS.length, 62);
  assert.equal(ESCAPADE_SEGMENTS[0].src, "/audio/dosen-escapade-ap-000.mp3");
  assert.equal(ESCAPADE_SEGMENTS.at(-1).src, "/audio/dosen-escapade-ap-061.mp3");
  assert.equal(getAudioDuration(ESCAPADE_SEGMENTS), 5504.031202);
});

test("locates segment boundaries and clamps seek requests", () => {
  assert.deepEqual(locateAudioSegment(ESCAPADE_SEGMENTS, 89.5), {
    index: 0,
    absoluteTime: 89.5,
    localTime: 89.5,
  });
  assert.deepEqual(locateAudioSegment(ESCAPADE_SEGMENTS, 90), {
    index: 1,
    absoluteTime: 90,
    localTime: 0,
  });
  assert.deepEqual(locateAudioSegment(ESCAPADE_SEGMENTS, -20), {
    index: 0,
    absoluteTime: 0,
    localTime: 0,
  });

  const finalLocation = locateAudioSegment(ESCAPADE_SEGMENTS, Number.POSITIVE_INFINITY);
  assert.equal(finalLocation.index, 61);
  assert.equal(finalLocation.absoluteTime, 5504.031202);
  assert.equal(finalLocation.localTime, 14.031202);
});

test("models single-file sets with the same player interface", () => {
  const segments = createSingleFileSegments("/audio/example.mp3", 3548.686009);
  assert.deepEqual(segments, [{ src: "/audio/example.mp3", offset: 0, duration: 3548.686009 }]);
  assert.equal(getAudioDuration(segments), 3548.686009);
  assert.deepEqual(locateAudioSegment(segments, 4000), {
    index: 0,
    absoluteTime: 3548.686009,
    localTime: 3548.686009,
  });
});

test("models the OFF GRID anniversary master at its encoded duration", () => {
  const segments = createSingleFileSegments(
    "/audio/off-grid-1-year-dosen-b2b-fastr.mp3",
    4212.623469,
  );
  assert.equal(getAudioDuration(segments), 4212.623469);
  assert.deepEqual(locateAudioSegment(segments, 4212.623469), {
    index: 0,
    absoluteTime: 4212.623469,
    localTime: 4212.623469,
  });
});
