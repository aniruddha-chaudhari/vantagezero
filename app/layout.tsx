import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";

import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

export const metadata: Metadata = {
  title: "Vantage",
  description: "Self-healing supply-chain intelligence for hardware teams.",
};

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("vantage-theme");
    var dark = stored === "dark" || (stored !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before paint so the dark class is already set - no light-mode flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${sans.variable} ${display.variable}`}>{children}</body>
    </html>
  );
}
