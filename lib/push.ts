import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { isLocale, makeT, type Translate } from "@/lib/i18n";

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

export const vapidPublicKey = publicKey && privateKey ? publicKey : null;

if (vapidPublicKey) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@stock.local",
    publicKey!,
    privateKey!,
  );
}

export type PushPayload = { title: string; body: string; url: string; tag?: string };

/** Sends to every device of the given users, in each device's language. */
export async function sendPush(
  userIds: string[],
  build: (t: Translate) => PushPayload,
) {
  if (!vapidPublicKey || !userIds.length) return;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, [...new Set(userIds)]));

  await Promise.all(
    subs.map(async (s) => {
      const payload = build(makeT(isLocale(s.locale) ? s.locale : "en"));
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 },
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
        } else {
          console.error("[push]", status, (e as Error).message);
        }
      }
    }),
  );
}
