"use client";

import { useEffect, useState } from "react";
import { useFactoryStore } from "./useFactoryStore";

/** True once the saved factories have loaded from the browser (pages render a placeholder until then) */
export function useHydrated(): boolean {
    const [hydrated, setHydrated] = useState(false);
    useEffect(() => {
        if (useFactoryStore.persist.hasHydrated()) setHydrated(true);
        return useFactoryStore.persist.onFinishHydration(() => setHydrated(true));
    }, []);
    return hydrated;
}

/** The active factory, creating a first one when there is none */
export function useEnsureFactory(hydrated: boolean): void {
    const count = useFactoryStore((s) => s.factories.length);
    const active = useFactoryStore((s) => s.activeFactoryId);
    const addFactory = useFactoryStore((s) => s.addFactory);
    const setActive = useFactoryStore((s) => s.setActiveFactory);
    const first = useFactoryStore((s) => s.factories[0]?.id);
    useEffect(() => {
        if (!hydrated) return;
        if (count === 0) addFactory();
        else if (!active && first) setActive(first);
    }, [hydrated, count, active, first, addFactory, setActive]);
}
