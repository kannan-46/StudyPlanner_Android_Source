import { z } from 'zod';

export interface AppConfig {
  mongodbUri: string;
  mongodbDb: string;
  jwtSecret: string;
  googleWebClientId: string;
  port: number;
  trustProxyHops: number;
  devGoogleStub: boolean;
  buildSha: string | null;
  contactEmail?: string | null;
}

const schema = z.object({
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().min(1).default('studyplanner'),
  JWT_SECRET: z
    .string()
    .refine(v => Buffer.byteLength(v, 'utf8') >= 32, 'too short'),
  GOOGLE_WEB_CLIENT_ID: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  DEV_GOOGLE_STUB: z.enum(['true', 'false']).default('false'),
  CONTACT_EMAIL: z.string().optional(),
  VERCEL: z.string().optional(),
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
});

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  // Empty strings count as unset so a blank .env line falls back to defaults.
  const cleaned: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    cleaned[k] = v === '' ? undefined : v;
  }

  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const names = [
      ...new Set(parsed.error.issues.map(i => String(i.path[0] ?? 'env'))),
    ];
    throw new Error(`Invalid environment: ${names.join(', ')}`);
  }
  const e = parsed.data;
  const devGoogleStub = e.DEV_GOOGLE_STUB === 'true';
  if (devGoogleStub && e.VERCEL) {
    throw new Error(
      'Invalid environment: DEV_GOOGLE_STUB (not allowed on Vercel)',
    );
  }
  return {
    mongodbUri: e.MONGODB_URI,
    mongodbDb: e.MONGODB_DB,
    jwtSecret: e.JWT_SECRET,
    googleWebClientId: e.GOOGLE_WEB_CLIENT_ID,
    port: e.PORT,
    trustProxyHops: e.VERCEL ? 1 : e.TRUST_PROXY_HOPS,
    devGoogleStub,
    buildSha: e.VERCEL_GIT_COMMIT_SHA ?? null,
    contactEmail: e.CONTACT_EMAIL ?? null,
  };
}
