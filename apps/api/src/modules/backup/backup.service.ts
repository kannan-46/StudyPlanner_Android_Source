import { ObjectId, type Db } from 'mongodb';
import { ZodError } from 'zod';
import {
  BACKUP_FORMAT_V1,
  nameKey,
  parseBackup,
  rebuildSchedule,
  ScheduleError,
  type BackupImportResult,
  type BackupV1,
} from '@planner/shared';
import type { AppDeps } from '../../core/deps';
import { AppError } from '../../core/errors/app-error';
import { createExamsRepository, type ExamDoc } from '../exams/exams.repository';
import {
  createMockTestsRepository,
  type MockTestDoc,
} from '../mockTests/mockTests.repository';
import { deleteStudyData } from '../me/me.service';
import {
  createSubjectsRepository,
  type SubjectDoc,
} from '../subjects/subjects.repository';
import type { TopicDoc } from '../topics/topic.mapper';
import { createUsersRepository } from '../users/users.repository';
import { mapLegacyBackup, type ImportPlan } from './legacy-mapper';

const MAX_TOPICS = 5000;

function invalid(details: unknown): AppError {
  return new AppError('BACKUP_INVALID', { details });
}

function v1ToPlan(data: BackupV1): ImportPlan {
  const examName = new Map(data.exams.map(e => [e.id, e.name]));
  const subjectName = new Map(data.subjects.map(s => [s.id, s.name]));
  // The schema guarantees every reference resolves inside the file.
  const name = (m: Map<string, string>, id: string) => m.get(id) as string;
  return {
    settings: data.settings,
    exams: data.exams.map(e => ({ name: e.name, examDate: e.examDate })),
    subjects: data.subjects.map(s => s.name),
    topics: data.topics.map(t => ({
      legacyId: t.legacyId ?? t.id,
      name: t.name,
      subjectName: name(subjectName, t.subjectId),
      examNames: t.examIds.map(id => name(examName, id)),
      studiedOn: t.studiedOn,
      intervals: t.intervals,
      notes: t.notes,
      revisions: [...t.revisions]
        .sort((a, b) => a.step - b.step)
        .map(r => ({ doneOn: r.doneOn, dueOverride: r.dueOverride })),
    })),
    mockTests: data.mockTests.map(m => ({
      sourceId: m.id,
      title: m.title,
      takenOn: m.takenOn,
      score: m.score,
      maxScore: m.maxScore,
      examName: m.examId === null ? null : name(examName, m.examId),
      notes: m.notes,
    })),
  };
}

/** Find-or-create by nameKey; returns nameKey -> id and how many were new. */
async function ensureNamed<D extends { _id: ObjectId; nameKey: string }>(
  existing: D[],
  wanted: { name: string; extra?: Partial<D> }[],
  make: (name: string, key: string, extra?: Partial<D>) => D,
  insert: (doc: D) => Promise<unknown>,
): Promise<{ ids: Map<string, ObjectId>; created: number }> {
  const ids = new Map(existing.map(d => [d.nameKey, d._id]));
  let created = 0;
  for (const w of wanted) {
    const key = nameKey(w.name);
    if (ids.has(key)) continue;
    const doc = make(w.name, key, w.extra);
    await insert(doc);
    ids.set(key, doc._id);
    created++;
  }
  return { ids, created };
}

function isDuplicateKeyOnly(e: unknown): boolean {
  const err = e as { code?: number; writeErrors?: { code?: number }[] };
  if (err.writeErrors && err.writeErrors.length > 0) {
    return err.writeErrors.every(w => w.code === 11000);
  }
  return err.code === 11000;
}

