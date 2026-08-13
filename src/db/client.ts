import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "~/db/schema";
import { env } from "~/server/env";

const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema, casing: "snake_case" });

export type Db = typeof db;
