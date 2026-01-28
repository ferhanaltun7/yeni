import React from ‘react’;
import { Stack } from ‘expo-router’;
import { StatusBar } from ‘expo-status-bar’;
import { AuthProvider } from ‘../src/contexts/AuthContext’;
import { COLORS } from ‘../src/utils/constants’;

export default function RootLayout() {
return (
<AuthProvider>
<StatusBar style="dark" />
<Stack
screenOptions={{
headerShown: false,
contentStyle: { backgroundColor: COLORS.background },
}}
>
<Stack.Screen name=“index” />
<Stack.Screen name=“login” />
<Stack.Screen name=“onboarding” />
<Stack.Screen name=”(tabs)” options={{ headerShown: false }} />

```
    {/* Bill Screens */}
    <Stack.Screen
      name="add-bill"
      options={{
        presentation: 'modal',
        headerShown: true,
        headerTitle: 'Yeni Fatura Ekle',
        headerStyle: { backgroundColor: COLORS.surface },
        headerTitleStyle: { color: COLORS.text },
      }}
    />
    <Stack.Screen
      name="bill-details"
      options={{
        headerShown: true,
        headerTitle: 'Fatura Detayı',
        headerStyle: { backgroundColor: COLORS.surface },
        headerTitleStyle: { color: COLORS.text },
      }}
    />
    
    {/* Receipt Screens */}
    <Stack.Screen
      name="add-receipt"
      options={{
        presentation: 'modal',
        headerShown: true,
        headerTitle: 'Yeni Fiş Ekle',
        headerStyle: { backgroundColor: COLORS.surface },
        headerTitleStyle: { color: COLORS.text },
      }}
    />
    <Stack.Screen
      name="receipt-details"
      options={{
        headerShown: true,
        headerTitle: 'Fiş Detayı',
        headerStyle: { backgroundColor: COLORS.surface },
        headerTitleStyle: { color: COLORS.text },
      }}
    />
  </Stack>
</AuthProvider>
```

);
}
