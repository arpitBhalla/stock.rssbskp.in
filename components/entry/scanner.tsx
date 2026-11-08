"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff } from "lucide-react";
import { useT } from "@/components/providers/i18n-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Minimal typing for the Shape Detection API (Chrome on Android).
type DetectedBarcode = { rawValue: string };
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
};

/**
 * Camera barcode/QR reader. Uses the native BarcodeDetector where available
 * (Android Chrome) and falls back to ZXing (iPhone Safari). A typed code is
 * always possible for broken labels or no camera.
 */
export function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const done = useRef(false);
  const onCodeRef = useRef(onCode);
  const [failed, setFailed] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    onCodeRef.current = onCode;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let stop = () => {};
    const emit = (code: string) => {
      if (done.current || !code) return;
      done.current = true;
      navigator.vibrate?.(40);
      onCodeRef.current(code.trim());
    };

    (async () => {
      try {
        const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
        if (Detector) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
          if (cancelled) return stream.getTracks().forEach((tr) => tr.stop());
          video.srcObject = stream;
          await video.play();
          const detector = new Detector();
          let timer: ReturnType<typeof setTimeout>;
          const tick = async () => {
            if (cancelled || done.current) return;
            try {
              const [hit] = await detector.detect(video);
              if (hit) return emit(hit.rawValue);
            } catch {
              /* frame not ready */
            }
            timer = setTimeout(tick, 150);
          };
          void tick();
          stop = () => {
            clearTimeout(timer);
            stream.getTracks().forEach((tr) => tr.stop());
          };
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: "environment" } }, audio: false },
            video,
            (result) => {
              if (result) emit(result.getText());
            },
          );
          if (cancelled) return controls.stop();
          stop = () => controls.stop();
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
        {failed ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/80">
            <div className="space-y-2">
              <CameraOff className="mx-auto size-8" />
              <p>{t("scan.noCamera")}</p>
            </div>
          </div>
        ) : (
          <>
            <video ref={videoRef} muted playsInline className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
          </>
        )}
      </div>
      <p className="text-center text-sm text-muted-foreground">{t("scan.hint")}</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) onCodeRef.current(typed.trim());
        }}
      >
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={t("scan.typeCode")}
          autoCapitalize="characters"
          autoCorrect="off"
          className="h-11"
        />
        <Button type="submit" className="h-11 px-4" disabled={!typed.trim()}>
          {t("scan.find")}
        </Button>
      </form>
    </div>
  );
}
