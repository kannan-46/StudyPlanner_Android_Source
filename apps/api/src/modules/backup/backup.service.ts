import { ObjectId, type Db } from 'mongodb';
import {
  BACKUP_FORMAT_V1,
  BACKUP_MAX_TOPICS,
  badJsonProblem,
  checkBackup,
  findLegacyOverflows,
  nameKey,
  rebuildSchedule,
  ScheduleError,
  topicLimitProblem,
  type BackupImportResult,
  type BackupProblem,
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

function invalid(details: BackupProblem[]): AppError {
  return new AppError('BACKUP_INVALID', { details });
}

function v1ToPlan(data: BackupV1): ImportPlan {
  const examName = new Map(data.exams.map(e => [e.id, e.name]));
  const subjectName = new Map(data.subjects.map(s => [s.id, s.name]));
  // The schema guarantees every subject resolves inside the file and drops
  // links to exams that are not in it.
  const name = (m: Map<string, string>, id: string) => m.get(id) as string;
  return {
    settings: data.settings,
    exams: data.exams.map(e => ({ name: e.name, examDate: e.examDate })),
    subjects: data.subjects.map(s => s.name),
    topics: data.topics.map(t => ({
      legacyId: t.legacyId ?? t.id,
      name: t.name,
      subjectName: name(subjectName, t.subjectId),
      examNames: t.examIds.flatMap(id => examName.get(id) ?? []),
      studiedOn: t.studiedOn,
      intervals: t.intervals,
      notes: t.notes,
      revisions: [...t.revisions]
        .sort((a, b) => a.step - b.step)
        .map(r => ({ doneOn: r.doneOn, dueOverride: r.dueOverride })),
    })),
    mockTests: data.mockTests.map(m => ({
      sourceId: m.sourceId ?? m.id,
      title: m.title,
      takenOn: m.takenOn,
      score: m.score,
      maxScore: m.maxScore,
      examName: m.examId === null ? null : (examName.get(m.examId) ?? null),
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
    // Older data can still point at a deleted exam. Leave such links out so
    // every exported file imports again.
    const examSet = new Set(exams.map(e => hex(e._id)));
    const knownExam = (id: ObjectId | null | undefined): id is ObjectId =>
      !!id && examSet.has(hex(id));
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
        examIds: t.examIds.filter(knownExam).map(hex),
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
        examId: knownExam(m.examId) ? hex(m.examId) : null,
        notes: m.notes,
        ...(typeof m.sourceId === 'string' ? { sourceId: m.sourceId } : {}),
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
        const label = t.name ? `Topic "${t.name}"` : `Topic ${i + 1}`;
        throw invalid([
          {
            reason: 'INVALID_RECORD',
            path: ['topics', i],
            message: e.message,
            description: `${label}: its revision dates are not valid. Nothing was imported.`,
          },
        ]);
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
      // Mock tests: native _ids (an account's own export) plus the stored
      // source keys of earlier imports, so re-merging a file adds nothing.
      const mocks = await db
        .collection<MockTestDoc>('mockTests')
        .find({ userId }, { projection: { _id: 1, sourceId: 1 } })
        .toArray();
      for (const m of mocks) {
        existingMocks.add(m._id.toHexString());
        if (typeof m.sourceId === 'string') existingMocks.add(m.sourceId);
      }
    }
    const toImport = plan.topics.filter(t => !existingLegacy.has(t.legacyId));
    let skipped = plan.topics.length - toImport.length;
    if (existingCount + toImport.length > BACKUP_MAX_TOPICS) {
      throw new AppError('LIMIT_EXCEEDED', {
        details: [topicLimitProblem(existingCount, toImport.length)],
      });
    }
    // Validate every schedule before writing.
    toImport.forEach(scheduleFor);

    if (mode === 'replace') await deleteStudyData(db, userId);

    // Merge only adds study data and leaves the user's settings alone.
    // Replace restores reminder and interval settings, but never the theme:
    // that is a per-device look the user chose on this phone.
    if (mode === 'replace') {
      const restored = { ...plan.settings };
      delete restored.theme;
      if (Object.keys(restored).length > 0) {
        await createUsersRepository(db).updateMe(userId, {
          settings: restored,
        });
      }
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

    // Skip mock tests already in the account and repeats within the file.
    const seenMocks = new Set(existingMocks);
    const newMocks = plan.mockTests.filter(m => {
      if (m.sourceId === undefined) return true;
      if (seenMocks.has(m.sourceId)) return false;
      seenMocks.add(m.sourceId);
      return true;
    });
    let skippedMocks = plan.mockTests.length - newMocks.length;
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
      ...(m.sourceId !== undefined ? { sourceId: m.sourceId } : {}),
    }));
    let importedMocks = mockDocs.length;
    if (mockDocs.length > 0) {
      try {
        await db
          .collection<MockTestDoc>('mockTests')
          .insertMany(mockDocs, { ordered: false });
      } catch (e) {
        // A concurrent import of the same file won the sourceId race.
        if (!isDuplicateKeyOnly(e)) throw e;
        const inserted = (e as { insertedCount?: number }).insertedCount ?? 0;
        skippedMocks += mockDocs.length - inserted;
        importedMocks = inserted;
      }
    }

    return {
      imported: {
        exams: examRes.created,
        subjects: subjectRes.created,
        topics: importedTopics,
        mockTests: importedMocks,
      },
      skipped: { topics: skipped, mockTests: skippedMocks },
      shortened: {
        topics: toImport.filter(t => t.shortened).length,
        mockTests: newMocks.filter(m => m.shortened).length,
      },
    };
  }

  return {
    export: exportFor,

    async import(
      userId: ObjectId,
      mode: 'merge' | 'replace',
      data: unknown,
    ): Promise<BackupImportResult> {
      // `data` is normally the backup object; the text of the file is also
      // accepted, so unreadable JSON gets its own BAD_JSON reason.
      let value = data;
      if (typeof data === 'string') {
        try {
          value = JSON.parse(data) as unknown;
        } catch {
          throw invalid([badJsonProblem()]);
        }
      }
      const check = checkBackup(value);
      if (!check.ok) throw invalid(check.problems);
      const parsed = check.backup;
      const db = await deps.getDb();
      const user = await createUsersRepository(db).findById(userId);
      if (!user) throw new AppError('UNAUTHENTICATED');
      let plan: ImportPlan;
      if (parsed.kind === 'v1') {
        plan = v1ToPlan(parsed.data);
      } else {
        plan = mapLegacyBackup(parsed.data, user.settings.intervals);
        // Old apps allowed longer text; mark what the import shortened.
        const over = findLegacyOverflows(value);
        const topicIds = new Set(over.topics.map(t => t.id));
        const mockIndexes = new Set(over.mockTests.map(m => m.index));
        plan.topics.forEach(t => {
          if (topicIds.has(t.legacyId)) t.shortened = true;
        });
        plan.mockTests.forEach((m, i) => {
          if (mockIndexes.has(i)) m.shortened = true;
        });
      }
      return applyPlan(db, userId, plan, mode);
    },
  };
}
