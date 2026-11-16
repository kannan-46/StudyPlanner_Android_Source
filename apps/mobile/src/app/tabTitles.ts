/**
 * The title of each main tab. The tab bar label and the heading at the top
 * of each tab screen use the same words, so every tab reads the same way.
 * Home greets the user instead of showing its title.
 */
export const TAB_TITLES = {
  Home: 'Home',
  Schedule: 'Schedule',
  Topics: 'Topics',
  Progress: 'Progress',
  Settings: 'Settings',
} as const;

export type TabName = keyof typeof TAB_TITLES;
