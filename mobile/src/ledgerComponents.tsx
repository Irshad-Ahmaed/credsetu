import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { Button, Surface } from './components';
import { displayDate, formatPaise } from './format';
import { LedgerSummary } from './ledgerTypes';
import { colors } from './theme';

function Metric({ label, value, tint, ink, wide }: { label: string; value: string; tint: string; ink: string; wide: boolean }) {
  return <View style={{ flex: 1, minWidth: wide ? '100%' : '46%', backgroundColor: tint, borderRadius: 12, padding: 12, gap: 4 }}>
    <Text style={{ color: ink, fontSize: 12, lineHeight: 17, fontWeight: '600' }}>{label}</Text>
    <Text style={{ color: colors.textPrimary, fontSize: 20, lineHeight: 26, fontWeight: '700', flexWrap: 'wrap' }}>{value}</Text>
  </View>;
}

export function SummaryCard({ summary }: { summary: LedgerSummary }) {
  const { fontScale } = useWindowDimensions();
  const wide = fontScale > 1.35;
  return <Surface style={{ gap: 12, borderColor: '#B7D9CB' }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>Summary</Text>
      <Text style={{ color: colors.textTertiary, fontSize: 12 }}>INR · India time</Text>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Metric wide={wide} label="Total lent" value={formatPaise(summary.total_lent_paise)} tint={colors.blueBg} ink={colors.blueText} />
      <Metric wide={wide} label="Total repaid" value={formatPaise(summary.total_repaid_paise)} tint={colors.greenBg} ink={colors.greenText} />
      <Metric wide={wide} label="Pending repayment" value={formatPaise(summary.total_pending_paise)} tint={colors.primaryTint} ink={colors.primary} />
      <Metric wide={wide} label="Overdue" value={formatPaise(summary.total_overdue_paise)} tint={colors.dangerTint} ink={colors.danger} />
    </View>
    <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>As of {displayDate(summary.business_today)}. Overdue is included in pending.</Text>
  </Surface>;
}

export function LedgerHeader({ summary, error, onRetry, onAdd, onLogout, busy = false }: {
  summary: LedgerSummary | null; error: string; onRetry: () => void; onAdd: () => void; onLogout: () => void; busy?: boolean;
}) {
  return <View style={{ gap: 20, paddingBottom: 18 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <View style={{ gap: 2, flexShrink: 1 }}>
        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.4 }}>MINILEDGER</Text>
        <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontSize: 24, lineHeight: 31, fontWeight: '700' }}>Your ledger</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Log out" accessibilityState={{ disabled: busy }} disabled={busy} onPress={onLogout} style={({ pressed }) => ({ minWidth: 64, minHeight: 48, paddingHorizontal: 10, borderRadius: 12, justifyContent: 'center', alignItems: 'center', opacity: busy ? 0.55 : 1, backgroundColor: pressed ? colors.primaryTint : 'transparent' })}>
        <Text style={{ color: colors.primary, fontSize: 14, fontWeight: '700' }}>Log out</Text>
      </Pressable>
    </View>
    {summary ? <SummaryCard summary={summary} /> : null}
    {error && summary ? <View accessibilityRole="alert" style={{ borderRadius: 12, borderWidth: 1, borderColor: '#F0BDB9', backgroundColor: colors.dangerTint, padding: 12, gap: 8 }}>
      <Text style={{ color: colors.danger, fontSize: 13, lineHeight: 19 }}>{error} Showing the last loaded data.</Text>
      <Button title="Try again" disabled={busy} variant="secondary" onPress={onRetry} style={{ minHeight: 48, alignSelf: 'flex-start' }} />
    </View> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 160 }}>
        <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '700' }}>Entries</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>Swipe left or right to delete.</Text>
      </View>
      <Button title="＋ Add entry" disabled={busy} onPress={onAdd} style={{ paddingHorizontal: 14, minHeight: 48 }} />
    </View>
  </View>;
}

export function EmptyLedger({ onAdd, disabled = false }: { onAdd: () => void; disabled?: boolean }) {
  return <Surface style={{ alignItems: 'center', gap: 10, padding: 24 }}>
    <Text style={{ fontSize: 30 }}>✦</Text>
    <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>Start your ledger</Text>
    <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>Add money you lent to a friend. Your summary will appear above.</Text>
    <Button title="Add your first entry" disabled={disabled} onPress={onAdd} style={{ alignSelf: 'stretch', marginTop: 4 }} />
  </Surface>;
}


