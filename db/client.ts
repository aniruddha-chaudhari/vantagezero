import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

// Neon's pooled endpoint runs pgbouncer in transaction mode, which is incompatible
// with postgres.js's default prepared statements.
const queryClient = postgres(process.env.DATABASE_URL, { prepare: false });

export const db = drizzle(queryClient, { schema });
