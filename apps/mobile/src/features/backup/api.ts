import type { BackupImportResult, BackupV1 } from '@planner/shared';
import type { Http } from '../../shared/api/http';

export function makeBackupApi(http: Http) {
  return {
    export: () => http.get<BackupV1>('/v1/backup'),
    import: (mode: 'merge' | 'replace', data: unknown) =>
      http.post<BackupImportResult>('/v1/backup/import', { mode, data }),
  };
}
