"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  createSingleFileSegments,
  ESCAPADE_SEGMENTS,
  getAudioDuration,
  locateAudioSegment,
} from "./player-model.mjs";

const MEDIA_ORIGIN = "https://dosen-media.matiadosen.workers.dev";

function mediaUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${MEDIA_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

type LibraryClip = {
  title: string;
  orientation: "landscape" | "portrait";
  src: string;
  poster: string;
};

const LIBRARY_EVENTS: Array<{
  id: string;
  title: string;
  set: string;
  date: string;
  time: string;
  location: string;
  clips: LibraryClip[];
}> = [
  {
    id: "off-grid-1-year",
    title: "OFF GRID 1 YEAR",
    set: "DOSEN B2B FASTR",
    date: "28 MAR 2026",
    time: "SET TIME / TBC",
    location: "GRIDWRKS / OTTAWA",
    clips: [
      {
        title: "Anniversary Clip 02",
        orientation: "landscape",
        src: "/media/library/off-grid-anniversary-2.mp4",
        poster: "/media/library/posters/off-grid-anniversary-2.jpg",
      },
      {
        title: "Anniversary Clip 03",
        orientation: "landscape",
        src: "/media/library/off-grid-anniversary-3.mp4",
        poster: "/media/library/posters/off-grid-anniversary-3.jpg",
      },
      {
        title: "Anniversary Clip 04",
        orientation: "landscape",
        src: "/media/library/off-grid-anniversary-4.mp4",
        poster: "/media/library/posters/off-grid-anniversary-4.jpg",
      },
      {
        title: "Anniversary Clip 05",
        orientation: "landscape",
        src: "/media/library/off-grid-anniversary-5.mp4",
        poster: "/media/library/posters/off-grid-anniversary-5.jpg",
      },
      {
        title: "Anniversary Clip 06",
        orientation: "landscape",
        src: "/media/library/off-grid-anniversary-6.mp4",
        poster: "/media/library/posters/off-grid-anniversary-6.jpg",
      },
      {
        title: "Anniversary Clip 07",
        orientation: "landscape",
        src: "/media/library/off-grid-anniversary-7.mp4",
        poster: "/media/library/posters/off-grid-anniversary-7.jpg",
      },
      {
        title: "Anniversary Clip 08",
        orientation: "landscape",
        src: "/media/library/off-grid-anniversary-8.mp4",
        poster: "/media/library/posters/off-grid-anniversary-8.jpg",
      },
      {
        title: "Blue Crowd",
        orientation: "portrait",
        src: "/media/library/off-grid-blue-crowd-vertical.mp4",
        poster: "/media/library/posters/off-grid-blue-crowd-vertical.jpg",
      },
      {
        title: "Blue Room",
        orientation: "portrait",
        src: "/media/library/off-grid-blue-room-vertical.mp4",
        poster: "/media/library/posters/off-grid-blue-room-vertical.jpg",
      },
      {
        title: "Behind the Decks",
        orientation: "portrait",
        src: "/media/library/off-grid-red-decks-vertical.mp4",
        poster: "/media/library/posters/off-grid-red-decks-vertical.jpg",
      },
      {
        title: "Anniversary Clip 09",
        orientation: "portrait",
        src: "/media/library/off-grid-anniversary-9.mp4",
        poster: "/media/library/posters/off-grid-anniversary-9.jpg",
      },
    ],
  },
  {
    id: "off-grid-frequency-shift",
    title: "OFF GRID × FREQUENCY SHIFT",
    set: "DOSEN / RECORDED SET",
    date: "03 JAN 2026",
    time: "SET TIME / TBC",
    location: "GRIDWRKS / OTTAWA",
    clips: [
      {
        title: "Frequency Shift Clip 01",
        orientation: "portrait",
        src: "/media/library/frequency-shift-jan-03-1.mp4",
        poster: "/media/library/posters/frequency-shift-jan-03-1.jpg",
      },
      {
        title: "Frequency Shift Clip 02",
        orientation: "portrait",
        src: "/media/library/frequency-shift-jan-03-2.mp4",
        poster: "/media/library/posters/frequency-shift-jan-03-2.jpg",
      },
      {
        title: "Frequency Shift Clip 03",
        orientation: "portrait",
        src: "/media/library/frequency-shift-jan-03-3.mp4",
        poster: "/media/library/posters/frequency-shift-jan-03-3.jpg",
      },
    ],
  },
  {
    id: "solstice-frequency-shift",
    title: "SOLSTICE × FREQUENCY SHIFT",
    set: "DOSEN B2B GAB BALLADELLI",
    date: "22 MAY 2026",
    time: "SET TIME / TBC",
    location: "CITY AT NIGHT / OTTAWA",
    clips: [
      {
        title: "Solstice Clip 01",
        orientation: "portrait",
        src: "/media/library/solstice-frequency-1.mp4",
        poster: "/media/library/posters/solstice-frequency-1.jpg",
      },
      {
        title: "Solstice Clip 02",
        orientation: "portrait",
        src: "/media/library/solstice-frequency-2.mp4",
        poster: "/media/library/posters/solstice-frequency-2.jpg",
      },
      {
        title: "Solstice Clip 04",
        orientation: "portrait",
        src: "/media/library/solstice-frequency-4.mp4",
        poster: "/media/library/posters/solstice-frequency-4.jpg",
      },
      {
        title: "Magenta Room",
        orientation: "portrait",
        src: "/media/library/solstice-magenta-room-vertical.mp4",
        poster: "/media/library/posters/solstice-magenta-room-vertical.jpg",
      },
    ],
  },
];

const LIBRARY_CLIP_COUNT = LIBRARY_EVENTS.reduce((total, event) => total + event.clips.length, 0);

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

type Transmission = {
  id: string;
  slug: string;
  date: string;
  venue: string;
  title: string;
  detail: string;
  slot: string;
  tone: string;
  role: string;
  lineup: string;
  duration: string;
  poster: string;
  cardPoster?: string;
  eventPoster?: string;
  audioSrc?: string;
  featureVideo?: string;
  story: string;
  sound: string;
  recordingUrl: string | null;
  secondaryUrl: string | null;
  libraryEventId: string | null;
};

const transmissions: Transmission[] = [
  {
    id: "TR-0626",
    slug: "escapade-afterparty",
    date: "26 JUN 2026",
    venue: "GRIDWRKS / OTTAWA",
    title: "ESCAPADE OFFICIAL AFTERPARTY",
    detail: "OPENING SUPPORT — ODD MOB B2B WALKER & ROYCE",
    slot: "hero-escapade",
    tone: "violet",
    role: "OPENING SUPPORT",
    lineup: "ODD MOB B2B WALKER & ROYCE",
    duration: "1:31:44",
    poster: "/media/escapade-ap-cover.png",
    story: "The opening set for the official Escapade afterparty, setting the room in motion before Odd Mob and Walker & Royce took over.",
    sound: "Driving tech house moved through a deliberate turn into dubstep before closing on rolling, euphoric techno.",
    recordingUrl: "https://soundcloud.com/user-278640203/odd-mob-x-walker-royce-x-dosen",
    secondaryUrl: null,
    libraryEventId: null,
  },
  {
    id: "OGS-053",
    slug: "off-grid-1-year",
    date: "28 MAR 2026",
    venue: "GRIDWRKS / OTTAWA",
    title: "OFF GRID 1 YEAR",
    detail: "DOSEN B2B FASTR — FULL SET AVAILABLE",
    slot: "offgrid-anniversary",
    tone: "amber",
    role: "B2B PERFORMANCE",
    lineup: "DOSEN B2B FASTR",
    duration: "1:10:12",
    poster: "/media/dossiers/off-grid-anniversary-soundcloud.png",
    eventPoster: "/media/dossiers/off-grid-1-year-poster.jpg",
    audioSrc: "/audio/off-grid-1-year-dosen-b2b-fastr.mp3",
    featureVideo: "/media/library/off-grid-anniversary-2.mp4",
    story: "A full anniversary-room document and the clearest view of DOSEN in an extended B2B format: responsive, physical, and built around shared escalation.",
    sound: "Rolling tech-house pressure with fast handoffs, redline moments, and enough lift to keep the set moving as one continuous exchange.",
    recordingUrl: "https://soundcloud.com/user-278640203/offgrid-anniversary-dosen-b2b",
    secondaryUrl: "https://www.youtube.com/watch?v=8ihwDpYYRiM",
    libraryEventId: "off-grid-1-year",
  },
  {
    id: "FS-0522",
    slug: "solstice-frequency-shift",
    date: "22 MAY 2026",
    venue: "CITY AT NIGHT / OTTAWA",
    title: "SOLSTICE X FREQUENCY SHIFT",
    detail: "DOSEN B2B GAB BALLADELLI",
    slot: "solstice-frequency",
    tone: "magenta",
    role: "B2B PERFORMANCE",
    lineup: "DOSEN B2B GAB BALLADELLI",
    duration: "SET RECORDING PENDING",
    poster: "/media/dossiers/solstice-frequency-poster.png",
    featureVideo: "/media/library/solstice-frequency-1.mp4",
    story: "A huge turnout packed City At Night for the Solstice and Frequency Shift crossover—and produced one of the strongest sets in the current run.",
    sound: "A high-energy B2B set built for a full room, with tech-house foundations opening into heavier pressure and moments of lift.",
    recordingUrl: null,
    secondaryUrl: null,
    libraryEventId: "solstice-frequency-shift",
  },
  {
    id: "FS-0103",
    slug: "off-grid-frequency-shift",
    date: "03 JAN 2026",
    venue: "GRIDWRKS / OTTAWA",
    title: "OFF GRID X FREQUENCY SHIFT",
    detail: "TECH HOUSE SET — FULL RECORDING AVAILABLE",
    slot: "frequency-shift",
    tone: "violet",
    role: "RECORDED SET",
    lineup: "DOSEN",
    duration: "1:14:52",
    poster: "/media/dossiers/off-grid-frequency-shift-soundcloud.png",
    cardPoster: "/media/dossiers/off-grid-frequency-shift-poster.jpg",
    eventPoster: "/media/dossiers/off-grid-frequency-shift-poster.jpg",
    audioSrc: "/audio/offgrid-x-frequency-shift.mp3",
    featureVideo: "/media/library/frequency-shift-jan-03-1.mp4",
    story: "A January collaboration between OFF GRID and Frequency Shift at GRIDWRKS, documented through a full recording and a focused set of room clips.",
    sound: "A dedicated tech-house set: direct, club-focused, and built around a steady increase in pressure across the room.",
    recordingUrl: "https://soundcloud.com/user-278640203/offgrid-x-frequency-shift",
    secondaryUrl: null,
    libraryEventId: "off-grid-frequency-shift",
  },
  {
    id: "OGS-032",
    slug: "off-grid-halloweekend",
    date: "01 NOV 2025",
    venue: "GRIDWRKS / OTTAWA",
    title: "OFF GRID HALLOWEEKEND",
    detail: "DEBUT / OPENING SET — FULL SET AVAILABLE",
    slot: "offgrid-halloween",
    tone: "red",
    role: "DEBUT / OPENING SET",
    lineup: "DOSEN",
    duration: "1:34:42",
    poster: "/media/dossiers/off-grid-halloweekend-soundcloud.png",
    cardPoster: "/media/dossiers/off-grid-halloweekend-poster.jpeg",
    eventPoster: "/media/dossiers/off-grid-halloweekend-poster.jpeg",
    audioSrc: "/audio/offgrid-032.mp3",
    story: "The first GRIDWRKS appearance and OFF GRID debut—the opening night that began the current run of performances in the room.",
    sound: "Tech house from beginning to end: a patient opening arc that steadily increased the room's energy without leaving its lane.",
    recordingUrl: "https://soundcloud.com/user-278640203/offgrid-halloween",
    secondaryUrl: "https://www.youtube.com/watch?v=BBwCfF2a7dU",
    libraryEventId: null,
  },
  {
    id: "EXO-002",
    slug: "exosphere-002-sky-lounge",
    date: "SUMMER 2025",
    venue: "SKY LOUNGE / OTTAWA",
    title: "EXOSPHERE 002",
    detail: "FIRST-EVER DEBUT / OPENING SET — FULL SET AVAILABLE",
    slot: "exosphere-002",
    tone: "amber",
    role: "DEBUT / OPENING SET",
    lineup: "DOSEN",
    duration: "0:59:08",
    poster: "/media/dossiers/exosphere-002-sky-lounge-cover.png",
    audioSrc: "/audio/exosphere-002-sky-lounge.mp3",
    story: "The first public DOSEN set: opening EXOSPHERE 002 at Sky Lounge in Ottawa and introducing the project in a live room for the first time.",
    sound: "A summer-leaning opening set rooted in tech house and house—bright, warm, and paced to bring the room in without rushing it.",
    recordingUrl: "https://soundcloud.com/user-278640203/sky-lounge-set",
    secondaryUrl: null,
    libraryEventId: null,
  },
];

type AudioSegment = (typeof ESCAPADE_SEGMENTS)[number];

type PlayerSource =
  | { kind: "segmented"; segments: AudioSegment[] }
  | { kind: "file"; src: string; duration: number };

type PlayableSet = Transmission & {
  source: PlayerSource;
  accent: string;
  dockTitle: string;
};

const PLAYER_CONFIG: Record<string, Pick<PlayableSet, "source" | "accent" | "dockTitle">> = {
  "escapade-afterparty": {
    source: { kind: "segmented", segments: ESCAPADE_SEGMENTS },
    accent: "#b748ff",
    dockTitle: "ESCAPADE AP / OPENING SET",
  },
  "off-grid-1-year": {
    source: { kind: "file", src: "/audio/off-grid-1-year-dosen-b2b-fastr.mp3", duration: 4212.623469 },
    accent: "#ff9933",
    dockTitle: "OFF GRID 1 YEAR / DOSEN B2B FASTR",
  },
  "off-grid-frequency-shift": {
    source: { kind: "file", src: "/audio/offgrid-x-frequency-shift.mp3", duration: 4492.417324 },
    accent: "#d75aff",
    dockTitle: "OFF GRID × FREQUENCY SHIFT",
  },
  "off-grid-halloweekend": {
    source: { kind: "file", src: "/audio/offgrid-032.mp3", duration: 5682.410975 },
    accent: "#ff4938",
    dockTitle: "OFF GRID / HALLOWEEKEND",
  },
  "exosphere-002-sky-lounge": {
    source: { kind: "file", src: "/audio/exosphere-002-sky-lounge.mp3", duration: 3548.686009 },
    accent: "#ff9933",
    dockTitle: "EXOSPHERE 002 / SKY LOUNGE",
  },
};

const playableSets: PlayableSet[] = transmissions.flatMap((transmission) => {
  const config = PLAYER_CONFIG[transmission.slug];
  return config ? [{ ...transmission, ...config }] : [];
});

function getEventArtwork(set: Transmission) {
  return set.eventPoster ?? set.cardPoster ?? set.poster;
}

function getLibraryEvent(set: Transmission) {
  return LIBRARY_EVENTS.find((event) => event.id === set.libraryEventId) ?? null;
}

function getFeaturedClip(set: Transmission) {
  if (!set.featureVideo) return null;
  return getLibraryEvent(set)?.clips.find((clip) => clip.src === set.featureVideo) ?? null;
}

function getSetSegments(set: PlayableSet) {
  return set.source.kind === "segmented"
    ? set.source.segments
    : createSingleFileSegments(set.source.src, set.source.duration);
}

const timeline = [
  ["26 JUN 2026", "ESCAPADE OFFICIAL AFTERPARTY", "GRIDWRKS", "OPENING SUPPORT", "escapade-afterparty"],
  ["22 MAY 2026", "SOLSTICE X FREQUENCY SHIFT", "CITY AT NIGHT", "B2B BALLADELLI", "solstice-frequency-shift"],
  ["28 MAR 2026", "OFF GRID 1 YEAR", "GRIDWRKS", "B2B FASTR", "off-grid-1-year"],
  ["03 JAN 2026", "OFF GRID X FREQUENCY SHIFT", "GRIDWRKS", "RECORDED SET", "off-grid-frequency-shift"],
  ["01 NOV 2025", "OFF GRID HALLOWEEKEND", "GRIDWRKS", "DEBUT / OPENING", "off-grid-halloweekend"],
  ["SUMMER 2025", "EXOSPHERE 002", "SKY LOUNGE", "FIRST DEBUT / OPENING", "exosphere-002-sky-lounge"],
];

function OrientationClipRow({
  eventId,
  eventTitle,
  orientation,
  clips,
  startIndex,
  onPlay,
}: {
  eventId: string;
  eventTitle: string;
  orientation: LibraryClip["orientation"];
  clips: LibraryClip[];
  startIndex: number;
  onPlay: (video: HTMLVideoElement) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || expanded) return;

    const measureOverflow = () => setCanExpand(track.scrollWidth > track.clientWidth + 2);
    measureOverflow();
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(track);
    return () => observer.disconnect();
  }, [expanded]);

  const rowId = `${eventId}-${orientation}-clips`;
  const formatLabel = orientation === "landscape" ? "HORIZONTAL" : "VERTICAL";

  return (
    <div className={`clip-format is-${orientation}`}>
      <div className="clip-format-header mono">
        <span>{formatLabel}</span>
        <span>{clips.length} CLIP{clips.length === 1 ? "" : "S"}</span>
      </div>

      <div
        id={rowId}
        className={`event-clip-track ${expanded ? "is-expanded" : ""}`}
        ref={trackRef}
      >
        {clips.map((clip, index) => {
          const clipNumber = String(startIndex + index + 1).padStart(2, "0");
          const clipLabel = `${eventTitle} CLIP ${clipNumber}`;

          return (
            <article className={`clip-card is-${clip.orientation}`} key={clip.src}>
              <video
                controls
                playsInline
                preload="metadata"
                poster={mediaUrl(clip.poster)}
                aria-label={clipLabel}
                onPlay={(playEvent) => onPlay(playEvent.currentTarget)}
              >
                <source src={mediaUrl(clip.src)} type="video/mp4" />
              </video>
              <div className="clip-card-copy">
                <span className="mono">{clipNumber}</span>
                <div>
                  <h4>{clipLabel}</h4>
                  <p className="mono">
                    {clip.orientation === "landscape" ? "PROFESSIONAL MEDIA" : "SOCIAL MEDIA POST"}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {(canExpand || expanded) && (
        <button
          className="clip-event-expand mono"
          type="button"
          aria-expanded={expanded}
          aria-controls={rowId}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? `COLLAPSE ${formatLabel}` : `EXPAND ALL ${clips.length} ${formatLabel}`}
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
      )}
    </div>
  );
}

function EventClipRow({
  event,
  onPlay,
}: {
  event: (typeof LIBRARY_EVENTS)[number];
  onPlay: (video: HTMLVideoElement) => void;
}) {
  const landscapeClips = event.clips.filter((clip) => clip.orientation === "landscape");
  const portraitClips = event.clips.filter((clip) => clip.orientation === "portrait");

  return (
    <section className="clip-event" id={`event-${event.id}`} aria-labelledby={`${event.id}-title`}>
      <header className="clip-event-header">
        <div>
          <p className="eyebrow">{event.set}</p>
          <h3 id={`${event.id}-title`}>{event.title}</h3>
        </div>
        <dl className="clip-event-facts mono">
          <div><dt>DATE</dt><dd>{event.date}</dd></div>
          <div><dt>TIME</dt><dd>{event.time}</dd></div>
          <div><dt>LOCATION</dt><dd>{event.location}</dd></div>
          <div><dt>MEDIA</dt><dd>{event.clips.length} CLIP{event.clips.length === 1 ? "" : "S"}</dd></div>
        </dl>
      </header>

      <div className="clip-formats">
        {landscapeClips.length > 0 && (
          <OrientationClipRow
            eventId={event.id}
            eventTitle={event.title}
            orientation="landscape"
            clips={landscapeClips}
            startIndex={0}
            onPlay={onPlay}
          />
        )}
        {portraitClips.length > 0 && (
          <OrientationClipRow
            eventId={event.id}
            eventTitle={event.title}
            orientation="portrait"
            clips={portraitClips}
            startIndex={landscapeClips.length}
            onPlay={onPlay}
          />
        )}
      </div>
    </section>
  );
}

function PlaybackIcon({ playing, className = "" }: { playing: boolean; className?: string }) {
  return (
    <span
      className={`playback-icon ${playing ? "is-pause" : "is-play"} ${className}`.trim()}
      aria-hidden="true"
    >
      <i />
      <i />
    </span>
  );
}

function DossierVinylPlayer({
  set,
  isActive,
  isPlaying,
  currentTime,
  duration,
  status,
  onToggle,
  onSeek,
}: {
  set: PlayableSet;
  isActive: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  status: string;
  onToggle: () => void;
  onSeek: (time: number) => void;
}) {
  const recordRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const rampRef = useRef<number | null>(null);

  useEffect(() => {
    const record = recordRef.current;
    if (!record) return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const configure = () => {
      animationRef.current?.cancel();
      animationRef.current = null;
      record.style.transform = "";
      if (motionQuery.matches) return;

      const animation = record.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
        { duration: 1800, iterations: Infinity, easing: "linear" },
      );
      animation.play();
      animation.updatePlaybackRate(0);
      animationRef.current = animation;
    };

    configure();
    motionQuery.addEventListener("change", configure);
    return () => {
      motionQuery.removeEventListener("change", configure);
      animationRef.current?.cancel();
      if (rampRef.current !== null) window.cancelAnimationFrame(rampRef.current);
    };
  }, []);

  useEffect(() => {
    const animation = animationRef.current;
    if (!animation) return;
    if (rampRef.current !== null) window.cancelAnimationFrame(rampRef.current);

    const targetRate = isPlaying ? 1 : 0;
    const startRate = animation.playbackRate;
    const durationMs = isPlaying ? 620 : 420;
    const startedAt = performance.now();

    const ramp = (now: number) => {
      const progress = Math.min((now - startedAt) / durationMs, 1);
      const eased = targetRate > startRate
        ? 1 - Math.pow(1 - progress, 3)
        : progress * progress * (3 - 2 * progress);
      animation.updatePlaybackRate(startRate + (targetRate - startRate) * eased);
      rampRef.current = progress < 1 ? window.requestAnimationFrame(ramp) : null;
    };

    rampRef.current = window.requestAnimationFrame(ramp);
    return () => {
      if (rampRef.current !== null) window.cancelAnimationFrame(rampRef.current);
    };
  }, [isPlaying]);

  const shownTime = isActive ? currentTime : 0;

  return (
    <div
      className={`dossier-vinyl-player ${isPlaying ? "is-playing" : ""}`}
      style={{ "--dossier-player-accent": set.accent } as CSSProperties}
    >
      <div className="dossier-vinyl-stage">
        <div className="dossier-vinyl-record-carriage" aria-hidden="true">
          <div className="dossier-vinyl-record" ref={recordRef}>
            <span className="dossier-vinyl-shine" />
            <span className="dossier-vinyl-label">
              <img src={mediaUrl(set.poster)} alt="" />
              <i />
            </span>
          </div>
        </div>
        <div className="dossier-vinyl-sleeve" aria-hidden="true">
          <img src={mediaUrl(set.poster)} alt="" />
          <span />
        </div>
        <button
          className="dossier-vinyl-play mono"
          type="button"
          onClick={onToggle}
          aria-label={isPlaying ? `Pause ${set.title}` : `Play ${set.title}`}
        >
          <PlaybackIcon playing={isPlaying} />
          {isPlaying ? "PAUSE" : "PLAY"}
        </button>
      </div>

      <div className="dossier-vinyl-controls">
        <p className="mono">FULL SET / LOCAL MASTER</p>
        <h4>{set.title}</h4>
        <div className="dossier-vinyl-meta mono">
          <span>320 KBPS MP3</span>
          <span>{isActive ? status : "READY"}</span>
        </div>
        <input
          type="range"
          min="0"
          max={duration}
          step="1"
          value={Math.min(shownTime, duration)}
          disabled={!isActive}
          aria-label={`Seek through ${set.title}`}
          onChange={(event) => onSeek(Number(event.currentTarget.value))}
        />
        <div className="dossier-vinyl-time mono">
          <span>{formatTime(shownTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [transmitting, setTransmitting] = useState(false);
  const [activeSetSlug, setActiveSetSlug] = useState("escapade-afterparty");
  const [playerStatus, setPlayerStatus] = useState<"ready" | "loading" | "error">("ready");
  const [mobileHero, setMobileHero] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [archiveLibraryOpen, setArchiveLibraryOpen] = useState(false);
  const [selectedSetSlug, setSelectedSetSlug] = useState<string | null>(null);
  const [eventVisualOpen, setEventVisualOpen] = useState(false);
  const [pendingLibraryEvent, setPendingLibraryEvent] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [signalVisible, setSignalVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const heroSectionRef = useRef<HTMLElement>(null);
  const signalSectionRef = useRef<HTMLElement>(null);
  const vinylRef = useRef<HTMLDivElement>(null);
  const spinAnimationRef = useRef<Animation | null>(null);
  const spinRampRef = useRef<number | null>(null);
  const switchRequestRef = useRef(0);
  const libraryRef = useRef<HTMLDivElement>(null);
  const dossierRef = useRef<HTMLDivElement>(null);
  const activeSet = playableSets.find((item) => item.slug === activeSetSlug) ?? playableSets[0];
  const activeSegments = getSetSegments(activeSet);
  const duration = getAudioDuration(activeSegments);
  const selectedSet = transmissions.find((item) => item.slug === selectedSetSlug) ?? null;
  const selectedPlayableSet = playableSets.find((item) => item.slug === selectedSetSlug) ?? null;
  const selectedLibraryEvent = selectedSet ? getLibraryEvent(selectedSet) : null;
  const selectedFeaturedClip = selectedSet ? getFeaturedClip(selectedSet) : null;
  const playerStateLabel = playerStatus === "error"
    ? "AUDIO ERROR"
    : playerStatus === "loading"
      ? "LOADING"
      : transmitting
        ? "PLAYING"
        : "READY";

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 700px) and (orientation: portrait)");
    const updateHeroSource = () => {
      setMobileHero(mobileQuery.matches);
    };

    updateHeroSource();
    mobileQuery.addEventListener("change", updateHeroSource);
    return () => mobileQuery.removeEventListener("change", updateHeroSource);
  }, []);

  useEffect(() => {
    const hero = heroSectionRef.current;
    if (!hero) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const video = heroVideoRef.current;
        if (!video) return;

        if (entry.intersectionRatio >= 0.08) {
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.08] },
    );

    observer.observe(hero);
    return () => observer.disconnect();
  }, [mobileHero]);

  useEffect(() => {
    const section = signalSectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => setSignalVisible(entry.isIntersecting),
      { rootMargin: "120px 0px", threshold: 0.01 },
    );

    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const vinyl = vinylRef.current;
    if (!vinyl || !signalVisible) {
      spinAnimationRef.current?.cancel();
      spinAnimationRef.current = null;
      if (spinRampRef.current !== null) {
        window.cancelAnimationFrame(spinRampRef.current);
        spinRampRef.current = null;
      }
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const configureSpin = () => {
      spinAnimationRef.current?.cancel();
      spinAnimationRef.current = null;
      vinyl.style.transform = "";
      if (motionQuery.matches) return;

      const animation = vinyl.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
        { duration: 1800, iterations: Infinity, easing: "linear" },
      );
      animation.play();
      animation.updatePlaybackRate(0);
      spinAnimationRef.current = animation;
    };

    configureSpin();
    motionQuery.addEventListener("change", configureSpin);
    return () => {
      motionQuery.removeEventListener("change", configureSpin);
      spinAnimationRef.current?.cancel();
      if (spinRampRef.current !== null) window.cancelAnimationFrame(spinRampRef.current);
    };
  }, [signalVisible]);

  useEffect(() => {
    const animation = spinAnimationRef.current;
    if (!animation) return;
    if (spinRampRef.current !== null) window.cancelAnimationFrame(spinRampRef.current);

    const targetRate = transmitting ? 1 : 0;
    const startRate = animation.playbackRate;
    const rampDuration = transmitting ? 680 : 440;
    const startedAt = performance.now();

    const ramp = (now: number) => {
      const progress = Math.min((now - startedAt) / rampDuration, 1);
      const eased = targetRate > startRate
        ? 1 - Math.pow(1 - progress, 3)
        : progress * progress * (3 - 2 * progress);
      animation.updatePlaybackRate(startRate + (targetRate - startRate) * eased);
      if (progress < 1) {
        spinRampRef.current = window.requestAnimationFrame(ramp);
      } else {
        spinRampRef.current = null;
      }
    };

    spinRampRef.current = window.requestAnimationFrame(ramp);
    return () => {
      if (spinRampRef.current !== null) window.cancelAnimationFrame(spinRampRef.current);
    };
  }, [transmitting, signalVisible]);

  useEffect(() => {
    const syncSetFromUrl = () => {
      const slug = new URLSearchParams(window.location.search).get("set");
      setSelectedSetSlug(transmissions.some((item) => item.slug === slug) ? slug : null);
    };

    syncSetFromUrl();
    window.addEventListener("popstate", syncSetFromUrl);
    return () => window.removeEventListener("popstate", syncSetFromUrl);
  }, []);

  useEffect(() => {
    if (!libraryOpen && !archiveLibraryOpen && !selectedSetSlug) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (eventVisualOpen) {
        setEventVisualOpen(false);
        return;
      }
      if (libraryOpen) {
        setLibraryOpen(false);
        return;
      }
      if (archiveLibraryOpen) {
        setArchiveLibraryOpen(false);
        return;
      }

      const url = new URL(window.location.href);
      url.searchParams.delete("set");
      window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
      setSelectedSetSlug(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [archiveLibraryOpen, eventVisualOpen, libraryOpen, selectedSetSlug]);

  useEffect(() => {
    if (!libraryOpen || !pendingLibraryEvent) return;

    const frame = window.requestAnimationFrame(() => {
      libraryRef.current
        ?.querySelector(`#event-${pendingLibraryEvent}`)
        ?.scrollIntoView({ block: "start" });
      setPendingLibraryEvent(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [libraryOpen, pendingLibraryEvent]);

  function loadSegment(
    nextIndex: number,
    localTime: number,
    shouldPlay: boolean,
    segments = activeSegments,
  ) {
    const audio = audioRef.current;
    const segment = segments[nextIndex];
    if (!audio || !segment) return;

    setPlayerStatus("loading");
    setSegmentIndex(nextIndex);
    audio.src = mediaUrl(segment.src);
    audio.load();
    audio.addEventListener(
      "loadedmetadata",
      () => {
        audio.currentTime = Math.min(localTime, segment.duration);
        setPlayerStatus("ready");
        if (shouldPlay) {
          void audio.play().catch(() => {
            setPlayerStatus("error");
            setTransmitting(false);
          });
        }
      },
      { once: true },
    );
  }

  function fadeAudio(audio: HTMLAudioElement, targetVolume: number, durationMs: number, requestId: number) {
    const startVolume = audio.volume;
    let startedAt: number | null = null;

    return new Promise<boolean>((resolve) => {
      const tick = (now: number) => {
        if (requestId !== switchRequestRef.current) {
          resolve(false);
          return;
        }

        startedAt ??= now;
        const progress = Math.min((now - startedAt) / durationMs, 1);
        const eased = progress * progress * (3 - 2 * progress);
        audio.volume = startVolume + (targetVolume - startVolume) * eased;
        if (progress < 1) {
          window.requestAnimationFrame(tick);
        } else {
          resolve(true);
        }
      };
      window.requestAnimationFrame(tick);
    });
  }

  async function selectPlayableSet(slug: string) {
    if (slug === activeSetSlug) return;
    const nextSet = playableSets.find((item) => item.slug === slug);
    const audio = audioRef.current;
    if (!nextSet || !audio) return;

    const requestId = ++switchRequestRef.current;
    const shouldContinue = !audio.paused;
    if (shouldContinue && !(await fadeAudio(audio, 0, 180, requestId))) return;
    if (requestId !== switchRequestRef.current) return;

    audio.pause();
    setActiveSetSlug(slug);
    setCurrentTime(0);
    setSegmentIndex(0);
    setPlayerStatus("loading");

    const nextSegments = getSetSegments(nextSet);
    audio.src = nextSegments[0].src;
    audio.volume = shouldContinue ? 0 : 1;
    audio.load();

    const loaded = await new Promise<boolean>((resolve) => {
      const onReady = () => resolve(true);
      const onError = () => resolve(false);
      audio.addEventListener("loadedmetadata", onReady, { once: true });
      audio.addEventListener("error", onError, { once: true });
    });

    if (requestId !== switchRequestRef.current) return;
    if (!loaded) {
      audio.volume = 1;
      setPlayerStatus("error");
      setTransmitting(false);
      return;
    }

    audio.currentTime = 0;
    setPlayerStatus("ready");
    if (!shouldContinue) return;

    try {
      await audio.play();
      await fadeAudio(audio, 1, 320, requestId);
    } catch {
      audio.volume = 1;
      setPlayerStatus("error");
      setTransmitting(false);
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        setPlayerStatus("loading");
        await audio.play();
        setPlayerStatus("ready");
      } catch {
        setPlayerStatus("error");
        setTransmitting(false);
      }
    } else {
      audio.pause();
    }
  }

  async function toggleDossierPlayback(set: PlayableSet) {
    dossierRef.current?.querySelectorAll("video").forEach((video) => video.pause());

    if (set.slug === activeSetSlug) {
      await togglePlayback();
      return;
    }

    await selectPlayableSet(set.slug);
    const audio = audioRef.current;
    if (!audio) return;
    try {
      setPlayerStatus("loading");
      await audio.play();
      setPlayerStatus("ready");
    } catch {
      setPlayerStatus("error");
      setTransmitting(false);
    }
  }

  function handleSegmentEnded() {
    const nextIndex = segmentIndex + 1;
    if (nextIndex < activeSegments.length) {
      loadSegment(nextIndex, 0, true);
      return;
    }

    setTransmitting(false);
    setCurrentTime(0);
    loadSegment(0, 0, false);
  }

  function seekTo(nextTime: number) {
    const location = locateAudioSegment(activeSegments, nextTime);
    const shouldPlay = audioRef.current ? !audioRef.current.paused : false;

    if (location.index === segmentIndex && audioRef.current) {
      audioRef.current.currentTime = location.localTime;
    } else {
      loadSegment(location.index, location.localTime, shouldPlay);
    }
    setCurrentTime(location.absoluteTime);
  }

  function openLibrary(eventId?: string) {
    audioRef.current?.pause();
    if (eventId) setPendingLibraryEvent(eventId);
    setLibraryOpen(true);
  }

  function closeLibrary() {
    libraryRef.current?.querySelectorAll("video").forEach((video) => video.pause());
    setLibraryOpen(false);
  }

  function openArchiveLibrary() {
    audioRef.current?.pause();
    setArchiveLibraryOpen(true);
  }

  function openSetFromArchiveLibrary(slug: string) {
    setArchiveLibraryOpen(false);
    openSetDossier(slug);
  }

  function handleLibraryPlay(activeVideo: HTMLVideoElement) {
    audioRef.current?.pause();
    libraryRef.current?.querySelectorAll("video").forEach((video) => {
      if (video !== activeVideo) video.pause();
    });
  }

  function openSetDossier(slug: string) {
    audioRef.current?.pause();
    setEventVisualOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set("set", slug);
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setSelectedSetSlug(slug);
  }

  function closeSetDossier() {
    dossierRef.current?.querySelectorAll("video").forEach((video) => video.pause());
    setEventVisualOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("set");
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setSelectedSetSlug(null);
  }

  function openSetMedia(eventId: string) {
    const url = new URL(window.location.href);
    url.searchParams.delete("set");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setSelectedSetSlug(null);
    openLibrary(eventId);
  }

  return (
    <main className={`site-shell ${libraryOpen ? "library-is-open" : ""} ${archiveLibraryOpen ? "archive-library-is-open" : ""} ${selectedSet ? "dossier-is-open" : ""}`}>
      <header className="site-header">
        <Link className="mini-mark" href="/" aria-label="DOSEN home">
          <span className="wordmark wordmark-small">DOSEN</span>
        </Link>
        <div className="header-signal" aria-hidden="true">
          OTTAWA, CANADA
        </div>
        <nav aria-label="Primary navigation">
          <a href="#signal">Listen</a>
          <a href="#archive">Sets</a>
          <a href="#press">Press</a>
          <a className="nav-cta" href="#contact">Book</a>
        </nav>
      </header>

      <section className="hero" id="top" ref={heroSectionRef}>
        <div className="hero-film">
          <video
            ref={heroVideoRef}
            key={mobileHero ? "mobile-hero" : "desktop-hero"}
            className="hero-video"
            src={mediaUrl(mobileHero ? "/media/hero/hero-mobile-v1.mp4" : "/media/hero/hero-desktop-v1.mp4")}
            autoPlay
            muted
            loop
            playsInline
            aria-label="DOSEN performance reel"
          />
          <span
            className="hero-film-matte hero-film-matte-top"
            style={{ backdropFilter: "blur(13px)", WebkitBackdropFilter: "blur(13px)" }}
            aria-hidden="true"
          />
          <span
            className="hero-film-matte hero-film-matte-bottom"
            style={{ backdropFilter: "blur(13px)", WebkitBackdropFilter: "blur(13px)" }}
            aria-hidden="true"
          />
        </div>
        <div className="hero-shade" aria-hidden="true" />

        <div className="hero-kicker mono">
          <span>OTTAWA, CANADA</span>
          <span>DJ / TECH HOUSE</span>
        </div>

        <div className="hero-copy">
          <h1 className="hero-mark">DOSEN</h1>
          <div className="hero-bottom">
            <p className="hero-statement">
              Ottawa DJ moving through tech house, trance lift, and the point
              where the room stops checking the time.
            </p>
            <div className="hero-actions">
              <button
                className="hero-action hero-action-primary"
                type="button"
                aria-haspopup="dialog"
                aria-expanded={libraryOpen}
                onClick={() => openLibrary()}
              >
                Open video library
              </button>
              <a className="hero-action hero-action-secondary" href="#archive">View performances</a>
            </div>
          </div>
        </div>

        <div className="scroll-note mono" aria-hidden="true">
          SCROLL TO EXPLORE <span>↓</span>
        </div>
      </section>

      {libraryOpen && (
        <div
          className="clip-library"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clip-library-title"
          ref={libraryRef}
        >
          <div className="clip-library-header">
            <div>
              <span className="wordmark wordmark-small">DOSEN</span>
              <p className="mono">FULL CLIP LIBRARY / ORIGINAL AUDIO</p>
            </div>
            <button type="button" onClick={closeLibrary} aria-label="Close video library">
              CLOSE <span aria-hidden="true">×</span>
            </button>
          </div>

          <div className="clip-library-intro">
            <p className="eyebrow">PERFORMANCE FILMS / {LIBRARY_CLIP_COUNT} CLIPS</p>
            <h2 id="clip-library-title">Inside the room.</h2>
            <p>Organized by night. Open a row, choose a perspective, and hear every clip with its original audio.</p>
          </div>

          <div className="clip-events">
            {LIBRARY_EVENTS.map((event) => (
              <EventClipRow event={event} onPlay={handleLibraryPlay} key={event.id} />
            ))}
          </div>
        </div>
      )}

      {archiveLibraryOpen && (
        <div
          className="set-library"
          role="dialog"
          aria-modal="true"
          aria-labelledby="set-library-title"
        >
          <header className="set-library-header">
            <div>
              <span className="wordmark wordmark-small">DOSEN</span>
              <p className="mono" id="set-library-title">SET LIBRARY / {transmissions.length} SELECTED SETS</p>
            </div>
            <button type="button" onClick={() => setArchiveLibraryOpen(false)} aria-label="Close set library">
              CLOSE <span aria-hidden="true">×</span>
            </button>
          </header>

          <div className="set-library-grid">
            {transmissions.map((item, index) => (
              <button
                className={`set-library-card tone-${item.tone}`}
                type="button"
                aria-haspopup="dialog"
                onClick={() => openSetFromArchiveLibrary(item.slug)}
                key={item.id}
              >
                <span className="set-library-media">
                  <img src={mediaUrl(getEventArtwork(item))} alt="" />
                  <span className="mono">{String(index + 1).padStart(2, "0")}</span>
                </span>
                <span className="set-library-meta mono"><span>{item.date}</span><span>{item.id}</span></span>
                <strong>{item.title}</strong>
                <small className="mono">{item.venue}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedSet && (
        <div
          className={`set-dossier dossier-${selectedSet.tone}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="set-dossier-title"
          ref={dossierRef}
        >
          <header className="set-dossier-header">
            <div>
              <span className="wordmark wordmark-small">DOSEN</span>
              <p className="mono">SET DOSSIER / {selectedSet.id}</p>
            </div>
            <button type="button" onClick={closeSetDossier} aria-label="Close set dossier">
              CLOSE <span aria-hidden="true">×</span>
            </button>
          </header>

          <div className="set-dossier-hero">
            <div className="set-dossier-heading">
              <p className="eyebrow">SELECTED SET / {selectedSet.date}</p>
              <h2 id="set-dossier-title">{selectedSet.title}</h2>
              <p>{selectedSet.detail}</p>
            </div>

            <figure className={`set-dossier-media ${selectedFeaturedClip ? `is-${selectedFeaturedClip.orientation}` : "is-artwork"}`}>
              {selectedSet.featureVideo ? (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`${selectedSet.title} featured event clip`}
                  onPlay={() => audioRef.current?.pause()}
                >
                  <source src={mediaUrl(selectedSet.featureVideo)} type="video/mp4" />
                </video>
              ) : (
                <img src={mediaUrl(getEventArtwork(selectedSet))} alt={`${selectedSet.title} event artwork`} />
              )}
              <div className="set-dossier-media-footer">
                <figcaption className="mono">
                  {selectedSet.featureVideo ? "FEATURED EVENT CLIP / ORIGINAL AUDIO" : "EVENT ARTWORK / ARCHIVE VISUAL"}
                </figcaption>
                {selectedSet.featureVideo && selectedLibraryEvent && (
                  <button className="mono" type="button" onClick={() => openSetMedia(selectedLibraryEvent.id)}>
                    VIEW ALL {selectedLibraryEvent.clips.length} EVENT VIDEOS <span aria-hidden="true">↗</span>
                  </button>
                )}
              </div>
            </figure>
          </div>

          <div className="set-dossier-body">
            <dl className="set-dossier-facts mono">
              <div><dt>ROLE</dt><dd>{selectedSet.role}</dd></div>
              <div><dt>LINEUP</dt><dd>{selectedSet.lineup}</dd></div>
              <div><dt>DATE</dt><dd>{selectedSet.date}</dd></div>
              <div><dt>LOCATION</dt><dd>{selectedSet.venue}</dd></div>
              <div><dt>RUN TIME</dt><dd>{selectedSet.duration}</dd></div>
            </dl>

            <div className="set-dossier-main">
              <div className="set-dossier-notes">
                <section>
                  <p className="mono">THE NIGHT</p>
                  <h3>Context</h3>
                  <p>{selectedSet.story}</p>
                </section>
                <section>
                  <p className="mono">THE SET</p>
                  <h3>Sound and arc</h3>
                  <p>{selectedSet.sound}</p>
                </section>
              </div>

              {selectedPlayableSet && (
                <DossierVinylPlayer
                  set={selectedPlayableSet}
                  isActive={selectedPlayableSet.slug === activeSetSlug}
                  isPlaying={selectedPlayableSet.slug === activeSetSlug && transmitting}
                  currentTime={currentTime}
                  duration={getAudioDuration(getSetSegments(selectedPlayableSet))}
                  status={playerStateLabel}
                  onToggle={() => void toggleDossierPlayback(selectedPlayableSet)}
                  onSeek={seekTo}
                />
              )}

              <div className="set-dossier-actions mono">
                {selectedSet.recordingUrl && (
                  <a href={selectedSet.recordingUrl} target="_blank" rel="noreferrer">
                    LISTEN TO FULL SET <span aria-hidden="true">↗</span>
                  </a>
                )}
                {selectedSet.secondaryUrl && (
                  <a href={selectedSet.secondaryUrl} target="_blank" rel="noreferrer">
                    WATCH FULL SET <span aria-hidden="true">↗</span>
                  </a>
                )}
                <button type="button" onClick={() => setEventVisualOpen(true)}>
                  OPEN EVENT VISUAL <span aria-hidden="true">↗</span>
                </button>
              </div>
            </div>
          </div>

          {eventVisualOpen && (
            <div
              className="event-visual-lightbox"
              role="dialog"
              aria-modal="true"
              aria-labelledby="event-visual-title"
              onClick={(event) => {
                if (event.target === event.currentTarget) setEventVisualOpen(false);
              }}
            >
              <header className="event-visual-header">
                <div>
                  <p className="mono">EVENT VISUAL / {selectedSet.date}</p>
                  <h3 id="event-visual-title">{selectedSet.title}</h3>
                </div>
                <button
                  className="mono"
                  type="button"
                  autoFocus
                  onClick={() => setEventVisualOpen(false)}
                  aria-label={`Close ${selectedSet.title} event visual`}
                >
                  CLOSE <span aria-hidden="true">×</span>
                </button>
              </header>
              <figure>
                <img
                  src={mediaUrl(getEventArtwork(selectedSet))}
                  alt={`${selectedSet.title} event poster`}
                />
                <figcaption className="mono">OFFICIAL EVENT POSTER / ARCHIVE VISUAL</figcaption>
              </figure>
            </div>
          )}
        </div>
      )}

      <div className="marquee" aria-label="DOSEN sound description">
        <div className="marquee-track">
          <div className="marquee-group">
            <span>TECH HOUSE</span><i>◆</i><span>MINIMAL GRIT</span><i>◆</i>
            <span>TRANCE-LIT HORIZON</span><i>◆</i><span>AFTER HOURS</span><i>◆</i>
          </div>
          <div className="marquee-group" aria-hidden="true">
            <span>TECH HOUSE</span><i>◆</i><span>MINIMAL GRIT</span><i>◆</i>
            <span>TRANCE-LIT HORIZON</span><i>◆</i><span>AFTER HOURS</span><i>◆</i>
          </div>
        </div>
      </div>

      <section
        className={`signal-section section tone-${activeSet.tone} ${transmitting ? "is-playing" : ""}`}
        id="signal"
        ref={signalSectionRef}
        style={{ "--player-accent": activeSet.accent } as CSSProperties}
        data-active-set={activeSet.slug}
      >
        <audio
          ref={audioRef}
          src={mediaUrl(activeSegments[0].src)}
          preload="metadata"
          onPlay={() => {
            setTransmitting(true);
            setPlayerStatus("ready");
          }}
          onPause={() => setTransmitting(false)}
          onError={() => {
            setPlayerStatus("error");
            setTransmitting(false);
          }}
          onEnded={handleSegmentEnded}
          onTimeUpdate={(event) =>
            setCurrentTime((activeSegments[segmentIndex]?.offset ?? 0) + event.currentTarget.currentTime)
          }
        />

        <div className="signal-feature-grid">
          <div className="signal-intro" key={`${activeSet.slug}-copy`}>
            <p className="eyebrow">FEATURED SET / {activeSet.date}</p>
            <h2>{activeSet.title}</h2>
            <p>{activeSet.story}</p>
            <div className="signal-sound">
              <span className="mono">SOUND / ARC</span>
              <p>{activeSet.sound}</p>
            </div>
          </div>

          <div className={`vinyl-stage ${transmitting ? "is-playing" : ""}`}>
            <div className="vinyl-record-carriage" aria-hidden="true">
              <div className="vinyl-record" ref={vinylRef}>
                <div className="vinyl-record-shine" />
                <div className="vinyl-label">
                  <img src={mediaUrl(activeSet.poster)} alt="" />
                  <span className="vinyl-spindle" />
                </div>
              </div>
            </div>

            <div className="vinyl-sleeve">
              <div className="vinyl-sleeve-art">
                <img src={mediaUrl(activeSet.poster)} alt={`${activeSet.title} official set artwork`} />
              </div>
              <span className="vinyl-sleeve-grain" aria-hidden="true" />
              <span className="vinyl-sleeve-edge" aria-hidden="true" />
              <button
                className="vinyl-play-button"
                type="button"
                aria-pressed={transmitting}
                aria-label={transmitting ? `Pause ${activeSet.title}` : `Play ${activeSet.title}`}
                onClick={() => void togglePlayback()}
              >
                <PlaybackIcon playing={transmitting} className="vinyl-play-icon" />
                <span>{transmitting ? "PAUSE" : "PLAY"}</span>
                <small className="mono">320 KBPS / {formatTime(duration)}</small>
              </button>
            </div>
          </div>

          <div className="signal-data mono" key={`${activeSet.slug}-data`}>
            <div><span>NOW QUEUED</span><strong>{activeSet.lineup}</strong></div>
            <div><span>LOCATION</span><strong>{activeSet.venue}</strong></div>
            <div><span>FORMAT</span><strong>FULL SET / {formatTime(duration)}</strong></div>
            <div><span>STATUS</span><strong>{playerStateLabel} / 320 KBPS MP3</strong></div>
          </div>
        </div>

        <div className="set-selector" aria-labelledby="set-selector-title">
          <div className="set-selector-heading mono">
            <span id="set-selector-title">CHOOSE A SET</span>
            <span>{String(playableSets.length).padStart(2, "0")} LOCAL RECORDINGS</span>
          </div>
          <div className="set-selector-track" role="group" aria-label="Playable DOSEN sets">
            {playableSets.map((set, index) => {
              const isActive = set.slug === activeSet.slug;
              return (
                <button
                  className={`set-selector-card tone-${set.tone} ${isActive ? "is-active" : ""}`}
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`${isActive ? "Currently selected" : "Select"}: ${set.title}`}
                  onClick={() => void selectPlayableSet(set.slug)}
                  key={set.slug}
                >
                  <span className="set-selector-cover">
                    <img src={mediaUrl(set.poster)} alt="" />
                    <span className="set-selector-number mono">{String(index + 1).padStart(2, "0")}</span>
                    <span className="set-selector-active mono">{isActive ? "ON AIR" : "SELECT"}</span>
                  </span>
                  <span className="set-selector-meta">
                    <strong>{set.title}</strong>
                    <small className="mono">{set.date} / {formatTime(getAudioDuration(getSetSegments(set)))}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="archive section" id="archive">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SELECTED PERFORMANCES / 2025—2026</p>
            <h2>Selected sets</h2>
          </div>
          <button className="archive-library-button mono" type="button" onClick={openArchiveLibrary}>
            LIBRARY <span aria-hidden="true">↗</span>
          </button>
        </div>

        <div className="archive-grid">
          {transmissions.map((item, index) => (
            <article className={`archive-card tone-${item.tone}`} key={item.id}>
              <button
                className="archive-card-trigger"
                type="button"
                aria-haspopup="dialog"
                onClick={() => openSetDossier(item.slug)}
              >
                <div className="archive-media media-slot" data-media-slot={item.slot}>
                  <img className="archive-poster" src={mediaUrl(getEventArtwork(item))} alt="" />
                  <span className="archive-index mono">{String(index + 1).padStart(2, "0")}</span>
                  <span className="placeholder-label mono">OPEN DOSSIER / {item.id}</span>
                </div>
                <div className="archive-meta mono">
                  <span>{item.id}</span><span>{item.date}</span>
                </div>
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
                <span className="venue mono">{item.venue}</span>
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="timeline section" aria-labelledby="timeline-title">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">SELECTED DATES / VERIFIED</p>
            <h2 id="timeline-title">Recent dates</h2>
          </div>
          <span className="coordinate mono">45.4215° N / 75.6972° W</span>
        </div>
        <div className="timeline-list">
          {timeline.map(([date, event, venue, format, slug], index) => (
            <button
              className="timeline-row"
              type="button"
              aria-haspopup="dialog"
              onClick={() => openSetDossier(slug)}
              key={event}
            >
              <span className="row-number mono">{String(index + 1).padStart(2, "0")}</span>
              <time className="mono">{date}</time>
              <strong>{event}</strong>
              <span>{venue}</span>
              <span className="mono format">{format}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="press section" id="press">
        <div className="press-label mono">ARTIST PROFILE / OFFICIAL BIO</div>
        <div className="press-copy">
          <p className="drop-cap">
            DOSEN is an Ottawa-based DJ with a sound rooted in minimal, gritty
            tech house and sharpened by shades of trance, house, and techno.
          </p>
          <p>
            After his first-ever opening set at Sky Lounge for EXOSPHERE 002,
            he moved quickly through Ottawa&apos;s underground—from his OFF GRID
            debut and Frequency Shift appearances to an opening slot at the
            official Escapade afterparty for Odd Mob B2B Walker &amp; Royce.
          </p>
        </div>
        <aside className="press-facts">
          <div><span>BASE</span><strong>OTTAWA, CANADA</strong></div>
          <div><span>CORE</span><strong>TECH HOUSE</strong></div>
          <div><span>EDGE</span><strong>TRANCE / HOUSE / TECHNO</strong></div>
          <div><span>SETS</span><strong>SOLO / B2B / SUPPORT</strong></div>
        </aside>
      </section>

      <section className="contact section" id="contact">
        <p className="eyebrow">BOOKINGS / PRESS / COLLABORATION</p>
        <h2>Make a night of it.</h2>
        <div className="contact-actions">
          <a href="mailto:matiadosen@outlook.com">matiadosen@outlook.com ↗</a>
          <a href="https://www.instagram.com/matia_dosen/" target="_blank" rel="noreferrer">Instagram ↗</a>
          <a href="https://soundcloud.com/user-278640203" target="_blank" rel="noreferrer">SoundCloud ↗</a>
        </div>
      </section>

      <footer>
        <span className="mini-mark wordmark wordmark-small">DOSEN</span>
        <p className="mono">ELECTRONIC PRESS KIT / OTTAWA / 2026</p>
        <a href="#top" aria-label="Back to top">↑ TOP</a>
      </footer>

      <div className={`signal-dock ${transmitting ? "is-playing" : ""}`}>
        <button type="button" onClick={() => void togglePlayback()} aria-label={transmitting ? `Pause ${activeSet.title}` : `Play ${activeSet.title}`}>
          <PlaybackIcon playing={transmitting} />
        </button>
        <div className="dock-track">
          <span>{activeSet.dockTitle}</span>
          <input
            className="progress"
            type="range"
            min="0"
            max={duration}
            step="1"
            value={Math.min(currentTime, duration)}
            aria-label={`Seek through ${activeSet.title}`}
            onChange={(event) => {
              const nextTime = Number(event.currentTarget.value);
              seekTo(nextTime);
            }}
          />
        </div>
        <span className="dock-time mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
        <span className="dock-status mono">{playerStateLabel}</span>
      </div>
    </main>
  );
}
