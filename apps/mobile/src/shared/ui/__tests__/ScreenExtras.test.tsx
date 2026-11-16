import React, { useRef } from 'react';
import {
  AccessibilityInfo,
  ScrollView,
  StyleSheet,
  Text,
  type ScrollViewInstance,
} from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Screen } from '../Screen';
import { ScreenTitle } from '../ScreenTitle';
import { ScrollToTopOnTabPress } from '../ScrollToTopOnTabPress';
import { SectionHeading } from '../SectionHeading';
import { DueText, dueTextStyle } from '../DueText';
import { ErrorRetry } from '../ErrorRetry';
import { announce } from '../announce';
import { darkColors, lightColors } from '../theme';
import { ThemeProvider } from '../ThemeProvider';
import { ApiError } from '../../api/errors';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

afterEach(cleanupClients);

const Tabs = createBottomTabNavigator();

function Settings() {
  return (
    <Screen scroll scrollToTopOnTabPress>
      <Text>Settings body</Text>
    </Screen>
  );
}
function Other() {
  return <Text>Other body</Text>;
}

describe('scroll to top on tab re-press', () => {
  it('scrolls a Screen back to the top when its tab is pressed again', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype as never, 'scrollTo');
    scrollTo.mockClear();
    await renderWithProviders(
      <NavigationContainer>
        <Tabs.Navigator>
          <Tabs.Screen name="Settings" component={Settings} />
          <Tabs.Screen name="Other" component={Other} />
        </Tabs.Navigator>
      </NavigationContainer>,
      makeHttp(),
    );
    expect(await screen.findByText('Settings body')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /Settings/ }));
    await waitFor(() =>
      expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true }),
    );
  });

  it('does nothing (and does not throw) outside a navigator', async () => {
    function Bare() {
      const ref = useRef<ScrollViewInstance>(null);
      return (
        <>
          <ScrollToTopOnTabPress scrollRef={ref} />
          <ScrollView ref={ref}>
            <Text>Bare</Text>
          </ScrollView>
        </>
      );
    }
    await render(<Bare />);
    expect(screen.getByText('Bare')).toBeOnTheScreen();
  });

  it('a Screen with the option renders without a navigator too', async () => {
    await renderWithProviders(<Settings />, makeHttp());
    expect(screen.getByText('Settings body')).toBeOnTheScreen();
  });
});

describe('headings', () => {
  it('ScreenTitle and SectionHeading are headings with one style each', async () => {
    await render(
      <ThemeProvider mode="dark">
        <ScreenTitle>Schedule</ScreenTitle>
        <SectionHeading>Overdue</SectionHeading>
      </ThemeProvider>,
    );
    const title = screen.getByRole('header', { name: 'Schedule' });
    const section = screen.getByRole('header', { name: 'Overdue' });
    expect(StyleSheet.flatten(title.props.style)).toMatchObject({
      color: darkColors.text,
      fontSize: 24,
      fontWeight: '700',
    });
    expect(StyleSheet.flatten(section.props.style)).toMatchObject({
      color: darkColors.text,
      fontSize: 18,
      fontWeight: '700',
    });
  });

  it('accepts extra spacing', async () => {
    await render(
      <ThemeProvider mode="light">
        <SectionHeading style={{ marginTop: 12 }}>Today</SectionHeading>
      </ThemeProvider>,
    );
    expect(
      StyleSheet.flatten(screen.getByRole('header').props.style).marginTop,
    ).toBe(12);
  });
});

describe('DueText', () => {
  it('draws overdue in red and bold, others in body text', async () => {
    await render(
      <ThemeProvider mode="light">
        <DueText due="2026-11-10" today="2026-11-13" />
        <DueText due="2026-11-17" today="2026-11-13" />
      </ThemeProvider>,
    );
    expect(
      StyleSheet.flatten(screen.getByText('Overdue by 3 days').props.style),
    ).toMatchObject({ color: lightColors.danger, fontWeight: '700' });
    expect(
      StyleSheet.flatten(screen.getByText('In 4 days, 17 Nov').props.style)
        .color,
    ).toBe(lightColors.text);
    expect(dueTextStyle(false, darkColors)).toEqual({ color: darkColors.text });
  });
});

describe('announcements', () => {
  const spy = jest.mocked(AccessibilityInfo.announceForAccessibility);
  beforeEach(() => spy.mockClear());

  it('announce() speaks non-empty text only', () => {
    announce('Saved');
    announce('  ');
    announce(null);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('Saved');
  });

  it('ErrorRetry reads its message when it appears', async () => {
    await render(
      <ThemeProvider mode="light">
        <ErrorRetry error={new ApiError('NETWORK', 0)} onRetry={() => {}} />
      </ThemeProvider>,
    );
    expect(spy).toHaveBeenCalledWith(expect.stringMatching(/server/));
  });
});
