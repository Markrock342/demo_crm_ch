import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./server/db/schema/index.ts",
  out: "./server/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://cangzhan:cangzhan@localhost:5432/cangzhan",
  },
});
