import React from 'react';
import { Text, View, useWindowDimensions } from 'react-native';
import { render } from '@testing-library/react-native';
import { ResponsiveContainer, columnsFor, useResponsive } from '../responsive';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockDims = (width: number, height = 800, fontScale = 1) =>
  (useWindowDimensions as jest.Mock).mockReturnValue({
    width,
    height,
    scale: 2,
    fontScale,
  });

let r: ReturnType<typeof useResponsive>;
function Probe() {
  r = useResponsive();
  return null;
}

it('classifies sizes', async () => {
  mockDims(320);
  await render(<Probe />);
  expect(r.size).toBe('compact');
  mockDims(700);
  await render(<Probe />);
  expect(r.size).toBe('medium');
  mockDims(1000);
  await render(<Probe />);
  expect(r.size).toBe('expanded');
  mockDims(599);
  await render(<Probe />);
  expect(r.size).toBe('compact');
  mockDims(900);
  await render(<Probe />);
  expect(r.size).toBe('expanded');
});

it('detects landscape and fontScale', async () => {
  mockDims(800, 400, 1.3);
  await render(<Probe />);
  expect(r.isLandscape).toBe(true);
  expect(r.fontScale).toBe(1.3);
  mockDims(400, 800);
  await render(<Probe />);
  expect(r.isLandscape).toBe(false);
});

it('columnsFor', async () => {
  expect(columnsFor('compact', { compact: 1, medium: 2, expanded: 2 })).toBe(1);
  expect(columnsFor('medium', { compact: 1, medium: 2, expanded: 3 })).toBe(2);
});

it('ResponsiveContainer applies maxWidth 720 only at >= 700', async () => {
  const style = async (w: number) => {
    mockDims(w);
    const { getByTestId } = await render(
      <ResponsiveContainer maxWidth={720}>
        <View testID="inner">
          <Text>x</Text>
        </View>
      </ResponsiveContainer>,
    );
    return getByTestId('responsive-container').props.style;
  };
  expect(JSON.stringify(await style(320))).not.toContain('720');
  expect(JSON.stringify(await style(700))).toContain('720');
  expect(JSON.stringify(await style(1000))).toContain('720');
});
