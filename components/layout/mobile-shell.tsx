"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CloudOff, House, Menu, Package, Plus, ReceiptText, RefreshCw } from "lucide-react";
import { DepartmentProvider, useDepartment } from "@/components/providers/department-provider";
import { EntryProvider, useEntry } from "@/components/providers/entry-provider";
import { OfflineProvider, useOffline } from "@/components/providers/offline-provider";
import { MeProvider, type Me } from "@/components/providers/me-provider";
import { useT } from "@/components/providers/i18n-provider";
import { DepartmentSwitcher } from "@/components/layout/department-switcher";
import type { MessageKey } from "@/lib/i18n";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const TABS_LEFT: { href: string; label: MessageKey; icon: typeof House }[] = [
  { href: "/", label: "nav.home", icon: House },
  { href: "/stock", label: "nav.stock", icon: Package },
];
const TABS_RIGHT: typeof TABS_LEFT = [
  { href: "/rahdari", label: "nav.rahdari", icon: ReceiptText },
  { href: "/more", label: "nav.more", icon: Menu },
];

export function MobileShell({ user, children }: { user: Me; children: React.ReactNode }) {
  return (
    <MeProvider me={user}>
      <OfflineProvider>
        <DepartmentProvider>
          <EntryProvider>
            <Shell user={user}>{children}</Shell>
          </EntryProvider>
        </DepartmentProvider>
      </OfflineProvider>
    </MeProvider>
  );
}

function Shell({ user, children }: { user: { name: string }; children: React.ReactNode }) {
  const t = useT();
  const pathname = usePathname();
  const { openMenu } = useEntry();
  const { departments, current, isLoading } = useDepartment();
  // Warm (and persist) what entry forms need, so they work with no signal.
  trpc.items.list.useQuery(undefined, { staleTime: 5 * 60_000 });
  trpc.inventory.listByDepartment.useQuery({ departmentId: current?.id ?? 0 }, { enabled: !!current });
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-lg flex-col">
      <header className="sticky top-0 z-30 print:hidden border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur supports-backdrop-filter:bg-background/75">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <DepartmentSwitcher />
          <div className="flex items-center gap-2">
            <SyncChip />
            <Link
              href="/more"
              aria-label={t("shell.account")}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase"
            >
              {user.name.slice(0, 2)}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] print:pb-0">
        {!isLoading && !departments.length ? (
          <p className="mx-4 mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
            {t("shell.noMembership")}
          </p>
        ) : null}
        {children}
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t print:hidden bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/80"
      >
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center">
          {TABS_LEFT.map((tab) => (
            <TabLink key={tab.href} href={tab.href} label={t(tab.label)} icon={tab.icon} active={isActive(tab.href)} />
          ))}
          <div className="grid place-items-center">
            <button
              type="button"
              aria-label={t("nav.newEntry")}
              onClick={openMenu}
              className="grid size-13 -translate-y-3 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-transform active:scale-95"
            >
              <Plus className="size-7" />
            </button>
          </div>
          {TABS_RIGHT.map((tab) => (
            <TabLink key={tab.href} href={tab.href} label={t(tab.label)} icon={tab.icon} active={isActive(tab.href)} />
          ))}
        </div>
      </nav>
    </div>
  );
}

/** Offline / pending-sync indicator; tapping it retries the queue. */
function SyncChip() {
  const t = useT();
  const { online, queue, syncing, syncNow } = useOffline();
  const pending = queue.filter((q) => !q.error).length;
  if (online && !pending) return null;
  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
        online
          ? "bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-300"
          : "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300",
      )}
    >
      {online ? <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} /> : <CloudOff className="size-3.5" />}
      {pending ? t("rahdari.pendingSync", { n: pending }) : t("shell.offline")}
    </button>
  );
}

function TabLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className={cn("size-6", active && "stroke-[2.25]")} />
      {label}
    </Link>
  );
}
