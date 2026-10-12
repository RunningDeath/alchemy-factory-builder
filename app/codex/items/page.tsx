import type { Metadata } from "next";
import { ItemBrowser } from "@/components/codex/ItemBrowser";

export const metadata: Metadata = {
    title: "Items",
    description: "Every item in Alchemy Factory: price, recipes that make it and recipes that use it.",
};

export default function ItemsPage() {
    return (
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6">
            <h1 className="font-cinzel text-2xl font-bold text-[var(--accent-gold)] sm:text-3xl">Items</h1>
            <ItemBrowser />
        </div>
    );
}
