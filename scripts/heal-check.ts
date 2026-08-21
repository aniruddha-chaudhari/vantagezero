/**
 * Standalone gate-check CLI (master-plan v3 §12):
 *
 *   tsx scripts/heal-check.ts --preview preview.json --source-target-id <id>
 *
 * Reads a healed preview (the `preview_result` from `bdata scraper heal`, saved to a file)
 * and fetches the source target + last-valid observation from Vantage's API, then runs the
 * exact same evaluateHealPreview() gate logic scripts/heal-loop.ts uses. Exit code is the
 * contract a shell-scripted CI step can act on directly:
 *
 *   exit 0 -> auto_approve   (bdata scraper approve <id> --auto-save)
 *   exit 1 -> auto_reject    (bdata scraper approve <id> --reject, then reheal)
 *   exit 2 -> escalate       (leave pending, Slack alert, workflow still exits green)
 *
 * --auto-save on the approve path is what persists the healed template to production;
 * without it the collector reverts and the same break recurs on the next cycle.
 *
 * Required env: INGEST_API_TOKEN. Optional: APP_BASE_URL (defaults to localhost:3000).
 */
import { readFileSync } from "node:fs";

import { evaluateHealPreview } from "@/brightdata/heal";

const APP_BASE_URL = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const INGEST_API_TOKEN = process.env.INGEST_API_TOKEN;

function readArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const previewPath = readArg("--preview");
  const sourceTargetId = readArg("--source-target-id");
  if (!previewPath || !sourceTargetId) {
    console.error("usage: tsx scripts/heal-check.ts --preview <file.json> --source-target-id <id>");
    process.exit(2);
  }
  if (!INGEST_API_TOKEN) {
    console.error("INGEST_API_TOKEN is not set");
    process.exit(2);
  }

  const rawPreview = JSON.parse(readFileSync(previewPath!, "utf8"));

  const res = await fetch(`${APP_BASE_URL}/api/observations/latest-valid?source_target_id=${sourceTargetId}`, {
    headers: { Authorization: `Bearer ${INGEST_API_TOKEN}` },
  });
  if (!res.ok) {
    console.error(`GET /api/observations/latest-valid failed: ${res.status} ${await res.text()}`);
    process.exit(2);
  }
  const snapshot = await res.json();
  const lastValid = snapshot.distributor ?? snapshot.manufacturer ?? null;

  const evaluation = evaluateHealPreview(rawPreview, snapshot.sourceTarget, lastValid);
  console.log(JSON.stringify(evaluation, null, 2));

  if (evaluation.decision === "auto_approve") process.exit(0);
  if (evaluation.decision === "auto_reject") process.exit(1);
  process.exit(2); // escalate
}

main().catch((err) => {
  console.error("heal-check error:", err instanceof Error ? err.message : err);
  process.exit(2);
});
