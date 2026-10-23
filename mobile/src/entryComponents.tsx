import { ActivityIndicator, Image, Modal, Pressable, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button } from './components';
import { displayDate } from './format';
import { colors } from './theme';

export function DueDateField({ value, error, disabled, onPress }: { value: string; error?: string; disabled: boolean; onPress: () => void }) {
  return <View style={{ gap: 6 }}>
    <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>Due date <Text style={{ color: colors.danger }}>*</Text></Text>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} accessibilityLabel={value ? `Due date ${displayDate(value)}` : 'Choose a due date'} accessibilityHint="Dates follow India time" disabled={disabled} onPress={onPress}
      style={{ minHeight: 52, borderWidth: 1, borderColor: error ? colors.danger : colors.borderInteractive, borderRadius: 12, backgroundColor: colors.surface, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: disabled ? 0.6 : 1 }}>
      <Text style={{ fontSize: 18 }}>▦</Text>
      <Text style={{ color: value ? colors.textPrimary : colors.textTertiary, fontSize: 16, flex: 1 }}>{value ? displayDate(value) : 'Choose a date'}</Text>
      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>Change</Text>
    </Pressable>
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
      : <Text style={{ color: colors.textTertiary, fontSize: 12, lineHeight: 17 }}>Past dates are allowed. Calendar dates follow India time.</Text>}
  </View>;
}

export function ReceiptField({ uri, error, picking, disabled, onCamera, onLibrary, onRemove }: {
  uri: string | null; error: string; picking: boolean; disabled: boolean;
  onCamera: () => void; onLibrary: () => void; onRemove: () => void;
}) {
  return <View style={{ gap: 8 }}>
    <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 20, fontWeight: '600' }}>Receipt photo <Text style={{ color: colors.textTertiary, fontWeight: '400' }}>· optional</Text></Text>
    {uri ? <View style={{ gap: 10 }}>
      <Image accessibilityLabel="Selected receipt photo preview" source={{ uri }} style={{ width: '100%', height: 180, borderRadius: 12, backgroundColor: colors.background }} resizeMode="cover" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Button title="Take another" variant="secondary" onPress={onCamera} disabled={disabled} style={{ flexGrow: 1, minHeight: 48, paddingHorizontal: 10 }} />
        <Button title="Remove photo" variant="danger" onPress={onRemove} disabled={disabled} style={{ flexGrow: 1, minHeight: 48, paddingHorizontal: 10 }} />
      </View>
    </View> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Button title="Take photo" variant="secondary" onPress={onCamera} disabled={disabled} style={{ flexGrow: 1, minHeight: 48, paddingHorizontal: 10 }} />
      <Button title="Choose photo" variant="secondary" onPress={onLibrary} disabled={disabled} style={{ flexGrow: 1, minHeight: 48, paddingHorizontal: 10 }} />
    </View>}
    <Text style={{ color: colors.textTertiary, fontSize: 12, lineHeight: 17 }}>One JPEG receipt, resized on your phone, up to 5 MB. Camera permission is only requested when you tap Take photo.</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13, lineHeight: 18 }}>{error}</Text> : null}
    {picking ? <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.textSecondary }}>Saving photo on this device…</Text></View> : null}
  </View>;
}

export function DatePickerSheet({ visible, value, bottomInset, onChange, onDone, onClose }: {
  visible: boolean; value: Date; bottomInset: number; onChange: (date: Date) => void; onDone: () => void; onClose: () => void;
}) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }}>
      <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: Math.max(28, bottomInset + 16) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>Choose due date</Text>
          <Pressable accessibilityRole="button" onPress={onDone} style={{ minWidth: 56, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center' }}>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '700' }}>Done</Text>
          </Pressable>
        </View>
        <DateTimePicker value={value} mode="date" display="spinner" timeZoneName="Asia/Kolkata" onValueChange={(_event, date) => onChange(date)} />
      </View>
    </View>
  </Modal>;
}
