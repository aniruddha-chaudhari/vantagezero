/**
 * The CI heal loop orchestrator (master-plan v3 §12). Talks to Vantage only over its own
 * HTTP API - never touches the database directly - so it runs identically whether it's
 * invoked locally against a dev server or from GitHub Actions against the deployed app.
 * The only extra credential it needs is BRIGHTDATA_API_KEY, for the `bdata scraper
 * heal`/`approve` calls themselves (brightdata/client.ts already reads that env var).
 *
 * Usage:
 *   tsx scripts/heal-loop.ts                                    process every eligible incident
 *   tsx scripts/heal-loop.ts --force --source-target-id <id>    heal one incident regardless of
 *                                                                rate discipline (manual/demo run,
 *                                                                per the plan's "the demo loop
 *                                                                reproduces a failure by hand")
 *   tsx scripts/heal-loop.ts --max-incidents 1                  cap a system-wide automatic run
 *   tsx scripts/heal-loop.ts --force --mpns USB4105-GF-A        heal only incidents for these MPNs
 *
 * Required env: INGEST_API_TOKEN, BRIGHTDATA_API_KEY. Optional: APP_BASE_URL (defaults to
 * localhost:3000), SLACK_WEBHOOK_URL (escalation alerts no-op without it).
 */
import { approveHeal, healScraper } from "@/brightdata/client";
import { evaluateHealPreview, type HealTarget } from "@/brightdata/heal";
import { selectHealCandidates } from "@/domain/heal-queue";
import { sendSlackAlert } from "@/lib/slack";

const APP_BASE_URL = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const INGEST_API_TOKEN = process.env.INGEST_API_TOKEN;

if (!INGEST_API_TOKEN) {
  throw new Error("INGEST_API_TOKEN is not set");
}

interface OpenIncident {
  id: string;
  sourceTargetId: string;
  collectorId: string | null;
  incidentType: string;
  openedAt: string;
  notes: string | null;
  sourceTarget: HealTarget;
  eligibleForAutoHeal: boolean;
  ineligibleReason: string | null;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${INGEST_API_TOKEN}`, "Content-Type": "application/json" };
}

async function fetchOpenIncidents(mpns?: string[]): Promise<OpenIncident[]> {
  const query = mpns?.length ? `?${new URLSearchParams({ mpns: mpns.join(",") })}` : "";
  const res = await fetch(`${APP_BASE_URL}/api/incidents/open${query}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET /api/incidents/open failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.incidents;
}

