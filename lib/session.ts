import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

const COOKIE_NAME = "vantage_session";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Anonymous multi-tenancy: no accounts, just a cookie. Two judges must not see each
 * other's builds - this is the entire mechanism that guarantees that.
 */
export async function getOrCreateSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const id = `anon_${randomUUID()}`;
  store.set(COOKIE_NAME, id, { httpOnly: true, sameSite: "lax", maxAge: ONE_YEAR_SECONDS, path: "/" });
  return id;
}

/** Read-only variant for Server Components, which cannot set cookies during render. */
export async function readSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}
