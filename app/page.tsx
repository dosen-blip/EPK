"use client";

import Link from "next/link";
import { useEdgeGlow } from "./edge-glow";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type TransitionEvent } from "react";
import {
  createSingleFileSegments,
  getAudioDuration,
  locateAudioSegment,
} from "./player-model.mjs";
import {
  NEON_FAULT_HOLD_MS,
  NEON_DRAMATIC_PACE,
  neonDolly,
  neonDollyArrival,
  neonDollyEnd,
  NEON_LETTERS,
  NEON_LIT_DELAY_MS,
  neonLitAt,
  planNeonIgnition,
  readNeonLevels,
  type NeonClock,
  type NeonFaultKind,
  type NeonTube,
} from "./_hero/neon-timeline.mjs";
import { ambienceToggles } from "./_hero/ambience-store";
import type { NeonSignScene } from "./_hero/neon-sign-scene";
import {
  DEFAULT_FEATURED_SET_SLUG,
  getEventArtwork,
  getLibraryEvent,
  LIBRARY_CLIP_COUNT,
  LIBRARY_EVENTS,
  MEDIA_ORIGIN,
  playableSets,
  PRESS_KIT,
  timeline,
  transmissions,
  type LibraryClip,
  type PlayableSet,
} from "./content";

function mediaUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${MEDIA_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

// Media read back through canvas (the hero and clip videos) is requested with CORS. A query of its own keeps
// those responses in a separate cache entry from any plain request for the same file, which Chrome can
// otherwise fail to write.
/** Whether a video is under way: the browser expects it to play through, or it's playing with some buffered ahead. */
function videoCanPlayOn(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return true;
  if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA || video.paused || video.currentTime < 0.2) return false;
  const { buffered, currentTime } = video;
  for (let i = 0; i < buffered.length; i++) {
    if (buffered.start(i) <= currentTime + 0.1 && buffered.end(i) - currentTime >= INTRO_VIDEO_AHEAD_S) return true;
  }
  return false;
}

function corsMediaUrl(path: string) {
  return `${mediaUrl(path)}?cors=1`;
}

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function getSetSegments(set: PlayableSet) {
  return set.source.kind === "segmented"
    ? set.source.segments
    : createSingleFileSegments(set.source.src, set.source.duration);
}

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
                crossOrigin="anonymous"
                poster={mediaUrl(clip.poster)}
                aria-label={clipLabel}
                onPlay={(playEvent) => onPlay(playEvent.currentTarget)}
              >
                <source src={corsMediaUrl(clip.src)} type="video/mp4" />
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
              <img src={mediaUrl(set.artwork.vinylCover)} alt="" loading="lazy" decoding="async" />
              <i />
            </span>
          </div>
        </div>
        <div className="dossier-vinyl-sleeve" aria-hidden="true">
          <img src={mediaUrl(set.artwork.vinylCover)} alt="" loading="lazy" decoding="async" />
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

const MOBILE_CHAPTERS = [
  { id: "signal", number: "01", label: "LISTEN" },
  { id: "archive", number: "02", label: "SELECTED SETS" },
  { id: "dates", number: "03", label: "DATES" },
  { id: "press", number: "04", label: "PROFILE" },
  { id: "contact", number: "05", label: "BOOK" },
] as const;

type MobileChapterId = (typeof MOBILE_CHAPTERS)[number]["id"];
type MobileDockPhase = "expanded" | "collapsing" | "compact" | "expanding";

function MobileChapterMarker({ number, label }: { number: string; label: string }) {
  return (
    <div className="mobile-chapter-marker mono mobile-reveal" data-number={number} aria-hidden="true">
      <span>{number}</span>
      <span>{label}</span>
    </div>
  );
}

type NeonFault = { index: number; kind: NeonFaultKind };

// The transparent text keeps the wordmark's exact size and accessible name; the tubes are paint only.
// Once WebGL is ready a 3D sign (app/_hero/neon-sign-scene.ts) takes over from the CSS tubes, reading
// the same ignition plan through `clock`. The tubes keep running underneath as the fallback.
/** Phone intro: how dark the room starts, how far the fully lit tubes alone lift it (the rest comes as the sign
 * lands), and the longest the dark opening waits for the wordmark's font and the 3D sign before powering on. */
const INTRO_ROOM_DARK = 0.96;
const INTRO_TUBE_LIGHT = 0.72;
// Phone intro: how long the hidden UI takes to fade in as the sign lands, and the latest it may stay hidden.
const INTRO_UI_FADE_MS = 900;
const INTRO_UI_SAFETY_MS = 9000; // from the start of the power-on
/** How much the intro's god rays and depth light already gather toward the sign (0: even across the room). */
const INTRO_LIGHT_FOCUS = 0.85;
const INTRO_GATE_MS = 1400;
/** The power-on also waits for the hero video to be playing (the browser expects it to play through, or it has
 * started and `INTRO_VIDEO_AHEAD_S` seconds are buffered), so the sign never lights an empty room on a slow
 * connection; past `INTRO_VIDEO_WAIT_MS` it starts anyway. */
const INTRO_VIDEO_AHEAD_S = 1.5;
const INTRO_VIDEO_WAIT_MS = 8000;
/** Phones: how much of the god rays and depth light stays on once the sign has settled (of the intro's peak). */
const HERO_REST_LIGHT = 0.34;
/** Desktop: the god rays and depth light settle to this steady level after the intro (started strong, to tune down). */
const HERO_REST_LIGHT_DESKTOP = 1;
/** Once settled, the god rays hold for this many seconds, then ease down over the next few to this share. */
const RAYS_CALM_AFTER = 3;
const RAYS_CALM_OVER = 2.5;
const RAYS_CALM_TO = 0.35;