export function createBackupService(deps: AppDeps) {
  async function exportFor(userId: ObjectId): Promise<BackupV1> {
    const db = await deps.getDb();
    const user = await createUsersRepository(db).findById(userId);
    if (!user) throw new AppError('UNAUTHENTICATED');
    const [exams, subjects, topics, mocks] = await Promise.all([
      createExamsRepository(db).list(userId),
      createSubjectsRepository(db).list(userId),
      db
        .collection<TopicDoc>('topics')
        .find({ userId })
        .sort({ _id: 1 })
        .toArray(),
      createMockTestsRepository(db).list(userId),
    ]);
    const hex = (id: ObjectId) => id.toHexString();
    return {
      format: BACKUP_FORMAT_V1,
      exportedAt: deps.now().toISOString(),
      settings: user.settings,
      exams: exams.map(e => ({
        id: hex(e._id),
        name: e.name,
        examDate: e.examDate ?? null,
      })),
      subjects: subjects.map(s => ({ id: hex(s._id), name: s.name })),
      topics: topics.map(t => ({
        id: hex(t._id),
        name: t.name,
        subjectId: hex(t.subjectId),
        examIds: t.examIds.map(hex),
        studiedOn: t.studiedOn,
        intervals: t.intervals,
        notes: t.notes,
        revisions: t.revisions.map(r => ({
          step: r.step,
          doneOn: r.doneOn,
          dueOverride: r.dueOverride,
        })),
        ...(t.legacyId !== undefined ? { legacyId: t.legacyId } : {}),
      })),
      mockTests: mocks.map(m => ({
        id: hex(m._id),
        title: m.title,
        takenOn: m.takenOn,
        score: m.score,
        maxScore: m.maxScore,
        examId: m.examId ? hex(m.examId) : null,
        notes: m.notes,
      })),
    };
  }

  function scheduleFor(t: ImportPlan['topics'][number], i: number) {
    try {
      return rebuildSchedule({
        studiedOn: t.studiedOn,
        intervals: t.intervals,
        revisions: t.revisions.map((r, k) => ({
          id: new ObjectId().toHexString(),
          step: k + 1,
          dueOn: t.studiedOn,
          doneOn: r.doneOn,
          dueOverride: r.doneOn === null ? r.dueOverride : null,
        })),
      });
    } catch (e) {
      if (e instanceof ScheduleError) {
        throw invalid([{ path: ['topics', i], message: e.message }]);
      }
      throw e;
    }
  }

  function buildTopicDocs(
    plan: ImportPlan,
    userId: ObjectId,
    examIds: Map<string, ObjectId>,
    subjectIds: Map<string, ObjectId>,
  ): TopicDoc[] {
    const now = deps.now();
    return plan.topics.map((t, i) => {
      const schedule = scheduleFor(t, i);
      const exams = [
        ...new Set(t.examNames.map(n => examIds.get(nameKey(n)) as ObjectId)),
      ];
      return {
        _id: new ObjectId(),
        userId,
        name: t.name,
        subjectId: subjectIds.get(nameKey(t.subjectName)) as ObjectId,
        examIds: exams,
        studiedOn: t.studiedOn,
        intervals: t.intervals,
        notes: t.notes,
        revisions: schedule.revisions,
        nextDueOn: schedule.nextDueOn,
        status: schedule.status,
        version: 0,
        legacyId: t.legacyId,
        createdAt: now,
        updatedAt: now,
      };
    });
  }

  async function applyPlan(
    db: Db,
    userId: ObjectId,
    plan: ImportPlan,
    mode: 'merge' | 'replace',
  ): Promise<BackupImportResult> {
    const topicsCol = db.collection<TopicDoc>('topics');
    // Everything below up to the first write only reads, so a limit or
    // validation failure leaves the user's data untouched.
    // Existing keys: stored legacyIds plus native _ids, so merging an
    // account's own export (where legacyId falls back to the id) is a no-op.
    const existingLegacy = new Set<string>();
    const existingMocks = new Set<string>();
    let existingCount = 0;
    if (mode === 'merge') {
      const docs = await topicsCol
        .find({ userId }, { projection: { _id: 1, legacyId: 1 } })
        .toArray();
      existingCount = docs.length;
      for (const d of docs) {
        existingLegacy.add(d._id.toHexString());
        if (typeof d.legacyId === 'string') existingLegacy.add(d.legacyId);
      }
      const mocks = await db
        .collection<MockTestDoc>('mockTests')
        .find({ userId }, { projection: { _id: 1 } })
        .toArray();
      mocks.forEach(m => existingMocks.add(m._id.toHexString()));
    }
    const toImport = plan.topics.filter(t => !existingLegacy.has(t.legacyId));
    let skipped = plan.topics.length - toImport.length;
    if (existingCount + toImport.length > MAX_TOPICS) {
      throw new AppError('LIMIT_EXCEEDED');
    }
    // Validate every schedule before writing.
    toImport.forEach(scheduleFor);

    if (mode === 'replace') await deleteStudyData(db, userId);

    if (Object.keys(plan.settings).length > 0) {
      await createUsersRepository(db).updateMe(userId, {
        settings: plan.settings,
      });
    }

    const examsRepo = createExamsRepository(db);
    const subjectsRepo = createSubjectsRepository(db);
    const now = deps.now();
    const examRes = await ensureNamed<ExamDoc>(
      await examsRepo.list(userId),
      plan.exams.map(e => ({ name: e.name, extra: { examDate: e.examDate } })),
      (name, key, extra) => ({
        _id: new ObjectId(),
        userId,
        name,
        nameKey: key,
        examDate: extra?.examDate ?? null,
        createdAt: now,
      }),
      d => examsRepo.insert(d),
    );
    const subjectRes = await ensureNamed<SubjectDoc>(
      await subjectsRepo.list(userId),
      plan.subjects.map(name => ({ name })),
      (name, key) => ({
        _id: new ObjectId(),
        userId,
        name,
        nameKey: key,
        createdAt: now,
      }),
      d => subjectsRepo.insert(d),
    );

    const docs = buildTopicDocs(
      { ...plan, topics: toImport },
      userId,
      examRes.ids,
      subjectRes.ids,
    );
    let importedTopics = docs.length;
    if (docs.length > 0) {
      try {
        await topicsCol.insertMany(docs, { ordered: false });
      } catch (e) {
        // A concurrent import of the same file won the legacyId race.
        if (!isDuplicateKeyOnly(e)) throw e;
        const inserted = (e as { insertedCount?: number }).insertedCount ?? 0;
        skipped += docs.length - inserted;
        importedTopics = inserted;
      }
    }

    const newMocks = plan.mockTests.filter(
      m => m.sourceId === undefined || !existingMocks.has(m.sourceId),
    );
    const mockDocs: MockTestDoc[] = newMocks.map(m => ({
      _id: new ObjectId(),
      userId,
      title: m.title,
      takenOn: m.takenOn,
      score: m.score,
      maxScore: m.maxScore,
      examId: m.examName
        ? (examRes.ids.get(nameKey(m.examName)) ?? null)
        : null,
      notes: m.notes,
      createdAt: now,
    }));
    if (mockDocs.length > 0) {
      await db.collection<MockTestDoc>('mockTests').insertMany(mockDocs);
    }

    return {
      imported: {
        exams: examRes.created,
        subjects: subjectRes.created,
        topics: importedTopics,
        mockTests: mockDocs.length,
      },
      skipped: { topics: skipped },
    };
  }

  return {
    export: exportFor,

    async import(
      userId: ObjectId,
      mode: 'merge' | 'replace',
      data: unknown,
    ): Promise<BackupImportResult> {
      let parsed;
      try {
        parsed = parseBackup(data);
      } catch (e) {
        if (e instanceof ZodError) {
          throw invalid(
            e.issues.map(i => ({ path: i.path, message: i.message })),
          );
        }
        throw e;
      }
      const db = await deps.getDb();
      const user = await createUsersRepository(db).findById(userId);
      if (!user) throw new AppError('UNAUTHENTICATED');
      const plan =
        parsed.kind === 'v1'
          ? v1ToPlan(parsed.data)
          : mapLegacyBackup(parsed.data, user.settings.intervals);
      return applyPlan(db, userId, plan, mode);
    },
  };
}
