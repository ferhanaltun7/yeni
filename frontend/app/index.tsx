import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { COLORS } from '../src/utils/constants';

export default function Index() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated && user) {
        if (!user.onboarding_completed) {
          router.replace('/onboarding');
        } else {
          router.replace('/(tabs)');
        }
      } else {
        router.replace('/login');
      }
    }
  }, [isLoading, isAuthenticated, user]);

  return (
    <View style={styles.container}>
      <LoadingSpinner message="Bütçe Asistanı yükleniyor..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
