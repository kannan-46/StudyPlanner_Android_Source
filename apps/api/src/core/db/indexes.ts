import type { Db } from 'mongodb';

export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection('users').createIndex({ googleSub: 1 }, { unique: true }),
    db.collection('users').createIndex({ email: 1 }),
    db.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true }),
    db.collection('sessions').createIndex({ userId: 1 }),
    db
      .collection('sessions')
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db
      .collection('exams')
      .createIndex({ userId: 1, nameKey: 1 }, { unique: true }),
    db
      .collection('subjects')
      .createIndex({ userId: 1, nameKey: 1 }, { unique: true }),
    db.collection('topics').createIndex({ userId: 1, nextDueOn: 1 }),
    db.collection('topics').createIndex({ userId: 1, subjectId: 1 }),
    db.collection('topics').createIndex({ userId: 1, updatedAt: 1 }),
    db.collection('topics').createIndex(
      { userId: 1, legacyId: 1 },
      {
        unique: true,
        partialFilterExpression: { legacyId: { $type: 'string' } },
      },
    ),
    db.collection('mockTests').createIndex({ userId: 1, takenOn: -1 }),
  ]);
}
