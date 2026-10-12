"use client";

import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { useFactoryStore } from "@/store/useFactoryStore";
import { Button } from "@/components/ui/Button";

/** Adds the item as a product of the current factory (a new one if there is none) and opens the planner */
export function PlanThisButton({ itemId }: { itemId: string }) {
    const router = useRouter();
    const plan = () => {
        const store = useFactoryStore.getState();
        const id = store.activeFactoryId ?? store.addFactory();
        const factory = useFactoryStore.getState().factories.find((f) => f.id === id);
        const targets = factory?.targets ?? [];
        if (!targets.some((t) => t.item === itemId)) store.setTargets(id, [...targets.filter((t) => t.item), { item: itemId, rate: 10 }]);
        router.push("/");
    };
    return (
        <Button variant="primary" onClick={plan}>
            <FlaskConical className="h-4 w-4" /> Plan this
        </Button>
    );
}
