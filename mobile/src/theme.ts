export const colors = {
  primary: '#047857', primaryPressed: '#065F46', primaryTint: '#E8F7EE',
  background: '#F7FAF9', surface: '#FFFFFF', textPrimary: '#111827',
  textSecondary: '#4B5563', textTertiary: '#6B7280', border: '#DCE5E1',
  borderInteractive: '#81938A', divider: '#E9EFEB', disabled: '#AFBBB5',
  danger: '#B42318', dangerTint: '#FEECEB', overlay: 'rgba(17,24,39,0.54)',
  blueBg: '#E8F2FF', blueText: '#1D4ED8', greenBg: '#E8F7EE', greenText: '#067647',
  amberBg: '#FFF7DF', amberText: '#92400E',
} as const;

export const space = { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32 } as const;
export const radius = { small: 10, input: 12, card: 16, button: 14, sheet: 24, pill: 999 } as const;
export const shadow = {
  card: { shadowColor: '#111827', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
} as const;
