import { format, parseISO, isValid } from 'date-fns';
import { tr } from 'date-fns/locale';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (dateString: string): string => {
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return 'Geçersiz tarih';
    return format(date, 'dd/MM/yyyy', { locale: tr });
  } catch {
    return 'Geçersiz tarih';
  }
};

export const formatDateLong = (dateString: string): string => {
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return 'Geçersiz tarih';
    return format(date, "d MMMM yyyy, EEEE", { locale: tr });
  } catch {
    return 'Geçersiz tarih';
  }
};

export const getDaysUntil = (dateString: string): number => {
  try {
    const date = parseISO(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
};

export const getBillStatus = (dueDate: string, isPaid: boolean): 'paid' | 'upcoming' | 'overdue' => {
  if (isPaid) return 'paid';
  const daysUntil = getDaysUntil(dueDate);
  if (daysUntil < 0) return 'overdue';
  return 'upcoming';
};
