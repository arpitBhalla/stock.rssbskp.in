export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh grid place-items-center bg-muted/30 px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      {children}
    </div>
  );
}
