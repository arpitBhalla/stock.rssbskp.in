/** Downscales a phone photo to a JPEG small enough to store (≈150–400 KB). */
export async function compressImage(file: File, maxDim = 1600, quality = 0.72): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read photo"))), "image/jpeg", quality),
  );
}

export async function uploadAttachment(blob: Blob): Promise<number> {
  const form = new FormData();
  form.append("file", blob, "bill.jpg");
  const res = await fetch("/api/attachments", { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { id?: number; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error ?? `Upload failed (${res.status})`);
  return body.id;
}
