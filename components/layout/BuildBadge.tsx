import { BUILD_COMMIT, BUILD_SHORT, BUILD_TIME, REPO_URL } from "@/lib/build-info";

/** Short commit of this build, linked to the commit; the build time on hover */
export function BuildBadge() {
    const title = `Build ${BUILD_COMMIT || "local"}${BUILD_TIME ? `, built ${BUILD_TIME.replace("T", " ").slice(0, 16)} UTC` : ""}`;
    const className = "font-mono text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)]";
    if (!BUILD_COMMIT) return <span className={className} title={title}>{BUILD_SHORT}</span>;
    return (
        <a href={`${REPO_URL}/commit/${BUILD_COMMIT}`} target="_blank" rel="noreferrer" className={className} title={title}>
            {BUILD_SHORT}
        </a>
    );
}
