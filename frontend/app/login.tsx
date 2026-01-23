import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/contexts/AuthContext';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { COLORS } from '../src/utils/constants';

const { width } = Dimensions.get('window');

export default function Login() {
  const { login, isLoading, isAuthenticated, user } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      if (!user.onboarding_completed) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [isAuthenticated, user]);

  const handleLogin = async () => {
    try {
      setError(null);
      await login();
    } catch (err) {
      setError('Giriş yapılırken bir hata oluştu. Lütfen tekrar deneyin.');
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="Giriş yapılıyor..." />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="wallet" size={64} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>Bütçe Asistanı</Text>
          <Text style={styles.subtitle}>
            Faturalarınızı takip edin, ödeme tarihlerini kaçırmayın
          </Text>
        </View>

        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Ionicons name="notifications" size={24} color={COLORS.secondary} />
            <Text style={styles.featureText}>Akıllı hatırlatıcılar</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="pie-chart" size={24} color={COLORS.warning} />
            <Text style={styles.featureText}>Aylık harcama analizi</Text>
          </View>
          <View style={styles.featureItem}>
            <Ionicons name="shield-checkmark" size={24} color={COLORS.success} />
            <Text style={styles.featureText}>Güvenli ve kolay</Text>
          </View>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color={COLORS.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.googleButton} onPress={handleLogin}>
          <Ionicons name="logo-google" size={24} color="#fff" />
          <Text style={styles.googleButtonText}>Google ile Giriş Yap</Text>
        </TouchableOpacity>

        <Text style={styles.termsText}>
          Giriş yaparak{' '}
          <Text style={styles.linkText}>Kullanım Koşulları</Text> ve{' '}
          <Text style={styles.linkText}>Gizlilik Politikası</Text>'nı kabul
          etmiş olursunuz.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  features: {
    marginBottom: 48,
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  featureText: {
    fontSize: 16,
    color: COLORS.text,
    fontWeight: '500',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.danger + '15',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: COLORS.danger,
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 24,
  },
  googleButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  termsText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  linkText: {
    color: COLORS.primary,
  },
});
