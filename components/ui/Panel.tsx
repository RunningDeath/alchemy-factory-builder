import { cn } from "@/lib/utils";

/** A card: the basic container of every page */
export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={cn("rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm", className)} {...rest}>
            {children}
        </div>
    );
}

/** Heading row of a panel, with optional actions on the right */
export function PanelHeader({ title, subtitle, actions, className }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
    return (
        <div className={cn("flex items-start justify-between gap-3 px-4 pt-4", className)}>
            <div className="min-w-0">
                <h2 className="font-cinzel text-base font-bold text-[var(--accent-gold)]">{title}</h2>
                {subtitle && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
    );
}
