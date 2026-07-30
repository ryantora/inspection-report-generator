import React, { createContext, useContext, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { OverlayCompositor } from './src/services/imageOverlay';
import AppNavigator from './src/navigation/AppNavigator';

// Exposes the single off-screen <OverlayCompositor /> instance to any screen
// that needs to burn a timestamp/bus-stop badge into a photo.
const OverlayCompositorCtx = createContext(null);
export function useOverlayCompositor() {
  return useContext(OverlayCompositorCtx);
}

function Root() {
  const theme = useTheme();
  const overlayRef = useRef(null);

  return (
    <OverlayCompositorCtx.Provider value={overlayRef}>
      <StatusBar style={theme === undefined ? 'auto' : 'auto'} />
      <AppNavigator />
      <OverlayCompositor ref={overlayRef} />
    </OverlayCompositorCtx.Provider>
  );
}

export default function App() {
  return (
    // Required by react-native-safe-area-context (used for SafeAreaView
    // throughout the app) to actually compute real device insets —
    // without this provider, every SafeAreaView falls back to zero
    // insets, which defeats the whole point of switching to it.
    <SafeAreaProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
