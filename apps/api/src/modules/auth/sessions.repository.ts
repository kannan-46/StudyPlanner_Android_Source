import { createHash, randomBytes } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import { AppError } from '../../core/errors/app-error';

const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000;
// A just-rotated token presented again is a routine retry, not theft.
const REUSE_GRACE_MS = 60 * 1000;

interface SessionDoc {
  _id: ObjectId;
  userId: ObjectId;
  tokenHash: string;
  deviceLabel: string | null;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy: ObjectId | null;
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
      const tokenHash = hashToken(refreshToken);
      const newId = new ObjectId();
      // Atomic claim: only one concurrent caller can flip revokedAt.
      const claimed = await sessions.findOneAndUpdate(
        { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
        { $set: { revokedAt: now, replacedBy: newId } },
        { returnDocument: 'before' },
      );
      if (claimed) {
        const user = await db
          .collection('users')
          .findOne({ _id: claimed.userId }, { projection: { _id: 1 } });
        if (!user) throw new AppError('UNAUTHENTICATED');
        const next = await insert(
          newId,
          claimed.userId,
          claimed.deviceLabel,
          now,
        );
        return { userId: claimed.userId, refreshToken: next };
      }
      const existing = await sessions.findOne({ tokenHash });
      if (existing && existing.revokedAt !== null) {
        const withinGrace =
          existing.replacedBy !== null &&
          now.getTime() - existing.revokedAt.getTime() < REUSE_GRACE_MS;
        if (withinGrace) throw new AppError('UNAUTHENTICATED');
        await repo.revokeAllForUser(existing.userId, now);
      }
      throw new AppError('UNAUTHENTICATED');
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
