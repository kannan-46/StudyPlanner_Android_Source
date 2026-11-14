import React from 'react';
import { KeyboardAvoidingView, Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HeaderHeightContext } from '@react-navigation/elements';
import { Screen } from '../Screen';
import { UnderHeaderContext } from '../StackHeader';
import { ThemeProvider } from '../ThemeProvider';

// Record the props Screen gives the keyboard avoider (its maths needs a real
// keyboard, so only the inputs can be checked here).
jest.mock(
  'react-native/Libraries/Components/Keyboard/KeyboardAvoidingView',
  () => ({
    __esModule: true,
    default: jest.fn(({ children }: { children: React.ReactNode }) => children),
  }),
);

const avoider = KeyboardAvoidingView as unknown as jest.Mock;

const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 24, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ThemeProvider mode="light">{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );

const lastProps = () => avoider.mock.calls[avoider.mock.calls.length - 1][0];

beforeEach(() => avoider.mockClear());

it('a scrolling Screen under a header leaves room for the header above the keyboard', async () => {
  await wrap(
    <HeaderHeightContext.Provider value={88}>
      <UnderHeaderContext.Provider value>
        <Screen scroll>
          <Text>form</Text>
        </Screen>
      </UnderHeaderContext.Provider>
    </HeaderHeightContext.Provider>,
  );
  expect(lastProps().keyboardVerticalOffset).toBe(88);
});

it('a scrolling Screen without a header needs no keyboard offset', async () => {
  await wrap(
    <HeaderHeightContext.Provider value={88}>
      <Screen scroll>
        <Text>form</Text>
      </Screen>
    </HeaderHeightContext.Provider>,
  );
  expect(lastProps().keyboardVerticalOffset).toBe(0);
});

it('falls back to no offset when the header height is not known yet', async () => {
  await wrap(
    <UnderHeaderContext.Provider value>
      <Screen scroll>
        <Text>form</Text>
      </Screen>
    </UnderHeaderContext.Provider>,
  );
  expect(lastProps().keyboardVerticalOffset).toBe(0);
});
