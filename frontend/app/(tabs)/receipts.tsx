import React, { useState, useCallback } from ‘react’;
import {
View,
Text,
StyleSheet,
FlatList,
TouchableOpacity,
RefreshControl,
} from ‘react-native’;
import { useRouter, useFocusEffect } from ‘expo-router’;
import { SafeAreaView } from ‘react-native-safe-area-context’;
import { Ionicons } from ‘@expo/vector-icons’;
import { receiptsAPI } from ‘../../src/services/api’;
import { LoadingSpinner } from ‘../../src/components/LoadingSpinner’;
import { ReceiptCard } from ‘../../src/components/ReceiptCard’;
import { EmptyState } from ‘../../src/components/EmptyState’;
import { COLORS, RECEIPT_CATEGORY_NAMES } from ‘../../src/utils/constants’;
import { Receipt, ReceiptStats } from ‘../../src/types’;
import { formatCurrency } from ‘../../src/utils/formatters’;

type FilterType = ‘all’ | ‘market’ | ‘restaurant’ | ‘clothing’ | ‘other’;

export default function Receipts() {
const router = useRouter();
const [receipts, setReceipts] = useState<Receipt[]>([]);
const [stats, setStats] = useState<ReceiptStats | null>(null);
const [loading, setLoading] = useState(true);
const [refreshing, setRefreshing] = useState(false);
const [filter, setFilter] = useState<FilterType>(‘all’);

const fetchData = async () => {
try {
const [receiptsData, statsData] = await Promise.all([
receiptsAPI.getAll(),
receiptsAPI.getStats(),
]);
setReceipts(receiptsData);
setStats(statsData);
} catch (error) {
console.error(‘Fetch receipts error:’, error);
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

const filteredReceipts = receipts.filter((receipt) => {
switch (filter) {
case ‘market’:
return receipt.category === ‘market’;
case ‘restaurant’:
return [‘restaurant’, ‘cafe’, ‘fastfood’].includes(receipt.category);
case ‘clothing’:
return [‘clothing’, ‘electronics’].includes(receipt.category);
case ‘other’:
return [‘pharmacy’, ‘fuel’, ‘other’].includes(receipt.category);
default:
return true;
}
});

const filterButtons: { key: FilterType; label: string }[] = [
{ key: ‘all’, label: ‘Tümü’ },
{ key: ‘market’, label: ‘Market’ },
{ key: ‘restaurant’, label: ‘Yeme-İçme’ },
{ key: ‘clothing’, label: ‘Alışveriş’ },
{ key: ‘other’, label: ‘Diğer’ },
];

if (loading) {
return <LoadingSpinner />;
}

return (
<SafeAreaView style={styles.container} edges={[‘left’, ‘right’]}>
{/* Stats Summary */}
{stats && (
<View style={styles.statsContainer}>
<View style={styles.statCard}>
<Text style={styles.statValue}>{formatCurrency(stats.total_this_month)}</Text>
<Text style={styles.statLabel}>Bu Ay</Text>
</View>
<View style={styles.statDivider} />
<View style={styles.statCard}>
<Text style={styles.statValue}>{stats.receipt_count}</Text>
<Text style={styles.statLabel}>Toplam Fiş</Text>
</View>
</View>
)}

```
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

  {filteredReceipts.length === 0 ? (
    <EmptyState
      icon="receipt-outline"
      title={filter === 'all' ? 'Henüz fiş yok' : 'Fiş bulunamadı'}
      message={
        filter === 'all'
          ? 'İlk fişinizi ekleyerek harcamalarınızı takip etmeye başlayın.'
          : 'Bu kategoride fiş bulunmuyor.'
      }
      actionLabel={filter === 'all' ? 'Fiş Ekle' : undefined}
      onAction={filter === 'all' ? () => router.push('/add-receipt') : undefined}
    />
  ) : (
    <FlatList
      data={filteredReceipts}
      keyExtractor={(item) => item.receipt_id}
      renderItem={({ item }) => (
        <ReceiptCard
          receipt={item}
          onPress={() => router.push(`/receipt-details?id=${item.receipt_id}`)}
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
    onPress={() => router.push('/add-receipt')}
  >
    <Ionicons name="add" size={28} color="#fff" />
  </TouchableOpacity>
</SafeAreaView>
```

);
}

const styles = StyleSheet.create({
container: {
flex: 1,
backgroundColor: COLORS.background,
},
statsContainer: {
flexDirection: ‘row’,
backgroundColor: COLORS.surface,
marginHorizontal: 16,
marginTop: 12,
marginBottom: 8,
borderRadius: 12,
padding: 16,
alignItems: ‘center’,
},
statCard: {
flex: 1,
alignItems: ‘center’,
},
statDivider: {
width: 1,
height: 40,
backgroundColor: COLORS.border,
},
statValue: {
fontSize: 20,
fontWeight: ‘700’,
color: COLORS.primary,
marginBottom: 4,
},
statLabel: {
fontSize: 12,
color: COLORS.textSecondary,
},
filterContainer: {
flexDirection: ‘row’,
paddingHorizontal: 16,
paddingVertical: 12,
gap: 8,
},
filterButton: {
paddingHorizontal: 14,
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
fontSize: 13,
fontWeight: ‘500’,
color: COLORS.textSecondary,
},
filterTextActive: {
color: ‘#fff’,
},
listContent: {
paddingBottom: 100,
},
fab: {
position: ‘absolute’,
right: 20,
bottom: 20,
width: 56,
height: 56,
borderRadius: 28,
backgroundColor: COLORS.secondary,
justifyContent: ‘center’,
alignItems: ‘center’,
shadowColor: COLORS.secondary,
shadowOffset: { width: 0, height: 4 },
shadowOpacity: 0.3,
shadowRadius: 8,
elevation: 5,
},
});
