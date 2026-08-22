const REPO = "aniruddha-chaudhari/vantagezero";

async function dispatchWorkflow(workflowFile: string, inputs: Record<string, string>): Promise<boolean> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return false;

  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflowFile}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main", inputs }),
  });

  return res.status === 204;
}

/**
 * Dispatches the Collect workflow scoped to specific MPNs - what "Refresh data" actually
 * triggers now. Collection cannot run synchronously inside this app: a multi-source refresh
 * genuinely took over two minutes against live Bright Data and hit Vercel's hard function
 * timeout (FUNCTION_INVOCATION_TIMEOUT), which surfaces to the browser as a platform HTML
 * error page instead of JSON - not a bug in the ingest logic, a mismatch between "scraping
 * takes as long as it takes" and "a serverless request has a ceiling." The Actions runner has
 * no such ceiling.
 *
 * This also means the button no longer waits for a result inline - it triggers a real run and
 * the UI points at the Actions tab instead of blocking on a response. The Collect workflow
 * performs its own MPN-scoped heal step after ingestion, so this one dispatch is the complete
 * collect -> detect -> heal -> verify chain.
 */
export async function dispatchCollectWorkflow(mpns: string[]): Promise<boolean> {
  return dispatchWorkflow("collect.yml", { mpns: mpns.join(",") });
}

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
  return dispatchWorkflow("heal.yml", { sourceTargetId });
}
