/**
 * Public origin for links printed on Rahdari (QR codes). Set APP_URL in
 * production; otherwise the request's own origin is used, which also works
 * when phones reach a dev machine by its LAN address.
 */
export function appOrigin(req: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}
