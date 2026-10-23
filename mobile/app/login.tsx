import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { Button, Field, PageTitle, Surface } from '../src/components';
import { colors } from '../src/theme';

export default function LoginScreen() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const requestBusy = useRef(false);
  const request = async () => {
    if (requestBusy.current) return;
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) { setError('Enter a 10-digit Indian phone number.'); return; }
    requestBusy.current = true; setError(''); setLoading(true);
    try {
      const result = await api<{ challenge_id: string; expires_at: string }>('/auth/request-otp', { method: 'POST', body: { phone: `+91${digits}` } });
      router.push({ pathname: '/verify', params: { challengeId: result.challenge_id, phone: `+91 ${digits}` } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not request a code.'); }
    finally { requestBusy.current = false; setLoading(false); }
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24, justifyContent: 'center', gap: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 10 }}><Text style={{ color: colors.primary, fontSize: 14, fontWeight: '800', letterSpacing: 1.5 }}>MINILEDGER</Text><PageTitle title="Money, remembered." subtitle="Keep a clear record of what friends owe you." /></View>
        <Surface style={{ gap: 18 }}>
          <PageTitle title="Sign in" subtitle="Use your phone number to continue." />
          <Field label="Phone number" value={phone} onChangeText={(value) => setPhone(value.replace(/\D/g, '').slice(0, 10))} keyboardType="phone-pad" textContentType="telephoneNumber" placeholder="98765 43210" maxLength={10} error={error || undefined} returnKeyType="done" onSubmitEditing={request} />
          <Button title="Send demo code" onPress={request} loading={loading} />
          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>Demo login: the six-digit code appears in the API server terminal. No SMS is sent.</Text>
        </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
