import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { billsAPI } from '../src/services/api';
import { scanBill, scanBillFromGallery, BillScanResult } from '../src/services/ocrService';
import { COLORS, CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_NAMES, CATEGORY_GROUPS } from '../src/utils/constants';

// Map biller names to categories
const BILLER_TO_CATEGORY: Record<string, string> = {
  'enerjisa': 'electricity', 'tedaş': 'electricity', 'bedaş': 'electricity', 'aydem': 'electricity',
  'iski': 'water', 'aski': 'water', 'izsu': 'water', 'buski': 'water', 'denizli': 'water',
  'igdaş': 'gas', 'egegaz': 'gas', 'başkentgaz': 'gas',
  'türk telekom': 'internet', 'superonline': 'internet', 'turknet': 'internet',
  'turkcell': 'phone', 'vodafone': 'phone',
};

function detectCategory(billerName: string): string {
  const lower = billerName.toLowerCase();
  for (const [key, cat] of Object.entries(BILLER_TO_CATEGORY)) {
    if (lower.includes(key)) return cat;
  }
  if (lower.includes('elektrik')) return 'electricity';
  if (lower.includes('su')) return 'water';
  if (lower.includes('gaz')) return 'gas';
  if (lower.includes('internet') || lower.includes('fiber')) return 'internet';
  if (lower.includes('telefon') || lower.includes('gsm')) return 'phone';
  return 'electricity';
}

