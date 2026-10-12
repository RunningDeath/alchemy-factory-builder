import { cn } from "@/lib/utils";

/** A labelled on/off switch; the whole row is the hit area */
export function Switch({
    checked,
    onChange,
    label,
    hint,
    disabled,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: React.ReactNode;
    hint?: React.ReactNode;
    disabled?: boolean;
}) {
    return (
        <label className={cn("flex min-h-10 cursor-pointer items-center justify-between gap-3 py-1", disabled && "pointer-events-none opacity-40")}>
            <span className="min-w-0">
                <span className="block text-sm text-[var(--text-primary)]">{label}</span>
                {hint && <span className="block text-xs text-[var(--text-muted)]">{hint}</span>}
            </span>
            <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
            <span
                aria-hidden
                className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--accent-gold)]",
                    checked ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]" : "border-[var(--border)] bg-[var(--background)]",
                )}
            >
                <span className={cn("absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all", checked ? "left-[23px]" : "left-[3px]")} />
            </span>
        </label>
    );
}
