import "server-only";

import { z } from "zod";

import { getPublicEnv } from "@/lib/env/public";

const serverOnlyEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  LUMEN_API_KEY: z.string().min(1).optional(),
  LUMEN_API_BASE_URL: z.string().url().optional(),
  LUMEN_MODEL: z.string().min(1).optional(),
});

const lumenEnvSchema = z.object({
  LUMEN_API_KEY: z.string().min(1).optional(),
  LUMEN_API_BASE_URL: z.string().url().optional(),
  LUMEN_MODEL: z.string().min(1).optional(),
});

export function getLumenEnv() {
  return lumenEnvSchema.parse({
    LUMEN_API_KEY: process.env.LUMEN_API_KEY,
    LUMEN_API_BASE_URL: process.env.LUMEN_API_BASE_URL,
    LUMEN_MODEL: process.env.LUMEN_MODEL,
  });
}

export function getServerEnv() {
  return {
    ...getPublicEnv(),
    ...serverOnlyEnvSchema.parse({
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      LUMEN_API_KEY: process.env.LUMEN_API_KEY,
      LUMEN_API_BASE_URL: process.env.LUMEN_API_BASE_URL,
      LUMEN_MODEL: process.env.LUMEN_MODEL,
    }),
  };
}
