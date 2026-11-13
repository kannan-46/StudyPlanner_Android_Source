import type { LinkingOptions } from '@react-navigation/native';

export const linking: LinkingOptions<ReactNavigation.RootParamList> = {
  prefixes: ['studyplanner://'],
  config: {
    screens: {
      MainTabs: {
        screens: { Schedule: 'schedule' },
      },
    },
  },
};
