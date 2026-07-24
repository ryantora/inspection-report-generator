import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';

import HomeScreen from '../screens/HomeScreen';
import CreateInspectionScreen from '../screens/CreateInspectionScreen';
import ChecklistScreen from '../screens/ChecklistScreen';
import CaptureScreen from '../screens/CaptureScreen';
import CropScreen from '../screens/CropScreen';
import ReportPreviewScreen from '../screens/ReportPreviewScreen';
import ReportArchiveScreen from '../screens/ReportArchiveScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const theme = useTheme();

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.text,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Inspections' }} />
        <Stack.Screen
          name="CreateInspection"
          component={CreateInspectionScreen}
          options={{ title: 'New Inspection' }}
        />
        <Stack.Screen name="Checklist" component={ChecklistScreen} options={{ title: 'Checklist' }} />
        <Stack.Screen
          name="Capture"
          component={CaptureScreen}
          options={{ title: 'Capture Photo', headerShown: false }}
        />
        <Stack.Screen
          name="Crop"
          component={CropScreen}
          options={{ title: 'Crop Photo', headerShown: false }}
        />
        <Stack.Screen
          name="ReportPreview"
          component={ReportPreviewScreen}
          options={{ title: 'Report Ready', headerBackVisible: false }}
        />
        <Stack.Screen
          name="ReportArchive"
          component={ReportArchiveScreen}
          options={{ title: 'Report Archive' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
