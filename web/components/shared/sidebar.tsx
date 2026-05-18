"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, Telescope, Settings, LogOut } from "lucide-react";
import { useAtlas } from "@/lib/store";
import { selectActiveRunCount } from "@/lib/store/selectors";
import { signOut } from "@/lib/auth/mock-auth";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", icon: Home, badge: false },
  { href: "/research", label: "Research", icon: Telescope, badge: true },
  { href: "/settings", label: "Settings", icon: Settings, badge: false },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const activeCount = useAtlas(selectActiveRunCount);

  function handleSignOut() {
    signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-[244px] shrink-0 flex-col border-r border-border bg-surface-2 p-5"
    >
      <Link
        href="/"
        className="mb-5 flex items-center gap-2 px-2 py-1.5"
      >
        <span className="font-display text-2xl font-semibold tracking-tight text-ink">
          haggl
        </span>
        <span className="h-[7px] w-[7px] rounded-full bg-clay" />
      </Link>

      <ul className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-clay-tint font-semibold text-clay-deep"
                    : "text-ink-2 hover:bg-surface hover:text-ink",
                )}
              >
                <Icon className="size-[17px] shrink-0" strokeWidth={2} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && activeCount > 0 && (
                  <span className="rounded-full bg-clay px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular text-white">
                    {activeCount}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex items-center gap-2.5 rounded-md border border-border bg-surface px-2 py-2.5">
        <span className="flex size-[30px] items-center justify-center rounded-full bg-clay-tint font-mono text-[11px] font-semibold text-clay-deep">
          MA
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-semibold text-ink">
            Marcus Allen
          </span>
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Sign out"
          title="Sign out"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <LogOut className="size-[15px]" strokeWidth={2} />
        </button>
      </div>
    </nav>
  );
}
