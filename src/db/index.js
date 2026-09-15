import "server-only";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { dbCredentials } from "./credentials";
import * as schema from "./schema";

const globalForDb = globalThis;

const client = globalForDb.libsql ?? createClient(dbCredentials());

if (process.env.NODE_ENV !== "production") globalForDb.libsql = client;

export const db = drizzle(client, { schema });
