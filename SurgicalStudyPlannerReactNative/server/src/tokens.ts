import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { config } from "./config.js";

const key = new TextEncoder().encode(config.jwtSecret);
const issuer = "surgical-study-planner-api";
const audience = "surgical-study-planner-mobile";

export async function createAccessToken(userId: string, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const { payload } = await jwtVerify(token, key, {
    algorithms: ["HS256"],
    issuer,
    audience,
  });
  return payload;
}
