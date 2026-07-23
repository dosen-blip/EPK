import rawContentManifest from "../source-of-truth/content-manifest.json";
import { ESCAPADE_SEGMENTS } from "./player-model.mjs";

export type LibraryClip = {
  title: string;
  orientation: "landscape" | "portrait";
  src: string;
  poster: string;
};

export type LibraryEvent = {
  id: string;
  title: string;
  set: string;
  date: string;
  time: string;
  location: string;
  clips: LibraryClip[];
};

type FilePlayer = {
  kind: "file";
  src: string;
  durationSeconds: number;
  accent: string;
  dockTitle: string;
};

type SegmentedPlayer = {
  kind: "segmented";
  model: "escapade-62-segment";
  accent: string;
  dockTitle: string;
};

export type Transmission = {
  id: string;
  slug: string;
  date: string;
  venue: string;
  title: string;
  detail: string;
  slot: string;
  tone: string;
  role: string;
  timelineFormat: string;
  lineup: string;
  duration: string;
  artwork: {
    vinylCover: string;
    eventPoster: string | null;
  };
  featureVideo: string | null;
  story: string;
  sound: string;
  recordingUrl: string | null;
  secondaryUrl: string | null;
  libraryEventId: string | null;
  player: FilePlayer | SegmentedPlayer | null;
};

type ContentManifest = {
  schemaVersion: 1;
  mediaOrigin: string;
  defaultFeaturedSetSlug: string;
  transmissionCount: number;
  playableSetCount: number;
  libraryClipCount: number;
  timelineOrder: string[];
  libraryEvents: LibraryEvent[];
  transmissions: Transmission[];
};

type AudioSegment = (typeof ESCAPADE_SEGMENTS)[number];

export type PlayerSource =
  | { kind: "segmented"; segments: AudioSegment[] }
  | { kind: "file"; src: string; duration: number };

export type PlayableSet = Transmission & {
  player: FilePlayer | SegmentedPlayer;
  source: PlayerSource;
  accent: string;
  dockTitle: string;
};

export const contentManifest = rawContentManifest as ContentManifest;
export const MEDIA_ORIGIN = contentManifest.mediaOrigin;
export const DEFAULT_FEATURED_SET_SLUG = contentManifest.defaultFeaturedSetSlug;
export const LIBRARY_EVENTS = contentManifest.libraryEvents;
export const LIBRARY_CLIP_COUNT = LIBRARY_EVENTS.reduce((total, event) => total + event.clips.length, 0);
export const transmissions = contentManifest.transmissions;

export const playableSets: PlayableSet[] = transmissions.flatMap((transmission) => {
  const player = transmission.player;
  if (!player) return [];

  const source: PlayerSource = player.kind === "segmented"
    ? { kind: "segmented", segments: ESCAPADE_SEGMENTS }
    : { kind: "file", src: player.src, duration: player.durationSeconds };

  return [{
    ...transmission,
    player,
    source,
    accent: player.accent,
    dockTitle: player.dockTitle,
  }];
});

export const timeline = contentManifest.timelineOrder.map((slug) => {
  const transmission = transmissions.find((item) => item.slug === slug);
  if (!transmission) {
    throw new Error(`Unknown timeline transmission: ${slug}`);
  }
  return transmission;
});

export function getEventArtwork(set: Transmission) {
  return set.artwork.eventPoster ?? set.artwork.vinylCover;
}

export function getLibraryEvent(set: Transmission) {
  return LIBRARY_EVENTS.find((event) => event.id === set.libraryEventId) ?? null;
}

export function getFeaturedClip(set: Transmission) {
  if (!set.featureVideo) return null;
  return getLibraryEvent(set)?.clips.find((clip) => clip.src === set.featureVideo) ?? null;
}
