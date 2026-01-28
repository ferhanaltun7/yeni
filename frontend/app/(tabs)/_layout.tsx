import React from ‘react’;
import { Tabs } from ‘expo-router’;
import { Ionicons } from ‘@expo/vector-icons’;
import { COLORS } from ‘../../src/utils/constants’;

export default function TabLayout() {
return (
<Tabs
screenOptions={{
tabBarActiveTintColor: COLORS.primary,
tabBarInactiveTintColor: COLORS.textSecondary,
tabBarStyle: {
backgroundColor: COLORS.surface,
borderTopColor: COLORS.border,
paddingBottom: 8,
paddingTop: 8,
height: 64,
},
tabBarLabelStyle: {
fontSize: 11,
fontWeight: ‘500’,
},
headerStyle: {
backgroundColor: COLORS.surface,
},
headerTitleStyle: {
color: COLORS.text,
fontWeight: ‘600’,
},
}}
>
<Tabs.Screen
name=“index”
options={{
title: ‘Ana Sayfa’,
headerTitle: ‘Bütçe Asistanı’,
tabBarIcon: ({ color, size }) => (
<Ionicons name="home" size={size} color={color} />
),
}}
/>
<Tabs.Screen
name=“bills”
options={{
title: ‘Faturalar’,
headerTitle: ‘Faturalarım’,
tabBarIcon: ({ color, size }) => (
<Ionicons name="document-text" size={size} color={color} />
),
}}
/>
<Tabs.Screen
name=“receipts”
options={{
title: ‘Fişler’,
headerTitle: ‘Fişlerim’,
tabBarIcon: ({ color, size }) => (
<Ionicons name="receipt" size={size} color={color} />
),
}}
/>
<Tabs.Screen
name=“profile”
options={{
title: ‘Profil’,
headerTitle: ‘Profilim’,
tabBarIcon: ({ color, size }) => (
<Ionicons name="person" size={size} color={color} />
),
}}
/>
</Tabs>
);
}
