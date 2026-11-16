import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  DEFAULT_SETTINGS,
  badJsonProblem,
  topicLimitProblem,
  unknownFormatProblem,
} from '@planner/shared';
import { BackupSection } from '../BackupSection';
import { pickBackupFile, saveBackupFile } from '../../../native/backupFiles';
import { ApiError } from '../../../shared/api/errors';
import { TOO_LARGE_TEXT } from '../../backup/messages';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

jest.mock('../../../native/backupFiles', () => ({
  ...jest.requireActual('../../../native/backupFiles'),
  pickBackupFile: jest.fn(),
  saveBackupFile: jest.fn(),
}));

const data = {
  format: 'studyplanner.backup.v1',
  exportedAt: '2026-11-13T12:00:00.000Z',
  settings: DEFAULT_SETTINGS,
  exams: [],
  subjects: [],
  topics: [],
  mockTests: [],
};
const mock = (over = {}) => ({
  id: 'm1',
  title: 'GT 3',
  takenOn: '2026-11-10',
  score: 50,
  maxScore: 100,
  examId: null,
  notes: '',
  ...over,
});
const legacyTopic = (over = {}) => ({
  id: 't1',
  name: 'Hernia',
  exam: 'NEET SS',
  subject: 'Surgery',
  studyDate: '2026-11-01',
  intervals: [4],
  notes: '',
  revisions: [],
  ...over,
});

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

async function openModeDialog() {
  await fireEvent.press(screen.getByText('Import backup'));
  return screen.findByText('Merge (recommended)');
}

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
  expect(
    await screen.findByText(
      /^Your data was replaced with the backup: 3 topics/,
    ),
  ).toBeTruthy();
});

it('Export first saves a file, then imports, with one message at the end', async () => {
  const http = setup();
  http.get.mockResolvedValue(data);
  let reply!: (v: unknown) => void;
  http.post.mockReturnValue(new Promise(r => (reply = r)));
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  await fireEvent.press(await screen.findByText('Replace everything'));
  await fireEvent.press(await screen.findByText('Export first'));
  await waitFor(() => expect(importCalls(http)).toHaveLength(1));
  expect(saveBackupFile).toHaveBeenCalledTimes(1);
  // The replace is still running: no "Backup saved" that reads as done.
  expect(screen.getByTestId('backup-status').props.children).toBe(
    'Backup saved. Replacing your data…',
  );
  expect(screen.queryByText('Backup saved')).toBeNull();
  await act(async () => {
    reply({
      imported: { exams: 0, subjects: 0, topics: 2, mockTests: 0 },
      skipped: { topics: 0 },
    });
  });
  expect(
    await screen.findByText(
      /^Your data was replaced with the backup: 2 topics/,
    ),
  ).toBeTruthy();
  expect(screen.queryByTestId('backup-status')).toBeNull();
});

it('invalid JSON says the file cannot be read', async () => {
  const http = setup();
  (pickBackupFile as jest.Mock).mockResolvedValue('{nope');
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  expect(await screen.findByText(badJsonProblem().description)).toBeTruthy();
  expect(importCalls(http)).toHaveLength(0);
});

it('cancelling the picker is silent', async () => {
  const http = setup();
  (pickBackupFile as jest.Mock).mockRejectedValue({ code: 'E_CANCELLED' });
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  await waitFor(() => expect(pickBackupFile).toHaveBeenCalled());
  expect(screen.queryByText(/not a Study Planner/)).toBeNull();
  expect(screen.queryByText("Couldn't read the backup file")).toBeNull();
  expect(screen.queryByText('Merge (recommended)')).toBeNull();
});

it('a file too large for the phone to read gets its own message', async () => {
  const http = setup();
  (pickBackupFile as jest.Mock).mockRejectedValue({ code: 'E_TOO_LARGE' });
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  expect(await screen.findByText(TOO_LARGE_TEXT)).toBeTruthy();
  expect(TOO_LARGE_TEXT).toMatch(/^This backup file is too large to import/);
  expect(screen.queryByText("Couldn't read the backup file")).toBeNull();
});

it('other read errors keep the generic read message', async () => {
  const http = setup();
  (pickBackupFile as jest.Mock).mockRejectedValue({ code: 'E_FILE_READ' });
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  expect(await screen.findByText("Couldn't read the backup file")).toBeTruthy();
});

it('a backup too big to upload is refused before the dialogs', async () => {
  const http = setup();
  (pickBackupFile as jest.Mock).mockResolvedValue(
    JSON.stringify({
      topics: [legacyTopic({ notes: 'x'.repeat(4_100_000) })],
      settings: { intervals: [4] },
    }),
  );
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  expect(await screen.findByText(TOO_LARGE_TEXT)).toBeTruthy();
  expect(screen.queryByText('Merge (recommended)')).toBeNull();
  expect(importCalls(http)).toHaveLength(0);
});

