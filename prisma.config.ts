// Prisma config for Steo Élite Predictor
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Utilise les variables Vercel/Supabase
    url: process.env["POSTGRES_URL_NON_POOLING"] || process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});
