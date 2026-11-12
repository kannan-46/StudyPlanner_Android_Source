import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { config } from "./config.js";
import { users } from "./db.js";
import type { UserDocument } from "./types.js";
import { createAccessToken, verifyAccessToken } from "./tokens.js";

const scryptCost = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const emailSchema = z.email().max(254);
const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(12).max(256),
}).strict();

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string };
    }
  }
}

async function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, scryptCost, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const digest = await derivePassword(password, salt);
  return `scrypt$32768$8$1$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelism, saltText, digestText] = encoded.split("$");
  if (algorithm !== "scrypt" || cost !== "32768" || blockSize !== "8" || parallelism !== "1" || !saltText || !digestText) {
    return false;
  }
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(digestText, "base64url");
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await derivePassword(password, salt);
  return timingSafeEqual(actual, expected);
}

function toSafeUser(user: UserDocument): { id: string; email: string } {
  return { id: user._id.toHexString(), email: user.email };
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ message: "Sign in to continue." });
    return;
  }

  try {
    const payload = await verifyAccessToken(token);
    if (!payload.sub || !ObjectId.isValid(payload.sub)) throw new Error("Invalid token subject");
    req.auth = { userId: payload.sub };
    next();
  } catch {
    res.status(401).json({ message: "Your session is invalid or expired. Please sign in again." });
  }
};

export function createAuthRouter(): Router {
  const router = Router();

  router.post("/register", async (req, res) => {
    if (!config.allowRegistration) {
      res.status(404).json({ message: "Registration is not available." });
      return;
    }

    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Enter a valid email and a password with at least 12 characters." });
      return;
    }

    const emailNormalized = parsed.data.email.trim().toLowerCase();
    const newUser: UserDocument = {
      _id: new ObjectId(),
      email: parsed.data.email.trim(),
      emailNormalized,
      passwordHash: await hashPassword(parsed.data.password),
      createdAt: new Date(),
    };

    try {
      await users().insertOne(newUser);
    } catch (error) {
      if (isDuplicateKey(error)) {
        res.status(409).json({ message: "An account with this email already exists." });
        return;
      }
      throw error;
    }

    res.status(201).json({
      token: await createAccessToken(newUser._id.toHexString(), newUser.email),
      user: toSafeUser(newUser),
    });
  });

  router.post("/login", async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    const emailNormalized = parsed.data.email.trim().toLowerCase();
    const user = await users().findOne({ emailNormalized });
    const passwordMatches = user
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : await derivePassword(parsed.data.password, Buffer.alloc(16, 49)).then(() => false);

    if (!user || !passwordMatches) {
      res.status(401).json({ message: "Invalid email or password." });
      return;
    }

    res.json({
      token: await createAccessToken(user._id.toHexString(), user.email),
      user: toSafeUser(user),
    });
  });

  return router;
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
