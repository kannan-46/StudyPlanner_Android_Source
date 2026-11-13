import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { ObjectId } from "mongodb";
import { connectDatabase, closeDatabase, users } from "./db.js";
import { hashPassword } from "./auth.js";
import type { UserDocument } from "./types.js";

async function readHidden(prompt: string): Promise<string> {
  stdout.write(prompt);
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    const readline = createInterface({ input: stdin, output: stdout });
    try {
      return await readline.question("");
    } finally {
      readline.close();
    }
  }

  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (error?: Error): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer): void => {
      for (const character of chunk.toString("utf8")) {
        if (character === "\u0003") {
          finish(new Error("Owner creation cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else if (character >= " ") value += character;
      }
    };
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  const emailInput = (await readHidden("Owner email: ")).trim();
  const emailNormalized = emailInput.toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(emailNormalized) || emailNormalized.length > 254) {
    throw new Error("Enter a valid email address.");
  }

  const password = await readHidden("Owner password (12 characters minimum): ");
  if (password.length < 12 || password.length > 256) {
    throw new Error("Password must contain 12 to 256 characters.");
  }

  await connectDatabase();
  const exists = await users().findOne({ emailNormalized }, { projection: { _id: 1 } });
  if (exists) throw new Error("An account with this email already exists.");

  const user: UserDocument = {
    _id: new ObjectId(),
    email: emailInput,
    emailNormalized,
    passwordHash: await hashPassword(password),
    createdAt: new Date(),
  };
  await users().insertOne(user);
  console.log(`Owner account created for ${user.email}.`);
}

main()
  .catch((error: unknown) => {
    console.error("Owner account was not created:", error instanceof Error ? error.message : "Unexpected error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase().catch(() => undefined);
  });
