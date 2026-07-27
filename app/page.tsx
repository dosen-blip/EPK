"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type TransitionEvent } from "react";
import {
  createSingleFileSegments,
  getAudioDuration,
  locateAudioSegment,
} from "./player-model.mjs";
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
              <img src={mediaUrl(set.artwork.vinylCover)} alt="" />
              <i />
            </span>
          </div>
        </div>
        <div className="dossier-vinyl-sleeve" aria-hidden="true">
          <img src={mediaUrl(set.artwork.vinylCover)} alt="" />
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

export default function Home() {
  const [transmitting, setTransmitting] = useState(false);
  const [activeSetSlug, setActiveSetSlug] = useState(DEFAULT_FEATURED_SET_SLUG);
  const [playerStatus, setPlayerStatus] = useState<"ready" | "loading" | "error">("ready");
  const [mobileHero, setMobileHero] = useState(false);
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
            src={mediaUrl(mobileHero ? "/media/hero/hero-mobile-v3.mp4" : "/media/hero/hero-desktop-v1.mp4")}
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
              Ottawa DJ playing tech house, house, trance, and techno.
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
                      poster={mediaUrl(clip.poster)}
                      aria-label={`${selectedSet.title} highlight clip ${index + 1}`}
                      onPlay={(event) => handleDossierClipPlay(event.currentTarget)}
                    >
                      <source src={mediaUrl(clip.src)} type="video/mp4" />
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
                  <img src={mediaUrl(activeSet.artwork.vinylCover)} alt="" />
                  <span className="vinyl-spindle" />
                </div>
              </div>
            </div>

            <div className="vinyl-sleeve">
              <div className="vinyl-sleeve-art">
                <img src={mediaUrl(activeSet.artwork.vinylCover)} alt={`${activeSet.title} official set artwork`} />
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
                    <img src={mediaUrl(set.artwork.vinylCover)} alt="" />
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
                  <img className="archive-poster" src={mediaUrl(getEventArtwork(item))} alt="" />
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
          <span className="coordinate mono">45.4215° N / 75.6972° W</span>
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
          <div><span>BASE</span><strong>OTTAWA, CANADA</strong></div>
          <div><span>CORE</span><strong>TECH HOUSE</strong></div>
          <div><span>EDGE</span><strong>TRANCE / HOUSE / TECHNO</strong></div>
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
