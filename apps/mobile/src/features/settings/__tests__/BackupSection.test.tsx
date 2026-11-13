import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { BackupSection } from '../BackupSection';
import { pickBackupFile, saveBackupFile } from '../../../native/backupFiles';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

jest.mock('../../../native/backupFiles', () => ({
  pickBackupFile: jest.fn(),
  saveBackupFile: jest.fn(),
}));

const data = { version: 1, topics: [] };
afterEach(cleanupClients);
beforeEach(() => {
  jest.clearAllMocks();
  (pickBackupFile as jest.Mock).mockResolvedValue(JSON.stringify(data));
  (saveBackupFile as jest.Mock).mockResolvedValue(undefined);
});

function setup() {
  const http = makeHttp();
  http.post.mockResolvedValue({
    imported: { exams: 0, subjects: 0, topics: 3, mockTests: 0 },
    skipped: { topics: 1 },
  });
  return http;
}
const importCalls = (http: ReturnType<typeof makeHttp>) =>
  http.post.mock.calls.filter(c => c[0] === '/v1/backup/import');

it('replace shows the export prompt; Cancel does not import', async () => {
  const http = setup();
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  await fireEvent.press(await screen.findByText('Replace everything'));
  expect(await screen.findByText('Export a backup first?')).toBeTruthy();
  await fireEvent.press(screen.getByText('Cancel'));
  expect(importCalls(http)).toHaveLength(0);
});

it('Continue without export imports in replace mode', async () => {
  const http = setup();
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  await fireEvent.press(await screen.findByText('Replace everything'));
  await fireEvent.press(await screen.findByText('Continue without export'));
  await waitFor(() =>
    expect(http.post).toHaveBeenCalledWith('/v1/backup/import', {
      mode: 'replace',
      data,
    }),
  );
  expect(saveBackupFile).not.toHaveBeenCalled();
});

it('Export first saves a file, then imports', async () => {
  const http = setup();
  http.get.mockResolvedValue({ version: 1, topics: ['x'] });
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  await fireEvent.press(await screen.findByText('Replace everything'));
  await fireEvent.press(await screen.findByText('Export first'));
  await waitFor(() => expect(importCalls(http)).toHaveLength(1));
  expect(saveBackupFile).toHaveBeenCalledTimes(1);
});

it('invalid JSON shows the not-a-backup message', async () => {
  const http = setup();
  (pickBackupFile as jest.Mock).mockResolvedValue('{nope');
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  expect(
    await screen.findByText('This file is not a Study Planner backup'),
  ).toBeTruthy();
  expect(importCalls(http)).toHaveLength(0);
});

it('cancelling the picker is silent', async () => {
  const http = setup();
  (pickBackupFile as jest.Mock).mockRejectedValue({ code: 'E_CANCELLED' });
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  await waitFor(() => expect(pickBackupFile).toHaveBeenCalled());
  expect(screen.queryByText(/not a Study Planner/)).toBeNull();
  expect(screen.queryByText('Merge (recommended)')).toBeNull();
});

it('merge shows the imported result', async () => {
  const http = setup();
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  await fireEvent.press(await screen.findByText('Merge (recommended)'));
  expect(await screen.findByText('Imported 3 topics (1 skipped)')).toBeTruthy();
  expect(http.post).toHaveBeenCalledWith('/v1/backup/import', {
    mode: 'merge',
    data,
  });
});

it('export saves the file and confirms', async () => {
  const http = setup();
  http.get.mockResolvedValue(data);
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Export backup'));
  expect(await screen.findByText('Backup saved')).toBeTruthy();
  expect(saveBackupFile).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
});
