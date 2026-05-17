import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "HAGGL — AI Procurement Negotiation",
  description: "AI-powered multi-supplier procurement negotiation platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans bg-slate-950 text-slate-100 antialiased`}>
        <nav className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-8">
                <a href="/" className="flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight">
                    <span className="text-cyan-400">HAGGL</span>
                    <span className="text-slate-600 font-mono text-[10px] ml-1">v0</span>
                  </span>
                </a>
                <div className="hidden md:flex items-center gap-1">
                  <NavLink href="/dashboard">Dashboard</NavLink>
                  <NavLink href="/rfq/new">New RFQ</NavLink>
                  <NavLink href="/rfqs">RFQs</NavLink>
                  <NavLink href="/suppliers">Suppliers</NavLink>
                  <NavLink href="/calls">Calls</NavLink>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
                  All Systems Nominal
                </span>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">{children}</main>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-md transition-all"
    >
      {children}
    </a>
  );
}
