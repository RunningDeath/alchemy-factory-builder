import { CodexTabs } from "@/components/layout/CodexTabs";

export default function CodexLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <CodexTabs />
            {children}
        </>
    );
}
