import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Button } from '../Button';
import { useSnackbar } from '../Snackbar';
import { STILL_SAVING_MESSAGE, useLeaveGuard } from '../useLeaveGuard';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

type Params = { List: undefined; Form: undefined };
const Stack = createNativeStackNavigator<Params>();
const nav = createNavigationContainerRef<Params>();

let finishSave: () => void = () => {};
let failSave: () => void = () => {};

function Form() {
  const snackbar = useSnackbar();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const guard = useLeaveGuard(dirty, saving);
  const save = () => {
    setSaving(true);
    new Promise<void>((resolve, reject) => {
      finishSave = resolve;
      failSave = () => reject(new Error('offline'));
    }).then(
      () => {
        setSaving(false);
        guard.leaveAfterSave(() => snackbar.show({ message: 'Topic added' }));
      },
      () => setSaving(false),
    );
  };
  return (
    <>
      <Text>Form screen</Text>
      <Button title="Type" onPress={() => setDirty(true)} />
      <Button title="Save" onPress={save} />
      {guard.dialog}
    </>
  );
}

function List() {
  return <Text>List screen</Text>;
}

async function setup() {
  await renderWithProviders(
    <NavigationContainer ref={nav}>
      <Stack.Navigator>
        <Stack.Screen name="List" component={List} />
        <Stack.Screen name="Form" component={Form} />
      </Stack.Navigator>
    </NavigationContainer>,
    makeHttp(),
  );
  await waitFor(() => expect(nav.isReady()).toBe(true));
  await act(async () => nav.navigate('Form'));
  expect(await screen.findByText('Form screen')).toBeOnTheScreen();
}

const goBack = () =>
  act(async () => {
    nav.goBack();
  });

afterEach(cleanupClients);

it('asks before discarding typed input', async () => {
  await setup();
  await fireEvent.press(screen.getByText('Type'));
  await goBack();
  expect(await screen.findByText('Discard changes?')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
  expect(await screen.findByText('List screen')).toBeOnTheScreen();
});

it('while saving, Back waits with a note instead of warning about lost input', async () => {
  await setup();
  await fireEvent.press(screen.getByText('Type'));
  await fireEvent.press(screen.getByText('Save'));
  await goBack();
  expect(screen.queryByText('Discard changes?')).toBeNull();
  expect(await screen.findByText(STILL_SAVING_MESSAGE)).toBeOnTheScreen();
  expect(nav.getCurrentRoute()?.name).toBe('Form');

  await act(async () => finishSave());
  await waitFor(() => expect(nav.getCurrentRoute()?.name).toBe('List'));
  expect(await screen.findByText('Topic added')).toBeOnTheScreen();
});

it('the discard prompt comes back if the save fails', async () => {
  await setup();
  await fireEvent.press(screen.getByText('Type'));
  await fireEvent.press(screen.getByText('Save'));
  await act(async () => failSave());
  await goBack();
  expect(await screen.findByText('Discard changes?')).toBeOnTheScreen();
});

it('shows the after-save snackbar only once the screen has gone', async () => {
  jest.useFakeTimers();
  try {
    await setup();
    await fireEvent.press(screen.getByText('Save'));
    await act(async () => finishSave());
    expect(nav.getCurrentRoute()?.name).toBe('List');
    expect(screen.queryByText('Topic added')).toBeNull();
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.getByText('Topic added')).toBeOnTheScreen();
  } finally {
    jest.useRealTimers();
  }
});

// Mirrors TopicForm: the child form owns `saving`, reports it to the screen
// through an effect, and calls onSaved before its `finally` clears saving.
let finishChildSave: () => void = () => {};

function ChildForm({
  onSaved,
  onSavingChange,
  onType,
}: {
  onSaved: () => void;
  onSavingChange: (s: boolean) => void;
  onType: () => void;
}) {
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    onSavingChange(saving);
  }, [saving, onSavingChange]);
  const save = async () => {
    setSaving(true);
    try {
      await new Promise<void>(resolve => {
        finishChildSave = resolve;
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <Button title="Type" onPress={onType} />
      <Button
        title="Save"
        onPress={() => {
          save();
        }}
      />
    </>
  );
}

function EffectForm() {
  const snackbar = useSnackbar();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const guard = useLeaveGuard(dirty, saving);
  return (
    <>
      <Text>Form screen</Text>
      <ChildForm
        onType={() => setDirty(true)}
        onSavingChange={setSaving}
        onSaved={() =>
          guard.leaveAfterSave(() => snackbar.show({ message: 'Topic added' }))
        }
      />
      {guard.dialog}
    </>
  );
}

it('closes after a save even when the form reports saving through an effect', async () => {
  await renderWithProviders(
    <NavigationContainer ref={nav}>
      <Stack.Navigator>
        <Stack.Screen name="List" component={List} />
        <Stack.Screen name="Form" component={EffectForm} />
      </Stack.Navigator>
    </NavigationContainer>,
    makeHttp(),
  );
  await waitFor(() => expect(nav.isReady()).toBe(true));
  await act(async () => nav.navigate('Form'));
  expect(await screen.findByText('Form screen')).toBeOnTheScreen();

  await fireEvent.press(screen.getByText('Type'));
  await fireEvent.press(screen.getByText('Save'));
  await act(async () => finishChildSave());

  await waitFor(() => expect(nav.getCurrentRoute()?.name).toBe('List'));
  expect(await screen.findByText('Topic added')).toBeOnTheScreen();
  expect(screen.queryByText(STILL_SAVING_MESSAGE)).toBeNull();
  expect(screen.queryByText('Discard changes?')).toBeNull();
});
