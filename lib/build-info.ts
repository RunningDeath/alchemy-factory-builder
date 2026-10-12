/** The build this page comes from (set in next.config.ts) */
export const BUILD_COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "";
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
export const BUILD_SHORT = BUILD_COMMIT ? BUILD_COMMIT.slice(0, 7) : "dev";
export const REPO_URL = "https://github.com/RunningDeath/alchemy-factory-builder";
