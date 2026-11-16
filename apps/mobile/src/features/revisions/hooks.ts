import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  addDays,
  completeRevision,
  maxDate,
  snoozeRevision,
  undoRevision,
  unsnoozeRevision,
  type AgendaItem,
  type LocalDate,
  type TopicView,
} from '@planner/shared';
import { useApi } from '../../shared/api/ApiProvider';
import { queryKeys } from '../../shared/api/queryClient';
import { invalidateTopicData } from '../../shared/api/invalidate';
import { isSessionEndedError } from '../../shared/api/errors';
import {
  currentSession,
  isCurrentSession,
  type SessionEpoch,
} from '../../shared/api/session';
import { nextAgendaItem, placeInAllAgendas } from '../agenda/cache';

export interface CompleteVars {
  topicId: string;
  revisionId: string;
  doneOn: string;
}

export interface UndoVars {
  topicId: string;
  revisionId: string;
  /** The agenda row the Done removed; Undo puts it back straight away. */
  restore?: AgendaItem;
  /**
   * The Done this Undo takes back, when it was tapped before the Done was
   * saved. If that Done fails there is nothing to undo and no request is sent.
   */
  afterDone?: Promise<unknown>;
}

export interface SnoozeVars {
  topicId: string;
  revisionId: string;
  today: LocalDate;
  days: number;
}

export interface UnsnoozeVars {
  topicId: string;
  revisionId: string;
  /** The date the revision showed before the snooze; it goes back to it. */
  dueOn: LocalDate;
  /** The agenda row as it was before the snooze; it comes back at once. */
  restore?: AgendaItem;
  /**
   * The snooze this takes back, when it was tapped before the snooze was
   * saved. If that snooze fails there is nothing to undo and no request is
   * sent.
   */
  afterSnooze?: Promise<unknown>;
}

/** Keys of the optimistic revision changes (the agenda keeps them shown). */
export const revisionKeys = {
  complete: ['revision', 'complete'] as const,
  undo: ['revision', 'undo'] as const,
  snooze: ['revision', 'snooze'] as const,
  unsnooze: ['revision', 'unsnooze'] as const,
};

/** What a snooze's or unsnooze's onMutate saved; `placed` is the row it moved. */
export type SnoozeContext = MutationContext & { placed?: AgendaItem };

type MutationContext = {
  topicKey: readonly unknown[];
  prevTopic: TopicView | undefined;
  prevAgenda: [readonly unknown[], AgendaItem[] | undefined][];
  /** The signed-in session the change started in. */
  session: SessionEpoch;
};

/**
 * Revision changes of one topic run one after another (Done, then Undo), so
 * an Undo tapped while Done is still on its way can't reach the server first.
 */
const topicScope = (topicId?: string) =>
  topicId ? { id: `topic:${topicId}` } : undefined;

/**
 * True while another change of the same topic waits behind the one that is
 * finishing: that one decides what the lists show, so this one must not
 * overwrite them (or refetch a state that is about to change).
 */
function queuedBehind(qc: QueryClient, topicId: string): boolean {
  const id = `topic:${topicId}`;
  return (
    qc.getMutationCache().findAll({
      status: 'pending',
      predicate: m => m.options.scope?.id === id,
    }).length > 1
  );
}

/**
 * False once the user signed out after the change started (or its reply was
 * dropped for that reason): nothing may touch the next session's cache.
 */
function stillSignedIn(
  ctx: { session: SessionEpoch } | undefined,
  e?: unknown,
) {
  if (e !== undefined && e !== null && isSessionEndedError(e)) return false;
  return !ctx || isCurrentSession(ctx.session);
}

/**
 * Refetch in the background: the mutation (and the snackbar waiting on it)
 * settles as soon as the server answers, not after every list reloads.
 */
const refreshAfter =
  (qc: QueryClient) =>
  (
    _d: unknown,
    e: unknown,
    v: { topicId: string },
    ctx: { session: SessionEpoch } | undefined,
  ) => {
    if (!stillSignedIn(ctx, e)) return;
    if (queuedBehind(qc, v.topicId)) return;
    invalidateTopicData(qc, v.topicId);
  };

const isTopic = (x: unknown): x is TopicView =>
  !!x && Array.isArray((x as TopicView).revisions);

