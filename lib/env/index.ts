/**
 * Centralized, validated access to environment variables.
 *
 * Importing this module asserts the runtime has the secrets the app
 * requires. Touching `process.env` directly elsewhere defeats the check,
 * so callers should pull values from here.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  AUTH_SECRET: required("AUTH_SECRET"),
  NODE_ENV: optional("NODE_ENV") ?? "development",
} as const;

export type Env = typeof env;