it('merge shows the imported result', async () => {
  const http = setup();
  await renderWithProviders(<BackupSection />, http);
  await openModeDialog();
  await fireEvent.press(screen.getByText('Merge (recommended)'));
  expect(
    await screen.findByText(
      'Added 3 topics. 1 topic was already in your planner.',
    ),
  ).toBeTruthy();
  expect(http.post).toHaveBeenCalledWith('/v1/backup/import', {
    mode: 'merge',
    data,
  });
});

it('merge reports mock tests and shortened text from the server', async () => {
  const http = setup();
  http.post.mockResolvedValue({
    imported: { exams: 0, subjects: 0, topics: 0, mockTests: 1 },
    skipped: { topics: 5, mockTests: 0 },
    shortened: { topics: 2, mockTests: 0 },
  });
  await renderWithProviders(<BackupSection />, http);
  await openModeDialog();
  await fireEvent.press(screen.getByText('Merge (recommended)'));
  expect(
    await screen.findByText(
      'Added 1 mock test. 5 topics were already in your planner. 2 topics had text shortened to fit this app. Keep your backup file to see the full text.',
    ),
  ).toBeTruthy();
});

it('import shows a spinner on Import and a status line while it runs', async () => {
  const http = setup();
  let reply!: (v: unknown) => void;
  http.post.mockReturnValue(new Promise(r => (reply = r)));
  await renderWithProviders(<BackupSection />, http);
  await openModeDialog();
  await fireEvent.press(screen.getByText('Merge (recommended)'));
  expect(screen.getByText('Importing your backup…')).toBeTruthy();
  expect(screen.getByTestId('button-spinner')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Export backup' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  await act(async () => {
    reply({
      imported: { exams: 0, subjects: 0, topics: 0, mockTests: 0 },
      skipped: { topics: 4 },
    });
  });
  expect(
    await screen.findByText(
      'Nothing new to add — everything in this file is already in your planner.',
    ),
  ).toBeTruthy();
  expect(screen.queryByText('Importing your backup…')).toBeNull();
  expect(screen.queryByTestId('button-spinner')).toBeNull();
});

it('export shows its progress, saves compact JSON and confirms', async () => {
  const http = setup();
  let reply!: (v: unknown) => void;
  http.get.mockReturnValue(new Promise(r => (reply = r)));
  await renderWithProviders(<BackupSection />, http);
  // Not awaited: the press handler's promise is still pending on purpose.
  fireEvent.press(screen.getByText('Export backup'));
  expect(await screen.findByText('Preparing your backup…')).toBeTruthy();
  expect(screen.getByTestId('button-spinner')).toBeTruthy();
  await act(async () => {
    reply(data);
  });
  expect(await screen.findByText('Backup saved')).toBeTruthy();
  expect(saveBackupFile).toHaveBeenCalledWith(JSON.stringify(data));
  expect(screen.queryByText('Preparing your backup…')).toBeNull();
});

it('Export first cancelled in the save dialog goes back to the question', async () => {
  const http = setup();
  http.get.mockResolvedValue(data);
  (saveBackupFile as jest.Mock).mockRejectedValue({ code: 'E_CANCELLED' });
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  await fireEvent.press(await screen.findByText('Replace everything'));
  await fireEvent.press(await screen.findByText('Export first'));
  await waitFor(() => expect(saveBackupFile).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('Export a backup first?')).toBeTruthy();
  expect(importCalls(http)).toHaveLength(0);
  // The same file can still be imported without picking it again.
  await fireEvent.press(screen.getByText('Continue without export'));
  await waitFor(() => expect(importCalls(http)).toHaveLength(1));
  expect(pickBackupFile).toHaveBeenCalledTimes(1);
});

it('Export first that fails says nothing was replaced and offers Retry', async () => {
  const http = setup();
  http.get.mockResolvedValue(data);
  (saveBackupFile as jest.Mock).mockRejectedValueOnce(new Error('EACCES'));
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  await fireEvent.press(await screen.findByText('Replace everything'));
  await fireEvent.press(await screen.findByText('Export first'));
  expect(
    await screen.findByText(
      "Couldn't save the backup file — nothing was replaced",
    ),
  ).toBeTruthy();
  expect(importCalls(http)).toHaveLength(0);
  await fireEvent.press(screen.getByText('Retry'));
  await waitFor(() => expect(importCalls(http)).toHaveLength(1));
  expect(saveBackupFile).toHaveBeenCalledTimes(2);
  expect(pickBackupFile).toHaveBeenCalledTimes(1);
});

it('valid JSON that is not a backup is rejected client-side', async () => {
  const http = setup();
  (pickBackupFile as jest.Mock).mockResolvedValue('{"version":1}');
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  expect(
    await screen.findByText(unknownFormatProblem().description),
  ).toBeTruthy();
  expect(screen.queryByText('Merge (recommended)')).toBeNull();
  expect(importCalls(http)).toHaveLength(0);
});

