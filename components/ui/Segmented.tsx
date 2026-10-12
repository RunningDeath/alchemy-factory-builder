import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
    value: T;
    label: React.ReactNode;
}

/** Tabs for switching views: fills the width on phones */
export function Segmented<T extends string>({
    options,
    value,
    onChange,
    className,
    label,
}: {
    options: SegmentOption<T>[];
    value: T;
    onChange: (v: T) => void;
    className?: string;
    label?: string;
}) {
    return (
        <div role="tablist" aria-label={label} className={cn("flex rounded-lg border border-[var(--border)] bg-[var(--background)] p-1", className)}>
            {options.map((o) => (
                <button
                    key={o.value}
                    role="tab"
                    type="button"
                    aria-selected={o.value === value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        "flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors",
                        o.value === value ? "bg-[var(--surface-elevated)] text-[var(--accent-gold)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
