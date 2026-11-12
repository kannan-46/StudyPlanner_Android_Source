import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parseBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value === "") return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be either true or false`);
}

function parseInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

const mongodbUri = required("MONGODB_URI");
if (!/^mongodb(?:\+srv)?:\/\//i.test(mongodbUri)) {
  throw new Error("MONGODB_URI must be a MongoDB connection string");
}

const jwtSecret = required("JWT_SECRET");
if (Buffer.byteLength(jwtSecret, "utf8") < 32) {
  throw new Error("JWT_SECRET must contain at least 32 bytes");
}

export const config = {
  mongodbUri,
  jwtSecret,
  port: parseInteger("PORT", 3000, 1, 65535),
  allowRegistration: parseBoolean("ALLOW_REGISTRATION", false),
  trustProxyHops: parseInteger("TRUST_PROXY_HOPS", 0, 0, 10),
};
