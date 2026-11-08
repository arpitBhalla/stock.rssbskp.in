"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Download,
  LogOut,
  Package,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { del } from "idb-keyval";
import { trpc } from "@/lib/trpc/client";
import { authClient } from "@/lib/auth-client";
import {
  currentPushState,
  subscribePush,
  unsubscribePush,
  type PushState,
} from "@/lib/push-client";
import { useI18n } from "@/components/providers/i18n-provider";
import { useMe } from "@/components/providers/me-provider";
import { useOffline } from "@/components/providers/offline-provider";
import { QUERY_CACHE_KEY } from "@/components/providers/trpc-provider";
import { ListCard, ListRow, PageTitle, Section } from "@/components/app/section";
import { errorText } from "@/components/entry/use-after-entry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type InstallPrompt = Event & { prompt: () => Promise<void> };

const STANDALONE = "(display-mode: standalone)";
function subscribeStandalone(cb: () => void) {
  const mql = window.matchMedia(STANDALONE);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}
const isStandalone = () =>
  window.matchMedia(STANDALONE).matches || (navigator as { standalone?: boolean }).standalone === true;

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-1 rounded-lg bg-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn("h-9 rounded-md px-2 text-sm font-medium", value === o.value ? "bg-background shadow-sm" : "text-muted-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function MorePage() {
  const { t, locale, setLocale } = useI18n();
  const me = useMe();
  const { theme, setTheme } = useTheme();
  const { queue } = useOffline();
  const isAdmin = me.role === "admin";
  const roleKey = me.role === "admin" || me.role === "manager" ? me.role : "viewer";

  const vapid = trpc.push.publicKey.useQuery();
  const subscribe = trpc.push.subscribe.useMutation();
  const unsubscribe = trpc.push.unsubscribe.useMutation();
  const [push, setPush] = useState<PushState | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallPrompt | null>(null);
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => true);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    void currentPushState().then(setPush);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function togglePush() {
    try {
      if (push === "on") {
        const endpoint = await unsubscribePush();
        if (endpoint) await unsubscribe.mutateAsync({ endpoint });
      } else if (vapid.data) {
        const sub = await subscribePush(vapid.data);
        if (sub) await subscribe.mutateAsync({ ...sub, locale });
      }
    } catch (e) {
      toast.error(errorText(e));
    }
    setPush(await currentPushState());
  }

  async function signOut() {
    const pending = queue.filter((q) => !q.error).length;
    if (pending && !confirmSignOut) {
      setConfirmSignOut(true);
      return;
    }
    await authClient.signOut();
    // Cached pages and data belong to this user; forget them.
    navigator.serviceWorker?.controller?.postMessage("clear-pages");
    await del(QUERY_CACHE_KEY).catch(() => {});
    // Full reload also drops the in-memory query cache.
    window.location.replace("/sign-in");
  }

  const pushLabel =
    vapid.data === null
      ? t("more.notifyNotConfigured")
      : push === "unsupported"
        ? t("more.notifyUnsupported")
        : push === "blocked"
          ? t("more.notifyBlocked")
          : null;
  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const pendingCount = queue.filter((q) => !q.error).length;

  return (
    <div className="space-y-6 pb-6">
      <PageTitle title={t("more.title")} />

      <section className="mx-4 flex items-center gap-3 rounded-xl border bg-card p-4">
        <div className="grid size-12 place-items-center rounded-full bg-muted text-sm font-semibold uppercase">
          {me.name.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{me.name}</p>
          <p className="truncate text-sm text-muted-foreground">@{me.username ?? "—"}</p>
        </div>
        <Badge variant="secondary">{t(`manage.role.${roleKey}`)}</Badge>
      </section>

      <Section title={t("more.work")}>
        <ListCard>
          <ListRow href="/borrows">
            <ArrowLeftRight className="size-5 text-primary" />
            <span className="font-medium">{t("borrows.title")}</span>
          </ListRow>
          <ListRow href="/reports">
            <BarChart3 className="size-5 text-primary" />
            <span className="font-medium">{t("manage.reports")}</span>
          </ListRow>
          <ListRow href="/manage/items">
            <Package className="size-5 text-primary" />
            <span className="font-medium">{t("manage.items")}</span>
          </ListRow>
        </ListCard>
      </Section>

      {isAdmin ? (
        <Section title={t("more.manage")}>
          <ListCard>
            <ListRow href="/manage/centers">
              <Building2 className="size-5 text-primary" />
              <span className="font-medium">{t("manage.centers")}</span>
            </ListRow>
            <ListRow href="/manage/departments">
              <Boxes className="size-5 text-primary" />
              <span className="font-medium">{t("manage.departments")}</span>
            </ListRow>
            <ListRow href="/manage/users">
              <Users className="size-5 text-primary" />
              <span className="font-medium">{t("manage.users")}</span>
            </ListRow>
          </ListCard>
        </Section>
      ) : null}

      <Section title={t("more.language")}>
        <Segmented
          value={locale}
          options={[
            { value: "en", label: "English" },
            { value: "hi", label: "हिन्दी" },
          ]}
          onChange={setLocale}
        />
      </Section>

      <Section title={t("more.theme")}>
        <Segmented
          value={(theme ?? "system") as "system" | "light" | "dark"}
          options={[
            { value: "system", label: t("more.themeAuto") },
            { value: "light", label: t("more.themeLight") },
            { value: "dark", label: t("more.themeDark") },
          ]}
          onChange={setTheme}
        />
      </Section>

      <Section title={t("more.notifications")}>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
          <Bell className="size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{push === "on" ? t("more.notifyOn") : t("more.notifyOff")}</p>
            {pushLabel ? <p className="text-sm text-muted-foreground">{pushLabel}</p> : null}
          </div>
          {push === "on" || push === "off" ? (
            <Button
              variant={push === "on" ? "outline" : "default"}
              className="h-10"
              disabled={!vapid.data || subscribe.isPending || unsubscribe.isPending}
              onClick={togglePush}
            >
              {push === "on" ? t("more.notifyDisable") : t("more.notifyEnable")}
            </Button>
          ) : null}
        </div>
      </Section>

      {!standalone ? (
        <Section title={t("more.install")}>
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{t("more.installHint")}</p>
            {installEvent ? (
              <Button className="h-11 w-full" onClick={() => void installEvent.prompt()}>
                <Download className="size-5" />
                {t("more.install")}
              </Button>
            ) : isIos ? (
              <p className="text-sm">{t("more.installIos")}</p>
            ) : null}
          </div>
        </Section>
      ) : null}

      <div className="space-y-2 px-4">
        {confirmSignOut ? (
          <p className="text-sm text-destructive">{t("more.signOutPending", { n: pendingCount })}</p>
        ) : null}
        <Button variant="outline" className="h-12 w-full text-base text-destructive" onClick={signOut}>
          <LogOut className="size-5" />
          {t("more.signOut")}
        </Button>
      </div>
    </div>
  );
}
