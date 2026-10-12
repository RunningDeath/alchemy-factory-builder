import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Class names joined, later Tailwind classes winning over earlier ones */
export function cn(...classes: ClassValue[]): string {
    return twMerge(clsx(classes));
}
