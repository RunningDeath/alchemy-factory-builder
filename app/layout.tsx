import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const cinzel = Cinzel({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-cinzel-face" });

export const metadata: Metadata = {
    title: { default: "Alchemy Factory Builder", template: "%s | Alchemy Factory Builder" },
    description: "Production planner, module generator and blueprint exporter for Alchemy Factory.",
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: [
        { media: "(prefers-color-scheme: dark)", color: "#14111c" },
        { media: "(prefers-color-scheme: light)", color: "#f7f3ea" },
    ],
};

/** Applies the saved theme before the first paint (no flash) */
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning className={`${inter.variable} ${cinzel.variable}`}>
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeScript }} />
            </head>
            <body className="min-h-dvh antialiased">
                <AppShell>{children}</AppShell>
            </body>
        </html>
    );
}