async function fetchLatestValidSnapshot(sourceTargetId: string) {
  const res = await fetch(`${APP_BASE_URL}/api/observations/latest-valid?source_target_id=${sourceTargetId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`GET /api/observations/latest-valid failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function resolveIncidentApi(incidentId: string, body: Record<string, unknown>) {
  const res = await fetch(`${APP_BASE_URL}/api/incidents/${incidentId}/resolve`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /api/incidents/${incidentId}/resolve failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Never states the expected value on purpose (§12) - that would bias the heal toward
 * continuity in a tool whose entire purpose is detecting when a value genuinely changes. */
function buildHealPrompt(incident: OpenIncident, sharpen: boolean): string {
  const { mpn, sourceName } = incident.sourceTarget;
  let prompt =
    `The extraction for "${mpn}" on ${sourceName} is failing: ${incident.notes ?? incident.incidentType}. ` +
    `Re-extract this product's fields from the current page, preserving the existing output field names exactly. ` +
    `Return null for any field genuinely absent from the page - never fabricate a value.`;
  if (sharpen) {
    prompt +=
      " The previous fix attempt was rejected: it either extracted the wrong product or dropped a field " +
      "that used to be present. Double-check you are reading from the correct product's data block only.";
  }
  return prompt.slice(0, 1000);
}

interface HealAttemptResult {
  prompt: string;
  rawPreview: unknown;
  evaluation: ReturnType<typeof evaluateHealPreview>;
}

async function attemptHeal(incident: OpenIncident, sharpen: boolean): Promise<HealAttemptResult> {
  const prompt = buildHealPrompt(incident, sharpen);
  console.log(`  heal prompt: ${prompt}`);
  const startedAt = Date.now();
  console.log(`  Bright Data heal started; this normally takes several minutes...`);

  const healResult = (await healScraper(incident.collectorId!, incident.sourceTarget.sourceUrl, prompt)) as {
    preview_result?: unknown;
  };
  console.log(`  Bright Data heal returned after ${Math.round((Date.now() - startedAt) / 1000)}s.`);
  if (healResult.preview_result == null) {
    throw new Error("bdata scraper heal did not return a preview_result");
  }

  const snapshot = await fetchLatestValidSnapshot(incident.sourceTargetId);
  const lastValid = snapshot.distributor ?? snapshot.manufacturer ?? null;

  const evaluation = evaluateHealPreview(healResult.preview_result, incident.sourceTarget, lastValid);
  console.log(`  gate decision: ${evaluation.decision}`);
  for (const r of evaluation.results) {
    console.log(`    - ${r.gate}: ${r.passed ? "pass" : "FAIL"} (${r.reason})`);
  }

  return { prompt, rawPreview: healResult.preview_result, evaluation };
}

async function processIncident(incident: OpenIncident): Promise<void> {
  const label = `${incident.sourceTarget.mpn} / ${incident.sourceTarget.sourceName}`;
  console.log(`\n=== ${label} (incident ${incident.id}) ===`);

  if (!incident.collectorId) {
    console.log("  skip: no collector_id on this source target");
    return;
  }

  let result = await attemptHeal(incident, false);

  if (result.evaluation.decision === "auto_reject") {
    console.log("  rejecting first preview, retrying once with a sharper prompt...");
    await approveHeal(incident.collectorId, incident.sourceTarget.sourceUrl, { reject: true });
    result = await attemptHeal(incident, true);
  }

  const { prompt, evaluation } = result;

  if (evaluation.decision === "auto_approve") {
    // autoSave persists the healed template to production. Approving without it lets the
    // paused job resume but leaves the collector's saved template untouched, so the next
    // cron cycle re-breaks on the same selector and re-heals the identical break.
    await approveHeal(incident.collectorId, incident.sourceTarget.sourceUrl, { reject: false, autoSave: true });
    await resolveIncidentApi(incident.id, {
      resolution: "auto_approved",
      status: "resolved",
      healPrompt: prompt,
      gateResultsJson: evaluation.results,
      triggeredBy: "cron",
    });
    console.log(`  -> AUTO-APPROVED, re-verified, incident resolved.`);
    return;
  }

  if (evaluation.decision === "auto_reject") {
    await approveHeal(incident.collectorId, incident.sourceTarget.sourceUrl, { reject: true });
    await resolveIncidentApi(incident.id, {
      resolution: "auto_rejected",
      status: "rejected",
      healPrompt: prompt,
      gateResultsJson: evaluation.results,
      triggeredBy: "cron",
    });
    console.log(`  -> AUTO-REJECTED after a sharper retry - still broken, left for the next cron cycle.`);
    return;
  }

  // escalate - leave Bright Data's own pending-approval state untouched for a human to decide.
  await resolveIncidentApi(incident.id, {
    resolution: "auto_rejected",
    status: "awaiting_approval",
    healPrompt: prompt,
    gateResultsJson: evaluation.results,
    triggeredBy: "cron",
  });
  const failedGates = evaluation.results
    .filter((g) => !g.passed)
    .map((g) => `${g.gate}: ${g.reason}`)
    .join("\n");
  await sendSlackAlert(
    `*Heal escalation* — ${label}\n` +
      `The healed preview can't be trusted automatically:\n${failedGates}\n` +
      `Review at ${APP_BASE_URL}/dashboard/sources`,
  );
  console.log(`  -> ESCALATED. Slack alert sent, awaiting human approval on /dashboard/sources.`);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const idFlagIndex = args.indexOf("--source-target-id");
  const onlySourceTargetId = idFlagIndex >= 0 ? args[idFlagIndex + 1] : undefined;
  const mpnsFlagIndex = args.indexOf("--mpns");
  const onlyMpns = mpnsFlagIndex >= 0
    ? args[mpnsFlagIndex + 1]?.split(",").map((mpn) => mpn.trim()).filter(Boolean)
    : undefined;
  const maxFlagIndex = args.indexOf("--max-incidents");
  const maxIncidentsRaw = maxFlagIndex >= 0 ? args[maxFlagIndex + 1] : undefined;
  const maxIncidents = maxIncidentsRaw == null ? undefined : Number(maxIncidentsRaw);
  if (maxIncidents != null && (!Number.isInteger(maxIncidents) || maxIncidents <= 0)) {
    throw new Error(`--max-incidents must be a positive integer, received "${maxIncidentsRaw}"`);
  }

  const incidents = await fetchOpenIncidents(onlyMpns);
  const candidates = selectHealCandidates(incidents, {
    force,
    sourceTargetId: onlySourceTargetId,
    maxIncidents,
  });

  const duplicateCount = incidents.filter((i) => i.collectorId != null).length -
    new Set(incidents.filter((i) => i.collectorId != null).map((i) => i.collectorId)).size;
  if (duplicateCount > 0) {
    console.log(`Collapsed ${duplicateCount} duplicate incident(s) sharing a collector.`);
  }

  if (candidates.length === 0) {
    console.log("No eligible incidents to heal.");
    return;
  }

  console.log(`Processing ${candidates.length} incident(s)${force ? " (--force)" : ""}...`);
  for (const incident of candidates) {
    try {
      await processIncident(incident);
    } catch (err) {
      // One incident's failure must never take down the whole run or redden CI.
      console.error(`  error while processing ${incident.sourceTarget.mpn}:`, err instanceof Error ? err.message : err);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("heal-loop fatal error:", err);
    process.exit(0); // exit green regardless - an escalation or a caught error here is not a CI failure
  });
