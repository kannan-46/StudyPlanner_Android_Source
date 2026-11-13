import React, {createContext, useCallback, useContext, useEffect, useMemo, useState} from 'react';
import * as Keychain from 'react-native-keychain';
import {getApiConfig, login, register} from '../api/client';
import {getPlannerNative} from '../planner/nativeAlarms';
import type {Account, AuthResponse} from '../types/planner';

const SESSION_SERVICE = 'com.surgicalstudyplanner.session';

type AuthContextValue = {
  loading: boolean;
  token: string | null;
  account: Account | null;
  registrationEnabled: boolean;
  configError: string | null;
  refreshApiConfig: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  createAccount: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({children}: React.PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const refreshApiConfig = useCallback(async () => {
    try {
      const config = await getApiConfig();
      setRegistrationEnabled(config.registrationEnabled);
      setConfigError(null);
    } catch (error) {
      setRegistrationEnabled(false);
      setConfigError(error instanceof Error ? error.message : 'Could not check API settings.');
    }
  }, []);

  useEffect(() => {
    let active = true;
    void Keychain.getGenericPassword({service: SESSION_SERVICE})
      .then(credentials => {
        if (!active) return;
        if (credentials) {
          setToken(credentials.password);
          setAccount({id: '', email: credentials.username});
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    void getApiConfig().then(apiConfig => {
      if (!active) return;
      setRegistrationEnabled(apiConfig.registrationEnabled);
      setConfigError(null);
    }).catch(error => {
      if (!active) return;
      setRegistrationEnabled(false);
      setConfigError(error instanceof Error ? error.message : 'Could not check API settings.');
    });
    return () => {
      active = false;
    };
  }, []);

  const storeSession = useCallback(async (result: AuthResponse) => {
    const stored = await Keychain.setGenericPassword(
      result.user.email,
      result.token,
      {service: SESSION_SERVICE},
    );
    if (!stored) {
      throw new Error('Secure storage could not save your sign-in. Please try again.');
    }
    setToken(result.token);
    setAccount(result.user);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    await storeSession(await login(email.trim(), password));
  }, [storeSession]);

  const createAccount = useCallback(async (email: string, password: string) => {
    await storeSession(await register(email.trim(), password));
  }, [storeSession]);

  const signOut = useCallback(async () => {
    setToken(null);
    setAccount(null);
    try {
      await getPlannerNative().clearAllAlarms();
    } catch {
      // Signing out and clearing secure credentials should still work if alarms are unavailable.
    }
    await Keychain.resetGenericPassword({service: SESSION_SERVICE}).catch(() => undefined);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    token,
    account,
    registrationEnabled,
    configError,
    refreshApiConfig,
    signIn,
    createAccount,
    signOut,
  }), [loading, token, account, registrationEnabled, configError, refreshApiConfig, signIn, createAccount, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return context;
}
