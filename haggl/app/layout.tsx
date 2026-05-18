import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// haggl runs HEADLESS. The buyer-facing UI is the standalone `web/`
// (Atlas) app — see web/. This app serves `/api/**` only, so the
// layout no longer mounts the old AppFrame chrome or procureai.css.

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "haggl — headless backend",
  description:
    "Voice-negotiation engine + Gemini Deep Research API. UI lives in the standalone web/ app.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
