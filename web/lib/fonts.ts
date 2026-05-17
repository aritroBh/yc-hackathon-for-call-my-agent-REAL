import { Fraunces } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

/** Editorial serif — big numbers, section titles, headings. */
export const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT", "WONK"],
});

/** Body + mono — Geist family via the `geist` package. */
export const geistSans = GeistSans; // exposes .variable === "--font-geist-sans"
export const geistMono = GeistMono; // exposes .variable === "--font-geist-mono"

export const fontVariables = `${fraunces.variable} ${geistSans.variable} ${geistMono.variable}`;
