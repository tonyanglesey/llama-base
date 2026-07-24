"use client";

import { useCallback, useEffect, useState } from "react";
import { LlamaHeader, LlamaFooter } from "@lla-ma/ui";

type Theme = "dark" | "light";

// The shared lla.ma shell, wrapped around the console. Theme lives here so
// the @lla-ma/ui header's toggle can drive it. The no-flash script in
// layout.tsx has already set <html data-theme=…> from localStorage before
// paint; we read it back on mount. The `data-theme` attribute drives both
// @lla-ma/ui's tokens and our Tailwind `dark:` variant (see globals.css).
export default function AppChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>("dark");
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "light" || t === "dark") setTheme(t);
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch {
        /* private mode / storage disabled — fine, just don't persist */
      }
      return next;
    });
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Shared lla.ma shell: logo + Platform·Base·Apps switcher + theme.
          Full-bleed (maxWidth="100%") so it lines up with the edge-to-edge
          console toolbar and sidebar below, rather than the 1320px marketing cap. */}
      <LlamaHeader app="base" theme={theme} onToggleTheme={toggleTheme} maxWidth="100%" />

      <div
        className="flex flex-col"
        style={{ minHeight: "calc(100vh - 54px)" }}
      >
        {children}
      </div>

      <LlamaFooter
        theme={theme}
        maxWidth="100%"
        tagline="The self-hosted, AI-native Postgres console — Supabase Studio's polish, for any Postgres, on your own box."
        copyright="lla.ma · © 2026 Via Ventures"
        columns={[
          {
            title: "PROJECT",
            links: [
              {
                label: "GitHub",
                href: "https://github.com/tonyanglesey/llama-base",
              },
              { label: "lla.ma", href: "https://lla.ma" },
            ],
          },
          {
            // TODO: wire real destinations — these are placeholders for now.
            title: "DEVELOPERS",
            links: [
              { label: "Docs", href: "https://lla.ma/docs" },
              { label: "API status", href: "https://api.lla.ma" },
              { label: "Sign in", href: "https://lla.ma/login" },
              { label: "Sign up", href: "https://lla.ma/register" },
            ],
          },
          {
            title: "COMPANY",
            links: [
              { label: "Account", href: "https://lla.ma/account" },
              { label: "Contact", href: "mailto:hello@lla.ma" },
            ],
          },
        ]}
      />
    </div>
  );
}
