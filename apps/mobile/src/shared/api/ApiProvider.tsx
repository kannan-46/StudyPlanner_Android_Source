import React, { createContext, useContext, useMemo } from 'react';
import type { Http } from './http';
import { makeAuthApi } from '../../features/auth/api';
import { makeMeApi } from '../../features/me/api';
import { makeExamsApi } from '../../features/exams/api';
import { makeSubjectsApi } from '../../features/subjects/api';
import { makeTopicsApi } from '../../features/topics/api';
import { makeRevisionsApi } from '../../features/revisions/api';
import { makeAgendaApi } from '../../features/agenda/api';
import { makeStatsApi, makeMockTestsApi } from '../../features/progress/api';
import { makeBackupApi } from '../../features/backup/api';
import { makeAppVersionApi } from '../../features/appUpdate/api';

export function makeApis(http: Http) {
  return {
    http,
    auth: makeAuthApi(http),
    me: makeMeApi(http),
    exams: makeExamsApi(http),
    subjects: makeSubjectsApi(http),
    topics: makeTopicsApi(http),
    revisions: makeRevisionsApi(http),
    agenda: makeAgendaApi(http),
    stats: makeStatsApi(http),
    mockTests: makeMockTestsApi(http),
    backup: makeBackupApi(http),
    appVersion: makeAppVersionApi(http),
  };
}
export type Api = ReturnType<typeof makeApis>;

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({
  http,
  children,
}: {
  http: Http;
  children: React.ReactNode;
}) {
  const api = useMemo(() => makeApis(http), [http]);
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside ApiProvider');
  return api;
}
