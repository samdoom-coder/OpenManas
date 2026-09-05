import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Use process.env directly (instead of env()) so `prisma generate` /
    // `prisma validate` work even when DATABASE_URL is unset (JSON dev mode).
    url: process.env.DATABASE_URL ?? "",
  },
});
