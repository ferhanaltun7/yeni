import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { COLORS } from '../../src/utils/constants';
import { formatCurrency } from '../../src/utils/formatters';

export default function Profile() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      'Çıkış Yap',
      'Hesabınızdan çıkmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const menuItems = [
    {
      icon: 'notifications-outline',
      label: 'Bildirim Ayarları',
      onPress: () => Alert.alert('Bildirim Ayarları', 'Bu özellik yakında eklenecek.'),
    },
    {
      icon: 'card-outline',
      label: 'Premium Üyelik',
      badge: user?.is_premium ? 'Aktif' : 'Ücretsiz',
      onPress: () => Alert.alert('Premium', 'Premium özellikler yakında!'),
    },
    {
      icon: 'download-outline',
      label: 'Verileri Dışa Aktar',
      onPress: () => Alert.alert('Dışa Aktarma', 'CSV dışa aktarma yakında.'),
    },
    {
      icon: 'help-circle-outline',
      label: 'Yardım ve Destek',
      onPress: () => Alert.alert('Destek', 'destek@butceasistani.com'),
    },
    {
      icon: 'information-circle-outline',
      label: 'Hakkında',
      onPress: () => Alert.alert('Bütçe Asistanı', 'Versiyon 1.0.0'),
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.header}>
          <View style={styles.avatarContainer}>
            {user?.picture ? (
              <View style={styles.avatar}>
                <Ionicons name="person" size={40} color={COLORS.primary} />
              </View>
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
          
          {user?.monthly_income && (
            <View style={styles.incomeContainer}>
              <Ionicons name="wallet-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.incomeText}>
                Aylık Gelir: {formatCurrency(user.monthly_income)}
              </Text>
            </View>
          )}
        </View>

        {/* Premium Banner */}
        {!user?.is_premium && (
          <TouchableOpacity style={styles.premiumBanner}>
            <View style={styles.premiumContent}>
              <Ionicons name="star" size={24} color="#FFD700" />
              <View style={styles.premiumText}>
                <Text style={styles.premiumTitle}>Premium'a Yükseltin</Text>
                <Text style={styles.premiumSubtitle}>
                  Sınırsız özellikler, detaylı raporlar
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        )}

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={item.onPress}
            >
              <View style={styles.menuItemLeft}>
                <Ionicons
                  name={item.icon as any}
                  size={24}
                  color={COLORS.text}
                />
                <Text style={styles.menuItemText}>{item.label}</Text>
              </View>
              {item.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={COLORS.textSecondary}
                />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={COLORS.danger} />
          <Text style={styles.logoutText}>Çıkış Yap</Text>
        </TouchableOpacity>

        <Text style={styles.version}>Bütçe Asistanı v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.primary,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  incomeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  incomeText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  premiumBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary + '10',
    marginHorizontal: 16,
    marginBottom: 24,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  premiumContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  premiumText: {
    gap: 2,
  },
  premiumTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  premiumSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  menuContainer: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    color: COLORS.text,
  },
  badge: {
    backgroundColor: COLORS.success + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 24,
    padding: 16,
    backgroundColor: COLORS.danger + '10',
    borderRadius: 12,
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.danger,
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 24,
    marginBottom: 32,
  },
});