export default function AddBill() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [category, setCategory] = useState('electricity');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [rawOcrText, setRawOcrText] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) setDueDate(selectedDate);
  };

  const handleScanResult = (result: BillScanResult) => {
    setWarnings(result.warnings || []);
    
    if (result.rawText) {
      setRawOcrText(result.rawText);
    }

    if (result.success) {
      // Auto-fill biller name as title
      if (result.billerName) {
        const cat = detectCategory(result.billerName);
        setCategory(cat);
        const catName = CATEGORY_NAMES[cat] || 'Fatura';
        setTitle(`${result.billerName} ${catName} Faturası`);
      }

      // Auto-fill amount
      if (result.amount) {
        setAmount(result.amount.toFixed(2));
      }

      // Auto-fill due date
      if (result.dueDate) {
        try {
          const d = new Date(result.dueDate);
          if (!isNaN(d.getTime())) setDueDate(d);
        } catch {}
      }

      // Show success or warnings
      if (result.warnings.length > 0) {
        Alert.alert('Tarama Tamamlandı', 
          `Bazı alanları kontrol edin:\n• ${result.warnings.join('\n• ')}`,
          [{ text: 'Tamam' }]
        );
      } else if (result.billerName || result.amount || result.dueDate) {
        Alert.alert('Tarama Başarılı', 'Fatura bilgileri dolduruldu. Kontrol edip kaydedin.');
      } else if (result.error) {
        Alert.alert('Uyarı', result.error);
      }
    } else {
      Alert.alert('Hata', result.error || 'Tarama başarısız oldu.');
    }
  };

  const handleScanBill = async (useCamera: boolean) => {
    setScanning(true);
    setRawOcrText(null);
    setWarnings([]);

    try {
      const result = useCamera ? await scanBill(true) : await scanBillFromGallery();
      handleScanResult(result);
    } catch (error) {
      console.error('Scan error:', error);
      Alert.alert('Hata', 'Tarama sırasında hata oluştu.');
    } finally {
      setScanning(false);
    }
  };

  const showScanOptions = () => {
    Alert.alert('Faturayı Tara', 'Fatura fotoğrafını nasıl eklemek istersiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Galeriden Seç', onPress: () => handleScanBill(false) },
      { text: 'Fotoğraf Çek', onPress: () => handleScanBill(true) },
    ]);
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Hata', 'Lütfen gider adı girin');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Hata', 'Lütfen geçerli bir tutar girin');
      return;
    }

    setSubmitting(true);
    try {
      await billsAPI.create({
        title: title.trim(),
        amount: parseFloat(amount.replace(/[^0-9.]/g, '')),
        due_date: dueDate.toISOString(),
        category,
        notes: notes.trim() || undefined,
      });
      Alert.alert('Başarılı', 'Fatura eklendi!', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('Add bill error:', error);
      Alert.alert('Hata', 'Fatura eklenirken hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          
          {/* Scan Button */}
          <TouchableOpacity
            style={[styles.scanButton, scanning && styles.scanButtonActive]}
            onPress={showScanOptions}
            disabled={scanning}
          >
            {scanning ? (
              <ActivityIndicator color={COLORS.primary} size="small" />
            ) : (
              <Ionicons name="camera" size={28} color={COLORS.primary} />
            )}
            <View style={styles.scanTextContainer}>
              <Text style={styles.scanButtonText}>
                {scanning ? 'Fatura Taranıyor...' : 'Faturayı Tara'}
              </Text>
              <Text style={styles.scanButtonSubtext}>
                {scanning ? 'Google Vision + AI işleniyor' : 'Kamera ile otomatik bilgi çıkarma'}
              </Text>
            </View>
            {!scanning && <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />}
          </TouchableOpacity>

          {/* Warnings */}
          {warnings.length > 0 && (
            <View style={styles.warningsContainer}>
              <Ionicons name="warning" size={18} color={COLORS.warning} />
              <Text style={styles.warningsText}>{warnings.join(' • ')}</Text>
            </View>
          )}

          {/* Raw OCR Text Preview */}
          {rawOcrText && (
            <View style={styles.rawTextContainer}>
              <TouchableOpacity style={styles.rawTextHeader} onPress={() => setShowRawText(!showRawText)}>
                <View style={styles.rawTextHeaderLeft}>
                  <Ionicons name="document-text-outline" size={18} color={COLORS.textSecondary} />
                  <Text style={styles.rawTextTitle}>Taranan Metin</Text>
                </View>
                <Ionicons name={showRawText ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
              {showRawText && (
                <Text style={styles.rawTextContent} numberOfLines={12}>{rawOcrText}</Text>
              )}
            </View>
          )}

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>veya manuel girin</Text>
            <View style={styles.divider} />
          </View>

          {/* Title */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Gider Adı *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Örn: Elektrik Faturası"
              placeholderTextColor={COLORS.textLight}
            />
          </View>

          {/* Amount */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Tutar *</Text>
            <View style={styles.amountContainer}>
              <TextInput
                style={[styles.input, styles.amountInput]}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={COLORS.textLight}
                keyboardType="decimal-pad"
              />
              <View style={styles.currencyBadge}>
                <Text style={styles.currencyText}>TL</Text>
              </View>
            </View>
          </View>

          {/* Due Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Son Ödeme Tarihi *</Text>
            <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
              <Ionicons name="calendar" size={20} color={COLORS.primary} />
              <Text style={styles.dateText}>
                {dueDate.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={dueDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                locale="tr-TR"
              />
            )}
          </View>

          {/* Category */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Kategori</Text>
            {CATEGORY_GROUPS.map((group) => (
              <View key={group.id} style={styles.categoryGroup}>
                <View style={styles.categoryGroupHeader}>
                  <Ionicons name={group.icon as any} size={18} color={COLORS.textSecondary} />
                  <Text style={styles.categoryGroupTitle}>{group.name}</Text>
                </View>
                <View style={styles.categoryGrid}>
                  {group.subcategories.map((catId) => (
                    <TouchableOpacity
                      key={catId}
                      style={[
                        styles.categoryButton,
                        category === catId && styles.categoryButtonActive,
                        category === catId && { backgroundColor: CATEGORY_COLORS[catId] + '20', borderColor: CATEGORY_COLORS[catId] },
                      ]}
                      onPress={() => setCategory(catId)}
                    >
                      <Ionicons
                        name={CATEGORY_ICONS[catId] as any}
                        size={18}
                        color={category === catId ? CATEGORY_COLORS[catId] : COLORS.textSecondary}
                      />
                      <Text style={[styles.categoryText, category === catId && { color: CATEGORY_COLORS[catId] }]}>
                        {CATEGORY_NAMES[catId]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>

          {/* Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notlar (Opsiyonel)</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Ek bilgiler..."
              placeholderTextColor={COLORS.textLight}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>

        {/* Submit Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitButton, (!title.trim() || !amount || submitting) && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={!title.trim() || !amount || submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.submitButtonText}>Faturayı Ekle</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  keyboardView: { flex: 1 },
  scrollContent: { padding: 20 },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '10',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: COLORS.primary + '30',
    borderStyle: 'dashed',
  },
  scanButtonActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  scanTextContainer: { flex: 1, marginLeft: 12 },
  scanButtonText: { fontSize: 16, fontWeight: '600', color: COLORS.primary },
  scanButtonSubtext: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  warningsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '15',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    gap: 8,
  },
  warningsText: { flex: 1, fontSize: 13, color: COLORS.warning, fontWeight: '500' },
  rawTextContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  rawTextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: COLORS.background,
  },
  rawTextHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rawTextTitle: { fontSize: 14, fontWeight: '500', color: COLORS.textSecondary },
  rawTextContent: {
    padding: 12,
    fontSize: 11,
    color: COLORS.text,
    lineHeight: 16,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  dividerContainer: { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  divider: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { marginHorizontal: 12, fontSize: 12, color: COLORS.textSecondary },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  amountContainer: { position: 'relative' },
  amountInput: { paddingRight: 50 },
  currencyBadge: { position: 'absolute', right: 16, top: '50%', transform: [{ translateY: -10 }] },
  currencyText: { fontSize: 16, fontWeight: '600', color: COLORS.primary },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 12,
  },
  dateText: { fontSize: 16, color: COLORS.text },
  categoryGroup: { marginBottom: 16 },
  categoryGroupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
  categoryGroupTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
  },
  categoryButtonActive: { borderWidth: 2 },
  categoryText: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary },
  notesInput: { height: 100, paddingTop: 14 },
  footer: {
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 20,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.success,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonDisabled: { backgroundColor: COLORS.textLight },
  submitButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
