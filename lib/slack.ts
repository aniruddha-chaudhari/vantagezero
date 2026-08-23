/**
 * Posts to a Slack Incoming Webhook if SLACK_WEBHOOK_URL is configured; no-ops otherwise.
 * Alerting must never break the pipeline it's alerting about, so failures are swallowed.
 */
export async function sendSlackAlert(text: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // Best-effort only.
  }
}

/**
 * The per-scrape activity feed - one line per successful collection. Separate from
 * sendSlackAlert() because it scales with the catalog, not with what went wrong: a single
 * `ingest.ts --all` cycle posts one of these for *every* enabled source target, so at
 * catalog size that is a burst of ~100 messages. Slack's Incoming Webhooks rate-limit around
 * one message per second and 429 the rest, and since delivery failures are swallowed by
 * design, a flood doesn't just spam the channel - it can quietly drop the incident alerts
 * that actually matter.
 *
 * So it's opt-in: set SLACK_ACTIVITY_FEED=1 alongside SLACK_WEBHOOK_URL for a live demo or a
 * single-target run. Unattended cron collection and bulk backfills (the catalog resolver)
 * leave it unset and still get incidents and critical buildability alerts in full.
 */
export async function sendSlackActivity(text: string): Promise<void> {
  if (!process.env.SLACK_ACTIVITY_FEED) return;
  await sendSlackAlert(text);
}
