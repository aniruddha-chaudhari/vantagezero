const REPO = "aniruddha-chaudhari/vantagezero";

/**
 * Dispatches the Heal GitHub Actions workflow for one source target - the same workflow the
 * Collect cron triggers automatically, just fired on demand instead of waiting for the next
 * scheduled tick. This exists because healing itself cannot run inside this app: `bdata
 * scraper heal` needs a writable filesystem and package resolution at request time, and
 * NEXT_RUNTIME is set in every Next.js request context (dev or deployed), so there is no
 * "run the CLI directly" option here the way there is for a plain script. Delegating to the
 * Actions runner - where the CLI already works, proven by the real Collect/Heal cron - is the
 * fix, not a workaround.
 *
 * Silently no-ops without GITHUB_TOKEN, same convention as sendSlackAlert with
 * SLACK_WEBHOOK_URL - a missing optional integration must never break the caller's own
 * success path.
 */
export async function dispatchHealWorkflow(sourceTargetId: string): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return false;

  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/heal.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main", inputs: { sourceTargetId } }),
  });

  return res.status === 204;
}
