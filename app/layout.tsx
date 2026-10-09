import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { MEDIA_ORIGIN } from "./content";

// Runs before the first paint. At the top of the page and with motion allowed, it arms the hero intro
// (`intro-pending`): the wordmark stays hidden and the room dark until app/page.tsx starts the power-on, so the
// first frames never show the resting word or a fallback font. If the page's script never starts the intro, the
// wordmark is released after 4s.
const ARM_INTRO = `(function(){try{var d=document.documentElement;if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&document.visibilityState==="visible"&&(!location.hash||location.hash==="#top")&&!/[?&]set=/.test(location.search)){d.classList.add("intro-pending");setTimeout(function(){if(!window.__dosenIntro)d.classList.remove("intro-pending")},4000)}}catch(e){}})();`;

const title = "DOSEN — Electronic Press Kit";
const description = "Ottawa DJ playing tech house, house, trance, and techno.";
export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og-dosen-wordmark.png", origin).toString();

  return {
    metadataBase: origin,
    title,
    description,
    icons: {
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      shortcut: "/favicon.svg",
    },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: socialImage, width: 1262, height: 718, alt: "DOSEN wordmark" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ARM_INTRO }} />
        {/* The wordmark's font lives on the media origin; start that connection and the font itself right away. */}
        <link rel="preconnect" href={MEDIA_ORIGIN} crossOrigin="anonymous" />
        <link rel="preload" href={`${MEDIA_ORIGIN}/fonts/Ethnocentric-Regular.otf`} as="font" type="font/otf" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
