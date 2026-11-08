import { asc, inArray } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db";
import { items } from "@/db/schema";
import { getT } from "@/lib/i18n/server";
import { ITEM_QR_PREFIX } from "@/lib/item-code";
import { PageTitle } from "@/components/app/section";
import { PrintButton } from "./print-button";

/** Printable sheet of item QR labels. ?ids=1,2,3 limits it to some items. */
export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const t = await getT();
  const ids = (await searchParams).ids
    ?.split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
  const rows = await db
    .select({ id: items.id, name: items.name, sku: items.sku, barcode: items.barcode })
    .from(items)
    .where(ids?.length ? inArray(items.id, ids) : undefined)
    .orderBy(asc(items.name));
  const labels = await Promise.all(
    rows.map(async (i) => ({
      ...i,
      // Items with a printed barcode keep it; others get a STOCK:ITEM: QR.
      qr: await QRCode.toDataURL(i.barcode ?? `${ITEM_QR_PREFIX}${i.sku}`, { margin: 0, width: 240 }),
    })),
  );

  return (
    <div className="pb-6 print:p-0">
      <div className="print:hidden">
        <PageTitle title={t("manage.labels")} back="/manage/items" action={<PrintButton label={t("common.print")} />} />
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 print:grid-cols-3 print:gap-0 print:px-0">
        {labels.map((l) => (
          <div key={l.id} className="flex items-center gap-2 rounded-lg border bg-white p-2 text-black break-inside-avoid print:rounded-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
            <img src={l.qr} alt="" className="size-20 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">{l.name}</p>
              <p className="font-mono text-xs">{l.sku}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
