"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { CheckCircle2, Download, FileImage, MessageCircle, Share2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useT } from "@/components/providers/i18n-provider";
import { PageTitle } from "@/components/app/section";
import { RahdariView } from "@/components/app/rahdari-view";
import { EntrySheet, Field } from "@/components/entry/entry-sheet";
import { errorText } from "@/components/entry/use-after-entry";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export default function RahdariDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const t = useT();
  const utils = trpc.useUtils();
  const detail = trpc.challans.byId.useQuery({ id }, { enabled: id > 0 });
  const d = detail.data;

  const [qr, setQr] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  const publicUrl = d && typeof window !== "undefined" ? `${window.location.origin}/r/${d.publicToken}` : "";
  const fileName = d ? `${d.number.replaceAll("/", "-")}.pdf` : "";

  useEffect(() => {
    if (!publicUrl) return;
    void QRCode.toDataURL(publicUrl, { margin: 1, width: 320 }).then(setQr);
  }, [publicUrl]);

  // Fetch the PDF up front: the share sheet must open straight from the tap
  // (Safari drops the user gesture after a slow await).
  useEffect(() => {
    if (!d || !navigator.onLine) return;
    let cancelled = false;
    fetch(`/api/challan/${d.id}/pdf`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b && !cancelled) setPdfFile(new File([b], fileName, { type: "application/pdf" }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [d, fileName]);

  const ack = trpc.challans.acknowledge.useMutation({
    onSuccess: () => {
      toast.success(t("toast.received"));
      void utils.challans.invalidate();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const voidIt = trpc.challans.void.useMutation({
    onSuccess: () => {
      toast.success(t("toast.voided"));
      setVoidOpen(false);
      void utils.invalidate();
    },
    onError: (e) => toast.error(errorText(e)),
  });

  if (detail.isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-36" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (!d) return <PageTitle title={t("common.error")} back="/rahdari" />;

  const shareText = `${t("rahdari.shareText", { number: d.number })}\n${publicUrl}`;

  async function share() {
    try {
      if (pdfFile && navigator.canShare?.({ files: [pdfFile] })) {
        await navigator.share({ files: [pdfFile], title: d!.number, text: shareText });
      } else if (navigator.share) {
        await navigator.share({ title: d!.number, text: shareText, url: publicUrl });
      } else {
        window.open(`/api/challan/${d!.id}/pdf`, "_blank");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error(errorText(e));
    }
  }

  return (
    <div className="space-y-4 pb-6">
      <PageTitle title={d.number.split("/").pop()} back="/rahdari" />
      <div className="px-4">
        <RahdariView d={d} />
      </div>

      <div className="grid grid-cols-3 gap-2 px-4">
        <Button className="h-14 flex-col gap-1 text-xs" onClick={share}>
          <Share2 className="size-5" />
          {t("rahdari.sharePdf")}
        </Button>
        <Button
          variant="outline"
          className="h-14 flex-col gap-1 text-xs"
          nativeButton={false}
          render={<a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" />}
        >
          <MessageCircle className="size-5" />
          {t("rahdari.whatsapp")}
        </Button>
        <Button
          variant="outline"
          className="h-14 flex-col gap-1 text-xs"
          nativeButton={false}
          render={<a href={`/api/challan/${d.id}/pdf?download`} />}
        >
          <Download className="size-5" />
          {t("rahdari.downloadPdf")}
        </Button>
      </div>

      {d.can.acknowledge ? (
        <div className="px-4">
          <Button
            className="h-12 w-full bg-emerald-600 text-base text-white hover:bg-emerald-600/90"
            disabled={ack.isPending}
            onClick={() => ack.mutate({ id: d.id })}
          >
            <CheckCircle2 className="size-5" />
            {t("rahdari.markReceived")}
          </Button>
        </div>
      ) : null}

      {d.acknowledgeable && d.status === "issued" && qr ? (
        <div className="mx-4 flex items-center gap-4 rounded-2xl border bg-white p-4 text-black">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          <img src={qr} alt="" className="size-32 shrink-0" />
          <p className="text-sm">{t("rahdari.scanToConfirm")}</p>
        </div>
      ) : null}

      <div className="space-y-2 px-4">
        {d.billAttachmentId ? (
          <a
            href={`/api/attachments/${d.billAttachmentId}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 items-center gap-2 rounded-xl border bg-card px-4 text-sm font-medium"
          >
            <FileImage className="size-5 text-primary" />
            {t("rahdari.billPhoto")}
          </a>
        ) : null}
        {d.borrowId ? (
          <Link
            href={`/borrows/${d.borrowId}`}
            className="flex h-12 items-center rounded-xl border bg-card px-4 text-sm font-medium"
          >
            {t("rahdari.borrow", { id: d.borrowId })}
          </Link>
        ) : null}
        {d.can.void ? (
          <Button variant="ghost" className="h-11 w-full text-destructive" onClick={() => setVoidOpen(true)}>
            <XCircle className="size-5" />
            {t("rahdari.void")}
          </Button>
        ) : null}
      </div>

      <EntrySheet
        open={voidOpen}
        onOpenChange={setVoidOpen}
        tall={false}
        title={t("rahdari.voidTitle")}
        description={t("rahdari.voidHint")}
        footer={
          <Button
            variant="destructive"
            className="h-12 w-full text-base"
            disabled={voidReason.trim().length < 3 || voidIt.isPending}
            onClick={() => voidIt.mutate({ id: d.id, reason: voidReason.trim() })}
          >
            {t("rahdari.voidConfirm")}
          </Button>
        }
      >
        <Field label={t("rahdari.voidReason")} htmlFor="void-reason">
          <Textarea id="void-reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={2} />
        </Field>
      </EntrySheet>
    </div>
  );
}
