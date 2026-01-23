import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Bill } from '../types';
import { COLORS, CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_NAMES } from '../utils/constants';
import { formatCurrency, formatDate, getDaysUntil, getBillStatus } from '../utils/formatters';

interface BillCardProps {
  bill: Bill;
  onPress?: () => void;
  onTogglePaid?: () => void;
}

export const BillCard: React.FC<BillCardProps> = ({ bill, onPress, onTogglePaid }) => {
  const status = getBillStatus(bill.due_date, bill.is_paid);
  const daysUntil = getDaysUntil(bill.due_date);
  const categoryColor = CATEGORY_COLORS[bill.category] || CATEGORY_COLORS.other;
  const categoryIcon = CATEGORY_ICONS[bill.category] || CATEGORY_ICONS.other;
  const categoryName = CATEGORY_NAMES[bill.category] || 'Diğer';
  
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
    if (daysUntil === 0) return 'Bugün!';
    if (daysUntil === 1) return 'Yarın';
    return `${daysUntil} gün kaldı`;
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { borderLeftColor: getStatusColor() },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: categoryColor + '20' }]}>
          <Ionicons name={categoryIcon as any} size={24} color={categoryColor} />
        </View>
        
        <View style={styles.details}>
          <Text style={styles.title} numberOfLines={1}>{bill.title}</Text>
          <Text style={styles.category}>{categoryName}</Text>
          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.date}>{formatDate(bill.due_date)}</Text>
          </View>
        </View>
        
        <View style={styles.rightSection}>
          <Text style={styles.amount}>{formatCurrency(bill.amount)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
              {getStatusText()}
            </Text>
          </View>
          
          <TouchableOpacity
            style={[
              styles.checkButton,
              bill.is_paid && styles.checkButtonActive,
            ]}
            onPress={(e) => {
              e.stopPropagation();
              onTogglePaid?.();
            }}
          >
            <Ionicons
              name={bill.is_paid ? 'checkmark-circle' : 'ellipse-outline'}
              size={28}
              color={bill.is_paid ? COLORS.success : COLORS.textLight}
            />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  details: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  category: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  date: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  checkButton: {
    padding: 4,
  },
  checkButtonActive: {
    transform: [{ scale: 1.1 }],
  },
});
