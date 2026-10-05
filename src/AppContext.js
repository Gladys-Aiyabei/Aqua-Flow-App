import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createApi, defaultApiUrl } from './api';

const KEYS = { apiUrl: 'aquaflow.apiUrl', session: 'aquaflow.session', cache: 'aquaflow.cache' };
const POLL_MS = 8000;

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

/** Cross-platform message box (Alert's buttons don't work on web). */
export function notify(title, message) {
  if (Platform.OS === 'web') window.alert(message ? `${title}\n\n${message}` : title);
  else Alert.alert(title, message);
}

export function confirm(title, message, confirmLabel = 'Yes') {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) => Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
    { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}

export function AppProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [apiUrl, setApiUrlState] = useState(defaultApiUrl());
  const [session, setSession] = useState(null); // { token, role, name, phone? }
  const [data, setData] = useState(null);
  const [online, setOnline] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const sessionRef = useRef(null);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const api = useMemo(() => createApi(apiUrl, session?.token), [apiUrl, session?.token]);

  useEffect(() => {
    (async () => {
      try {
        const [[, url], [, sess], [, cache]] = await AsyncStorage.multiGet([KEYS.apiUrl, KEYS.session, KEYS.cache]);
        if (url) setApiUrlState(url);
        if (sess) setSession(JSON.parse(sess));
        if (cache) setData(JSON.parse(cache));
      } catch { /* first launch */ }
      setBooting(false);
    })();
  }, []);

  const signOut = useCallback(async () => {
    const current = sessionRef.current;
    if (current) createApi(apiUrl, current.token).post('/api/auth/logout').catch(() => {});
    setSession(null);
    setData(null);
    await AsyncStorage.multiRemove([KEYS.session, KEYS.cache]);
  }, [apiUrl]);

  const refresh = useCallback(async () => {
    if (!sessionRef.current) return;
    try {
      const state = await api.get('/api/state');
      setData(state);
      setOnline(true);
      setLastSync(new Date());
      AsyncStorage.setItem(KEYS.cache, JSON.stringify(state)).catch(() => {});
    } catch (e) {
      if (e.status === 401) signOut();
      else setOnline(false);
    }
  }, [api, signOut]);

  // Keep data live: refresh on sign-in, every few seconds, and when the app returns to the foreground.
  useEffect(() => {
    if (!session) return undefined;
    // refresh() only sets state after the network request resolves, so this doesn't cascade renders.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    let timer = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => {
      clearInterval(timer);
      if (s === 'active') { refresh(); timer = setInterval(refresh, POLL_MS); }
    });
    return () => { clearInterval(timer); sub.remove(); };
  }, [session, refresh]);

  const signIn = useCallback(async (url, role, credentials) => {
    const cleanUrl = url.trim().replace(/\/$/, '');
    const res = await createApi(cleanUrl, null).post(`/api/auth/${role}`, credentials);
    const sess = { token: res.token, role: res.role, name: res.name, phone: res.phone };
    await AsyncStorage.multiSet([[KEYS.apiUrl, cleanUrl], [KEYS.session, JSON.stringify(sess)]]);
    setApiUrlState(cleanUrl);
    setData(null);
    setSession(sess);
  }, []);

  /** Runs a mutation, shows any error, then refreshes everything. Resolves to the result or null. */
  const act = useCallback(async (fn, successMessage) => {
    try {
      const result = await fn(api);
      await refresh();
      if (successMessage) notify(successMessage);
      return result ?? true;
    } catch (e) {
      notify('Could not complete', e.message);
      return null;
    }
  }, [api, refresh]);

  const value = useMemo(() => ({
    booting, apiUrl, session, data, online, lastSync, api, refresh, signIn, signOut, act,
    isStaff: session?.role === 'staff',
  }), [booting, apiUrl, session, data, online, lastSync, api, refresh, signIn, signOut, act]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
