import type { Db, ObjectId } from 'mongodb';
import {
  DEFAULT_SETTINGS,
  type Settings,
  type UserView,
} from '@planner/shared';
import type { GoogleIdentity } from '../../core/deps';

export interface UserDoc {
  _id: ObjectId;
  googleSub: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  settings: Settings;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  lastLoginAt: Date;
}

export function toUserView(doc: UserDoc): UserView {
  return {
    id: doc._id.toHexString(),
    email: doc.email,
    name: doc.name,
    avatarUrl: doc.avatarUrl,
    onboardingCompletedAt: doc.onboardingCompletedAt
      ? doc.onboardingCompletedAt.toISOString()
      : null,
    settings: doc.settings,
  };
}

export type UserPatch = Partial<
  Pick<UserDoc, 'name' | 'settings' | 'onboardingCompletedAt'>
>;

export interface UsersRepository {
  upsertFromGoogle(identity: GoogleIdentity, now: Date): Promise<UserDoc>;
  findById(id: ObjectId): Promise<UserDoc | null>;
  updateMe(id: ObjectId, patch: UserPatch): Promise<UserDoc | null>;
  deleteById(id: ObjectId): Promise<void>;
}

export function createUsersRepository(db: Db): UsersRepository {
  const users = db.collection<UserDoc>('users');
  return {
    async upsertFromGoogle(identity, now) {
      const doc = await users.findOneAndUpdate(
        { googleSub: identity.sub },
        {
          $set: {
            email: identity.email,
            name: identity.name,
            avatarUrl: identity.picture,
            lastLoginAt: now,
          },
          $setOnInsert: {
            createdAt: now,
            settings: structuredClone(DEFAULT_SETTINGS),
            onboardingCompletedAt: null,
          },
        },
        { upsert: true, returnDocument: 'after' },
      );
      return doc as UserDoc;
    },
    findById(id) {
      return users.findOne({ _id: id });
    },
    updateMe(id, patch) {
      return users.findOneAndUpdate(
        { _id: id },
        { $set: patch },
        { returnDocument: 'after' },
      );
    },
    async deleteById(id) {
      await users.deleteOne({ _id: id });
    },
  };
}
