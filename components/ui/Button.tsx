import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
    primary: "bg-[var(--accent-gold)] text-[#1a1408] hover:bg-[var(--accent-gold-bright)]",
    secondary: "border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-primary)] hover:border-[var(--accent-gold-dim)]",
    ghost: "text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)]",
    danger: "text-[var(--error)] hover:bg-[var(--error-dim)]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: "sm" | "md" | "icon";
}

/** Buttons are at least 36 px tall (40 px by default): easy to hit with a thumb */
export function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }: ButtonProps) {
    return (
        <button
            type={type}
            className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
                size === "sm" && "h-9 px-3 text-sm",
                size === "md" && "h-10 px-4 text-sm",
                size === "icon" && "h-10 w-10 shrink-0",
                VARIANTS[variant],
                className,
            )}
            {...rest}
        />
    );
}
