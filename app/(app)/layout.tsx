import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { MobileShell } from "@/components/layout/mobile-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const { id, name, username, role } = session.user;
  return (
    <MobileShell user={{ id, name, username: username ?? null, role: role ?? "viewer" }}>
      {children}
    </MobileShell>
  );
}
