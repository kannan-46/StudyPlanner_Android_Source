import { createHash, randomBytes } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import { AppError } from '../../core/errors/app-error';

const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000;
// A just-rotated token presented again is a routine retry, not theft.
const REUSE_GRACE_MS = 60 * 1000;
/**
 * A replacement younger than this is the answer to a refresh that is still
 * on its way back (two refreshes of one token at the same moment), not a lost
 * one: the retry is refused instead of retiring the pair just handed out.
 */
const RACE_WINDOW_MS = 2 * 1000;
/** How many retry hops a lost-response chain may follow. */
const MAX_RETRY_HOPS = 5;

interface SessionDoc {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  deviceLabel: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: ObjectId | null;
  /** True when it was rotated for a retry of an older token (lost reply). */
  rotatedByRetry?: boolean;
}

const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

export interface SessionsRepository {
  create(
    userId: ObjectId,
    deviceLabel: string | null,
    now: Date,
  ): Promise<{ refreshToken: string }>;
  rotate(
    refreshToken: string,
    now: Date,
  ): Promise<{ userId: ObjectId; refreshToken: string }>;
  revoke(refreshToken: string, now: Date): Promise<void>;
  revokeAllForUser(userId: ObjectId, now: Date): Promise<void>;
}

export function createSessionsRepository(db: Db): SessionsRepository {
  const sessions = db.collection<SessionDoc>('sessions');

  async function insert(
    _id: ObjectId,
    userId: ObjectId,
    deviceLabel: string | null,
    now: Date,
  ): Promise<string> {
    const refreshToken = newToken();
    await sessions.insertOne({
      _id,
      userId,
      tokenHash: hashToken(refreshToken),
      deviceLabel,
      createdAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
      revokedAt: null,
      replacedBy: null,
    });
    return refreshToken;
  }

  const isLive = (doc: SessionDoc, now: Date) =>
    doc.revokedAt === null && doc.expiresAt.getTime() > now.getTime();

  type Rotated = { userId: ObjectId; refreshToken: string };

  /**
   * Replaces a live session with a new one. The new session is written first
   * and only then is the old one claimed, so a claimed session always has a
   * replacement that a retry can pick up. Returns null when another request
   * claimed the old session first.
   */
  async function rotateSession(
    doc: SessionDoc,
    now: Date,
    byRetry = false,
  ): Promise<Rotated | null> {
    if (!isLive(doc, now)) throw new AppError('UNAUTHENTICATED');
    const user = await db
      .collection('users')
      .findOne({ _id: doc.userId }, { projection: { _id: 1 } });
    if (!user) {
      await sessions.updateOne(
        { _id: doc._id, revokedAt: null },
        { $set: { revokedAt: now } },
      );
      throw new AppError('UNAUTHENTICATED');
    }
    const newId = new ObjectId();
    const next = await insert(newId, doc.userId, doc.deviceLabel, now);
    // Atomic claim: only one concurrent caller can flip revokedAt.
    const claimed = await sessions.findOneAndUpdate(
      { _id: doc._id, revokedAt: null, expiresAt: { $gt: now } },
      {
        $set: {
          revokedAt: now,
          replacedBy: newId,
          ...(byRetry ? { rotatedByRetry: true } : {}),
        },
      },
    );
    if (!claimed) {
      await sessions.deleteOne({ _id: newId });
      return null;
    }
    return { userId: doc.userId, refreshToken: next };
  }

  /**
   * A token that was already rotated came back. Within the grace window this
   * is a retry whose response never reached the phone (app closed, network
   * switch): when the newest replacement was never used, it is swapped for a
   * fresh pair so the device stays signed in. Replacements made for earlier
   * retries of the same token are followed, so a second lost reply works too.
   * Reuse after the window is treated as theft and signs out every device.
   */
  async function retryRotated(doc: SessionDoc, now: Date): Promise<Rotated> {
    const revokedAt = doc.revokedAt as Date;
    const withinGrace =
      doc.replacedBy !== null &&
      now.getTime() - revokedAt.getTime() < REUSE_GRACE_MS;
    if (!withinGrace) {
      await repo.revokeAllForUser(doc.userId, now);
      throw new AppError('UNAUTHENTICATED');
    }
    let replacement = await sessions.findOne({
      _id: doc.replacedBy as ObjectId,
    });
    for (
      let hops = 0;
      replacement &&
      replacement.revokedAt !== null &&
      replacement.rotatedByRetry === true &&
      replacement.replacedBy !== null &&
      hops < MAX_RETRY_HOPS;
      hops++
    ) {
      replacement = await sessions.findOne({ _id: replacement.replacedBy });
    }
    if (
      replacement &&
      isLive(replacement, now) &&
      now.getTime() - replacement.createdAt.getTime() >= RACE_WINDOW_MS
    ) {
      const next = await rotateSession(replacement, now, true);
      if (next) return next;
    }
    // The replacement was already used, or was handed out a moment ago to a
    // refresh that is still on its way: refuse, but keep every device.
    throw new AppError('UNAUTHENTICATED');
  }

  const repo: SessionsRepository = {
    async create(userId, deviceLabel, now) {
      const refreshToken = await insert(
        new ObjectId(),
        userId,
        deviceLabel,
        now,
      );
      return { refreshToken };
    },

    async rotate(refreshToken, now) {
      const presented = await sessions.findOne({
        tokenHash: hashToken(refreshToken),
      });
      if (!presented) throw new AppError('UNAUTHENTICATED');
      if (presented.revokedAt === null) {
        const next = await rotateSession(presented, now);
        if (next) return next;
        // Another refresh of the same token won the race. Its new pair is
        // still on its way to the caller, so leave it alone and refuse this
        // one; nobody else is signed out.
        throw new AppError('UNAUTHENTICATED');
      }
      return retryRotated(presented, now);
    },

    async revoke(refreshToken, now) {
      await sessions.updateOne(
        { tokenHash: hashToken(refreshToken), revokedAt: null },
        { $set: { revokedAt: now } },
      );
    },

    async revokeAllForUser(userId, now) {
      await sessions.updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: now } },
      );
    },
  };
  return repo;
}
