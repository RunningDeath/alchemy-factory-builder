import { execSync } from "node:child_process";
import type { NextConfig } from "next";

/** Commit the build was made from: Vercel names it, a local build asks git */
function buildCommit(): string {
    if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
    try {
        return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
        return "";
    }
}

const config: NextConfig = {
    // Shown in the header and at /version, so a deploy can be checked in the open app
    env: {
        NEXT_PUBLIC_BUILD_COMMIT: buildCommit(),
        NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
    },
};

export default config;
