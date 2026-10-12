"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    suffix?: string;
    className?: string;
}

/** A number with − and + buttons; typing is committed on blur or Enter */
export function NumberField({ value, onChange, min = 0, max = Infinity, step = 1, label, suffix, className }: Props) {
    const [text, setText] = useState(String(value));
    useEffect(() => setText(String(value)), [value]);
    const clamp = (v: number) => Math.min(max, Math.max(min, v));
    const commit = () => {
        const parsed = parseFloat(text.replace(",", "."));
        if (Number.isFinite(parsed)) onChange(clamp(parsed));
        else setText(String(value));
    };
    // Round away floating point noise from repeated steps
    const stepBy = (d: number) => onChange(clamp(Math.round((value + d) * 1000) / 1000));
    return (
        <div className={cn("flex h-10 items-stretch overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--background)]", className)}>
            <button
                type="button"
                onClick={() => stepBy(-step)}
                disabled={value <= min}
                className="flex w-10 shrink-0 items-center justify-center text-[var(--text-secondary)] disabled:opacity-30"
                aria-label={`Decrease ${label ?? ""}`}
            >
                <Minus className="h-4 w-4" />
            </button>
            <input
                type="number"
                inputMode="decimal"
                value={text}
                aria-label={label}
                onChange={(e) => setText(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="w-full min-w-0 bg-transparent text-center text-sm font-semibold text-[var(--text-primary)] outline-none"
            />
            {suffix && <span className="flex items-center pr-1 text-xs text-[var(--text-muted)]">{suffix}</span>}
            <button
                type="button"
                onClick={() => stepBy(step)}
                disabled={value >= max}
                className="flex w-10 shrink-0 items-center justify-center text-[var(--text-secondary)] disabled:opacity-30"
                aria-label={`Increase ${label ?? ""}`}
            >
                <Plus className="h-4 w-4" />
            </button>
        </div>
    );
}