function NeonWordmark() {
  const markRef = useRef<HTMLHeadingElement>(null);
  const clockRef = useRef<NeonClock>({ still: false, tubes: null, start: null, lit: null, fault: null });
  const [tubes, setTubes] = useState<NeonTube[] | null>(null);
  const [lit, setLit] = useState(false);
  const [fault, setFault] = useState<NeonFault | null>(null);
  const [sign, setSign] = useState<"css" | "3d">("css");
  // Phones only: the hero intro. The room opens dark with the sign in the centre of the screen; it powers on slowly,
  // its light reaching into the room as the tubes catch, then pulls back and down into its place in one smooth move
  // and arrives with a hit of light (see .neon-mark.is-intro, .hero-room, .hero-flash and the 3D sign).
  // Armed before the first paint by the head script in app/layout.tsx.
  const introRef = useRef(false);
  const [intro, setIntro] = useState<{ dx: number; dy: number; scale: number } | null>(null);
  // Settles once the 3D sign has drawn its first frame or given up, so the intro can open on it.
  // The 3D sign, once it's up, so the hero's light layer can follow it as it sways.
  const sceneRef = useRef<NeonSignScene | null>(null);
  const [signReady] = useState(() => {
    let resolve = () => {};
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve: () => resolve() };
  });

  useEffect(() => {
    const clock = clockRef.current;
    const root = document.documentElement;
    (window as Window & { __dosenIntro?: boolean }).__dosenIntro = true;
    // Phones hide the header, hero copy and player during the centred power-on (`intro-ui-hidden`, set before first
    // paint); they fade back in as the sign lands.
    let uiTimer = 0;
    const revealUi = () => {
      if (!root.classList.contains("intro-ui-hidden")) return;
      root.classList.remove("intro-ui-hidden");
      root.classList.add("intro-ui-reveal");
      window.setTimeout(() => root.classList.remove("intro-ui-reveal"), INTRO_UI_FADE_MS + 100);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clock.still = true;
      root.classList.remove("intro-pending", "intro-ui-hidden");
      return;
    }
    const wantsIntro = root.classList.contains("intro-pending") && window.scrollY < 40;
    if (!wantsIntro) root.classList.remove("intro-pending", "intro-ui-hidden");
    introRef.current = wantsIntro;

    const plan = wantsIntro ? planNeonIgnition(Math.random, NEON_DRAMATIC_PACE) : planNeonIgnition();
    const litAt = neonLitAt(plan);
    clock.tubes = plan;
    let disposed = false;
    let frame = 0;
    let faultTimer = 0;
    let resetTimer = 0;
    let litTimer = 0;
    let gateTimer = 0;
    let videoTimer = 0;
    let flashTimer = 0;
    let roomFrame = 0;
    const section = markRef.current?.closest<HTMLElement>(".hero") ?? null;
    const room = section?.querySelector<HTMLElement>(".hero-room") ?? null;
    const flash = section?.querySelector<HTMLElement>(".hero-flash") ?? null;
    const phoneLight = window.matchMedia("(max-width: 620px)").matches;

    const scheduleFault = () => {
      faultTimer = window.setTimeout(() => {
        if (!document.hidden) {
          const kind: NeonFaultKind = Math.random() < 0.25 ? "dropout" : "blip";
          const next = { index: Math.floor(Math.random() * NEON_LETTERS.length), kind };
          clock.fault = { ...next, at: performance.now() };
          setFault(next);
          resetTimer = window.setTimeout(() => setFault(null), NEON_FAULT_HOLD_MS[kind]);
        }
        scheduleFault();
      }, 5200 + Math.random() * 7800);
    };

    // The last letter landing throws a flash of the sign's light across the room.
    const hitRoom = () => {
      flash?.animate([{ opacity: 0 }, { opacity: 1, offset: 0.05 }, { opacity: 0 }], { duration: 1150, easing: "cubic-bezier(.25, .6, .3, 1)" });
    };

    const begin = () => {
      if (disposed || frame) return;
      window.clearTimeout(gateTimer);
      window.clearTimeout(videoTimer);
      // Never leave the page without its navigation, whatever happens to the intro.
      if (introRef.current) uiTimer = window.setTimeout(revealUi, INTRO_UI_SAFETY_MS);
      frame = window.requestAnimationFrame(() => {
        clock.start = performance.now();
        setTubes(plan);
        litTimer = window.setTimeout(() => {
          clock.lit = performance.now();
          setLit(true);
          scheduleFault();
          if (clock.intro) {
            flashTimer = window.setTimeout(() => {
              hitRoom();
              revealUi();
            }, neonDollyArrival() * 1000);
          }
        }, litAt * 1000 + NEON_LIT_DELAY_MS);
      });
    };

    // The room is lit by the sign itself. It starts black; as tubes catch, light reaches out from them: the dark
    // over the video lifts most where the light is (a pool of visibility with darkness beyond its reach), a blue
    // neon spill tints the room, both flicker exactly with the tubes and lean toward whichever letters are lit,
    // and the light travels down with the sign as it settles. Once it arrives it opens up to the whole room.
    // Only opacity and transforms change, so the layers composite without repainting.
    const dark = room?.querySelector<HTMLElement>(".hero-room-dark") ?? null;
    const reach = room?.querySelector<HTMLElement>(".hero-room-reach") ?? null;
    const spill = room?.querySelector<HTMLElement>(".hero-room-spill") ?? null;
    const levels = new Float32Array(NEON_LETTERS.length);
    // The hero's size, measured when it resizes: read inside the light loops, straight after the room's style
    // writes, it would force a style recalc every frame.
    let heroSize = { w: section?.clientWidth ?? 0, h: section?.clientHeight ?? 0 };
    const sizeObserver = section ? new ResizeObserver(() => { heroSize = { w: section.clientWidth, h: section.clientHeight }; }) : null;
    if (section) sizeObserver?.observe(section);
    // The intro's light pool: most of the room, falling off toward its edges.
    // Tight enough that the room beyond it keeps its own (often red) light, so the blue reads as the sign's light.
    const introReach = () => ({ x: heroSize.w * 0.62, y: heroSize.h * 0.32 });
    let letterX: number[] = [];
    let restX = 0;
    let restY = 0;
    let fontPx = 100;
    let heroLight: import("./_hero/hero-light").HeroLight | null = null;
    let light = 0;
    let lastAt = 0;
    const lightRoom = (now: number) => {
      if (disposed || !room || !dark || !reach || !spill) return;
      const dt = lastAt ? Math.min(0.1, (now - lastAt) / 1000) : 0;
      lastAt = now;
      let target = 0;
      let lean = 0;
      const { offset: drop, offsetX: slide, scale } = neonDolly(clock, now);
      if (clock.start !== null) {
        readNeonLevels(clock, now, levels);
        let sum = 0;
        let weighted = 0;
        levels.forEach((level, i) => {
          sum += level;
          weighted += level * (letterX[i] ?? 0) * scale;
        });
        target = sum / levels.length;
        lean = sum > 0.01 ? weighted / sum : 0;
      }
      // Light is near-instant: just enough easing that a flicker reads as a flicker, not a strobe.
      light += (target - light) * (1 - Math.exp(-(target > light ? 34 : 18) * dt));
      const open = clock.lit === null ? 0 : Math.min(1, (now - clock.lit) / 1000 / neonDollyEnd());
      const opened = open * open * (3 - 2 * open);
      const x = restX + slide + lean;
      const y = restY + drop;
      dark.style.opacity = ((INTRO_ROOM_DARK - INTRO_TUBE_LIGHT * light) * (1 - opened)).toFixed(3);
      reach.style.opacity = (1 - opened).toFixed(3);
      reach.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(0.22 + 0.8 * light + 2.4 * opened).toFixed(3)})`;
      spill.style.opacity = (0.7 * light * (1 - 0.75 * opened)).toFixed(3);
      spill.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      // God rays and depth light (app/_hero/hero-light.ts), each on its own switch so they can be compared.
      if (heroLight) {
        const toggles = ambienceToggles();
        heroLight.render({
          light,
          fade: 1 - opened * (1 - (phoneLight ? HERO_REST_LIGHT : HERO_REST_LIGHT_DESKTOP)),
          centre: { x, y },
          letters: letterX.map((offset, i) => ({ x: restX + slide + offset * scale, level: levels[i] ?? 0 })),
          fontPx: fontPx * scale,
          rays: toggles.rays,
          depth: toggles.depthlight,
          // Even at its peak the light falls off toward the edges of the room, so it reads as light from the sign
          // rather than an even blue wash.
          focus: INTRO_LIGHT_FOCUS,
          reach: introReach(),
        });
      }
      if (clock.lit !== null && now > clock.lit + neonDollyEnd() * 1000 + 250) {
        room.style.opacity = "0";
        startRest();
        return;
      }
      roomFrame = window.requestAnimationFrame(lightRoom);
    };

    // Where the word rests in the room and where each letter sits across it (relative to the word's centre), for
    // the room light; then the god rays / depth light layer, which loads alongside the 3D sign.
    const setUpLight = (mark: HTMLElement, word: { x: number; y: number }) => {
      if (!section) return;
      const frame = section.getBoundingClientRect();
      restX = word.x - frame.left;
      restY = word.y - frame.top;
      section.style.setProperty("--intro-rest-x", `${Math.round(restX)}px`);
      section.style.setProperty("--intro-rest-y", `${Math.round(restY)}px`);
      letterX = Array.from(mark.querySelectorAll<HTMLElement>(".neon-tube"), (tube) => {
        const r = tube.getBoundingClientRect();
        return r.left + r.width / 2 - word.x;
      });
      fontPx = parseFloat(getComputedStyle(mark).fontSize) || fontPx;
      if (!ambienceToggles().rays && !ambienceToggles().depthlight) return;
      void import("./_hero/hero-light").then(({ HeroLight }) => {
        if (disposed) return;
        heroLight = HeroLight.create(section, () => section.querySelector<HTMLVideoElement>(".hero-video"));
        if (!heroLight) return;
        if (new URLSearchParams(window.location.search).has("neon-debug")) Object.assign(window, { __dosenHeroLight: heroLight });
        section.querySelector(".hero-room")?.after(heroLight.canvas);
        if (!wantsIntro) startRest();
      }).catch(() => undefined);
    };

    // After the intro (or on a phone page that skipped it), the rays and depth light stay on at a resting level,
    // following the tubes' hum and flickers and the live footage. Only while the hero is on screen and the tab is
    // visible, and at most at the footage's own 30 fps.
    let restFrame = 0;
    let restDrawn = 0;
    let restSince = 0;
    let restSeen = true;
    let restObserver: IntersectionObserver | null = null;
    const restLight = (now: number) => {
      restFrame = 0;
      if (disposed || !heroLight || !section) return;
      restFrame = window.requestAnimationFrame(restLight);
      if (now - restDrawn < 32) return;
      restDrawn = now;
      readNeonLevels(clock, now, levels);
      const toggles = ambienceToggles();
      const shift = sceneRef.current?.lightShift() ?? { x: 0, y: 0 };
      const middle = restX + shift.x;
      const across = letterX.length ? letterX.reduce((sum, x) => sum + x, 0) / letterX.length : 0;
      // A few seconds after the sign settles, the rays ease down and both effects gather into a pool around the
      // sign, so the room behind stops competing with it.
      if (!restSince) restSince = now;
      const t = Math.min(1, Math.max(0, ((now - restSince) / 1000 - RAYS_CALM_AFTER) / RAYS_CALM_OVER));
      const calm = t * t * (3 - 2 * t);
      const wide = introReach();
      heroLight.render({
        light: levels.reduce((sum, level) => sum + level, 0) / levels.length,
        fade: phoneLight ? HERO_REST_LIGHT : HERO_REST_LIGHT_DESKTOP,
        rayGain: 1 - (1 - RAYS_CALM_TO) * calm,
        // From the intro's wide pool to a tight one around the sign.
        focus: INTRO_LIGHT_FOCUS + (1 - INTRO_LIGHT_FOCUS) * calm,
        reach: {
          x: wide.x + (fontPx * 4.7 * 0.72 - wide.x) * calm,
          y: wide.y + (fontPx * 2.3 - wide.y) * calm,
        },
        centre: { x: middle + across, y: restY + shift.y },
        letters: letterX.map((offset, i) => ({ x: middle + offset, level: levels[i] ?? 0 })),
        fontPx,
        rays: toggles.rays,
        depth: toggles.depthlight,
      });
    };
    const syncRest = () => {
      const run = restSeen && document.visibilityState === "visible";
      if (run && !restFrame) restFrame = window.requestAnimationFrame(restLight);
      else if (!run && restFrame) {
        window.cancelAnimationFrame(restFrame);
        restFrame = 0;
      }
    };
    function startRest() {
      if (!heroLight || !section || restObserver) return;
      restObserver = new IntersectionObserver(([entry]) => {
        restSeen = entry.isIntersecting;
        syncRest();
      });
      restObserver.observe(section);
      document.addEventListener("visibilitychange", syncRest);
      syncRest();
    }

    // The word's width and centre. The width comes from the font size (Ethnocentric's DOSEN advances 4.72em plus
    // its tracking; 4.57em on phones), not from the rendered text, which may still be in a fallback font this
    // early. The heading's box depends only on its size, so it can be measured before the font arrives.
    const measureWord = (mark: HTMLElement) => {
      const box = mark.getBoundingClientRect();
      const style = getComputedStyle(mark);
      const size = parseFloat(style.fontSize) || box.height;
      const tracking = (parseFloat(style.letterSpacing) || 0) / size;
      const width = size * (4.72 + 5 * tracking);
      return { width, x: box.left + width / 2, y: box.top + box.height / 2 };
    };

    if (wantsIntro && markRef.current) {
      const word = measureWord(markRef.current);
      // It starts centred on screen and as large as fits: on phones the word already spans the margins at rest,
      // so it keeps ~14px clear each side (the 3D sign's deep returns add a little width at the edges); on wider
      // screens it starts a little larger, within 86% of the width.
      const fit = phoneLight ? (window.innerWidth - 28) / word.width : (window.innerWidth * 0.86) / word.width;
      const scale = Math.min(phoneLight ? 1.2 : 1.15, Math.max(1, fit));
      const next = {
        dx: Math.round(window.innerWidth / 2 - word.x),
        dy: Math.round(window.innerHeight / 2 - word.y),
        scale: Math.round(scale * 1000) / 1000,
      };
      // The 3D sign reads the same offsets and timing from the shared clock.
      clock.intro = next;
      setIntro(next);
      setUpLight(markRef.current, word);
      // The power-on opens on darkness, so it can wait: for the wordmark's font and the 3D sign (up to
      // INTRO_GATE_MS), and for the hero video to be ready to play on (up to INTRO_VIDEO_WAIT_MS).
      const assets = Promise.race([
        Promise.all([document.fonts.load('400 100px "Ethnocentric"').catch(() => undefined), signReady.promise]),
        new Promise((resolve) => window.setTimeout(resolve, INTRO_GATE_MS)),
      ]);
      const footage = new Promise<void>((resolve) => {
        // The video element may not have its source yet (the page picks phone or desktop footage after mount) and
        // can be swapped, so it's looked up afresh each time.
        const check = () => {
          const video = section?.querySelector<HTMLVideoElement>(".hero-video");
          if (disposed || (video?.getAttribute("src") && videoCanPlayOn(video))) return resolve();
          videoTimer = window.setTimeout(check, 100);
        };
        check();
      });
      gateTimer = window.setTimeout(begin, INTRO_VIDEO_WAIT_MS);
      void Promise.all([assets, footage]).then(begin);
      // The room layers stay on for the whole intro (the pre-paint class only covers the first frames).
      if (room) room.style.opacity = "1";
      roomFrame = window.requestAnimationFrame(lightRoom);
    } else {
      begin();
      // Desktop, and phones that skipped the intro (loaded part-way down, or from a link), get the resting light.
      if (markRef.current) setUpLight(markRef.current, measureWord(markRef.current));
    }

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(roomFrame);
      window.cancelAnimationFrame(restFrame);
      restObserver?.disconnect();
      sizeObserver?.disconnect();
      document.removeEventListener("visibilitychange", syncRest);
      heroLight?.dispose();
      window.clearTimeout(gateTimer);
      window.clearTimeout(flashTimer);
      window.clearTimeout(litTimer);
      window.clearTimeout(faultTimer);
      window.clearTimeout(resetTimer);
      window.clearTimeout(uiTimer);
      window.clearTimeout(videoTimer);
      root.classList.remove("intro-ui-hidden");
    };
  }, [signReady]);

  // The wordmark is released from its hidden first paint in the same frame its ignition is committed.
  useLayoutEffect(() => {
    if (tubes && introRef.current) document.documentElement.classList.remove("intro-pending");
  }, [tubes]);

  // Pin the shared clock to the moment the browser actually started the CSS ignition.
  useEffect(() => {
    const tube = markRef.current?.querySelector(".neon-tube");
    const animation = tube?.getAnimations().find((item) => item instanceof CSSAnimation);
    if (!tubes || !animation) return;
    let current = true;
    animation.ready
      .then(() => {
        if (current && typeof animation.startTime === "number") clockRef.current.start = animation.startTime;
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [tubes]);

  // The 3D sign loads off the critical path and never blocks the CSS version.
  useEffect(() => {
    const mark = markRef.current;
    const text = mark?.querySelector<HTMLElement>(".neon-mark-text");
    const section = mark?.closest<HTMLElement>(".hero");
    if (!mark || !text || !section || typeof WebGL2RenderingContext === "undefined") {
      signReady.resolve();
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.className = "neon-canvas";
    canvas.setAttribute("aria-hidden", "true");
    section.append(canvas);
    let disposed = false;
    let scene: NeonSignScene | null = null;
    let unmountPanel: (() => void) | null = null;

    // Which video-ambience effects run: defaults, then saved panel choices, then `?ambience=`.
    const params = new URLSearchParams(window.location.search);
    const ambience = ambienceToggles();

    // Records why the 3D sign handed back to the CSS tubes; `?neon-debug` also shows it on screen, since a phone
    // has no console to hand.
    const fallBack = (reason: string) => {
      scene?.dispose();
      scene = null;
      sceneRef.current = null;
      canvas.remove();
      signReady.resolve();
      if (disposed) return;
      setSign("css");
      mark.dataset.signFallback = reason;
      console.info(`DOSEN sign: using the CSS fallback (${reason})`);
      if (params.has("neon-debug")) {
        const note = document.createElement("p");
        note.textContent = `3D sign fell back: ${reason}`;
        note.style.cssText = "position:fixed;z-index:300;left:12px;bottom:96px;margin:0;padding:8px 10px;border-radius:8px;background:#200;color:#fbb;font:600 11px/1.3 ui-monospace,monospace";
        document.body.append(note);
      }
    };

    const load = () => {
      if (disposed) return;
      import("./_hero/neon-sign-scene")
        .then(({ NeonSignScene }) =>
          NeonSignScene.create({
            canvas,
            section,
            text,
            clock: clockRef.current,
            video: () => section.querySelector<HTMLVideoElement>(".hero-video"),
            ambience,
            reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
            onReady: () => {
              if (disposed) return;
              canvas.classList.add("is-ready");
              setSign("3d");
              signReady.resolve();
            },
            onLost: (reason) => fallBack(reason),
          }),
        )
        .then((created) => {
          if (disposed) return created.dispose();
          scene = created;
          sceneRef.current = created;
          if (params.has("neon-debug")) Object.assign(window, { __dosenNeonSign: created, __dosenAmbience: ambience });
          if (params.has("ambience-panel") || params.has("neon-debug")) {
            import("./_hero/neon-ambience").then(({ mountAmbiencePanel }) => {
              if (!disposed) unmountPanel = mountAmbiencePanel(ambience, () => scene?.readAmbience() ?? null);
            });
          }
        })
        .catch((error: unknown) => fallBack(error instanceof Error ? error.message : "failed to start"));
    };

    const viaIdle = typeof window.requestIdleCallback === "function";
    let idle = 0;
    const queue = () => {
      if (disposed || idle) return;
      idle = viaIdle ? window.requestIdleCallback(load, { timeout: 900 }) : window.setTimeout(load, 250);
    };
    // On phones the 3D sign plays the intro itself (centred start and letter drop, from the shared clock), so it
    // loads straight away rather than at idle; the CSS tubes cover the first flickers until it's ready.
    if (introRef.current) void load();
    else queue();

    return () => {
      disposed = true;
      if (idle && viaIdle) window.cancelIdleCallback(idle);
      else if (idle) window.clearTimeout(idle);
      unmountPanel?.();
      scene?.dispose();
      canvas.remove();
    };
  }, [signReady]);

  const litAt = tubes ? neonLitAt(tubes) : 0;
  const phase = lit ? " is-lit" : tubes ? " is-powering" : "";

  return (
    <h1
      ref={markRef}
      className={`hero-mark neon-mark${phase}${intro ? " is-intro" : ""}`}
      data-sign={sign}
      style={tubes ? ({ "--neon-lit-at": `${litAt.toFixed(2)}s`, ...(intro ? { "--intro-dx": `${intro.dx}px`, "--intro-dy": `${intro.dy}px`, "--intro-scale": intro.scale } : {}) } as CSSProperties) : undefined}
    >
      <span className="neon-mark-text">DOSEN</span>
      <span className="neon-tubes" aria-hidden="true">
        {NEON_LETTERS.map((letter, index) => {
          const tube = tubes?.[index];
          return (
            <span
              className={`neon-tube${fault?.index === index ? ` is-${fault.kind}` : ""}`}
              data-ignition={tube?.ignition}
              style={tube ? ({ "--neon-delay": `${tube.delay.toFixed(2)}s`, "--neon-duration": `${tube.duration.toFixed(2)}s` } as CSSProperties) : undefined}
              key={letter}
            >
              {letter}
            </span>
          );
        })}
      </span>
    </h1>
  );
}

export default function Home() {
  useEdgeGlow();
  const marqueeRef = useRef<HTMLDivElement>(null);

  // The genre ticker reads the hero video too; it loads after the page is idle and only runs on screen.
  useEffect(() => {
    const marquee = marqueeRef.current;
    if (!marquee) return;
    const stops: (() => void)[] = [];
    let cancelled = false;
    const load = () => {
      import("./ticker-ambience").then(({ startTickerAmbience }) => {
        if (!cancelled) stops.push(startTickerAmbience(marquee));
      });
      import("./video-ambilight").then(({ startVideoAmbilight }) => {
        if (!cancelled) stops.push(startVideoAmbilight());
      });
      import("./poster-light").then(({ startPosterLight }) => {
        if (!cancelled) stops.push(startPosterLight());
      });
      import("./surface-light").then(({ startSurfaceLight }) => {
        if (!cancelled) stops.push(startSurfaceLight());
      });
    };
    const viaIdle = typeof window.requestIdleCallback === "function";
    const idle = viaIdle ? window.requestIdleCallback(load, { timeout: 1500 }) : window.setTimeout(load, 400);
    return () => {
      cancelled = true;
      if (viaIdle) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
      stops.forEach((stop) => stop());
    };
  }, []);

  // Ticker ignition: its tubes wait dark, then power on the first time the ticker comes into view once the
  // sign is lit, as if the two share a circuit. Switched off or under reduced motion, it simply stays lit.
  useEffect(() => {
    const marquee = marqueeRef.current;
    const mark = document.querySelector(".neon-mark");
    if (!marquee) return;
    let woke = false;
    let timer = 0;
    const wake = (animate: boolean) => {
      if (woke) return;
      woke = true;
      marquee.classList.remove("is-dormant", "is-waiting");
      if (!animate) return;
      marquee.classList.add("is-igniting");
      timer = window.setTimeout(() => marquee.classList.remove("is-igniting"), 1100);
    };
    if (!ambienceToggles().circuit || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !mark) {
      wake(false);
      return;
    }
    marquee.classList.add("is-waiting");
    let lit = mark.classList.contains("is-lit");
    let seen = false;
    const tryWake = () => {
      if (lit && seen) timer = window.setTimeout(() => wake(true), 180);
    };
    const watch = new MutationObserver(() => {
      if (!mark.classList.contains("is-lit")) return;
      lit = true;
      watch.disconnect();
      tryWake();
    });
    watch.observe(mark, { attributes: true, attributeFilter: ["class"] });
    const view = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      seen = true;
      view.disconnect();
      tryWake();
    }, { threshold: 0.6 });
    view.observe(marquee);
    // Never strand it dark if the sign never reports in.
    const safety = window.setTimeout(() => {
      lit = true;
      tryWake();
    }, 7000);
    return () => {
      watch.disconnect();
      view.disconnect();
      window.clearTimeout(timer);
      window.clearTimeout(safety);
    };
  }, []);

  // Bookend: the Book section's DOSEN watermark powers on once when you reach it.
  useEffect(() => {
    const contact = document.getElementById("contact");
    if (!contact) return;
    const view = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      contact.classList.add("is-bookend-lit");
      view.disconnect();
    }, { threshold: 0.35 });
    view.observe(contact);
    return () => view.disconnect();
  }, []);
  const [transmitting, setTransmitting] = useState(false);
  const [activeSetSlug, setActiveSetSlug] = useState(DEFAULT_FEATURED_SET_SLUG);
  const [playerStatus, setPlayerStatus] = useState<"ready" | "loading" | "error">("ready");
  // Unknown until the first effect reads the screen: the hero video gets no source until then, so phones never
  // start loading (and briefly showing) the desktop video before switching to theirs.
  const [mobileHero, setMobileHero] = useState<boolean | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [archiveLibraryOpen, setArchiveLibraryOpen] = useState(false);
  const [selectedSetSlug, setSelectedSetSlug] = useState<string | null>(null);
  const [dossierScrollCueVisible, setDossierScrollCueVisible] = useState(false);
  const [mobileLayout, setMobileLayout] = useState(false);
  const [mobileIndexOpen, setMobileIndexOpen] = useState(false);
  const [activeMobileChapter, setActiveMobileChapter] = useState<MobileChapterId>("signal");
  const [mobileDockPhase, setMobileDockPhase] = useState<MobileDockPhase>("expanded");
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
  const mobileIndexRef = useRef<HTMLDivElement>(null);
  const mobileIndexButtonRef = useRef<HTMLButtonElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const dockMorphSurfaceRef = useRef<HTMLDivElement>(null);
  const dockCoverRef = useRef<HTMLImageElement>(null);
  const dockScrollFrameRef = useRef<number | null>(null);
  const mobileDockPhaseRef = useRef<MobileDockPhase>("expanded");
  const activeSet = playableSets.find((item) => item.slug === activeSetSlug) ?? playableSets[0];
  const activeSegments = getSetSegments(activeSet);
  const duration = getAudioDuration(activeSegments);
  const selectedSet = transmissions.find((item) => item.slug === selectedSetSlug) ?? null;
  const selectedPlayableSet = playableSets.find((item) => item.slug === selectedSetSlug) ?? null;
  const selectedLibraryEvent = selectedSet ? getLibraryEvent(selectedSet) : null;
  const selectedHighlightClips = selectedLibraryEvent?.clips.slice(0, 3) ?? [];
  const activeMobileChapterNumber = MOBILE_CHAPTERS.find((chapter) => chapter.id === activeMobileChapter)?.number ?? "01";
  const mobileDockCompact = mobileDockPhase === "collapsing" || mobileDockPhase === "compact";
  const mobileDockMorphing = mobileDockPhase === "collapsing" || mobileDockPhase === "expanding";
  const playerStateLabel = playerStatus === "error"
    ? "AUDIO ERROR"
    : playerStatus === "loading"
      ? "LOADING"
      : transmitting
        ? "PLAYING"
        : "READY";

  useEffect(() => {
    mobileDockPhaseRef.current = mobileDockPhase;
  }, [mobileDockPhase]);

  const requestMobileDockCompact = useCallback((compact: boolean) => {
    setMobileDockPhase((current) => {
      const currentlyTargetsCompact = current === "collapsing" || current === "compact";
      if (compact === currentlyTargetsCompact) return current;
      return compact ? "collapsing" : "expanding";
    });
  }, []);

  const handleDockMorphEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== dockMorphSurfaceRef.current || event.propertyName !== "transform") return;
    setMobileDockPhase((current) => {
      if (current === "collapsing") return "compact";
      if (current === "expanding") return "expanded";
      return current;
    });
  };

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 700px) and (orientation: portrait)");
    const mobileLayoutQuery = window.matchMedia("(max-width: 620px)");
    const updateHeroSource = () => {
      setMobileHero(mobileQuery.matches);
    };
    const updateMobileLayout = () => {
      setMobileLayout(mobileLayoutQuery.matches);
      if (!mobileLayoutQuery.matches) {
        setMobileIndexOpen(false);
        setMobileDockPhase("expanded");
      }
    };

    updateHeroSource();
    updateMobileLayout();
    mobileQuery.addEventListener("change", updateHeroSource);
    mobileLayoutQuery.addEventListener("change", updateMobileLayout);
    return () => {
      mobileQuery.removeEventListener("change", updateHeroSource);
      mobileLayoutQuery.removeEventListener("change", updateMobileLayout);
    };
  }, []);

  useEffect(() => {
    if (!mobileLayout) return;
    const dock = dockRef.current;
    if (!dock) return;

    const updateDockScale = () => {
      const expandedWidth = dock.getBoundingClientRect().width;
      if (expandedWidth <= 0) return;
      const compactWidth = Math.min(window.innerWidth * 0.46, 190);
      dock.style.setProperty("--dock-compact-scale-x", String(compactWidth / expandedWidth));
    };

    updateDockScale();
    const resizeObserver = new ResizeObserver(updateDockScale);
    resizeObserver.observe(dock);
    window.addEventListener("resize", updateDockScale, { passive: true });
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateDockScale);
    };
  }, [mobileLayout]);

  useEffect(() => {
    const cover = dockCoverRef.current;
    if (!cover) return;
    void cover.decode().catch(() => undefined);
  }, [activeSetSlug]);

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
    if (!mobileLayout) return;

    const targets = MOBILE_CHAPTERS
      .map((chapter) => document.getElementById(chapter.id))
      .filter((target): target is HTMLElement => Boolean(target));

    const observer = new IntersectionObserver(
      (entries) => {
        const activeEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (!activeEntry) return;
        setActiveMobileChapter(activeEntry.target.id as MobileChapterId);
      },
      { rootMargin: "-18% 0px -70% 0px", threshold: 0 },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [mobileLayout]);

  useEffect(() => {
    if (!mobileLayout) return;

    const elements = Array.from(document.querySelectorAll<HTMLElement>(".mobile-reveal"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      elements.forEach((element) => element.classList.add("is-revealed"));
      return () => elements.forEach((element) => element.classList.remove("is-revealed"));
    }

    elements.forEach((element) => element.classList.add("is-mobile-reveal-pending"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          entry.target.classList.remove("is-mobile-reveal-pending");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.04 },
    );

    elements.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      elements.forEach((element) => {
        element.classList.remove("is-mobile-reveal-pending");
        element.classList.remove("is-revealed");
      });
    };
  }, [mobileLayout]);

  useEffect(() => {
    if (!mobileLayout) return;

    let lastScrollY = window.scrollY;
    let downwardTravel = 0;
    let upwardTravel = 0;

    const updateDock = () => {
      dockScrollFrameRef.current = null;
      const nextScrollY = window.scrollY;
      const delta = nextScrollY - lastScrollY;
      lastScrollY = nextScrollY;

      if (nextScrollY <= 120) {
        downwardTravel = 0;
        upwardTravel = 0;
        requestMobileDockCompact(false);
        return;
      }

      if (dockRef.current?.contains(document.activeElement)) return;

      if (delta > 0) {
        downwardTravel += delta;
        upwardTravel = 0;
        if (downwardTravel >= 64) {
          requestMobileDockCompact(true);
          downwardTravel = 0;
        }
      } else if (delta < 0) {
        upwardTravel += Math.abs(delta);
        downwardTravel = 0;
        if (upwardTravel >= 32) {
          requestMobileDockCompact(false);
          upwardTravel = 0;
        }
      }
    };

    const handleScroll = () => {
      if (dockScrollFrameRef.current !== null) return;
      dockScrollFrameRef.current = window.requestAnimationFrame(updateDock);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (dockScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dockScrollFrameRef.current);
        dockScrollFrameRef.current = null;
      }
    };
  }, [mobileLayout, requestMobileDockCompact]);

  useEffect(() => {
    if (!mobileLayout) return;
    const frame = window.requestAnimationFrame(() => requestMobileDockCompact(false));
    return () => window.cancelAnimationFrame(frame);
  }, [activeSetSlug, mobileLayout, requestMobileDockCompact, transmitting]);

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
    if (!libraryOpen && !archiveLibraryOpen && !selectedSetSlug && !mobileIndexOpen) return;

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
      if (mobileIndexOpen) {
        setMobileIndexOpen(false);
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
  }, [archiveLibraryOpen, eventVisualOpen, libraryOpen, mobileIndexOpen, selectedSetSlug]);

  useEffect(() => {
    if (!mobileIndexOpen) return;

    const panel = mobileIndexRef.current;
    const trigger = mobileIndexButtonRef.current;
    if (!panel) return;

    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])"),
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const frame = window.requestAnimationFrame(() => first?.focus());

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || focusable.length === 0) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    panel.addEventListener("keydown", trapFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      panel.removeEventListener("keydown", trapFocus);
      trigger?.focus();
    };
  }, [mobileIndexOpen]);

  useEffect(() => {
    const dossier = dossierRef.current;
    if (!selectedSetSlug || !dossier || selectedHighlightClips.length === 0) {
      setDossierScrollCueVisible(false);
      return;
    }

    let frame: number | null = null;
    const updateCue = () => setDossierScrollCueVisible(dossier.scrollTop < 120);
    const handleScroll = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updateCue();
      });
    };
    updateCue();
    dossier.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      dossier.removeEventListener("scroll", handleScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [selectedHighlightClips.length, selectedSetSlug]);

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

  function handleDossierClipPlay(activeVideo: HTMLVideoElement) {
    audioRef.current?.pause();
    dossierRef.current?.querySelectorAll("video").forEach((video) => {
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
    <main className={`site-shell ${libraryOpen ? "library-is-open" : ""} ${archiveLibraryOpen ? "archive-library-is-open" : ""} ${selectedSet ? "dossier-is-open" : ""} ${mobileIndexOpen ? "mobile-index-is-open" : ""}`}>
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
        <div className="mobile-header-actions">
          <button
            className="mobile-index-trigger mono"
            type="button"
            aria-expanded={mobileIndexOpen}
            aria-controls="mobile-index"
            ref={mobileIndexButtonRef}
            onClick={() => setMobileIndexOpen(true)}
          >
            INDEX <span>/ {activeMobileChapterNumber}</span>
          </button>
          <a className="nav-cta mono" href="#contact">BOOK</a>
        </div>
      </header>

      {mobileIndexOpen && (
        <div
          className="mobile-index"
          id="mobile-index"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-index-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setMobileIndexOpen(false);
          }}
        >
          <div className="mobile-index-panel" ref={mobileIndexRef}>
            <header>
              <div>
                <p className="mono">DOSEN / MOBILE INDEX</p>
                <h2 id="mobile-index-title">Choose a chapter.</h2>
              </div>
              <button className="mono" type="button" onClick={() => setMobileIndexOpen(false)}>
                CLOSE <span aria-hidden="true">×</span>
              </button>
            </header>
            <nav aria-label="Mobile chapter index">
              {MOBILE_CHAPTERS.map((chapter) => (
                <a
                  className={activeMobileChapter === chapter.id ? "is-active" : ""}
                  href={`#${chapter.id}`}
                  onClick={() => setMobileIndexOpen(false)}
                  key={chapter.id}
                >
                  <span className="mono">{chapter.number}</span>
                  <strong>{chapter.label}</strong>
                </a>
              ))}
            </nav>
          </div>
        </div>
      )}

      <section className="hero" id="top" ref={heroSectionRef}>
        <div className="hero-film">
          <video
            ref={heroVideoRef}
            key={mobileHero ? "mobile-hero" : "desktop-hero"}
            className="hero-video"
            src={mobileHero === null ? undefined : corsMediaUrl(mobileHero ? "/media/hero/hero-mobile-v3.mp4" : "/media/hero/hero-desktop-v1.mp4")}
            crossOrigin="anonymous"
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
        {/* Phone intro: the dark the sign lights up, and the flash of its landing (see NeonWordmark). */}
        <div className="hero-room" aria-hidden="true">
          <i className="hero-room-dark" />
          <i className="hero-room-reach" />
          <i className="hero-room-spill" />
        </div>
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-flash" aria-hidden="true" />

        <div className="hero-copy">
          <NeonWordmark />
          <div className="hero-bottom">
            <p className="hero-tag mono">DJ · Electronic press kit</p>
            <div className="hero-actions">
              <button
                className="hero-action"
                type="button"
                aria-haspopup="dialog"
                aria-expanded={libraryOpen}
                aria-label="Open video library"
                onClick={() => openLibrary()}
              >
                Library
              </button>
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
                  <img src={mediaUrl(getEventArtwork(item))} alt="" loading="lazy" decoding="async" />
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
              <p className="mono">SET DETAILS / {selectedSet.id}</p>
            </div>
            <button type="button" onClick={closeSetDossier} aria-label="Close set dossier">
              CLOSE <span aria-hidden="true">×</span>
            </button>
          </header>

          <div className="set-dossier-primary">
            <div className="set-dossier-primary-heading">
              <p className="eyebrow">SELECTED SET / {selectedSet.date}</p>
              <h2 id="set-dossier-title">{selectedSet.title}</h2>
              <p>{selectedSet.detail}</p>
            </div>

            <dl className="set-dossier-facts mono">
              <div className="fact-role"><dt>ROLE</dt><dd>{selectedSet.role}</dd></div>
              <div className="fact-date"><dt>DATE</dt><dd>{selectedSet.date}</dd></div>
              <div className="fact-lineup"><dt>LINEUP</dt><dd>{selectedSet.lineup}</dd></div>
              <div className="fact-location"><dt>LOCATION</dt><dd>{selectedSet.venue}</dd></div>
              <div className="fact-runtime"><dt>RUN TIME</dt><dd>{selectedSet.duration}</dd></div>
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

          {selectedHighlightClips.length > 0 && (
            <div
              className={`set-dossier-scroll-cue mono ${dossierScrollCueVisible ? "is-visible" : ""}`}
              aria-hidden="true"
            >
              <span>SCROLL FOR MORE</span>
              <span aria-hidden="true">↓</span>
            </div>
          )}

          {selectedHighlightClips.length > 0 && selectedLibraryEvent && (
            <section className="set-dossier-highlights" aria-labelledby="set-dossier-highlights-title">
              <div className="set-dossier-highlights-heading">
                <div>
                  <p className="eyebrow">FEATURED CLIPS / {selectedHighlightClips.length} OF {selectedLibraryEvent.clips.length}</p>
                  <h3 id="set-dossier-highlights-title">Inside the room.</h3>
                </div>
                <button className="mono" type="button" onClick={() => openSetMedia(selectedLibraryEvent.id)}>
                  VIEW ALL {selectedLibraryEvent.clips.length} EVENT VIDEOS <span aria-hidden="true">↗</span>
                </button>
              </div>

              <div className="set-dossier-highlights-grid">
                {selectedHighlightClips.map((clip, index) => (
                  <article className={`set-dossier-highlight is-${clip.orientation}`} key={clip.src}>
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      crossOrigin="anonymous"
                      poster={mediaUrl(clip.poster)}
                      aria-label={`${selectedSet.title} highlight clip ${index + 1}`}
                      onPlay={(event) => handleDossierClipPlay(event.currentTarget)}
                    >
                      <source src={corsMediaUrl(clip.src)} type="video/mp4" />
                    </video>
                    <p className="mono">HIGHLIGHT {String(index + 1).padStart(2, "0")} / {clip.title}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

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
                  decoding="async"
                />
                <figcaption className="mono">OFFICIAL EVENT POSTER / ARCHIVE VISUAL</figcaption>
              </figure>
            </div>
          )}
        </div>
      )}

      <div className="marquee is-dormant" aria-label="DOSEN sound description" ref={marqueeRef}>
        <canvas className="marquee-reflection" aria-hidden="true" />
        <div className="marquee-track">
          <div className="marquee-group">
            <span>TECH HOUSE</span><i>◆</i><span>TRANCE</span><i>◆</i><span>BASS</span><i>◆</i>
            <span>TECHNO</span><i>◆</i><span>HOUSE</span><i>◆</i><span>DUBSTEP</span><i>◆</i>
          </div>
          <div className="marquee-group" aria-hidden="true">
            <span>TECH HOUSE</span><i>◆</i><span>TRANCE</span><i>◆</i><span>BASS</span><i>◆</i>
            <span>TECHNO</span><i>◆</i><span>HOUSE</span><i>◆</i><span>DUBSTEP</span><i>◆</i>
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
          onTimeUpdate={(event) => {
            const dockPhase = mobileDockPhaseRef.current;
            if (dockPhase === "collapsing" || dockPhase === "expanding") return;
            setCurrentTime((activeSegments[segmentIndex]?.offset ?? 0) + event.currentTarget.currentTime);
          }}
        />

        <MobileChapterMarker number="01" label="LISTEN" />

        <div className="signal-feature-grid mobile-reveal">
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
                  <img src={mediaUrl(activeSet.artwork.vinylCover)} alt="" loading="lazy" decoding="async" />
                  <span className="vinyl-spindle" />
                </div>
              </div>
            </div>

            <div className="vinyl-sleeve">
              <div className="vinyl-sleeve-art">
                <img src={mediaUrl(activeSet.artwork.vinylCover)} alt={`${activeSet.title} official set artwork`} loading="lazy" decoding="async" />
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

        <div className="set-selector mobile-reveal" aria-labelledby="set-selector-title">
          <div className="set-selector-heading mono">
            <span id="set-selector-title">SELECT A SET</span>
          </div>
          <div className="set-selector-track" role="group" aria-label="Playable DOSEN sets">
            {playableSets.map((set) => {
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
                    <img src={mediaUrl(set.artwork.vinylCover)} alt="" loading="lazy" decoding="async" />
                    {isActive && <span className="set-selector-active mono">ON AIR</span>}
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
        <MobileChapterMarker number="02" label="SELECTED SETS" />

        <div className="section-heading mobile-reveal">
          <div>
            <p className="eyebrow">SELECTED PERFORMANCES / 2025—2026</p>
            <h2>Selected sets</h2>
          </div>
          <button className="archive-library-button mono" type="button" onClick={openArchiveLibrary}>
            LIBRARY <span aria-hidden="true">↗</span>
          </button>
        </div>

        <div className="archive-grid mobile-reveal">
          {transmissions.map((item, index) => (
            <article className={`archive-card tone-${item.tone}`} key={item.id}>
              <button
                className="archive-card-trigger"
                type="button"
                aria-haspopup="dialog"
                onClick={() => openSetDossier(item.slug)}
              >
                <div className="archive-media media-slot" data-media-slot={item.slot}>
                  <img className="archive-poster" src={mediaUrl(getEventArtwork(item))} alt="" loading="lazy" decoding="async" />
                  <span className="archive-index mono">{String(index + 1).padStart(2, "0")}</span>
                  <span className="placeholder-label mono">VIEW MORE / {item.id}</span>
                </div>
                <div className="archive-meta mono">
                  <span>{item.id}</span><span>{item.date}</span>
                </div>
                {item.featuredLabel && <p className="archive-featured mono">{item.featuredLabel}</p>}
                <h3>{item.title}</h3>
                <p>{item.detail}</p>
                <span className="venue mono">{item.venue}</span>
              </button>
            </article>
          ))}
        </div>

      </section>

      <section className="timeline section" id="dates" aria-labelledby="timeline-title">
        <MobileChapterMarker number="03" label="DATES" />

        <div className="section-heading compact mobile-reveal">
          <div>
            <p className="eyebrow">SELECTED DATES / VERIFIED</p>
            <h2 id="timeline-title">Recent dates</h2>
          </div>
        </div>
        <div className="timeline-list mobile-reveal">
          {timeline.map((item, index) => (
            <button
              className="timeline-row"
              type="button"
              aria-haspopup="dialog"
              onClick={() => openSetDossier(item.slug)}
              key={item.slug}
            >
              <span className="row-number mono">{String(index + 1).padStart(2, "0")}</span>
              <time className="mono">{item.date}</time>
              <strong>{item.title}</strong>
              <span>{item.venue.split(" / ")[0]}</span>
              <span className="mono format">{item.timelineFormat}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="press section" id="press">
        <MobileChapterMarker number="04" label="PROFILE" />

        <div className="press-profile mobile-reveal">
          <div className="press-label mono">ARTIST PROFILE / OFFICIAL BIO</div>
          <figure className="press-headshot">
            <img
              src={mediaUrl("/media/profile/dosen-headshot-2026.jpeg")}
              alt="DOSEN seated beneath blue architectural lighting"
              loading="lazy"
              decoding="async"
            />
            <figcaption className="mono">DOSEN / ARTIST PORTRAIT</figcaption>
          </figure>
        </div>
        <div className="press-copy mobile-reveal">
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
        <aside className="press-facts mobile-reveal">
          <div><span>SETS</span><strong>SOLO / B2B / SUPPORT</strong></div>
        </aside>
      </section>

      <section className="contact section" id="contact">
        <MobileChapterMarker number="05" label="BOOK" />
        <p className="eyebrow">BOOKINGS / PRESS / COLLABORATION</p>
        <h2 className="mobile-reveal">Make a night of it.</h2>
        <div className="contact-actions mobile-reveal">
          <a
            className="contact-download"
            href={mediaUrl(PRESS_KIT.path)}
            download={PRESS_KIT.filename}
            aria-label="Download the DOSEN electronic press kit PDF"
          >
            {PRESS_KIT.label} ↓
          </a>
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

      <div
        className={`signal-dock ${transmitting ? "is-playing" : ""} ${mobileDockCompact ? "is-compact" : ""} ${mobileDockMorphing ? "is-morphing" : ""} dock-${mobileDockPhase}`}
        style={{
          "--dock-accent": activeSet.accent,
          "--dock-progress": `${duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0}%`,
        } as CSSProperties}
        role="region"
        aria-label="Persistent set player"
        ref={dockRef}
        onFocusCapture={() => requestMobileDockCompact(false)}
        onPointerDownCapture={() => requestMobileDockCompact(false)}
        onTransitionEnd={handleDockMorphEnd}
      >
        <div className="dock-morph-surface" ref={dockMorphSurfaceRef} aria-hidden="true" />
        <div className="dock-visual">
          <img
            className="dock-cover"
            ref={dockCoverRef}
            src={mediaUrl(activeSet.artwork.vinylCover)}
            alt=""
            aria-hidden="true"
            decoding="async"
          />
          <button
            className="dock-toggle"
            type="button"
            onClick={() => void togglePlayback()}
            aria-label={transmitting ? `Pause ${activeSet.title}` : `Play ${activeSet.title}`}
          >
            <PlaybackIcon playing={transmitting} />
          </button>
        </div>
        <div className="dock-player">
          <div className="dock-heading">
            <div className="dock-identification">
              <span className="dock-state mono" role="status">{playerStateLabel}</span>
              <strong>{activeSet.dockTitle}</strong>
            </div>
            <span className="dock-time mono">
              <span>{formatTime(currentTime)}</span>
              <span aria-hidden="true">/</span>
              <span>{formatTime(duration)}</span>
            </span>
          </div>
          <input
            className="progress"
            type="range"
            min="0"
            max={duration}
            step="1"
            value={Math.min(currentTime, duration)}
            disabled={mobileDockCompact}
            aria-label={`Seek through ${activeSet.title}`}
            onChange={(event) => {
              const nextTime = Number(event.currentTarget.value);
              seekTo(nextTime);
            }}
          />
        </div>
      </div>
    </main>
  );
}
