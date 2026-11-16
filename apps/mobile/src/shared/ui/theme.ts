export type Colors = {
  background: string;
  surface: string;
  text: string;
  /** Secondary text; at least 4.5:1 on background, surface and softAccent. */
  muted: string;
  /** Dividers and card edges (decorative, low contrast). */
  line: string;
  /** Edges of controls (inputs, chips, outlined buttons); at least 3:1. */
  border: string;
  accent: string;
  accentText: string;
  softAccent: string;
  /** Accent for text drawn on an inverse (colors.text) background. */
  inverseAccent: string;
  danger: string;
  /** Fill behind error messages. */
  softDanger: string;
  /** Warning edges and text (amber); at least 4.5:1 on softWarning. */
  warning: string;
  /** Fill behind warning messages. */
  softWarning: string;
  success: string;
  input: string;
};

export const lightColors: Colors = {
  background: '#F3F7FA',
  surface: '#FFFFFF',
  text: '#142C3A',
  muted: '#5A6F7B',
  line: '#DCE6EB',
  border: '#7A8E99',
  accent: '#156E81',
  accentText: '#FFFFFF',
  softAccent: '#E3F3F5',
  inverseAccent: '#8FD3DF',
  danger: '#B34545',
  softDanger: '#FBEAEA',
  warning: '#8A5300',
  softWarning: '#FFF3DC',
  success: '#288168',
  input: '#F8FBFC',
};

export const darkColors: Colors = {
  background: '#101A20',
  surface: '#17252D',
  text: '#E6EEF2',
  muted: '#A4B5BE',
  line: '#2A3B45',
  border: '#60757F',
  accent: '#66B9C8',
  accentText: '#10252C',
  softAccent: '#203B44',
  inverseAccent: '#156E81',
  danger: '#F0867C',
  softDanger: '#3D2224',
  warning: '#E9B35F',
  softWarning: '#3A2D17',
  success: '#77C6A8',
  input: '#122029',
};

export const examColors = {
  'MS General Surgery': '#3279A3',
  'NEET SS': '#9B5D98',
  Both: '#6873B5',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** WCAG 2 contrast ratio between two '#RRGGBB' colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map(i => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
