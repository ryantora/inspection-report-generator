import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { getTheme } from './colors';

const ThemeCtx = createContext(getTheme('light'));

export function ThemeProvider({ children }) {
  const scheme = useColorScheme(); // 'light' | 'dark' | null — follows device setting
  const theme = getTheme(scheme);
  return <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
