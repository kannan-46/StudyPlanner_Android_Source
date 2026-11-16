import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SpreadsheetFile } from '@planner/shared';
import { BackupSection } from '../BackupSection';
import { pickSpreadsheet } from '../../../native/spreadsheetFiles';
import { ApiError } from '../../../shared/api/errors';
import { SPREADSHEET_TEXT } from '../../backup/spreadsheetMessages';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
  topic,
} from '../../../test/testUtils';

jest.mock('../../../native/spreadsheetFiles', () => ({
  ...jest.requireActual('../../../native/spreadsheetFiles'),
  pickSpreadsheet: jest.fn(),
}));

const HEADER = [
  'Book',
  'Topic',
  'First-reading date',
  'Interval (days)',
  'Revision due date',
  'Day',
  'Status',
  'Completion date',
];

// Synthetic rows only. 46342 is 2026-11-16.
const file: SpreadsheetFile = {
  fileName: 'plan.xlsx',
  sheets: [
    { name: 'Dashboard', rows: [['Study dashboard']] },
    {
      name: 'Spaced Revision',
      rows: [
        HEADER,
        ['Anatomy', 'hernia', '46300', '4', '', '', 'Pending', ''],
        ['Anatomy', 'Thyroid', '46300', '4', '', '', 'Done', '46305'],
        ['Anatomy', 'Thyroid', '46300', '7', '', '', 'Pending', ''],
        ['Pearls', 'Burns', '46342', '4', '', '', 'Pending', ''],
        ['Pearls', '', '46342', '4', '', '', 'Pending', ''],
      ],
    },
  ],
};

const importCalls = (http: ReturnType<typeof makeHttp>) =>
  http.post.mock.calls.filter(c => c[0] === '/v1/backup/import');

function setup() {
  const http = makeHttp([topic()]);
  http.post.mockResolvedValue({
    imported: { exams: 0, subjects: 1, topics: 2, mockTests: 0 },
    skipped: { topics: 0, mockTests: 0 },
  });
  return http;
}

afterEach(cleanupClients);
beforeEach(() => {
  jest.clearAllMocks();
  (pickSpreadsheet as jest.Mock).mockResolvedValue(file);
});

async function openPreview() {
  await fireEvent.press(screen.getByText('Import from Excel'));
  return screen.findByTestId('excel-preview');
}

it('shows what the sheet holds before importing', async () => {
  const http = setup();
  await renderWithProviders(<BackupSection />, http);
  await openPreview();
  expect(
    screen.getByText('From the "Spaced Revision" sheet of plan.xlsx'),
  ).toBeTruthy();
  expect(screen.getByText('Found 3 topics')).toBeTruthy();
  expect(screen.getByText('• Anatomy: 2 topics')).toBeTruthy();
  expect(screen.getByText('• Pearls: 1 topic')).toBeTruthy();
  expect(
    screen.getByText(
      '1 topic looks like it is already in your planner and will be skipped.',
    ),
  ).toBeTruthy();
  expect(
    screen.getByText('1 revision already done will be marked done.'),
  ).toBeTruthy();
  expect(
    screen.getByText('Topics will be added to your exam MS General Surgery.'),
  ).toBeTruthy();
  expect(screen.getByText('1 row skipped.')).toBeTruthy();
  expect(screen.queryByTestId('excel-details')).toBeNull();
  await fireEvent.press(screen.getByText('Show details'));
  expect(screen.getByText('Row 6: No topic name')).toBeTruthy();
  expect(importCalls(http)).toHaveLength(0);
});

it('imports only the new topics in merge mode, linked to the one exam', async () => {
  const http = setup();
  await renderWithProviders(<BackupSection />, http);
  await openPreview();
  await fireEvent.press(screen.getByText('Import 2 topics'));
  await waitFor(() => expect(importCalls(http)).toHaveLength(1));
  const [, body] = importCalls(http)[0];
  expect(body.mode).toBe('merge');
  expect(body.data.exams).toEqual([
    { id: 'e1', name: 'MS General Surgery', examDate: null },
  ]);
  expect(
    body.data.topics.map((t: { name: string; legacyId: string }) => [
      t.name,
      t.legacyId,
    ]),
  ).toEqual([
    ['Thyroid', 'xlsx:anatomy|thyroid'],
    ['Burns', 'xlsx:pearls|burns'],
  ]);
  expect(body.data.topics[0].revisions).toEqual([
    { step: 1, doneOn: '2026-10-10', dueOverride: null },
    { step: 2, doneOn: null, dueOverride: null },
  ]);
  expect(
    await screen.findByText(
      'Imported 2 topics from Spaced Revision. 1 topic was already in your planner.',
    ),
  ).toBeTruthy();
});

it('shows progress while importing', async () => {
  const http = setup();
  let reply!: (v: unknown) => void;
  http.post.mockReturnValue(new Promise(r => (reply = r)));
  await renderWithProviders(<BackupSection />, http);
  await openPreview();
  await fireEvent.press(screen.getByText('Import 2 topics'));
  expect((await screen.findByTestId('excel-status')).props.children).toBe(
    'Importing 2 topics…',
  );
  // The other backup buttons wait for the import.
  expect(
    screen.getByRole('button', { name: 'Import backup' }).props
      .accessibilityState,
  ).toMatchObject({ disabled: true });
  await act(async () => {
    reply({
      imported: { exams: 0, subjects: 0, topics: 2, mockTests: 0 },
      skipped: { topics: 0 },
    });
  });
  expect(await screen.findByText(/^Imported 2 topics/)).toBeTruthy();
  expect(screen.queryByTestId('excel-status')).toBeNull();
});

