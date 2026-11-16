import React from 'react';
import { act, render } from '@testing-library/react-native';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/errors';
import { ApiProvider } from '../../../shared/api/ApiProvider';
import type { Http } from '../../../shared/api/http';
import { createQueryClient, queryKeys } from '../../../shared/api/queryClient';
import {
  useCreateTopic,
  useDeleteTopic,
  useTopic,
  useTopics,
  useUpdateTopic,
} from '../hooks';
import { ID, makeHttp, topic, type Mocks } from '../../../test/testUtils';

type Hooks = {
  create: ReturnType<typeof useCreateTopic>;
  update: ReturnType<typeof useUpdateTopic>;
  remove: ReturnType<typeof useDeleteTopic>;
};

let clients: QueryClient[] = [];

/** The app's client (real retries), but finished mutations are not kept. */
function makeClient(): QueryClient {
  const qc = createQueryClient();
  const d = qc.getDefaultOptions();
  qc.setDefaultOptions({ ...d, mutations: { ...d.mutations, gcTime: 0 } });
  clients.push(qc);
  return qc;
}
afterEach(async () => {
  for (const c of clients) {
    await c.cancelQueries();
    c.clear();
  }
  clients = [];
});

/**
 * Renders the mutation hooks with the app's real query defaults (retries
 * included, unlike renderWithProviders), plus an active topics list so every
 * invalidation has something to refetch.
 */
async function setup(http: Mocks) {
  const qc = makeClient();
  const out = {} as Hooks;
  function Probe() {
    useTopics({ status: 'active' });
    out.create = useCreateTopic();
    out.update = useUpdateTopic();
    out.remove = useDeleteTopic();
    return null;
  }
  await render(
    <QueryClientProvider client={qc}>
      <ApiProvider http={http as unknown as Http}>
        <Probe />
      </ApiProvider>
    </QueryClientProvider>,
  );
  return { qc, hooks: out };
}

describe('topic mutations (F7)', () => {
  it('a failed save settles at once, without waiting for list refetches', async () => {
    const http = makeHttp([topic()]);
    const { hooks } = await setup(http);
    // From now on every request fails like an offline phone (lists retry).
    http.get.mockRejectedValue(new ApiError('NETWORK', 0));
    http.post.mockRejectedValue(new ApiError('NETWORK', 0));
    const started = Date.now();
    let error: unknown;
    await act(async () => {
      await hooks.create
        .mutateAsync({
          name: 'Hernia',
          subjectId: ID(1),
          examIds: [],
          studiedOn: '2026-11-01',
          notes: '',
        })
        .catch(e => (error = e));
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(Date.now() - started).toBeLessThan(800);
  });

  it('a successful save puts the topic in the cache straight away', async () => {
    const http = makeHttp([topic()]);
    const saved = topic({ name: 'Hernia repair' });
    http.patch.mockResolvedValue(saved);
    const { qc, hooks } = await setup(http);
    let held!: () => void;
    // Refetches hang: the save must not wait for them.
    http.get.mockReturnValue(new Promise(r => (held = () => r([]))));
    await act(async () => {
      await hooks.update.mutateAsync({
        id: saved.id,
        patch: { name: 'Hernia repair' },
      });
    });
    expect(qc.getQueryData(queryKeys.topic(saved.id))).toEqual(saved);
    held?.();
  });

  it('delete does not refetch the deleted topic', async () => {
    const http = makeHttp([topic()]);
    http.del.mockResolvedValue(undefined);
    const qc = makeClient();
    const out = {} as Hooks;
    function Probe() {
      useTopic(ID(100));
      out.remove = useDeleteTopic();
      return null;
    }
    await render(
      <QueryClientProvider client={qc}>
        <ApiProvider http={http as unknown as Http}>
          <Probe />
        </ApiProvider>
      </QueryClientProvider>,
    );
    await act(async () => {});
    http.get.mockClear();
    await act(async () => {
      await out.remove.mutateAsync(ID(100));
    });
    await act(async () => {});
    expect(
      http.get.mock.calls.filter(c => c[0] === `/v1/topics/${ID(100)}`),
    ).toHaveLength(0);
  });
});

describe('useTopic fromList (F25)', () => {
  it('shows the list copy while the topic loads', async () => {
    const http = makeHttp([topic()]);
    const known = http.get.getMockImplementation() as (p: string) => unknown;
    http.get.mockImplementation((path: string) =>
      path.startsWith('/v1/topics/') ? new Promise(() => {}) : known(path),
    );
    const qc = makeClient();
    qc.setQueryData(queryKeys.topics({ status: 'active' }), [topic()]);
    const seen: { name?: string; placeholder: boolean }[] = [];
    function Probe({ fromList }: { fromList: boolean }) {
      const q = useTopic(ID(100), { fromList });
      seen.push({ name: q.data?.name, placeholder: q.isPlaceholderData });
      return null;
    }
    await render(
      <QueryClientProvider client={qc}>
        <ApiProvider http={http as unknown as Http}>
          <Probe fromList />
        </ApiProvider>
      </QueryClientProvider>,
    );
    expect(seen[0]).toEqual({ name: 'Hernia', placeholder: true });
    // Never written to the cache: the real topic still loads.
    expect(qc.getQueryData(queryKeys.topic(ID(100)))).toBeUndefined();
  });
});
