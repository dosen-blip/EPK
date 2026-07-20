"use client";

import { useRef, useState } from "react";

type ArchiveMode = "tune" | "drift" | "lock";

const MIX_SEGMENTS = Array.from({ length: 31 }, (_, index) => ({
  src: `/audio/dosen-escapade-ap-${String(index).padStart(3, "0")}.mp3`,
  offset: index * 180,
  duration: index === 30 ? 104.031202 : 180,
}));

const MIX_DURATION = MIX_SEGMENTS.at(-1)!.offset + MIX_SEGMENTS.at(-1)!.duration;

function formatTime(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

const transmissions = [
  {
    id: "TR-0626",
    date: "26 JUN 2026",
    venue: "GRIDWRKS / OTTAWA",
    title: "ESCAPADE OFFICIAL AFTERPARTY",
    detail: "OPENING SUPPORT — ODD MOB B2B WALKER & ROYCE",
    slot: "hero-escapade",
    tone: "violet",
  },
  {
    id: "OGS-053",
    date: "28 MAR 2026",
    venue: "GRIDWRKS / OTTAWA",
    title: "OFF GRID 1 YEAR",
    detail: "DOSEN B2B FASTR — FULL SET AVAILABLE",
    slot: "offgrid-anniversary",
    tone: "amber",
  },
  {
    id: "FS-0522",
    date: "22 MAY 2026",
    venue: "CITY AT NIGHT / OTTAWA",
    title: "SOLSTICE X FREQUENCY SHIFT",
    detail: "DOSEN B2B GAB BALLADELLI",
    slot: "solstice-frequency",
    tone: "magenta",
  },
  {
    id: "OGS-032",
    date: "31 OCT 2025",
    venue: "GRIDWRKS / OTTAWA",
    title: "OFF GRID HALLOWEEKEND",
    detail: "DEBUT / OPENING SET — FULL SET AVAILABLE",
    slot: "offgrid-halloween",
    tone: "red",
  },
];

const timeline = [
  ["31 OCT 2025", "OFF GRID HALLOWEEKEND", "GRIDWRKS", "DEBUT / OPENING"],
  ["03 JAN 2026", "OFF GRID X FREQUENCY SHIFT", "GRIDWRKS", "RECORDED SET"],
  ["28 MAR 2026", "OFF GRID 1 YEAR", "GRIDWRKS", "B2B FASTR"],
  ["22 MAY 2026", "SOLSTICE X FREQUENCY SHIFT", "CITY AT NIGHT", "B2B BALLADELLI"],
  ["26 JUN 2026", "ESCAPADE OFFICIAL AFTERPARTY", "GRIDWRKS", "OPENING SUPPORT"],
];

export default function Home() {
  const [mode, setMode] = useState<ArchiveMode>("tune");
  const [transmitting, setTransmitting] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const duration = MIX_DURATION;

  function loadSegment(nextIndex: number, localTime: number, shouldPlay: boolean) {
    const audio = audioRef.current;
    const segment = MIX_SEGMENTS[nextIndex];
    if (!audio || !segment) return;

    setSegmentIndex(nextIndex);
    audio.src = segment.src;
    audio.load();
    audio.addEventListener(
      "loadedmetadata",
      () => {
        audio.currentTime = Math.min(localTime, segment.duration);
        if (shouldPlay) void audio.play();
      },
      { once: true },
    );
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setTransmitting(false);
      }
    } else {
      audio.pause();
    }
  }

  function handleSegmentEnded() {
    const nextIndex = segmentIndex + 1;
    if (nextIndex < MIX_SEGMENTS.length) {
      loadSegment(nextIndex, 0, true);
      return;
    }

    setTransmitting(false);
    setCurrentTime(0);
    loadSegment(0, 0, false);
  }

  function seekTo(nextTime: number) {
    const boundedTime = Math.min(Math.max(nextTime, 0), MIX_DURATION);
    const nextIndex = MIX_SEGMENTS.findIndex(
      (segment, index) =>
        boundedTime < segment.offset + segment.duration || index === MIX_SEGMENTS.length - 1,
    );
    const segment = MIX_SEGMENTS[nextIndex];
    const localTime = boundedTime - segment.offset;
    const shouldPlay = audioRef.current ? !audioRef.current.paused : false;

    if (nextIndex === segmentIndex && audioRef.current) {
      audioRef.current.currentTime = localTime;
    } else {
      loadSegment(nextIndex, localTime, shouldPlay);
    }
    setCurrentTime(boundedTime);
  }

  return (
    <main className={`site-shell mode-${mode}`}>
      <header className="site-header">
        <a className="mini-mark" href="#top" aria-label="DOSEN home">
          <span className="wordmark wordmark-small">DOSEN</span>
        </a>
        <div className="header-signal" aria-hidden="true">
          <span className="signal-dot" /> OTTAWA / CA
        </div>
        <nav aria-label="Primary navigation">
          <a href="#archive">Archive</a>
          <a href="#signal">Signal</a>
          <a href="#press">Press</a>
          <a className="nav-cta" href="#contact">Book</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-kicker mono">
          <span>TRANSMISSION 001</span>
          <span>TECH HOUSE / AFTER HOURS</span>
        </div>

        <div className="hero-copy">
          <p className="eyebrow">MINIMAL GRIT / ROLLING PRESSURE / LATE-HOUR RELEASE</p>
          <h1 className="hero-mark">DOSEN</h1>
          <div className="hero-bottom">
            <p className="hero-statement">
              Ottawa-based DJ building pressure through tech house, trance lift,
              and the point where the room stops checking the time.
            </p>
            <a className="round-link" href="#archive">
              Enter archive <span aria-hidden="true">↘</span>
            </a>
          </div>
        </div>

        <div className="hero-media media-slot" data-media-slot="hero-loop">
          <div className="media-noise" aria-hidden="true" />
          <div className="media-corner top-left">LIVE FEED</div>
          <div className="media-corner top-right">00:00:00</div>
          <div className="media-center">
            <span>MEDIA PENDING</span>
            <small>HERO-LOOP / 16:9 OR 9:16</small>
          </div>
          <div className="media-corner bottom-left">SOURCE / REVIEW QUEUE</div>
          <div className="media-corner bottom-right">01</div>
        </div>

        <div className="scroll-note mono" aria-hidden="true">
          SCROLL TO TUNE <span>↓</span>
        </div>
      </section>

      <div className="marquee" aria-label="DOSEN sound description">
        <div className="marquee-track">
          <span>TECH HOUSE</span><i>◆</i><span>MINIMAL GRIT</span><i>◆</i>
          <span>TRANCE-LIT HORIZON</span><i>◆</i><span>AFTER HOURS</span><i>◆</i>
          <span aria-hidden="true">TECH HOUSE</span><i aria-hidden="true">◆</i>
          <span aria-hidden="true">MINIMAL GRIT</span><i aria-hidden="true">◆</i>
        </div>
      </div>

      <section className="archive section" id="archive">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SELECTED TRANSMISSIONS / 2025—2026</p>
            <h2>Signal archive</h2>
          </div>
          <div className="mode-switch" aria-label="Archive display mode">
            {(["tune", "drift", "lock"] as ArchiveMode[]).map((option) => (
              <button
                key={option}
                type="button"
                className={mode === option ? "active" : ""}
                aria-pressed={mode === option}
                onClick={() => setMode(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <p className="mode-description mono" aria-live="polite">
          {mode === "tune" && "TUNE / Scan the verified performance record."}
          {mode === "drift" && "DRIFT / Browse the archive out of sequence."}
          {mode === "lock" && "LOCK / Reduced-motion booking view engaged."}
        </p>

        <div className="archive-grid">
          {transmissions.map((item, index) => (
            <article className={`archive-card tone-${item.tone}`} key={item.id}>
              <div className="archive-media media-slot" data-media-slot={item.slot}>
                <span className="archive-index mono">{String(index + 1).padStart(2, "0")}</span>
                <div className="placeholder-pulse" aria-hidden="true">
                  {Array.from({ length: 12 }).map((_, bar) => <i key={bar} />)}
                </div>
                <span className="placeholder-label mono">MEDIA / {item.id}</span>
              </div>
              <div className="archive-meta mono">
                <span>{item.id}</span><span>{item.date}</span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <span className="venue mono">{item.venue}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="signal-section section" id="signal">
        <audio
          ref={audioRef}
          src={MIX_SEGMENTS[0].src}
          preload="metadata"
          onPlay={() => setTransmitting(true)}
          onPause={() => setTransmitting(false)}
          onEnded={handleSegmentEnded}
          onTimeUpdate={(event) =>
            setCurrentTime(MIX_SEGMENTS[segmentIndex].offset + event.currentTarget.currentTime)
          }
        />
        <div className="signal-intro">
          <p className="eyebrow">THE CURRENT SIGNAL</p>
          <h2>Built for the late hours.</h2>
          <p>
            Driving tech house, minimal tension, and euphoric release. The player
            now carried by the full Escapade afterparty opening set.
          </p>
        </div>
        <button
          className={`player-disc ${transmitting ? "is-playing" : ""}`}
          type="button"
          aria-pressed={transmitting}
          onClick={() => void togglePlayback()}
        >
          <img
            className="player-cover-art"
            src="/media/escapade-ap-cover.png"
            alt="Escapade official afterparty: Odd Mob B2B Walker & Royce, opening set DOSEN"
            width="1254"
            height="1254"
          />
          <span className="player-cover-control">
            <span className="player-action">{transmitting ? "PAUSE SIGNAL" : "PLAY FULL SET"}</span>
            <small>320 KBPS / {formatTime(duration)}</small>
          </span>
        </button>
        <div className="signal-data mono">
          <div><span>NOW QUEUED</span><strong>ODD MOB X WALKER &amp; ROYCE / OPENING SET</strong></div>
          <div><span>FORMAT</span><strong>FULL SET / {formatTime(duration)}</strong></div>
          <div><span>STATUS</span><strong>LIVE PLAYER / 320 KBPS MP3</strong></div>
        </div>
      </section>

      <section className="timeline section" aria-labelledby="timeline-title">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">SELECTED DATES / VERIFIED</p>
            <h2 id="timeline-title">Recent frequency</h2>
          </div>
          <span className="coordinate mono">45.4215° N / 75.6972° W</span>
        </div>
        <div className="timeline-list">
          {timeline.map(([date, event, venue, format], index) => (
            <div className="timeline-row" key={event}>
              <span className="row-number mono">{String(index + 1).padStart(2, "0")}</span>
              <time className="mono">{date}</time>
              <strong>{event}</strong>
              <span>{venue}</span>
              <span className="mono format">{format}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="press section" id="press">
        <div className="press-label mono">ARTIST PROFILE / WORKING COPY</div>
        <div className="press-copy">
          <p className="drop-cap">
            DOSEN is an Ottawa-based DJ with a sound rooted in minimal, gritty
            tech house and sharpened by shades of trance, house, and techno.
          </p>
          <p>
            After debuting with OFF GRID on Halloween 2025, he moved quickly
            through Ottawa&apos;s underground—from Frequency Shift and OFF GRID
            appearances to an opening slot at the official Escapade afterparty
            for Odd Mob B2B Walker &amp; Royce.
          </p>
          <p className="press-note mono">BIO STATUS / DRAFT — FINAL APPROVAL REQUIRED</p>
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
        <h2>Lock the signal.</h2>
        <div className="contact-actions">
          <span className="contact-placeholder">BOOKING CONTACT / ADD BEFORE LAUNCH</span>
          <a href="https://www.instagram.com/matia_dosen/" target="_blank" rel="noreferrer">Instagram ↗</a>
          <a href="https://soundcloud.com/user-278640203" target="_blank" rel="noreferrer">SoundCloud ↗</a>
        </div>
      </section>

      <footer>
        <span className="mini-mark wordmark wordmark-small">DOSEN</span>
        <p className="mono">EPK SCAFFOLD / MEDIA SLOTS ARE PLACEHOLDERS / 2026</p>
        <a href="#top" aria-label="Back to top">↑ TOP</a>
      </footer>

      <div className={`signal-dock ${transmitting ? "is-playing" : ""}`}>
        <button type="button" onClick={() => void togglePlayback()} aria-label={transmitting ? "Pause Escapade opening set" : "Play Escapade opening set"}>
          {transmitting ? "Ⅱ" : "▶"}
        </button>
        <div className="dock-track">
          <span>ESCAPADE AP / OPENING SET</span>
          <input
            className="progress"
            type="range"
            min="0"
            max={duration}
            step="1"
            value={Math.min(currentTime, duration)}
            aria-label="Seek through Escapade opening set"
            onChange={(event) => {
              const nextTime = Number(event.currentTarget.value);
              seekTo(nextTime);
            }}
          />
        </div>
        <span className="dock-time mono">{formatTime(currentTime)} / {formatTime(duration)}</span>
        <span className="dock-status mono">{transmitting ? "TRANSMITTING" : "READY"}</span>
      </div>
    </main>
  );
}