it('Cancel imports nothing', async () => {
  const http = setup();
  await renderWithProviders(<BackupSection />, http);
  await openPreview();
  await fireEvent.press(screen.getByText('Cancel'));
  expect(screen.queryByTestId('excel-preview')).toBeNull();
  expect(importCalls(http)).toHaveLength(0);
});

it('offers Retry when the import fails on the network, and resends', async () => {
  const http = setup();
  http.post.mockRejectedValueOnce(new ApiError('NETWORK', 0));
  await renderWithProviders(<BackupSection />, http);
  await openPreview();
  await fireEvent.press(screen.getByText('Import 2 topics'));
  await fireEvent.press(await screen.findByText('Retry'));
  await waitFor(() => expect(importCalls(http)).toHaveLength(2));
  expect(importCalls(http)[1][1]).toEqual(importCalls(http)[0][1]);
  expect(await screen.findByText(/^Imported 2 topics/)).toBeTruthy();
});

it('explains the topic limit', async () => {
  const http = setup();
  http.post.mockRejectedValue(new ApiError('LIMIT_EXCEEDED', 400));
  await renderWithProviders(<BackupSection />, http);
  await openPreview();
  await fireEvent.press(screen.getByText('Import 2 topics'));
  expect(
    await screen.findByText(
      'This would take you over the 5,000-topic limit. Nothing was imported.',
    ),
  ).toBeTruthy();
  expect(screen.queryByText('Retry')).toBeNull();
});

it('only offers Close when every topic is already in the app', async () => {
  const http = setup();
  (pickSpreadsheet as jest.Mock).mockResolvedValue({
    fileName: 'plan.xlsx',
    sheets: [
      {
        name: 'Topic Bank',
        rows: [
          ['Book', 'Chapter / topic', 'First-reading date'],
          ['Anatomy', 'Hernia', '46342'],
        ],
      },
    ],
  });
  await renderWithProviders(<BackupSection />, http);
  await openPreview();
  expect(screen.queryByText(/^Import \d/)).toBeNull();
  await fireEvent.press(screen.getByText('Close'));
  expect(importCalls(http)).toHaveLength(0);
});

it('says when a per-topic sheet uses the usual gaps', async () => {
  const http = setup();
  (pickSpreadsheet as jest.Mock).mockResolvedValue({
    fileName: 'plan.csv',
    sheets: [
      {
        name: 'plan',
        rows: [
          ['Subject', 'Topic', 'Studied on'],
          ['Pearls', 'Burns', '16/11/2026'],
        ],
      },
    ],
  });
  await renderWithProviders(<BackupSection />, http);
  await openPreview();
  expect(
    screen.getByText(
      'This sheet has one row per topic, so your usual revision gaps (4, 7, 15 days) will be used.',
    ),
  ).toBeTruthy();
  await fireEvent.press(screen.getByText('Import 1 topic'));
  await waitFor(() => expect(importCalls(http)).toHaveLength(1));
  expect(importCalls(http)[0][1].data.topics[0].intervals).toEqual([4, 7, 15]);
});

it.each([
  ['E_CANCELLED', null],
  ['E_TOO_LARGE', SPREADSHEET_TEXT.tooLarge],
  ['E_OLD_XLS', SPREADSHEET_TEXT.oldXls],
  ['E_NOT_SPREADSHEET', SPREADSHEET_TEXT.notSpreadsheet],
  ['E_FILE_READ', SPREADSHEET_TEXT.readFailed],
])('picker error %s', async (code, message) => {
  const http = setup();
  (pickSpreadsheet as jest.Mock).mockRejectedValue({ code });
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import from Excel'));
  if (message) expect(await screen.findByText(message)).toBeTruthy();
  else await waitFor(() => expect(pickSpreadsheet).toHaveBeenCalled());
  expect(screen.queryByTestId('excel-preview')).toBeNull();
});

it('says when no sheet has topics', async () => {
  const http = setup();
  (pickSpreadsheet as jest.Mock).mockResolvedValue({
    fileName: 'x.xlsx',
    sheets: [{ name: 'Notes', rows: [['Hello']] }],
  });
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import from Excel'));
  expect(await screen.findByText(SPREADSHEET_TEXT.noTopics)).toBeTruthy();
});

it('offers Retry when the current topics cannot be loaded, without picking again', async () => {
  const http = setup();
  const get = http.get.getMockImplementation() as (p: string) => unknown;
  let fail = true;
  http.get.mockImplementation(async (path: string) => {
    if (path === '/v1/topics' && fail) {
      throw new ApiError('NETWORK', 0);
    }
    return get(path);
  });
  await renderWithProviders(<BackupSection />, http);
  await fireEvent.press(screen.getByText('Import from Excel'));
  expect(await screen.findByText(SPREADSHEET_TEXT.loadFailed)).toBeTruthy();
  fail = false;
  await fireEvent.press(screen.getByText('Retry'));
  expect(await screen.findByTestId('excel-preview')).toBeTruthy();
  expect(pickSpreadsheet).toHaveBeenCalledTimes(1);
});
