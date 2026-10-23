import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { api, clearToken, clearUserSnapshot, getToken, getUserSnapshot, saveToken, saveUserSnapshot } from './api';
import { clearDraft } from './draft';
import { recoverPendingReceipt } from './pickerRecovery';

type User = { id: string; phone_e164: string };
type SignOutOptions = { preserveDraft?: boolean; revoke?: boolean };
type AuthValue = { ready: boolean; token: string | null; user: User | null; signIn: (token: string, user: User) => Promise<void>; signOut: (options?: SignOutOptions) => Promise<void>; setUser: (user: User) => void };
const Context = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await getToken();
        if (!active) return;
        if (!stored) return;
        setToken(stored);
        const cachedUser = await getUserSnapshot();
        if (active && cachedUser) setUser(cachedUser);
        try {
          const response = await api<{ user: User }>('/auth/me');
          if (active) {
            setUser(response.user);
            await saveUserSnapshot(response.user);
            if (Platform.OS === 'android') await recoverPendingReceipt(response.user.id);
          }
        } catch (error) {
          if (error instanceof Error && 'status' in error && (error as { status: number }).status === 401) {
            await clearToken(); await clearUserSnapshot();
            setToken(null); setUser(null);
          } else if (active && cachedUser && Platform.OS === 'android') await recoverPendingReceipt(cachedUser.id);
        }
      } catch (error) {
        // Secure storage or network failures must not silently discard an existing session.
      } finally { if (active) setReady(true); }
    })();
    return () => { active = false; };
  }, []);
  const signIn = useCallback(async (newToken: string, newUser: User) => {
    try {
      await saveUserSnapshot(newUser);
      await saveToken(newToken);
    } catch (error) {
      await clearToken().catch(() => undefined);
      await clearUserSnapshot().catch(() => undefined);
      throw error;
    }
    setToken(newToken);
    setUser(newUser);
  }, []);
  const signOut = useCallback(async (options?: SignOutOptions) => {
    try { if (token && options?.revoke !== false) await api('/auth/logout', { method: 'POST', body: {} }); } catch { /* Expiry bounds an offline revocation. */ }
    if (user && !options?.preserveDraft) await clearDraft(user.id);
    await clearToken(); await clearUserSnapshot(); setToken(null); setUser(null);
  }, [token, user]);
  const value = useMemo(() => ({ ready, token, user, signIn, signOut, setUser }), [ready, token, user, signIn, signOut]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAuth() { const value = useContext(Context); if (!value) throw new Error('useAuth must be inside AuthProvider'); return value; }
