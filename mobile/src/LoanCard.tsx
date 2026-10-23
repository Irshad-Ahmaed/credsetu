import { memo, useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Surface } from './components';
import { displayDate, formatPaise } from './format';
import type { Loan } from './ledgerTypes';
import { SwipeableCard } from './SwipeableCard';
import { colors, radius } from './theme';

export const LoanCard = memo(function LoanCard({ loan, onRepay, onDelete, repaying, deleting, busy, reduceMotion, businessToday }: {
  loan: Loan; onRepay: (loan: Loan) => void; onDelete: (loan: Loan) => void;
  repaying: boolean; deleting: boolean; busy: boolean; reduceMotion: boolean; businessToday: string;
}) {
  const status = loan.status === 'repaid' ? 'Repaid' : loan.is_overdue ? 'Overdue' : 'Pending';
  const ink = loan.status === 'repaid' ? colors.greenText : loan.is_overdue ? colors.danger : colors.amberText;
  const tint = loan.status === 'repaid' ? colors.greenBg : loan.is_overdue ? colors.dangerTint : colors.amberBg;
  const initials = loan.friend_name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] ?? '').join('').toUpperCase();
  const requestDelete = useCallback(() => onDelete(loan), [loan, onDelete]);
  return <SwipeableCard onDelete={requestDelete} disabled={busy} reduceMotion={reduceMotion}>
    <Surface style={{ gap: 14, borderColor: loan.is_overdue ? '#E7B6B1' : colors.border, opacity: deleting ? 0.6 : 1 }}>
      <View style={styles.identity}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.avatar, { backgroundColor: tint }]}><Text maxFontSizeMultiplier={1.5} style={[styles.initials, { color: ink }]}>{initials}</Text></View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text accessibilityRole="header" style={styles.name}>{loan.friend_name}</Text>
          <View accessibilityLabel={`Status: ${status}`} style={[styles.badge, { backgroundColor: tint }]}><Text style={[styles.status, { color: ink }]}>{status}</Text></View>
        </View>
      </View>
      <View style={{ gap: 5 }}>
        <Text style={styles.amount}>{formatPaise(loan.amount_paise)}</Text>
        <Text style={styles.date}>{loan.status === 'repaid' ? `Repaid ${displayDate(loan.repaid_on!)}`
          : `${loan.due_on === businessToday ? 'Due today ·' : loan.is_overdue ? 'Was due' : 'Due'} ${displayDate(loan.due_on)}`}</Text>
        {loan.status === 'repaid' ? <Text style={styles.caption}>Original due date · {displayDate(loan.due_on)}</Text> : null}
      </View>
      <View style={styles.actions}>
        {loan.receipt_available ? <Pressable accessibilityRole="button" accessibilityLabel={`View ${loan.friend_name}'s receipt photo`}
          disabled={busy} accessibilityState={{ disabled: busy }} style={({ pressed }) => [styles.link, { backgroundColor: pressed ? colors.primaryTint : 'transparent', opacity: busy ? 0.55 : 1 }]}
          onPress={() => router.push({ pathname: '/(app)/receipt', params: { id: loan.id, name: loan.friend_name } })}>
          <Text style={[styles.linkText, { color: colors.primary }]}>View receipt →</Text>
        </Pressable> : <Text style={styles.caption}>No receipt attached</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${loan.friend_name}'s ${formatPaise(loan.amount_paise)} entry`}
          accessibilityState={{ disabled: busy, busy: deleting }} disabled={busy} onPress={requestDelete}
          style={({ pressed }) => [styles.link, { backgroundColor: pressed ? colors.dangerTint : 'transparent', opacity: busy && !deleting ? 0.55 : 1 }]}>
          {deleting ? <ActivityIndicator color={colors.danger} accessibilityLabel="Deleting entry" />
            : <Text style={[styles.linkText, { color: colors.danger }]}>Delete</Text>}
        </Pressable>
      </View>
      {loan.status === 'pending' ? <Button title="Mark as repaid" loading={repaying} disabled={busy}
        accessibilityLabel={repaying ? 'Saving repayment' : `Mark ${loan.friend_name}'s entry as repaid`}
        variant="secondary" onPress={() => onRepay(loan)} style={{ minHeight: 48, backgroundColor: colors.primaryTint, borderColor: '#B7D9CB' }} /> : null}
    </Surface>
  </SwipeableCard>;
});

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 16, fontWeight: '700' },
  name: { color: colors.textPrimary, fontSize: 17, lineHeight: 23, fontWeight: '700' },
  badge: { alignSelf: 'flex-start', minHeight: 24, paddingHorizontal: 9, paddingVertical: 3, borderRadius: radius.pill },
  status: { fontSize: 12, lineHeight: 17, fontWeight: '700' },
  amount: { color: colors.textPrimary, fontSize: 26, lineHeight: 34, fontWeight: '700' },
  date: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  caption: { color: colors.textTertiary, fontSize: 12, lineHeight: 18 },
  actions: { borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 2, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  link: { minHeight: 48, minWidth: 64, maxWidth: '100%', flexShrink: 1, borderRadius: 8, paddingHorizontal: 8, justifyContent: 'center' },
  linkText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
});
