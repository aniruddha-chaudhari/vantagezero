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
