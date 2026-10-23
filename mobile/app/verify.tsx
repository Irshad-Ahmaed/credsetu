import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../src/api';
import { useAuth } from '../src/auth';
import { Button, Field, PageTitle, Surface } from '../src/components';
import { colors } from '../src/theme';

type VerifyResult = { token: string; user: { id: string; phone_e164: string } };

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ challengeId: string; phone: string }>();
  const { signIn } = useAuth();
  const [code, setCode] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const [resendIn, setResendIn] = useState(30);
  const busy = useRef(false);
  const challengeId = typeof params.challengeId === 'string' ? params.challengeId : '';
  const phone = typeof params.phone === 'string' ? params.phone : '';
  useEffect(() => {
    const resendAt = Date.now() + 30_000;
    const update = () => setResendIn(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [challengeId]);
  const verify = async () => {
    if (busy.current) return;
    if (code.length !== 6) { setError('Enter all six digits.'); return; }
    if (!challengeId) { setError('This sign-in code has expired. Go back and request a new code.'); return; }
    busy.current = true; setLoading(true); setError('');
    try { const result = await api<VerifyResult>('/auth/verify-otp', { method: 'POST', body: { challenge_id: challengeId, code } }); await signIn(result.token, result.user); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not verify this code.'); }
    finally { busy.current = false; setLoading(false); }
  };
  const resend = async () => {
    if (resendIn || busy.current) return;
    if (!phone) { setError('Phone number is missing. Go back and enter it again.'); return; }
    busy.current = true; setLoading(true); setError('');
    try { const result = await api<{ challenge_id: string }>('/auth/request-otp', { method: 'POST', body: { phone: phone.replace(/\s/g, '') } }); setCode(''); setResendIn(30); router.replace({ pathname: '/verify', params: { challengeId: result.challenge_id, phone } }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not request another code.'); }
    finally { busy.current = false; setLoading(false); }
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top', 'bottom']}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
        <Surface style={{ gap: 18 }}>
          <Button variant="secondary" title="←  Back" onPress={() => router.back()} style={{ alignSelf: 'flex-start', minWidth: 96 }} />
          <PageTitle title="Enter your code" subtitle={`Code for ${phone || 'your phone'}. Read it in the API terminal.`} />
          <Field label="Six-digit code" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" textContentType="oneTimeCode" placeholder="000000" maxLength={6} error={error || undefined} returnKeyType="done" onSubmitEditing={verify} />
          <Button title="Verify and continue" onPress={verify} loading={loading} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 48 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Didn't receive it? </Text>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: resendIn > 0 || loading }} disabled={resendIn > 0 || loading} onPress={resend} style={{ minHeight: 48, justifyContent: 'center' }}>
              <Text style={{ color: resendIn || loading ? colors.textTertiary : colors.primary, fontWeight: '700', fontSize: 14 }}>{resendIn ? `Resend in ${resendIn}s` : 'Resend code'}</Text>
            </Pressable>
          </View>
        </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
