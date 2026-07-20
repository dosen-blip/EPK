"use client";

import { useState } from "react";

type ArchiveMode = "tune" | "drift" | "lock";

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

  return (
    <main className={`site-shell mode-${mode}`}>
      <header className="site-header">
        <a className="mini-mark" href="#top" aria-label="DOSEN home">
          <img className="wordmark-on-dark wordmark-small" src="/brand/dosen-wordmark-v2.png" alt="DOSEN" width="935" height="145" />
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
          <h1 className="hero-mark">
            <span className="sr-only">DOSEN</span>
            <img className="wordmark-on-dark" src="/brand/dosen-wordmark-v2.png" alt="" width="935" height="145" />
          </h1>
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
        <div className="signal-intro">
          <p className="eyebrow">THE CURRENT SIGNAL</p>
          <h2>Built for the late hours.</h2>
          <p>
            Driving tech house, minimal tension, and euphoric release. The player
            shell is ready for a reviewed SoundCloud or self-hosted mix.
          </p>
        </div>
        <button
          className={`player-disc ${transmitting ? "is-playing" : ""}`}
          type="button"
          aria-pressed={transmitting}
          onClick={() => setTransmitting((value) => !value)}
        >
          <span className="disc-ring" aria-hidden="true" />
          <span>{transmitting ? "PAUSE SIGNAL" : "TEST PLAYER"}</span>
          <small>PLACEHOLDER AUDIO</small>
        </button>
        <div className="signal-data mono">
          <div><span>NOW QUEUED</span><strong>ODD MOB X WALKER &amp; ROYCE / OPENING SET</strong></div>
          <div><span>FORMAT</span><strong>FULL SET / 01:31:44</strong></div>
          <div><span>STATUS</span><strong>EMBED PENDING MEDIA REVIEW</strong></div>
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
        <span className="mini-mark" aria-label="DOSEN">
          <img className="wordmark-on-light wordmark-small" src="/brand/dosen-wordmark-v2.png" alt="" width="935" height="145" />
        </span>
        <p className="mono">EPK SCAFFOLD / MEDIA SLOTS ARE PLACEHOLDERS / 2026</p>
        <a href="#top" aria-label="Back to top">↑ TOP</a>
      </footer>

      <div className={`signal-dock ${transmitting ? "is-playing" : ""}`}>
        <button type="button" onClick={() => setTransmitting((value) => !value)} aria-label={transmitting ? "Pause placeholder player" : "Play placeholder player"}>
          {transmitting ? "Ⅱ" : "▶"}
        </button>
        <div className="dock-track">
          <span>PLACEHOLDER / OPENING SET</span>
          <div className="progress"><i /></div>
        </div>
        <span className="dock-time mono">00:00 / 91:44</span>
        <span className="dock-status mono">{transmitting ? "TRANSMITTING" : "STANDBY"}</span>
      </div>
    </main>
  );
}
