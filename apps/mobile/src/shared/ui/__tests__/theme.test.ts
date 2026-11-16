import { contrastRatio, darkColors, lightColors, type Colors } from '../theme';

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as [string, Colors][])('%s theme contrast', (_name, c) => {
  it('control edges reach 3:1 against every surface they sit on', () => {
    for (const bg of [c.background, c.surface, c.input]) {
      expect(contrastRatio(c.border, bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it('muted text reaches 4.5:1 on background, surface and softAccent', () => {
    for (const bg of [c.background, c.surface, c.softAccent]) {
      expect(contrastRatio(c.muted, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('warning and error banners keep their text and action readable', () => {
    expect(contrastRatio(c.warning, c.softWarning)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.text, c.softWarning)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.accent, c.softWarning)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.danger, c.softDanger)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.text, c.softDanger)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.accent, c.softDanger)).toBeGreaterThanOrEqual(4.5);
  });

  it('danger text reads on the page and on cards', () => {
    expect(contrastRatio(c.danger, c.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c.danger, c.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('the snackbar action is readable on the inverse bar', () => {
    expect(contrastRatio(c.inverseAccent, c.text)).toBeGreaterThanOrEqual(4.5);
    expect(c.inverseAccent).not.toBe(c.background);
  });
});

it('contrastRatio matches the WCAG formula', () => {
  expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
});
