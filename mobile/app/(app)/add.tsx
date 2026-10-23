import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError, api } from '../../src/api';
import { useAuth } from '../../src/auth';
import { Button, Field, PageTitle, Surface } from '../../src/components';
import { DatePickerSheet, DueDateField, ReceiptField } from '../../src/entryComponents';
import { clearDraft, loadDraft, saveDraft } from '../../src/draft';
import { dateToPicker, isCalendarDate, newSubmissionKey, pickerDateToIndia } from '../../src/entryUtils';
import { keepReceiptOnDevice, removeLocalReceipt } from '../../src/receiptFile';
import { rupeesToPaise } from '../../src/format';
import { colors, space } from '../../src/theme';
import { useDraftNavigationGuard, type PendingNavigation } from '../../src/useDraftNavigationGuard';

export default function AddEntryScreen() {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [friend, setFriend] = useState('');
  const [amount, setAmount] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [key, setKey] = useState(newSubmissionKey);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [iosPicker, setIosPicker] = useState(false);
  const [iosDate, setIosDate] = useState(dateToPicker(''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [retryLocked, setRetryLocked] = useState(false);
  const [savedRemotely, setSavedRemotely] = useState(false);
  const [allowRemoval, setAllowRemoval] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation>(null);
  const active = useRef(true);
  const pickerBusy = useRef(false);
  const submitBusy = useRef(false);
  const navigationSaveBusy = useRef(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const amountInput = useRef<TextInput | null>(null);

  const cancelDraftTimer = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
  }, []);

  useEffect(() => {
    active.current = true;
    let alive = true;
    const restore = async () => {
      try {
        if (user) {
          const draft = await loadDraft(user.id);
          if (!alive) return;
          if (draft) {
            setFriend(draft.friendName); setAmount(draft.amount); setDueOn(draft.dueOn);
            setReceiptUri(draft.receiptUri); setKey(draft.submissionKey); setPhotoError(draft.photoMessage ?? '');
          }
        }
      } catch {
        if (alive) setDraftError('Could not restore the saved entry. Check device storage before continuing.');
      } finally { if (alive) setHydrated(true); }
    };
    void restore();
    return () => { alive = false; active.current = false; cancelDraftTimer(); };
  }, [user, cancelDraftTimer]);

  const persist = useCallback(async () => {
    if (!hydrated || !user || !active.current || savedRemotely) return;
    const saved = await saveDraft(user.id, { friendName: friend, amount, dueOn, receiptUri, submissionKey: key });
    if (active.current) setDraftError(saved ? '' : 'Device storage is unavailable. The entry draft could not be saved.');
  }, [hydrated, user, friend, amount, dueOn, receiptUri, key, savedRemotely]);

  useEffect(() => {
    cancelDraftTimer();
    if (!hydrated || savedRemotely) return;
    draftTimer.current = setTimeout(() => { draftTimer.current = null; void persist(); }, 180);
    return cancelDraftTimer;
  }, [persist, hydrated, savedRemotely, cancelDraftTimer]);

  const navigation = useDraftNavigationGuard({
    allowRemoval, savedRemotely, user, saving, picking, friend, amount, dueOn,
    receiptUri, submissionKey: key, active, navigationSaveBusy, pickerBusy, submitBusy,
    cancelDraftTimer, setFormError, setDraftError, setPendingNavigation, setAllowRemoval,
  });

  useEffect(() => {
    if (!allowRemoval || !pendingNavigation) return;
    if (pendingNavigation === 'back') router.back();
    else navigation.dispatch(pendingNavigation);
    setPendingNavigation(null);
  }, [allowRemoval, pendingNavigation, navigation]);

  const acceptPickerResult = useCallback(async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || !result.assets[0] || !user) return;
    setFormError('');
    try {
      const savedUri = await keepReceiptOnDevice(result.assets[0].uri, { width: result.assets[0].width, height: result.assets[0].height });
      const persisted = await saveDraft(user.id, { friendName: friend, amount, dueOn, receiptUri: savedUri, submissionKey: key });
      if (!persisted) {
        removeLocalReceipt(savedUri);
        setPhotoError('Could not save this entry draft on the device. Try again before attaching a photo.');
        return;
      }
      setDraftError('');
      if (receiptUri && receiptUri !== savedUri) removeLocalReceipt(receiptUri);
      setReceiptUri(savedUri);
      setPhotoError('');
    } catch (cause) { setPhotoError(cause instanceof Error ? cause.message : 'Could not save this photo. Try again or choose a different image.'); }
  }, [user, friend, amount, dueOn, key, receiptUri]);

  const runPicker = useCallback(async (source: 'camera' | 'library') => {
    if (!hydrated || pickerBusy.current || submitBusy.current || retryLocked || savedRemotely || !user) return;
    pickerBusy.current = true;
    setPicking(true);
    cancelDraftTimer();
    Keyboard.dismiss(); setFormError(''); setPhotoError('');
    try {
      const persisted = await saveDraft(user.id, { friendName: friend, amount, dueOn, receiptUri, submissionKey: key });
      if (!persisted) { setDraftError('Device storage is unavailable. Save the draft before opening the photo picker.'); return; }
      setDraftError('');
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera permission needed', permission.canAskAgain ? 'Allow camera access to take a receipt photo.' : 'Enable camera access in Settings, or choose a photo from your library.', [
            { text: 'Cancel', style: 'cancel' },
            ...(!permission.canAskAgain ? [{ text: 'Open Settings', onPress: () => void Linking.openSettings() }] : []),
          ]);
          return;
        }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 0.8, exif: false })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8, exif: false });
      await acceptPickerResult(result);
    } catch {
      Alert.alert(source === 'camera' ? 'Camera unavailable' : 'Photo library unavailable', 'Your entry is still saved. Try the other photo option, or continue without a receipt.');
    } finally { pickerBusy.current = false; setPicking(false); }
  }, [hydrated, retryLocked, savedRemotely, user, cancelDraftTimer, friend, amount, dueOn, receiptUri, key, acceptPickerResult]);

  const validate = useCallback(() => {
    const next: Record<string, string> = {};
    if (Array.from(friend.trim()).length < 2 || Array.from(friend.trim()).length > 80) next.friend = 'Enter a name between 2 and 80 characters.';
    if (!rupeesToPaise(amount)) next.amount = 'Enter an amount above ₹0, with no more than 2 decimal places.';
    if (!dueOn) next.due = 'Choose a due date.';
    else if (!isCalendarDate(dueOn)) next.due = 'Choose a valid calendar date.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [friend, amount, dueOn]);

  const submit = useCallback(async () => {
    if (submitBusy.current || pickerBusy.current || navigationSaveBusy.current || !hydrated || !user || savedRemotely) return;
    Keyboard.dismiss(); setFormError('');
    if (!retryLocked && !validate()) return;
    submitBusy.current = true; setSaving(true); cancelDraftTimer();
    let requestStarted = false;
    try {
      if (!await saveDraft(user.id, { friendName: friend, amount, dueOn, receiptUri, submissionKey: key })) {
        throw new Error('Device storage is unavailable. MiniLedger could not save a safe retry key, so this entry was not sent.');
      }
      setDraftError('');
      requestStarted = true;
      await api('/loans', { method: 'POST', body: { friend_name: friend.trim(), amount_paise: rupeesToPaise(amount)!, due_on: dueOn }, key, receiptUri });
      active.current = false; setSavedRemotely(true);
      const cleared = await clearDraft(user.id);
      if (!cleared) {
        setFormError('Entry saved to your ledger, but the local draft could not be cleared. Check device storage, then tap Finish.');
        return;
      }
      removeLocalReceipt(receiptUri);
      setPendingNavigation('back'); setAllowRemoval(true);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        setAllowRemoval(true);
        await signOut({ preserveDraft: true });
        return;
      }
      if (cause instanceof ApiError && cause.fields) {
        const mapped: Record<string, string> = {};
        if (cause.fields.friend_name) mapped.friend = cause.fields.friend_name;
        if (cause.fields.amount_paise) mapped.amount = cause.fields.amount_paise;
        if (cause.fields.due_on) mapped.due = cause.fields.due_on;
        setErrors(mapped);
      }
      if (requestStarted && (!(cause instanceof ApiError) || cause.status >= 500 || cause.code === 'IDEMPOTENCY_CONFLICT')) setRetryLocked(true);
      setFormError(cause instanceof Error ? cause.message : 'Could not save this entry. Your draft and retry key are saved on this device.');
    } finally { submitBusy.current = false; setSaving(false); }
  }, [hydrated, user, signOut, savedRemotely, retryLocked, validate, cancelDraftTimer, friend, amount, dueOn, receiptUri, key]);

  const finish = useCallback(async () => {
    if (navigationSaveBusy.current) return;
    navigationSaveBusy.current = true;
    if (!user || !await clearDraft(user.id)) {
      navigationSaveBusy.current = false;
      setFormError('Device storage is still unavailable. The entry is safe in your ledger; try Finish again.');
      return;
    }
    removeLocalReceipt(receiptUri); setPendingNavigation('back'); setAllowRemoval(true);
  }, [user, receiptUri]);

  const discard = useCallback(() => {
    if (savedRemotely) { void finish(); return; }
    if (submitBusy.current || pickerBusy.current || navigationSaveBusy.current) {
      setFormError('Please wait for the current save or photo picker to finish before discarding this entry.');
      return;
    }
    Alert.alert('Discard this entry?', retryLocked
      ? 'This save may already be in your ledger. Check the ledger before discarding this form and its attached photo.'
      : 'The form and its attached photo will be removed from this device.', [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: async () => {
      if (submitBusy.current || pickerBusy.current || navigationSaveBusy.current) {
        setFormError('Please wait for the current save or photo picker to finish before discarding this entry.');
        return;
      }
      navigationSaveBusy.current = true;
      cancelDraftTimer();
      if (!user || !await clearDraft(user.id)) {
        navigationSaveBusy.current = false;
        setDraftError('Device storage is unavailable. The draft and photo were kept on this device.');
        return;
      }
      active.current = false;
      removeLocalReceipt(receiptUri); setPendingNavigation('back'); setAllowRemoval(true);
    } },
    ]);
  }, [savedRemotely, retryLocked, finish, user, receiptUri, cancelDraftTimer]);

  const removePhoto = useCallback(async () => {
    cancelDraftTimer();
    if (!user || retryLocked || savedRemotely || !await saveDraft(user.id, { friendName: friend, amount, dueOn, receiptUri: null, submissionKey: key })) {
      setPhotoError('Could not update the saved draft. Keep the photo attached or try again.');
      return;
    }
    cancelDraftTimer(); setDraftError('');
    removeLocalReceipt(receiptUri); setReceiptUri(null); setPhotoError('');
  }, [user, retryLocked, savedRemotely, friend, amount, dueOn, key, receiptUri, cancelDraftTimer]);

  const chooseDate = useCallback(() => {
    if (retryLocked || savedRemotely) return;
    Keyboard.dismiss();
    if (Platform.OS === 'android') DateTimePickerAndroid.open({
      value: dateToPicker(dueOn), mode: 'date', display: 'calendar', timeZoneName: 'Asia/Kolkata',
      onValueChange: (_event, date) => { setDueOn(pickerDateToIndia(date)); setErrors((old) => ({ ...old, due: '' })); },
    });
    else { setIosDate(dateToPicker(dueOn)); setIosPicker(true); }
  }, [retryLocked, savedRemotely, dueOn]);

  const locked = saving || picking || retryLocked || savedRemotely;

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={savedRemotely ? 'Finish and return' : 'Go back'} onPress={() => { if (savedRemotely) void finish(); else router.back(); }} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}><Text style={{ color: colors.primary, fontSize: 16, fontWeight: '700' }}>{savedRemotely ? '‹  Finish' : '‹  Back'}</Text></Pressable>
        {!savedRemotely ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving || picking }} disabled={saving || picking} onPress={discard} style={{ minWidth: 48, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center', opacity: saving || picking ? 0.55 : 1 }}><Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>Cancel</Text></Pressable> : <View style={{ minWidth: 48 }} />}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(28, space.xl), gap: 18 }}>
        <PageTitle title="Add an entry" subtitle="Record what you lent and when it is due." />
        <Surface style={{ gap: 16 }}>
          <Field label="Friend's name" value={friend} onChangeText={(value) => { setFriend(value); setErrors((old) => ({ ...old, friend: '' })); }} placeholder="e.g. Amit Kumar" autoCapitalize="words" maxLength={80} returnKeyType="next" onSubmitEditing={() => amountInput.current?.focus()} error={errors.friend} editable={hydrated && !locked} />
          <Field inputRef={amountInput} label="Amount (INR)" value={amount} onChangeText={(value) => { setAmount(value.replace(/[^\d.]/g, '').slice(0, 16)); setErrors((old) => ({ ...old, amount: '' })); }} placeholder="e.g. 2500.00" keyboardType="decimal-pad" returnKeyType="done" onSubmitEditing={Keyboard.dismiss} error={errors.amount} editable={hydrated && !locked} />
          <DueDateField value={dueOn} error={errors.due} disabled={!hydrated || locked} onPress={chooseDate} />
          <ReceiptField uri={receiptUri} error={photoError} picking={picking} disabled={!hydrated || locked} onCamera={() => void runPicker('camera')} onLibrary={() => void runPicker('library')} onRemove={() => void removePhoto()} />
        </Surface>
        {retryLocked ? <Text accessibilityRole="alert" style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>The save result is uncertain. Retry the same entry to safely confirm it, or cancel and check your ledger before creating another entry.</Text> : null}
        {formError ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>{formError}</Text> : null}
        {draftError ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13, lineHeight: 19 }}>{draftError}</Text> : null}
        {savedRemotely ? <Button title="Finish" onPress={() => void finish()} /> : <Button title={saving ? 'Saving entry…' : retryLocked ? 'Retry same save' : 'Save entry'} onPress={() => void submit()} loading={saving} disabled={!hydrated || picking} />}
        <Text style={{ color: colors.textTertiary, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{draftError ? 'Check your device storage before continuing.' : 'Your entry details and retry key stay on this device if the connection drops.'}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
    <DatePickerSheet visible={iosPicker} value={iosDate} bottomInset={insets.bottom} onClose={() => setIosPicker(false)} onChange={setIosDate}
      onDone={() => { setDueOn(pickerDateToIndia(iosDate)); setErrors((old) => ({ ...old, due: '' })); setIosPicker(false); }} />
  </SafeAreaView>;
}
