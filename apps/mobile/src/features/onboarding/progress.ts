import { createContext } from 'react';

/** Told by each setup step (1-4) when it is shown; no-op outside setup. */
export const OnboardingProgressContext = createContext<(step: number) => void>(
  () => {},
);
