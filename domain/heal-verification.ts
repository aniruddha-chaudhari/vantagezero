export interface HealResolutionResponse {
  incident?: { status?: string };
  reingestResult?: {
    ok?: boolean;
    detail?: string;
  } | null;
  verified?: boolean;
}

export function verificationSucceeded(result: HealResolutionResponse): boolean {
  return result.verified === true && result.reingestResult?.ok === true && result.incident?.status === "resolved";
}

export function describeVerificationFailure(result: HealResolutionResponse): string {
  if (result.reingestResult?.detail) return result.reingestResult.detail;
  if (result.reingestResult?.ok === false) return "verification scrape failed validation";
  return "verification response did not confirm a resolved incident";
}
