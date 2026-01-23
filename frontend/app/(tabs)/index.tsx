import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { dashboardAPI, billsAPI } from '../../src/services/api';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { BillCard } from '../../src/components/BillCard';
import { COLORS } from '../../src/utils/constants';
import { formatCurrency } from '../../src/utils/formatters';
import { DashboardStats, Bill } from '../../src/types';

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [upcomingBills, setUpcomingBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [statsData, billsData] = await Promise.all([
        dashboardAPI.getStats(),
        billsAPI.getAll(),
      ]);
      setStats(statsData);
      
      // Get upcoming (not paid) bills sorted by due date
      const upcoming = billsData
        .filter(bill => !bill.is_paid)
        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
        .slice(0, 3);
      setUpcomingBills(upcoming);
    } catch (error) {
      console.error('Dashboard data error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleTogglePaid = async (billId: string) => {
    try {
      await billsAPI.togglePaid(billId);
      fetchData();
    } catch (error) {
      console.error('Toggle paid error:', error);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <View>
            <Text style={styles.greeting}>Merhaba, {user?.name?.split(' ')[0]}</Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString('tr-TR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/add-bill')}
          >
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={[styles.statCard, styles.statCardOverdue]}>
            <Ionicons name="alert-circle" size={24} color={COLORS.danger} />
            <Text style={styles.statValue}>{formatCurrency(stats?.total_overdue || 0)}</Text>
            <Text style={styles.statLabel}>Gecikmiş ({stats?.overdue_count || 0})</Text>
          </View>
          
          <View style={[styles.statCard, styles.statCardUpcoming]}>
            <Ionicons name="time" size={24} color={COLORS.warning} />
            <Text style={styles.statValue}>{formatCurrency(stats?.total_upcoming || 0)}</Text>
            <Text style={styles.statLabel}>Bekleyen ({stats?.upcoming_count || 0})</Text>
          </View>
          
          <View style={[styles.statCard, styles.statCardPaid]}>
            <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
            <Text style={styles.statValue}>{formatCurrency(stats?.total_paid_this_month || 0)}</Text>
            <Text style={styles.statLabel}>Bu Ay Ödenen</Text>
          </View>
        </View>

        {/* Next Bill Alert */}
        {stats?.next_bill && (
          <TouchableOpacity
            style={styles.nextBillCard}
            onPress={() => router.push(`/bill-details?id=${stats.next_bill?.bill_id}`)}
          >
            <View style={styles.nextBillHeader}>
              <Ionicons name="notifications" size={24} color={COLORS.primary} />
              <Text style={styles.nextBillTitle}>Sonraki Fatura</Text>
            </View>
            <View style={styles.nextBillContent}>
              <View>
                <Text style={styles.nextBillName}>{stats.next_bill.title}</Text>
                <Text style={styles.nextBillDate}>
                  {new Date(stats.next_bill.due_date).toLocaleDateString('tr-TR')}
                </Text>
              </View>
              <Text style={styles.nextBillAmount}>
                {formatCurrency(stats.next_bill.amount)}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Upcoming Bills */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Yakınlaşan Faturalar</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/bills')}>
              <Text style={styles.seeAllText}>Tümünü Gör</Text>
            </TouchableOpacity>
          </View>
          
          {upcomingBills.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-done-circle" size={48} color={COLORS.success} />
              <Text style={styles.emptyText}>Harika! Bekleyen faturanız yok.</Text>
            </View>
          ) : (
            upcomingBills.map((bill) => (
              <BillCard
                key={bill.bill_id}
                bill={bill}
                onPress={() => router.push(`/bill-details?id=${bill.bill_id}`)}
                onTogglePaid={() => handleTogglePaid(bill.bill_id)}
              />
            ))
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push('/add-bill')}
          >
            <Ionicons name="add-circle" size={32} color={COLORS.primary} />
            <Text style={styles.quickActionText}>Gider Ekle</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.quickActionButton}
            onPress={() => router.push('/(tabs)/bills')}
          >
            <Ionicons name="list" size={32} color={COLORS.secondary} />
            <Text style={styles.quickActionText}>Tüm Giderler</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  welcomeSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  date: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statCardOverdue: {
    backgroundColor: COLORS.danger + '15',
  },
  statCardUpcoming: {
    backgroundColor: COLORS.warning + '15',
  },
  statCardPaid: {
    backgroundColor: COLORS.success + '15',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  nextBillCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  nextBillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  nextBillTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  nextBillContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextBillName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  nextBillDate: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  nextBillAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.primary,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  seeAllText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    marginHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 12,
    textAlign: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 32,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    gap: 8,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
  },
});
