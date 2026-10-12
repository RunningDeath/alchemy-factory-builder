"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** A bottom sheet on phones, a centered dialog on larger screens */
export function Sheet({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; className?: string }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", onKey);
        return () => {
            document.body.style.overflow = overflow;
            window.removeEventListener("keydown", onKey);
        };
    }, [open, onClose]);
    if (!open || typeof document === "undefined") return null;
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div
                className={cn(
                    "relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-w-lg sm:rounded-2xl",
                    className,
                )}
            >
                <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                    <h2 className="font-cinzel text-base font-bold text-[var(--accent-gold)]">{title}</h2>
                    <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]" aria-label="Close">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">{children}</div>
            </div>
        </div>,
        document.body,
    );
}