it('a backup with one bad record names it', async () => {
  const http = setup();
  (pickBackupFile as jest.Mock).mockResolvedValue(
    JSON.stringify({ ...data, mockTests: [mock({ score: 120 })] }),
  );
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import backup'));
  expect(
    await screen.findByText(
      'Mock test "GT 3": the score is higher than the max score. Nothing was imported.',
    ),
  ).toBeTruthy();
  expect(importCalls(http)).toHaveLength(0);
});

it('the topic limit from the server is explained', async () => {
  const http = setup();
  const problem = topicLimitProblem(4990, 20);
  http.post.mockRejectedValue(
    new ApiError('LIMIT_EXCEEDED', 400, undefined, { details: [problem] }),
  );
  await renderWithProviders(<BackupSection />, http);
  await openModeDialog();
  await fireEvent.press(screen.getByText('Merge (recommended)'));
  expect(await screen.findByText(problem.description)).toBeTruthy();
  // Retrying cannot help, so there is no Retry.
  expect(screen.queryByText('Retry')).toBeNull();
});

it('a 413 from the server shows the too-large message', async () => {
  const http = setup();
  http.post.mockRejectedValue(new ApiError('VALIDATION_FAILED', 413));
  await renderWithProviders(<BackupSection />, http);
  await openModeDialog();
  await fireEvent.press(screen.getByText('Merge (recommended)'));
  expect(await screen.findByText(TOO_LARGE_TEXT)).toBeTruthy();
});

it('a network failure keeps the file and Retry sends it again', async () => {
  const http = setup();
  http.post.mockRejectedValueOnce(new ApiError('NETWORK', 0));
  await renderWithProviders(<BackupSection />, http);
  await openModeDialog();
  await fireEvent.press(screen.getByText('Merge (recommended)'));
  expect(
    await screen.findByText("Can't reach the server — try again"),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText('Retry'));
  await waitFor(() => expect(importCalls(http)).toHaveLength(2));
  expect(importCalls(http)[1][1]).toEqual({ mode: 'merge', data });
  expect(pickBackupFile).toHaveBeenCalledTimes(1);
  expect(
    await screen.findByText(
      'Added 3 topics. 1 topic was already in your planner.',
    ),
  ).toBeTruthy();
});

it('a reply after sign-out shows nothing', async () => {
  const http = setup();
  http.post.mockRejectedValue(
    new ApiError('UNAUTHENTICATED', 401, undefined, { sessionEnded: true }),
  );
  await renderWithProviders(<BackupSection />, http);
  await openModeDialog();
  await fireEvent.press(screen.getByText('Merge (recommended)'));
  await waitFor(() => expect(importCalls(http)).toHaveLength(1));
  await waitFor(() => expect(screen.queryByTestId('backup-status')).toBeNull());
  expect(screen.queryByText(/session ended/i)).toBeNull();
  expect(screen.queryByText('Retry')).toBeNull();
});

it('never shows a raw error message when saving fails', async () => {
  const http = setup();
  http.get.mockResolvedValue(data);
  (saveBackupFile as jest.Mock).mockRejectedValue(new Error('EACCES /secret'));
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Export backup'));
  expect(await screen.findByText("Couldn't save the backup file")).toBeTruthy();
  expect(screen.queryByText(/EACCES/)).toBeNull();
});

it('the import dialog previews the file and explains merge and replace', async () => {
  (pickBackupFile as jest.Mock).mockResolvedValue(
    JSON.stringify({ ...data, mockTests: [mock()] }),
  );
  await renderWithProviders(<BackupSection />, setup());
  await openModeDialog();
  expect(screen.getByTestId('backup-summary').props.children).toMatch(
    /^Backup from 13 Nov( 2026)?: 0 topics, 1 mock test$/,
  );
  expect(screen.getByText(/Your settings stay as they are/)).toBeTruthy();
  expect(
    screen.getByText(/restores the reminder time and revision intervals/),
  ).toBeTruthy();
  // The export-first question repeats what will be restored.
  await fireEvent.press(screen.getByText('Replace everything'));
  expect(
    await screen.findByText(
      /^Backup from 13 Nov( 2026)?: 0 topics, 1 mock test$/,
    ),
  ).toBeTruthy();
});

it('an old-app backup with long text warns and lists the topics first', async () => {
  (pickBackupFile as jest.Mock).mockResolvedValue(
    JSON.stringify({
      topics: [
        legacyTopic({ id: 'a', name: 'Long one', notes: 'n'.repeat(2500) }),
        legacyTopic({ id: 'b', name: 'Short one' }),
      ],
      settings: { intervals: [4] },
    }),
  );
  await renderWithProviders(<BackupSection />, setup());
  await openModeDialog();
  expect(screen.getByTestId('backup-summary').props.children).toBe(
    'Backup from the old app: 2 topics, 0 mock tests',
  );
  expect(
    screen.getByText(/^1 topic has text longer than this app keeps/),
  ).toBeTruthy();
  expect(screen.getByText('• Long one')).toBeTruthy();
  expect(screen.queryByText('• Short one')).toBeNull();
});