/** Cancels the topic's and the agenda's fetches and saves what they hold. */
async function saveCaches(
  qc: QueryClient,
  topicId: string,
): Promise<MutationContext> {
  const session = currentSession();
  const topicKey = queryKeys.topic(topicId);
  await Promise.all([
    qc.cancelQueries({ queryKey: topicKey }),
    qc.cancelQueries({ queryKey: ['agenda'] }),
  ]);
  return {
    topicKey,
    prevTopic: qc.getQueryData<TopicView>(topicKey),
    prevAgenda: qc.getQueriesData<AgendaItem[]>({ queryKey: ['agenda'] }),
    session,
  };
}

/** The topic's row in any cached agenda, if one is cached. */
function agendaRowOf(
  prevAgenda: MutationContext['prevAgenda'],
  topicId: string,
): AgendaItem | undefined {
  return prevAgenda
    .flatMap(([, items]) => items ?? [])
    .find(i => i.topicId === topicId);
}

/** Puts back what saveCaches saved (after a failed change). */
function rollBack(qc: QueryClient, ctx: MutationContext | undefined) {
  if (!ctx) return;
  qc.setQueryData(ctx.topicKey, ctx.prevTopic);
  for (const [key, data] of ctx.prevAgenda) qc.setQueryData(key, data);
}

/**
 * Writes the topic the server saved and moves its agenda row to the topic's
 * next revision (`base` gives the row's subject details).
 */
function showSaved(
  qc: QueryClient,
  res: TopicView,
  topicId: string,
  base: AgendaItem | undefined,
) {
  qc.setQueryData<TopicView>(queryKeys.topic(topicId), res);
  if (base) placeInAllAgendas(qc, topicId, nextAgendaItem(res, base));
}

export function useCompleteRevision(topicId?: string) {
  const { revisions } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: revisionKeys.complete,
    scope: topicScope(topicId),
    mutationFn: (v: CompleteVars) =>
      revisions.complete(v.topicId, v.revisionId, v.doneOn),
    onMutate: async (v): Promise<MutationContext> => {
      const ctx = await saveCaches(qc, v.topicId);
      if (ctx.prevTopic) {
        try {
          const next = completeRevision(ctx.prevTopic, v.revisionId, v.doneOn);
          qc.setQueryData<TopicView>(ctx.topicKey, {
            ...ctx.prevTopic,
            ...next,
          });
        } catch {
          // Not applicable locally; the server decides.
        }
      }
      qc.setQueriesData<AgendaItem[]>({ queryKey: ['agenda'] }, items =>
        items?.filter(
          i => !(i.topicId === v.topicId && i.revisionId === v.revisionId),
        ),
      );
      return ctx;
    },
    onSuccess: (res, v, ctx) => {
      // The saved topic shows at once: its next revision takes the row's
      // place (under Coming up unless it is really due today).
      if (!stillSignedIn(ctx) || !isTopic(res)) return;
      if (queuedBehind(qc, v.topicId)) return;
      showSaved(qc, res, v.topicId, agendaRowOf(ctx.prevAgenda, v.topicId));
    },
    onError: (e, _v, ctx) => {
      if (stillSignedIn(ctx, e)) rollBack(qc, ctx);
    },
    onSettled: refreshAfter(qc),
  });
}

export function useUndoRevision(topicId?: string) {
  const { revisions } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: revisionKeys.undo,
    scope: topicScope(topicId),
    mutationFn: async (v: UndoVars) => {
      if (v.afterDone) {
        const saved = await v.afterDone.then(
          () => true,
          () => false,
        );
        // The Done failed and was rolled back: already as Undo wants it.
        if (!saved) return undefined;
      }
      return revisions.undo(v.topicId, v.revisionId);
    },
    onMutate: async (v): Promise<MutationContext> => {
      const ctx = await saveCaches(qc, v.topicId);
      if (ctx.prevTopic) {
        try {
          const next = undoRevision(ctx.prevTopic, v.revisionId);
          qc.setQueryData<TopicView>(ctx.topicKey, {
            ...ctx.prevTopic,
            ...next,
          });
        } catch {
          // Not applicable locally; the server decides.
        }
      }
      if (v.restore) placeInAllAgendas(qc, v.topicId, v.restore);
      return ctx;
    },
    onSuccess: (res, v, ctx) => {
      // Replaces a list fetched while the Undo was on its way (it still had
      // the revision done) before the "restored" snackbar shows.
      if (!stillSignedIn(ctx) || !isTopic(res)) return;
      if (queuedBehind(qc, v.topicId)) return;
      showSaved(
        qc,
        res,
        v.topicId,
        v.restore ?? agendaRowOf(ctx.prevAgenda, v.topicId),
      );
    },
    onError: (e, _v, ctx) => {
      if (stillSignedIn(ctx, e)) rollBack(qc, ctx);
    },
    onSettled: refreshAfter(qc),
  });
}

