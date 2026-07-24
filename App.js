import React, { createContext, useContext, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
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
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  );
}
