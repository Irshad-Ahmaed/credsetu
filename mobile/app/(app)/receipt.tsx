import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth';
import { Button } from '../../src/components';
import { useReceipt } from '../../src/useReceipt';

export default function ReceiptScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const receiptId = typeof id === 'string' ? id : '';
  const receiptName = typeof name === 'string' ? name : '';
  const receipt = useReceipt(receiptId);
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const uri = receipt.uri;
  const close = () => { if (router.canGoBack()) router.back(); else router.replace('/(app)'); };
  const signInAgain = async () => {
    if (signingOut) return;
    setSigningOut(true); setSessionError('');
    try { await signOut({ preserveDraft: true, revoke: false }); }
    catch { setSessionError('Could not clear the expired session. Check device storage and try again.'); setSigningOut(false); }
  };

  return <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
    <StatusBar style="light" />
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close receipt" onPress={close} style={styles.close}>
        <Text style={styles.white}>Close</Text>
      </Pressable>
      <Text numberOfLines={2} accessibilityRole="header" style={styles.title}>{receiptName ? `${receiptName}'s receipt` : 'Receipt'}</Text>
      <View style={{ width: 64 }} />
    </View>
    <View style={{ flex: 1 }}>
      {receipt.error ? <View style={styles.feedback}>
        <Text accessibilityRole="alert" style={styles.message}>{sessionError || receipt.error}</Text>
        {receipt.status === 401
          ? <Button title="Sign in again" loading={signingOut} onPress={() => void signInAgain()} />
          : <Button title="Try again" onPress={() => { setSessionError(''); receipt.retry(); }} />}
        <Text style={styles.hint}>You can close this view to return to your ledger.</Text>
      </View> : <>
        {uri ? <Image key={uri} source={{ uri }} accessibilityLabel={`${receiptName || 'Loan'} receipt photo`}
          resizeMode="contain" resizeMethod="resize" onLoad={() => receipt.imageLoaded(uri)}
          onError={() => receipt.imageFailed(uri)} style={{ flex: 1, width: '100%' }} /> : null}
        {receipt.loading ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.feedback]}>
          <ActivityIndicator color="white" size="large" />
          <Text style={styles.message}>{uri ? 'Opening receipt…' : 'Downloading receipt…'}</Text>
        </View> : null}
      </>}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111827' },
  header: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  close: { minWidth: 64, minHeight: 48, justifyContent: 'center' },
  white: { color: '#FFFFFF', fontSize: 16 },
  title: { color: '#FFFFFF', fontWeight: '700', flex: 1, textAlign: 'center', fontSize: 16, lineHeight: 22 },
  feedback: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  message: { color: '#FFFFFF', textAlign: 'center', fontSize: 15, lineHeight: 23 },
  hint: { color: '#D1D5DB', textAlign: 'center', fontSize: 13, lineHeight: 20 },
});
