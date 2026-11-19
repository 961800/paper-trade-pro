process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
import { defineConfig } from "drizzle-kit";
import path from "path";
import fs from "fs";

if (!process.env.DATABASE_URL) {
  const rootEnv = path.resolve(process.cwd(), "../../.env");
  const localEnv = path.resolve(process.cwd(), ".env");
  const envPath = fs.existsSync(localEnv) ? localEnv : (fs.existsSync(rootEnv) ? rootEnv : null);
  if (envPath) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && match[1]) {
        process.env[match[1]] = match[2]?.replace(/^['"]|['"]$/g, "").trim();
      }
    }
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  },
});
