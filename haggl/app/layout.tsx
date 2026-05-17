import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./procureai.css";
import { AppFrame } from "@/components/AppFrame";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "HAGGL — AI Procurement Negotiation",
  description: "AI-powered multi-supplier procurement negotiation platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased`}>
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
