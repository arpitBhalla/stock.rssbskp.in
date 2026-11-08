"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useI18n } from "@/components/providers/i18n-provider";
import { Field } from "@/components/entry/entry-sheet";
import { errorText } from "@/components/entry/use-after-entry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AckForm({ token }: { token: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const ack = trpc.challans.acknowledgeByToken.useMutation({
    onSuccess: () => {
      toast.success(t("public.thanks"));
      router.refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <form
      className="space-y-3 rounded-2xl border-2 border-emerald-600/40 bg-emerald-50/50 p-4 dark:bg-emerald-400/5"
      onSubmit={(e) => {
        e.preventDefault();
        ack.mutate({ token, name: name.trim(), phone: phone.trim() || undefined });
      }}
    >
      <p className="font-semibold">{t("public.confirmTitle")}</p>
      <Field label={t("public.yourName")} htmlFor="ack-name">
        <Input id="ack-name" required minLength={2} autoComplete="name" className="h-11 bg-background" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("public.phoneOptional")} htmlFor="ack-phone">
        <Input id="ack-phone" type="tel" inputMode="tel" autoComplete="tel" className="h-11 bg-background" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Button type="submit" className="h-12 w-full bg-emerald-600 text-base text-white hover:bg-emerald-600/90" disabled={name.trim().length < 2 || ack.isPending}>
        <CheckCircle2 className="size-5" />
        {t("public.confirm")}
      </Button>
    </form>
  );
}

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "en" ? "hi" : "en")}
      className="h-9 rounded-full border px-3 text-sm font-medium"
    >
      {locale === "en" ? "हिन्दी" : "English"}
    </button>
  );
}
