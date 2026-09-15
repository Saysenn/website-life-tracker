import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
import { dbCredentials } from "./src/db/credentials.js";

loadEnvConfig(process.cwd());

const { url, authToken } = dbCredentials();

export default defineConfig({
  dialect: url.startsWith("file:") ? "sqlite" : "turso",
  schema: "./src/db/schema.js",
  out: "./drizzle",
  dbCredentials: { url, authToken },
});
