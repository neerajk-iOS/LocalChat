export const colors = {
  // Core backgrounds
  background:     '#0F172A',
  surface:        '#1E293B',
  surfaceHigh:    '#293548',
  surfaceHigher:  '#334155',
  border:         '#334155',
  borderLight:    '#475569',

  // Brand
  primary:        '#6366F1',
  primaryLight:   '#818CF8',
  primaryDark:    '#4F46E5',
  primaryFade:    'rgba(99,102,241,0.15)',
  secondary:      '#8B5CF6',
  accent:         '#06B6D4',

  // Text
  text:           '#F8FAFC',
  textSecondary:  '#94A3B8',
  textMuted:      '#64748B',
  textInverse:    '#0F172A',

  // State
  success:        '#10B981',
  successFade:    'rgba(16,185,129,0.15)',
  warning:        '#F59E0B',
  warningFade:    'rgba(245,158,11,0.15)',
  error:          '#EF4444',
  errorFade:      'rgba(239,68,68,0.15)',

  // Chat bubbles
  bubbleOut:      '#4F46E5',
  bubbleIn:       '#1E293B',
  bubbleOutText:  '#FFFFFF',
  bubbleInText:   '#F1F5F9',

  // Misc
  online:         '#10B981',
  offline:        '#64748B',
  overlay:        'rgba(0,0,0,0.6)',
  transparent:    'transparent',
  white:          '#FFFFFF',
  black:          '#000000',
};

export const typography = {
  // Font sizes
  xs:   11,
  sm:   13,
  base: 15,
  md:   17,
  lg:   19,
  xl:   22,
  '2xl': 26,
  '3xl': 32,

  // Weights
  regular:    '400',
  medium:     '500',
  semibold:   '600',
  bold:       '700',
  extrabold:  '800',
};

export const spacing = {
  0:  0,
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  7:  28,
  8:  32,
  10: 40,
  12: 48,
  16: 64,
};

export const radii = {
  sm:   6,
  md:   10,
  lg:   16,
  xl:   20,
  full: 9999,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
};

export default { colors, typography, spacing, radii, shadows };
