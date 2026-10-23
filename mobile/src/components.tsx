import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { colors, radius, space } from './theme';

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={{ gap: 4 }}><Text accessibilityRole="header" style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>;
}

export function Button({ title, onPress, disabled, loading, variant = 'primary', style, accessibilityLabel }: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: 'primary' | 'secondary' | 'danger'; style?: ViewStyle; accessibilityLabel?: string;
}) {
  const backgroundColor = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.dangerTint : colors.surface;
  const color = variant === 'primary' ? '#FFFFFF' : variant === 'danger' ? colors.danger : colors.textPrimary;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }} disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor, opacity: disabled ? 0.55 : pressed ? 0.84 : 1 }, variant !== 'primary' && styles.outline, style]}>
    {loading ? <ActivityIndicator color={color} /> : <Text style={[styles.buttonText, { color }]}>{title}</Text>}
  </Pressable>;
}

export function Field({ label, error, containerStyle, inputRef, ...props }: TextInputProps & { label: string; error?: string; containerStyle?: StyleProp<ViewStyle>; inputRef?: React.Ref<TextInput> }) {
  return <View style={[{ gap: 6 }, containerStyle]}>
    <Text style={styles.label}>{label}</Text>
    <TextInput ref={inputRef} {...props} accessibilityLabel={label} accessibilityHint={error ? `Error: ${error}` : undefined}
      placeholderTextColor={colors.textTertiary} selectionColor={colors.primary}
      style={[styles.input, !!error && { borderColor: colors.danger }]} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

export function Surface({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

export function ScreenMessage({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <View style={styles.message}><Text style={styles.messageTitle}>{title}</Text><Text style={styles.subtitle}>{body}</Text>{action}</View>;
}

export const styles = StyleSheet.create({
  title: { color: colors.textPrimary, fontSize: 25, lineHeight: 32, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  label: { color: colors.textPrimary, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.borderInteractive, borderRadius: radius.input, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, color: colors.textPrimary, fontSize: 16, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  button: { minHeight: 52, borderRadius: radius.button, paddingHorizontal: 20, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  outline: { borderWidth: 1, borderColor: colors.borderInteractive },
  surface: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: space.base },
  message: { alignItems: 'center', gap: 12, padding: 24 },
  messageTitle: { color: colors.textPrimary, fontSize: 18, lineHeight: 24, fontWeight: '700', textAlign: 'center' },
});
