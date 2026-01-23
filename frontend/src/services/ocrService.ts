import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BillScanResult {
  success: boolean;
  amount?: string;
  dueDate?: string;
  category?: string;
  title?: string;
  rawText?: string;
  error?: string;
}

// Category detection keywords
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  electricity: ['elektrik', 'enerji', 'aydem', 'enerjisa', 'tedaş', 'başkent', 'bedaş', 'gediz', 'toroslar', 'dicle', 'kw', 'kwh', 'sayaç'],
  water: ['su', 'iski', 'aski', 'izsu', 'buski', 'deski', 'meski', 'kaski', 'koski', 'm³', 'metreküp'],
  gas: ['doğalgaz', 'gaz', 'igdaş', 'egegaz', 'başkentgaz', 'izmirgaz', 'bursagaz'],
  internet: ['internet', 'ttnet', 'türk telekom', 'turknet', 'superonline', 'vodafone net', 'fiber', 'mbps'],
  phone: ['telefon', 'gsm', 'mobil', 'cep', 'turkcell', 'vodafone', 'hat', 'kontör'],
  subscriptions: ['netflix', 'spotify', 'youtube', 'amazon', 'disney', 'exxen', 'abonelik'],
  rent: ['kira', 'konut', 'daire'],
  market: ['market', 'migros', 'a101', 'bim', 'şok', 'carrefour'],
};

const CATEGORY_TITLES: Record<string, string> = {
  electricity: 'Elektrik Faturası',
  water: 'Su Faturası',
  gas: 'Doğalgaz Faturası',
  internet: 'İnternet Faturası',
  phone: 'Telefon Faturası',
  subscriptions: 'Abonelik',
  rent: 'Kira',
  market: 'Market Alışverişi',
};

/**
 * Parse amount from Turkish bill text
 */
function parseAmount(text: string): string | undefined {
  const patterns = [
    /(?:toplam|tutar|ödenmesi gereken|ödenecek|fatura bedeli|borç)[:\s]*[₺]?\s*([0-9]+[.,][0-9]{2})/gi,
    /([0-9]+[.,][0-9]{2})\s*(?:tl|₺)/gi,
    /(?:tl|₺)\s*([0-9]+[.,][0-9]{2})/gi,
    /([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/g,
  ];
  
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const matches = [...text.toLowerCase().matchAll(pattern)];
    
    for (const match of matches) {
      if (match && match[1]) {
        let amount = match[1].replace(/\s/g, '');
        
        if (amount.includes('.') && amount.includes(',')) {
          amount = amount.replace(/\./g, '').replace(',', '.');
        } else if (amount.includes(',')) {
          amount = amount.replace(',', '.');
        }
        
        const numValue = parseFloat(amount);
        if (!isNaN(numValue) && numValue > 1 && numValue < 50000) {
          return numValue.toFixed(2);
        }
      }
    }
  }
  return undefined;
}

/**
 * Parse due date from Turkish bill text
 */
function parseDueDate(text: string): string | undefined {
  const patterns = [
    /(?:son ödeme|vade|ödeme tarihi|s\.ö\.t)[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/gi,
    /(\d{2}[.]\d{2}[.]\d{4})/g,
  ];
  
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    const match = text.match(pattern);
    
    if (match && match[0]) {
      const dateMatch = match[0].match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
      if (dateMatch) {
        let day = parseInt(dateMatch[1]);
        let month = parseInt(dateMatch[2]);
        let year = parseInt(dateMatch[3]);
        
        if (year < 100) year += 2000;
        
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2024) {
          return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        }
      }
    }
  }
  return undefined;
}

/**
 * Detect bill category from text
 */
function parseCategory(text: string): string | undefined {
  const lowerText = text.toLowerCase();
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }
  return undefined;
}

/**
 * Request permissions
 */
async function requestPermissions(): Promise<boolean> {
  const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
  const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return cameraPermission.granted || mediaPermission.granted;
}

/**
 * Pick and compress image
 */
async function pickAndCompressImage(useCamera: boolean): Promise<string | null> {
  const hasPermission = await requestPermissions();
  if (!hasPermission) return null;

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8,
  };

  let result;
  try {
    result = useCamera 
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  } catch (error) {
    console.error('Image picker error:', error);
    return null;
  }

  if (result.canceled || !result.assets[0]) return null;

  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return manipResult.base64 || null;
  } catch (error) {
    console.log('Image manipulation failed:', error);
    return null;
  }
}

/**
 * Call OCR API (free-ocr.com as backup)
 */
async function callOcrApi(base64Image: string): Promise<string | null> {
  // Try OCR.space first
  try {
    const formData = new FormData();
    formData.append('apikey', 'K85482945088957');
    formData.append('base64Image', `data:image/jpeg;base64,${base64Image}`);
    formData.append('language', 'tur');
    formData.append('OCREngine', '2');

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    
    if (!data.IsErroredOnProcessing && data.ParsedResults?.[0]?.ParsedText) {
      return data.ParsedResults[0].ParsedText;
    }
  } catch (error) {
    console.log('OCR.space failed, trying backup...');
  }

  // Backup: Try API from backend
  try {
    const token = await AsyncStorage.getItem('session_token');
    const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    
    const response = await axios.post(
      `${API_URL}/api/bills/scan`,
      { image_base64: base64Image },
      { 
        headers: { Authorization: `Bearer ${token}` },
        timeout: 30000
      }
    );

    if (response.data.rawText) {
      return response.data.rawText;
    }
  } catch (error) {
    console.log('Backend OCR failed');
  }

  return null;
}

/**
 * Main scan function
 */
export async function scanBill(useCamera: boolean = true): Promise<BillScanResult> {
  try {
    // Step 1: Pick image
    const base64Image = await pickAndCompressImage(useCamera);
    
    if (!base64Image) {
      return {
        success: false,
        error: 'Fotoğraf seçilemedi veya izin verilmedi.',
      };
    }

    // Step 2: OCR
    const rawText = await callOcrApi(base64Image);
    
    if (!rawText || rawText.trim().length < 10) {
      return {
        success: false,
        error: 'Faturada metin bulunamadı. Lütfen daha net bir fotoğraf çekin.',
      };
    }

    console.log('OCR Text:', rawText.substring(0, 200));

    // Step 3: Parse
    const amount = parseAmount(rawText);
    const dueDate = parseDueDate(rawText);
    const category = parseCategory(rawText);
    const title = category ? CATEGORY_TITLES[category] : undefined;

    const hasData = amount || dueDate || category;

    return {
      success: true,
      amount,
      dueDate,
      category,
      title,
      rawText: rawText.substring(0, 500),
      error: hasData ? undefined : 'Bilgiler tam çıkarılamadı. Lütfen kontrol edin.',
    };

  } catch (error) {
    console.error('Scan error:', error);
    return {
      success: false,
      error: 'Tarama başarısız. Lütfen tekrar deneyin.',
    };
  }
}

export async function scanBillFromGallery(): Promise<BillScanResult> {
  return scanBill(false);
}

export default { scanBill, scanBillFromGallery };
