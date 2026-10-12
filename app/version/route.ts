import { BUILD_COMMIT, BUILD_TIME } from "@/lib/build-info";

export const dynamic = "force-static";

/** Which build is deployed: commit and build time */
export function GET() {
    return Response.json({ commit: BUILD_COMMIT || null, builtAt: BUILD_TIME || null });
}
