import { ingestSourceTarget } from "@/brightdata/ingestion";

/** Usage: npm run ingest -- <sourceTargetId> */
async function main() {
  const sourceTargetId = process.argv[2];
  if (!sourceTargetId) {
    throw new Error("usage: npm run ingest -- <sourceTargetId>");
  }

  const result = await ingestSourceTarget(sourceTargetId, { triggeredBy: "manual" });

  if (result.ok) {
    console.log("Observation stored:", result);
  } else {
    console.error("Incident opened:", result);
    process.exitCode = 1;
  }
}

main().finally(() => process.exit());
