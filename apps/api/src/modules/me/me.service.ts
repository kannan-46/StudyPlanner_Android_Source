import type { Db, ObjectId } from 'mongodb';
import type { Settings, UpdateMeInput, UserView } from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import { AppError } from '../../core/errors/app-error';
import {
  createUsersRepository,
  toUserView,
  type UserPatch,
} from '../users/users.repository';

const STUDY_COLLECTIONS = ['topics', 'exams', 'subjects', 'mockTests'] as const;

/** Deletes topics, exams, subjects and mock tests; keeps user and sessions. */
export async function deleteStudyData(db: Db, userId: ObjectId): Promise<void> {
  await Promise.all(
    STUDY_COLLECTIONS.map(c => db.collection(c).deleteMany({ userId })),
  );
}

export async function deleteUserData(db: Db, userId: ObjectId): Promise<void> {
  await deleteStudyData(db, userId);
  await db.collection('sessions').deleteMany({ userId });
  await createUsersRepository(db).deleteById(userId);
}

export function createMeService(deps: AppDeps) {
  return {
    async get(userId: ObjectId): Promise<UserView> {
      const repo = createUsersRepository(await deps.getDb());
      const user = await repo.findById(userId);
      if (!user) throw new AppError('UNAUTHENTICATED');
      return toUserView(user);
    },
    async update(userId: ObjectId, input: UpdateMeInput): Promise<UserView> {
      const repo = createUsersRepository(await deps.getDb());
      const user = await repo.findById(userId);
      if (!user) throw new AppError('UNAUTHENTICATED');
      const patch: UserPatch = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.settings) {
        const defined = Object.fromEntries(
          Object.entries(input.settings).filter(([, v]) => v !== undefined),
        );
        patch.settings = { ...user.settings, ...defined } as Settings;
      }
      if (input.onboardingCompleted && !user.onboardingCompletedAt) {
        patch.onboardingCompletedAt = deps.now();
      }
      const updated = Object.keys(patch).length
        ? await repo.updateMe(userId, patch)
        : user;
      if (!updated) throw new AppError('UNAUTHENTICATED');
      return toUserView(updated);
    },
    async remove(userId: ObjectId): Promise<void> {
      await deleteUserData(await deps.getDb(), userId);
    },
  };
}