/**
 * Snooze moves the revision at once (under Coming up on Home and Schedule,
 * the new date on Topic detail), so a stale row can't be snoozed twice. A
 * failure puts everything back.
 */
export function useSnoozeRevision(topicId?: string) {
  const { revisions } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: revisionKeys.snooze,
    scope: topicScope(topicId),
    mutationFn: (v: SnoozeVars) =>
      revisions.snooze(v.topicId, v.revisionId, v.today, v.days),
    onMutate: async (v): Promise<SnoozeContext> => {
      const ctx = await saveCaches(qc, v.topicId);
      if (ctx.prevTopic) {
        try {
          const next = snoozeRevision(
            ctx.prevTopic,
            v.revisionId,
            v.today,
            v.days,
          );
          qc.setQueryData<TopicView>(ctx.topicKey, {
            ...ctx.prevTopic,
            ...next,
          });
        } catch {
          // Not applicable locally; the server decides.
        }
      }
      const row = agendaRowOf(ctx.prevAgenda, v.topicId);
      if (!row || row.revisionId !== v.revisionId) return ctx;
      const placed: AgendaItem = {
        ...row,
        dueOn: addDays(maxDate(v.today, row.dueOn), v.days),
      };
      placeInAllAgendas(qc, v.topicId, placed);
      return { ...ctx, placed };
    },
    onSuccess: (res, v, ctx) => {
      if (!stillSignedIn(ctx) || !isTopic(res)) return;
      if (queuedBehind(qc, v.topicId)) return;
      showSaved(
        qc,
        res,
        v.topicId,
        ctx.placed ?? agendaRowOf(ctx.prevAgenda, v.topicId),
      );
    },
    onError: (e, _v, ctx) => {
      if (stillSignedIn(ctx, e)) rollBack(qc, ctx);
    },
    onSettled: refreshAfter(qc),
  });
}

/**
 * Undoes a snooze: the revision goes back to the date it showed before (the
 * row back under Today on Home, the old date on Topic detail) at once. Runs
 * in the topic's scope, so an Undo tapped while the snooze is still saving
 * waits for it, and sends nothing if the snooze failed. A failure puts the
 * snoozed state back.
 */
export function useUnsnoozeRevision(topicId?: string) {
  const { revisions } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationKey: revisionKeys.unsnooze,
    scope: topicScope(topicId),
    mutationFn: async (v: UnsnoozeVars) => {
      if (v.afterSnooze) {
        const saved = await v.afterSnooze.then(
          () => true,
          () => false,
        );
        // The snooze failed and was rolled back: already as Undo wants it.
        if (!saved) return undefined;
      }
      return revisions.unsnooze(v.topicId, v.revisionId, v.dueOn);
    },
    onMutate: async (v): Promise<SnoozeContext> => {
      const ctx = await saveCaches(qc, v.topicId);
      if (ctx.prevTopic) {
        try {
          const next = unsnoozeRevision(ctx.prevTopic, v.revisionId, v.dueOn);
          qc.setQueryData<TopicView>(ctx.topicKey, {
            ...ctx.prevTopic,
            ...next,
          });
        } catch {
          // Not applicable locally; the server decides.
        }
      }
      const row = agendaRowOf(ctx.prevAgenda, v.topicId);
      const placed =
        v.restore ??
        (row && row.revisionId === v.revisionId
          ? { ...row, dueOn: v.dueOn }
          : undefined);
      if (!placed) return ctx;
      placeInAllAgendas(qc, v.topicId, placed);
      return { ...ctx, placed };
    },
    onSuccess: (res, v, ctx) => {
      if (!stillSignedIn(ctx) || !isTopic(res)) return;
      if (queuedBehind(qc, v.topicId)) return;
      showSaved(
        qc,
        res,
        v.topicId,
        ctx.placed ?? agendaRowOf(ctx.prevAgenda, v.topicId),
      );
    },
    onError: (e, _v, ctx) => {
      if (stillSignedIn(ctx, e)) rollBack(qc, ctx);
    },
    onSettled: refreshAfter(qc),
  });
}
