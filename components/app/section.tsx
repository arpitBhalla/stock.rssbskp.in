import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageTitle({
  title,
  back,
  action,
}: {
  title: React.ReactNode;
  back?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
      {back ? (
        <Link
          href={back}
          aria-label="Back"
          className="-ml-2 grid size-10 shrink-0 place-items-center rounded-full active:bg-foreground/5"
        >
          <ChevronLeft className="size-6" />
        </Link>
      ) : null}
      <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight">{title}</h1>
      {action}
    </div>
  );
}

export function Section({
  title,
  href,
  hrefLabel,
  children,
  className,
}: {
  title: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("px-4", className)}>
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        {href ? (
          <Link href={href} className="text-sm font-medium text-primary">
            {hrefLabel}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Rounded card holding divided rows. */
export function ListCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("divide-y overflow-hidden rounded-xl border bg-card", className)}>{children}</div>;
}

export function ListRow({
  href,
  onClick,
  children,
  className,
  chevron = true,
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  chevron?: boolean;
}) {
  const inner = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      {chevron && (href || onClick) ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" /> : null}
    </>
  );
  const cls = cn("flex min-h-14 w-full items-center gap-2 px-4 py-2.5 text-left", (href || onClick) && "active:bg-foreground/5", className);
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
