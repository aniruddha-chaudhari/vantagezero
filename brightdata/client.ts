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

/** Runs an existing collector against one URL and returns its parsed JSON output. */
export async function runScraper(collectorId: string, url: string): Promise<ScraperRunResult> {
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

/** Runs a web search (SERP) query, used for resolving MPNs to distributor/manufacturer PDP URLs. */
export async function searchWeb(query: string): Promise<unknown> {
  const stdout = await runCli(["search", query]);
  return JSON.parse(stdout);
}

/** Heals a collector in place from a natural-language description of what broke. */
export async function healScraper(collectorId: string, url: string, prompt: string): Promise<unknown> {
  const stdout = await runCli(["scraper", "heal", collectorId, prompt, "--url", url]);
  return JSON.parse(stdout);
}

/** Approves (or rejects) a heal that is awaiting approval. */
export async function approveHeal(
  collectorId: string,
  url: string,
  options: { reject?: boolean } = {},
): Promise<unknown> {
  const args = ["scraper", "approve", collectorId, "--url", url];
  if (options.reject) args.push("--reject");
  const stdout = await runCli(args);
  return JSON.parse(stdout);
}
