import React from 'react';
import { render } from '@testing-library/react-native';
import { useRefetchOnFocus } from '../useRefetchOnFocus';

let focusCb: (() => void) | undefined;
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(() => {
      focusCb = cb;
      cb();
    }, [cb]);
  },
}));

function Probe({ fn }: { fn: () => void }) {
  useRefetchOnFocus(fn);
  return null;
}

it('skips the first focus and refetches on later focuses', async () => {
  const fn = jest.fn();
  await render(<Probe fn={fn} />);
  expect(fn).not.toHaveBeenCalled();
  focusCb?.();
  expect(fn).toHaveBeenCalledTimes(1);
  focusCb?.();
  expect(fn).toHaveBeenCalledTimes(2);
});
