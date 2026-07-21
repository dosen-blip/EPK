/**
 * @typedef {{ src: string, offset: number, duration: number }} AudioSegment
 */

/** @type {AudioSegment[]} */
export const ESCAPADE_SEGMENTS = Array.from({ length: 62 }, (_, index) => ({
  src: `/audio/dosen-escapade-ap-${String(index).padStart(3, "0")}.mp3`,
  offset: index * 90,
  duration: index === 61 ? 14.031202 : 90,
}));

/**
 * @param {AudioSegment[]} segments
 */
export function getAudioDuration(segments) {
  const finalSegment = segments.at(-1);
  return finalSegment ? finalSegment.offset + finalSegment.duration : 0;
}

/**
 * @param {AudioSegment[]} segments
 * @param {number} requestedTime
 */
export function locateAudioSegment(segments, requestedTime) {
  const duration = getAudioDuration(segments);
  const safeTime = typeof requestedTime === "number" && !Number.isNaN(requestedTime) ? requestedTime : 0;
  const boundedTime = Math.min(Math.max(safeTime, 0), duration);
  const index = Math.max(
    0,
    segments.findIndex(
      (segment, segmentIndex) =>
        boundedTime < segment.offset + segment.duration || segmentIndex === segments.length - 1,
    ),
  );
  const segment = segments[index];

  return {
    index,
    absoluteTime: boundedTime,
    localTime: segment ? Math.min(Math.max(boundedTime - segment.offset, 0), segment.duration) : 0,
  };
}

/**
 * @param {string} src
 * @param {number} duration
 * @returns {AudioSegment[]}
 */
export function createSingleFileSegments(src, duration) {
  return [{ src, offset: 0, duration }];
}
