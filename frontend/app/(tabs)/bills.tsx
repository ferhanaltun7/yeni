import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { billsAPI } from '../../src/services/api';
import { LoadingSpinner } from '../../src/components/LoadingSpinner';
import { BillCard } from '../../src/components/BillCard';
import { EmptyState } from '../../src/components/EmptyState';
import { COLORS } from '../../src/utils/constants';
import { Bill } from '../../src/types';

type FilterType = 'all' | 'upcoming' | 'overdue' | 'paid';

export default function Bills() {
  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  const fetchBills = async () => {
    try {
      const data = await billsAPI.getAll();
      setBills(data);
    } catch (error) {
      console.error('Fetch bills error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchBills();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    fetchBills();
  };

  const handleTogglePaid = async (billId: string) => {
    try {
      await billsAPI.togglePaid(billId);
      fetchBills();
    } catch (error) {
      console.error('Toggle paid error:', error);
    }
  };

  const filteredBills = bills.filter((bill) => {
    const now = new Date();
    const dueDate = new Date(bill.due_date);
    
    switch (filter) {
      case 'upcoming':
        return !bill.is_paid && dueDate >= now;
      case 'overdue':
        return !bill.is_paid && dueDate < now;
      case 'paid':
        return bill.is_paid;
      default:
        return true;
    }
  });

  const filterButtons: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'Tümü' },
    { key: 'upcoming', label: 'Bekleyen' },
    { key: 'overdue', label: 'Geciken' },
    { key: 'paid', label: 'Ödenen' },
  ];

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {filterButtons.map((btn) => (
          <TouchableOpacity
            key={btn.key}
            style={[
              styles.filterButton,
              filter === btn.key && styles.filterButtonActive,
            ]}
            onPress={() => setFilter(btn.key)}
          >
            <Text
              style={[
                styles.filterText,
                filter === btn.key && styles.filterTextActive,
              ]}
            >
              {btn.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filteredBills.length === 0 ? (
        <EmptyState
          icon="document-text-outline"
          title={filter === 'all' ? 'Henüz gider yok' : 'Gider bulunamadı'}
          message={
            filter === 'all'
              ? 'İlk giderinizi ekleyerek bütçenizi takip etmeye başlayın.'
              : 'Bu kategoride gider bulunmuyor.'
          }
          actionLabel={filter === 'all' ? 'Gider Ekle' : undefined}
          onAction={filter === 'all' ? () => router.push('/add-bill') : undefined}
        />
      ) : (
        <FlatList
          data={filteredBills}
          keyExtractor={(item) => item.bill_id}
          renderItem={({ item }) => (
            <BillCard
              bill={item}
              onPress={() => router.push(`/bill-details?id=${item.bill_id}`)}
              onTogglePaid={() => handleTogglePaid(item.bill_id)}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/add-bill')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  filterTextActive: {
    color: '#fff',
  },
  listContent: {
    paddingBottom: 100,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
});
