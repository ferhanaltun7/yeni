import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { billsAPI } from '../src/services/api';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { COLORS, CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_NAMES } from '../src/utils/constants';
import { formatCurrency, formatDateLong, getDaysUntil, getBillStatus } from '../src/utils/formatters';
import { Bill } from '../src/types';

export default function BillDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchBill();
    }
  }, [id]);

  const fetchBill = async () => {
    try {
      const data = await billsAPI.getById(id!);
      setBill(data);
    } catch (error) {
      console.error('Fetch bill error:', error);
      Alert.alert('Hata', 'Fatura bulunamadı', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePaid = async () => {
    if (!bill) return;
    
    try {
      const updated = await billsAPI.togglePaid(bill.bill_id);
      setBill(updated);
      
      Alert.alert(
        'Başarılı',
        updated.is_paid ? 'Fatura ödendi olarak işaretlendi!' : 'Fatura ödenmedi olarak işaretlendi!'
      );
    } catch (error) {
      console.error('Toggle paid error:', error);
      Alert.alert('Hata', 'İşlem başarısız oldu');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Faturayı Sil',
      'Bu faturayı silmek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await billsAPI.delete(bill!.bill_id);
              Alert.alert('Başarılı', 'Fatura silindi', [
                { text: 'Tamam', onPress: () => router.back() },
              ]);
            } catch (error) {
              console.error('Delete bill error:', error);
              Alert.alert('Hata', 'Fatura silinirken bir hata oluştu');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!bill) {
    return null;
  }

  const status = getBillStatus(bill.due_date, bill.is_paid);
  const daysUntil = getDaysUntil(bill.due_date);
  const categoryColor = CATEGORY_COLORS[bill.category] || '#6B7280';
  const categoryIcon = CATEGORY_ICONS[bill.category] || 'ellipsis-horizontal';
  const categoryName = CATEGORY_NAMES[bill.category] || bill.category;

  const getStatusColor = () => {
    switch (status) {
      case 'paid': return COLORS.success;
      case 'overdue': return COLORS.danger;
      default: return daysUntil <= 3 ? COLORS.warning : COLORS.primary;
    }
  };

  const getStatusText = () => {
    if (status === 'paid') return 'Ödendi';
    if (status === 'overdue') return `${Math.abs(daysUntil)} gün gecikmiş`;
    if (daysUntil === 0) return 'Bugün ödenmeli!';
    if (daysUntil === 1) return 'Yarın ödenmeli';
    return `${daysUntil} gün kaldı`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header Card */}
        <View style={[styles.headerCard, { borderTopColor: getStatusColor() }]}>
          <View style={[styles.categoryIcon, { backgroundColor: categoryColor + '20' }]}>
            <Ionicons name={categoryIcon as any} size={32} color={categoryColor} />
          </View>
          <Text style={styles.billTitle}>{bill.title}</Text>
          <Text style={styles.amount}>{formatCurrency(bill.amount)}</Text>
          
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '20' }]}>
            <Ionicons
              name={status === 'paid' ? 'checkmark-circle' : 'time'}
              size={18}
              color={getStatusColor()}
            />
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusText()}
            </Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.detailsCard}>
          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="pricetag" size={20} color={COLORS.textSecondary} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Kategori</Text>
              <Text style={styles.detailValue}>{categoryName}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <View style={styles.detailIcon}>
              <Ionicons name="calendar" size={20} color={COLORS.textSecondary} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Son Ödeme Tarihi</Text>
              <Text style={styles.detailValue}>{formatDateLong(bill.due_date)}</Text>
            </View>
          </View>

          {bill.is_paid && bill.paid_at && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}>
                  <Ionicons name="checkmark-done" size={20} color={COLORS.success} />
                </View>
                <View>
                  <Text style={styles.detailLabel}>Ödeme Tarihi</Text>
                  <Text style={[styles.detailValue, { color: COLORS.success }]}>
                    {formatDateLong(bill.paid_at)}
                  </Text>
                </View>
              </View>
            </>
          )}

          {bill.notes && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}>
                  <Ionicons name="document-text" size={20} color={COLORS.textSecondary} />
                </View>
                <View style={styles.notesContainer}>
                  <Text style={styles.detailLabel}>Notlar</Text>
                  <Text style={styles.notesText}>{bill.notes}</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              bill.is_paid ? styles.actionButtonOutline : styles.actionButtonPrimary,
            ]}
            onPress={handleTogglePaid}
          >
            <Ionicons
              name={bill.is_paid ? 'close-circle' : 'checkmark-circle'}
              size={24}
              color={bill.is_paid ? COLORS.textSecondary : '#fff'}
            />
            <Text
              style={[
                styles.actionButtonText,
                bill.is_paid && styles.actionButtonTextOutline,
              ]}
            >
              {bill.is_paid ? 'Ödenmedi Olarak İşaretle' : 'Ödendi Olarak İşaretle'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.actionButtonDanger]}
            onPress={handleDelete}
          >
            <Ionicons name="trash" size={24} color={COLORS.danger} />
            <Text style={[styles.actionButtonText, { color: COLORS.danger }]}>
              Faturayı Sil
            </Text>
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
  headerCard: {
    backgroundColor: COLORS.surface,
    margin: 16,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  categoryIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  billTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  amount: {
    fontSize: 36,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  detailsCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  notesContainer: {
    flex: 1,
  },
  notesText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  actionsContainer: {
    padding: 16,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  actionButtonPrimary: {
    backgroundColor: COLORS.success,
  },
  actionButtonOutline: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionButtonDanger: {
    backgroundColor: COLORS.danger + '15',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionButtonTextOutline: {
    color: COLORS.textSecondary,
  },
});
