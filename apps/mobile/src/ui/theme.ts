export type Theme = {
  background: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  accent: string;
  accentText: string;
  softAccent: string;
  danger: string;
  success: string;
  input: string;
};

export const lightTheme: Theme = {
  background: '#F3F7FA',
  surface: '#FFFFFF',
  text: '#142C3A',
  muted: '#607581',
  line: '#DCE6EB',
  accent: '#156E81',
  accentText: '#FFFFFF',
  softAccent: '#E3F3F5',
  danger: '#B34545',
  success: '#288168',
  input: '#F8FBFC',
};

export const darkTheme: Theme = {
  background: '#101A20',
  surface: '#17252D',
  text: '#E6EEF2',
  muted: '#A4B5BE',
  line: '#2A3B45',
  accent: '#66B9C8',
  accentText: '#10252C',
  softAccent: '#203B44',
  danger: '#F0867C',
  success: '#77C6A8',
  input: '#122029',
};

export const examColors = {
  'MS General Surgery': '#3279A3',
  'NEET SS': '#9B5D98',
  Both: '#6873B5',
} as const;
