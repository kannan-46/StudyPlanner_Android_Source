const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/planner/nativeAlarms.ts');

function loadSyncNativeAlarms(native, today) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const loaded = new Module(sourcePath, module);
  loaded.filename = sourcePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  const originalLoad = Module._load;

  Module._load = function (request, parent, isMain) {
    if (request === 'react-native') {
      return {NativeModules: {PlannerNative: native}};
    }
    if (request === './revisions' && parent?.filename === sourcePath) {
      return {
        allRevisions: planner => planner.topics.flatMap(topic =>
          topic.revisions.map((revision, revisionIndex) => ({
            ...revision,
            topicId: topic.id,
            topicName: topic.name,
            revisionIndex,
          })),
        ),
        localDateString: () => today,
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    loaded._compile(compiled, sourcePath);
  } finally {
    Module._load = originalLoad;
  }
  return loaded.exports.syncNativeAlarms;
}

async function getScheduledTime(date, today, now, reminderTime = '10:00') {
  const scheduled = [];
  const native = {
    cancelAllRevisionAlarms: async () => undefined,
    clearAllAlarms: async () => undefined,
    scheduleRevisionAlarm: async (id, atMillis) => scheduled.push({id, atMillis}),
    scheduleDailyReminder: async () => undefined,
    requestExactAlarmAccess: async () => undefined,
    exportBackup: async () => undefined,
    importBackup: async () => '',
  };
  const syncNativeAlarms = loadSyncNativeAlarms(native, today);
  const planner = {
    settings: {time: reminderTime},
    topics: [{
      id: 'topic-1',
      name: 'Test topic',
      revisions: [{day: 1, date, done: false}],
    }],
  };
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    await syncNativeAlarms(planner);
  } finally {
    Date.now = originalNow;
  }
  return scheduled[0]?.atMillis;
}

test('a revision due today waits until the selected reminder time', async () => {
  const today = '2026-11-12';
  const now = new Date(`${today}T09:00:00`).getTime();
  const expected = new Date(`${today}T10:00:00`).getTime();

  assert.equal(await getScheduledTime(today, today, now), expected);
});

test('a revision already overdue today is queued shortly after planner sync', async () => {
  const today = '2026-11-12';
  const now = new Date(`${today}T11:00:00`).getTime();

  assert.equal(await getScheduledTime(today, today, now), now + 45_000);
});

test('a future revision keeps its selected local time', async () => {
  const today = '2026-11-12';
  const now = new Date(`${today}T09:00:00`).getTime();
  const expected = new Date('2026-11-13T10:00:00').getTime();

  assert.equal(await getScheduledTime('2026-11-13', today, now), expected);
});
