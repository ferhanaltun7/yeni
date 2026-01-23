import React, { useState, useEffect } from 'react';
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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { billsAPI, ocrAPI } from '../src/services/api';
import { COLORS, CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_NAMES, CATEGORY_GROUPS } from '../src/utils/constants';

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
  const [scannedImage, setScannedImage] = useState<string | null>(null);

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDueDate(selectedDate);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Fotoğraf seçmek için galeri izni gerekiyor.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      await scanBillImage(result.assets[0].base64, result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Fotoğraf çekmek için kamera izni gerekiyor.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      await scanBillImage(result.assets[0].base64, result.assets[0].uri);
    }
  };

  const scanBillImage = async (base64: string, uri: string) => {
    setScanning(true);
    setScannedImage(uri);

    try {
      const result = await ocrAPI.scanBill(base64);

      if (result.success) {
        if (result.title) setTitle(result.title);
        if (result.amount) setAmount(result.amount.toString());
        if (result.due_date) {
          try {
            const date = new Date(result.due_date);
            if (!isNaN(date.getTime())) {
              setDueDate(date);
            }
          } catch (e) {
            console.log('Date parse error:', e);
          }
        }
        if (result.category && CATEGORY_NAMES[result.category]) {
          setCategory(result.category);
        }

        Alert.alert('Başarılı', 'Fatura bilgileri otomatik olarak dolduruldu. Lütfen kontrol edin.');
      } else {
        Alert.alert('Uyarı', result.error || 'Fatura okunamadı. Lütfen manuel olarak doldurun.');
      }
    } catch (error) {
      console.error('Scan error:', error);
      Alert.alert('Hata', 'Fatura taraması başarısız oldu.');
    } finally {
      setScanning(false);
    }
  };

  const showScanOptions = () => {
    Alert.alert(
      'Fatura Tara',
      'Fatura fotoğrafı nasıl eklemek istersiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Galeriden Seç', onPress: pickImage },
        { text: 'Fotoğraf Çek', onPress: takePhoto },
      ]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Hata', 'Lütfen fatura adı girin');
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
      Alert.alert('Hata', 'Fatura eklenirken bir hata oluştu');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Scan Button - Coming Soon */}
          <View style={styles.scanButton}>
            <Ionicons name="scan" size={24} color={COLORS.textSecondary} />
            <View style={styles.scanTextContainer}>
              <Text style={styles.scanButtonTextDisabled}>
                Fatura Fotoğrafı ile Ekle
              </Text>
              <Text style={styles.scanButtonSubtext}>
                Yakında - AI ile otomatik bilgi çıkarma
              </Text>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Yakında</Text>
            </View>
          </View>

          {scannedImage && (
            <View style={styles.scannedImageContainer}>
              <Image source={{ uri: scannedImage }} style={styles.scannedImage} />
            </View>
          )}

          <View style={styles.dividerContainer}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>veya manuel girin</Text>
            <View style={styles.divider} />
          </View>

          {/* Title */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Fatura Adı *</Text>
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
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar" size={20} color={COLORS.primary} />
              <Text style={styles.dateText}>
                {dueDate.toLocaleDateString('tr-TR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
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

          {/* Category - Grouped */}
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
                        category === catId && {
                          backgroundColor: CATEGORY_COLORS[catId] + '20',
                          borderColor: CATEGORY_COLORS[catId],
                        },
                      ]}
                      onPress={() => setCategory(catId)}
                    >
                      <Ionicons
                        name={CATEGORY_ICONS[catId] as any}
                        size={18}
                        color={
                          category === catId
                            ? CATEGORY_COLORS[catId]
                            : COLORS.textSecondary
                        }
                      />
                      <Text
                        style={[
                          styles.categoryText,
                          category === catId && {
                            color: CATEGORY_COLORS[catId],
                          },
                        ]}
                      >
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
            style={[
              styles.submitButton,
              (!title.trim() || !amount || submitting) &&
                styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!title.trim() || !amount || submitting}
          >
            {submitting ? (
              <Text style={styles.submitButtonText}>Ekleniyor...</Text>
            ) : (
              <>
                <Ionicons name="add-circle" size={24} color="#fff" />
                <Text style={styles.submitButtonText}>Fatura Ekle</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '10',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: COLORS.primary + '30',
    borderStyle: 'dashed',
  },
  scanButtonTextDisabled: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  comingSoonBadge: {
    backgroundColor: COLORS.warning + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.warning,
  },
  scanTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  scanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  scanButtonSubtext: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  scannedImageContainer: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  scannedImage: {
    width: '100%',
    height: 150,
    resizeMode: 'cover',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
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
  amountContainer: {
    position: 'relative',
  },
  amountInput: {
    paddingRight: 50,
  },
  currencyBadge: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -10 }],
  },
  currencyText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
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
  dateText: {
    fontSize: 16,
    color: COLORS.text,
  },
  categoryGroup: {
    marginBottom: 16,
  },
  categoryGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 6,
  },
  categoryGroupTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
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
  categoryButtonActive: {
    borderWidth: 2,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  notesInput: {
    height: 100,
    paddingTop: 14,
  },
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
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.textLight,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
