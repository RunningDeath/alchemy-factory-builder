"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "system" | "light" | "dark";
const ORDER: Theme[] = ["system", "dark", "light"];
const ICON = { system: Monitor, dark: Moon, light: Sun };

function readTheme(): Theme {
    try {
        const saved = localStorage.getItem("theme");
        return saved === "light" || saved === "dark" ? saved : "system";
    } catch {
        return "system";
    }
}

/** Cycles system → dark → light; remembered in this browser */
export function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>("system");
    useEffect(() => setTheme(readTheme()), []);

    const next = () => {
        const value = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
        setTheme(value);
        try {
            if (value === "system") localStorage.removeItem("theme");
            else localStorage.setItem("theme", value);
        } catch {}
        if (value === "system") delete document.documentElement.dataset.theme;
        else document.documentElement.dataset.theme = value;
    };
    const Icon = ICON[theme];
    return (
        <button
            onClick={next}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]"
            aria-label={`Theme: ${theme}. Change theme`}
            title={`Theme: ${theme}`}
        >
            <Icon className="h-5 w-5" />
        </button>
    );
}
