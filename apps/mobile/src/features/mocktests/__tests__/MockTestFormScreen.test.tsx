import React from 'react';
import { fireEvent, screen } from '@testing-library/react-native';
import { MockTestFormScreen, MOCK_TEST_GONE_TEXT } from '../MockTestFormScreen';
import {
  cleanupClients,
  makeHttp,
  renderWithProviders,
} from '../../../test/testUtils';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
  usePreventRemove: jest.fn(),
  useNavigation: () => ({ goBack: mockGoBack, dispatch: jest.fn() }),
  useRoute: () => ({ params: { id: 'gone' } }),
}));

afterEach(async () => {
  await cleanupClients();
  mockGoBack.mockClear();
});

it('says a deleted mock test is gone and offers a way back', async () => {
  const http = makeHttp();
  await renderWithProviders(<MockTestFormScreen />, http);
  expect(await screen.findByText(MOCK_TEST_GONE_TEXT)).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Go back' }));
  expect(mockGoBack).toHaveBeenCalled();
});
