import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { ScraperRunFailed } from "@/domain/errors";

const execFileAsync = promisify(execFile);

/**
 * Wraps the `bdata` CLI rather than reimplementing Bright Data's HTTP API.
 * The API key is passed explicitly on every call (`-k`) instead of relying on
 * this machine's `bdata login` session, so the same code path works from a
 * deployed server as it does from this terminal.
 */
function apiKey(): string {
  const key = process.env.BRIGHTDATA_API_KEY;
  if (!key) throw new Error("BRIGHTDATA_API_KEY is not set");
  return key;
}

/**
 * execFile with shell:true on Windows joins the arg array into a command line by
 * naively concatenating with spaces - it does NOT quote args that contain spaces
 * themselves, so a multi-word arg (e.g. a search query) silently splits into
 * multiple CLI arguments. Quote anything with whitespace ourselves.
 */
function quoteForWindowsShell(arg: string): string {
  return /\s/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/**
 * Node's child_process errors embed the full command line (including our -k <key> flag)
 * in .message. Every runCli() caller eventually lets error messages reach logs, thrown
 * VantageValidationError.details, or console output - so the key must never survive past
 * this function, regardless of what any caller does with the error afterward.
 */
function redactKey(message: string, key: string): string {
  return message.split(key).join("***REDACTED***");
}

async function runCli(args: string[]): Promise<string> {
  const isWindows = process.platform === "win32";
  const key = apiKey();
  const rawArgs = ["-y", "-p", "@brightdata/cli", "bdata", ...args, "-k", key, "--json"];
  const finalArgs = isWindows ? rawArgs.map(quoteForWindowsShell) : rawArgs;

  try {
    const { stdout } = await execFileAsync("npx", finalArgs, {
      maxBuffer: 1024 * 1024 * 32,
      shell: isWindows,
    });
    return stdout;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(redactKey(message, key));
  }
}

export interface ScraperRunResult {
  raw: unknown;
  collectorId: string;
  url: string;
}

const API_BASE = "https://api.brightdata.com";

/**
 * Runs an existing collector against one URL and returns its parsed JSON output.
 *
 * Branches on runtime rather than always using one transport. `NEXT_RUNTIME` is set by
 * Next.js/Vercel whenever code runs inside the deployed app (e.g. POST /api/catalog/resolve,
 * a user confirming a searched candidate) - there, spawning the `bdata` CLI fails outright:
 * no writable filesystem, no package resolution at request time. Everywhere else (the CLI
 * script, the CI runner, this terminal) keeps using the CLI unchanged - that path is already
 * proven by the Collect/Heal cron and there is no reason to touch it.
 */
export async function runScraper(collectorId: string, url: string): Promise<ScraperRunResult> {
  if (process.env.NEXT_RUNTIME) {
    return runScraperHttp(collectorId, url);
  }

  let stdout: string;
  try {
    stdout = await runCli(["scraper", "run", collectorId, url]);
  } catch (err) {
    throw new ScraperRunFailed(`Bright Data run failed for collector ${collectorId}`, {
      collectorId,
      url,
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new ScraperRunFailed(`Bright Data run for collector ${collectorId} did not return valid JSON`, {
      collectorId,
      url,
      stdout: stdout.slice(0, 2000),
    });
  }

  return { raw: parsed, collectorId, url };
}

/**
 * HTTP equivalent of `bdata scraper run <id> <url>`, matching the CLI's own single-URL path
 * (@brightdata/cli dist/commands/scraper.js `handle_run_scraper`): the *immediate* pair, not
 * the batch `/dca/trigger` + `/dca/dataset` pair, which queues behind other account work and
 * can sit unstarted for minutes.
 *   POST /dca/trigger_immediate?collector=<id>  with {url}   -> { response_id }
 *   GET  /dca/get_result?response_id=<id>                    -> 202 while pending,
 *                                                                200 with the rows once done
 * `timeoutMs` stays below the route's `maxDuration` so a slow collector surfaces as a
 * ScraperRunFailed (which opens an incident) rather than the platform killing the function
 * mid-write.
 */
async function runScraperHttp(collectorId: string, url: string, timeoutMs = 100_000): Promise<ScraperRunResult> {
  const pollMs = 3_000;
  const key = apiKey();
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const fail = (message: string, extra: Record<string, unknown> = {}) =>
    new ScraperRunFailed(message, { collectorId, url, ...extra });

  let responseId: string;
  try {
    const res = await fetch(`${API_BASE}/dca/trigger_immediate?collector=${encodeURIComponent(collectorId)}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
    const body = JSON.parse(text) as { response_id?: string };
    if (!body.response_id) throw new Error(`trigger returned no response_id: ${text.slice(0, 300)}`);
    responseId = body.response_id;
  } catch (err) {
    throw fail(`Bright Data run failed for collector ${collectorId}`, {
      cause: err instanceof Error ? redactKey(err.message, key) : String(err),
    });
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${API_BASE}/dca/get_result?response_id=${encodeURIComponent(responseId)}`, { headers });
    const text = await res.text();

    if (res.status === 202) {
      await new Promise((r) => setTimeout(r, pollMs));
      continue;
    }
    if (!res.ok) {
      throw fail(`Bright Data run failed for collector ${collectorId}`, {
        responseId,
        cause: `${res.status} ${text.slice(0, 300)}`,
      });
    }

    try {
      return { raw: JSON.parse(text), collectorId, url };
    } catch {
      throw fail(`Bright Data run for collector ${collectorId} did not return valid JSON`, {
        responseId,
        stdout: text.slice(0, 2000),
      });
    }
  }

  throw fail(`Bright Data run for collector ${collectorId} did not finish within ${timeoutMs}ms`, { responseId });
}

/**
 * Runs a web search (SERP) query, used for resolving MPNs to distributor/manufacturer PDP URLs.
 *
 * Uses Bright Data's HTTP SERP endpoint directly rather than `bdata search`, because this is
 * the one collection path a *user* triggers synchronously from the deployed app ("Search for
 * this part"). Spawning the CLI needs a writable filesystem and package resolution at request
 * time, which a serverless function does not provide - so the CLI version worked locally and
 * failed in production. Everything else here still goes through the CLI, which is correct:
 * those paths only ever run from a terminal or a CI runner.
 *
 * `brd_json=1` makes the SERP API return parsed JSON with an `organic[]` array - the exact
 * shape callers already expect - instead of raw HTML we would have to scrape ourselves.
 * Mirrors the CLI's own construction (see @brightdata/cli dist/commands/search.js).
 */
const SERP_ENDPOINT = "https://api.brightdata.com/request";

export async function searchWeb(query: string): Promise<unknown> {
  const zone = process.env.BRIGHTDATA_SERP_ZONE;
  if (!zone) {
    throw new Error("BRIGHTDATA_SERP_ZONE is not set (the Bright Data zone name used for SERP requests)");
  }

  const searchUrl = `https://www.google.com/search?${new URLSearchParams({ q: query, brd_json: "1" })}`;

  const res = await fetch(SERP_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ zone, url: searchUrl, format: "raw" }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Bright Data SERP request failed: ${res.status} ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Bright Data SERP request did not return JSON: ${text.slice(0, 300)}`);
  }
}

export type HealProgress = {
  id?: string;
  step?: string;
  completed_steps?: string[];
  status?: string;
  preview_result?: unknown;
  [key: string]: unknown;
};

const MAX_CODE_FIXER_ATTEMPTS = 2;

export function describeHealFailure(progress: HealProgress): string {
  const details = [
    `status: ${progress.status ?? "unknown"}`,
    progress.step ? `step: ${progress.step}` : null,
    progress.id ? `job: ${progress.id}` : null,
    progress.completed_steps?.length ? `completed: ${progress.completed_steps.join(", ")}` : null,
  ].filter(Boolean);
  return details.join("; ");
}

export function shouldRetryHealFailure(progress: HealProgress, attempt: number): boolean {
  return (
    attempt < MAX_CODE_FIXER_ATTEMPTS &&
    progress.step === "code_fixer" &&
    (progress.status === "error" || progress.status === "failed")
  );
}

/**
 * Builds the self-healing input explicitly. The Bright Data CLI currently accepts
 * `--url`, but only uses it when printing the suggested follow-up command; its
 * refactor request sends `custom_input: []`. For collectors shared by many product
 * pages, that makes the AI repair and preview whichever sample URL is stored on the
 * collector instead of the broken source target.
 */
export function buildHealRequest(url: string, prompt: string) {
  return { prompt, custom_input: [{ url }] };
}

const TERMINAL_REFACTOR_STATUSES = ["done", "failed", "error", "cancelled"];

/** Single, unmodified read of a collector's current refactor job - used to check *which*
 * job (by `id`) is sitting on a collector before acting on it, so a caller can tell a fresh
 * job apart from one left over from an earlier or overlapping heal attempt. */
async function fetchRefactorProgress(collectorId: string, headers: Record<string, string>): Promise<HealProgress> {
  const url = `${API_BASE}/dca/collectors/${encodeURIComponent(collectorId)}/refactor_template/progress`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Failed to read Bright Data self-healing progress for collector ${collectorId}: ${res.status} ${text.slice(0, 500)}`,
    );
  }
  try {
    return JSON.parse(text) as HealProgress;
  } catch {
    throw new Error(
      `Bright Data self-healing progress for collector ${collectorId} was not valid JSON: ${text.slice(0, 500)}`,
    );
  }
}

/** Polls a collector's refactor job to its next gate or terminal state. */
async function pollRefactorProgress(collectorId: string, headers: Record<string, string>): Promise<HealProgress> {
  while (true) {
    const progress = await fetchRefactorProgress(collectorId, headers);
    if (progress.status === "pending_answer") {
      return { ...progress, status: "awaiting_approval" };
    }
    if (TERMINAL_REFACTOR_STATUSES.includes(progress.status ?? "")) {
      return progress;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function runHealAttempt(
  collectorId: string,
  url: string,
  prompt: string,
  key: string,
  headers: Record<string, string>,
): Promise<HealProgress> {
  const endpoint = `${API_BASE}/dca/collectors/${encodeURIComponent(collectorId)}/refactor_template`;

  const trigger = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(buildHealRequest(url, prompt)),
  });
  const triggerText = await trigger.text();
  if (!trigger.ok) {
    throw new Error(
      `Failed to start Bright Data self-healing for collector ${collectorId}: ` +
        `${trigger.status} ${redactKey(triggerText.slice(0, 500), key)}`,
    );
  }

  return pollRefactorProgress(collectorId, headers);
}

/**
 * Heals a collector against the exact source-target URL and returns its gated preview.
 * Bright Data can occasionally finish planning and the control preview, then fail internally
 * in `code_fixer` without producing a candidate. That terminal state is safe to retry because
 * no draft or production version exists yet. Retry it once; never retry a pending approval,
 * cancellation, HTTP error, or a failure in an unknown stage.
 */
export async function healScraper(collectorId: string, url: string, prompt: string): Promise<HealProgress> {
  const key = apiKey();
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  for (let attempt = 1; attempt <= MAX_CODE_FIXER_ATTEMPTS; attempt++) {
    const progress = await runHealAttempt(collectorId, url, prompt, key, headers);
    if (progress.status === "done" || progress.status === "awaiting_approval") return progress;

    if (shouldRetryHealFailure(progress, attempt)) {
      console.warn(
        `Bright Data self-healing ended before producing a candidate (${describeHealFailure(progress)}); ` +
          `retrying once...`,
      );
      continue;
    }

    throw new Error(
      `Bright Data self-healing failed for collector ${collectorId} (${describeHealFailure(progress)})`,
    );
  }

  throw new Error(`Bright Data self-healing failed for collector ${collectorId} after retrying code_fixer`);
}

/**
 * Reads whichever refactor job currently sits on a collector - callers that don't already
 * hold a `HealProgress` from `healScraper` (e.g. a human approving from the dashboard, well
 * after the heal that produced it ran) use this to get the job `id` that `approveHeal`
 * requires.
 */
export async function getCurrentHealJob(collectorId: string): Promise<HealProgress> {
  const key = apiKey();
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return fetchRefactorProgress(collectorId, headers);
}

/**
 * Approves (or rejects) a heal that is awaiting approval.
 *
 * `expectedJobId` must be the `id` of the exact refactor job that was gate-evaluated (from
 * `healScraper`'s returned progress). Bright Data's resume call (`resume_automation_job`)
 * takes no job id itself - it always acts on whatever job currently sits on the collector.
 * If a second heal for the same collector has started since (an overlapping workflow run, a
 * duplicate manual/demo re-take), that call would silently resume *that* job instead and
 * report its state - including a stale `done`/`save_new_template` - as if it were the one
 * this caller evaluated. Checking the id first turns that race into a loud, immediate error
 * instead of a heal that looks approved but saved nothing for the incident it was meant to fix.
 *
 * `autoSave` is forwarded as `auto_save` on the resume call. Without it, approving lets the
 * paused job resume but never persists the healed template to production - the collector
 * reverts, the next cron cycle re-breaks on the same selector, and the loop heals the
 * identical break forever. It only applies on approval, so it is never sent alongside reject.
 */
export async function approveHeal(
  collectorId: string,
  expectedJobId: string,
  options: { reject?: boolean; autoSave?: boolean } = {},
): Promise<HealProgress> {
  const key = apiKey();
  const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const verb = options.reject ? "reject" : "approve";

  const current = await fetchRefactorProgress(collectorId, headers);
  if (current.id !== expectedJobId) {
    throw new Error(
      `Refusing to ${verb} heal job ${expectedJobId} on collector ${collectorId}: Bright Data now has a ` +
        `different job (${current.id ?? "unknown"}, status ${current.status ?? "unknown"}) on this collector - ` +
        `another heal run must have started against it since this one was evaluated.`,
    );
  }
  if (current.status !== "pending_answer") {
    throw new Error(
      `Refusing to ${verb} heal job ${expectedJobId} on collector ${collectorId}: it is no longer awaiting ` +
        `approval (status ${current.status ?? "unknown"}).`,
    );
  }

  const approve = !options.reject;
  const body = approve && options.autoSave ? { message: true, auto_save: true } : { message: approve };

  const resumeUrl = `${API_BASE}/dca/collectors/${encodeURIComponent(collectorId)}/resume_automation_job`;
  const resume = await fetch(resumeUrl, { method: "POST", headers, body: JSON.stringify(body) });
  const resumeText = await resume.text();
  if (!resume.ok) {
    throw new Error(
      `Failed to ${verb} Bright Data self-healing for collector ${collectorId}: ` +
        `${resume.status} ${redactKey(resumeText.slice(0, 500), key)}`,
    );
  }

  return pollRefactorProgress(collectorId, headers);
}
