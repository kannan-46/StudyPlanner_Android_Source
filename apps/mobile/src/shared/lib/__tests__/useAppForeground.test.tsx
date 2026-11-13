import React from 'react';
import { AppState } from 'react-native';
import { render } from '@testing-library/react-native';
import { useAppForeground } from '../useAppForeground';

function Probe({ cb }: { cb: () => void }) {
  useAppForeground(cb);
  return null;
}

it('fires only on background to active', async () => {
  let listener: (s: string) => void = () => {};
  const remove = jest.fn();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(((_: string, l: (s: string) => void) => {
      listener = l;
      return { remove };
    }) as never);
  const cb = jest.fn();
  const { unmount } = await render(<Probe cb={cb} />);
  listener('active');
  expect(cb).not.toHaveBeenCalled();
  listener('background');
  listener('active');
  expect(cb).toHaveBeenCalledTimes(1);
  await unmount();
  expect(remove).toHaveBeenCalled();
});
