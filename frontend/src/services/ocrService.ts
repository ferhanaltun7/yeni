import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

export interface BillScanResult {
  success: boolean;
  amount?: string;
  dueDate?: string;
  category?: string;
  rawText?: string;
  error?: string;
}

// OCR.space free API key (25,000 requests/month free)
// Users can get their own key at https://ocr.space/ocrapi/freekey
const OCR_API_KEY = 'K85482945088957'; // Free tier API key
const OCR_API_URL = 'https://api.ocr.space/parse/image';

// Category detection keywords
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  electricity: ['elektrik', 'enerji', 'aydem', 'enerjisa', 'tedaş', 'başkent', 'bedaş', 'gediz', 'toroslar', 'dicle', 'vangölü', 'akedaş', 'akdeniz', 'yeşilırmak', 'çoruh', 'fırat', 'kayseri', 'meram', 'osmangazi', 'sakarya', 'trakya', 'uludağ'],
  water: ['su', 'iski', 'aski', 'izsu', 'buski', 'deski', 'meski', 'kaski', 'koski', 'satso', 'asat', 'muski'],
  gas: ['doğalgaz', 'gaz', 'igdaş', 'egegaz', 'başkentgaz', 'izmirgaz', 'bursagaz', 'kayserigaz', 'enerya', 'agdaş', 'palgaz', 'samgaz', 'akmercan', 'armadaş', 'çinigaz', 'netgaz', 'ovagaz', 'trakya gaz'],
  internet: ['internet', 'ttnet', 'türk telekom', 'turknet', 'superonline', 'vodafone net', 'kablonet', 'd-smart', 'millenicom', 'pttcell'],
  phone: ['telefon', 'gsm', 'mobil', 'cep', 'turkcell', 'vodafone', 'türk telekom', 'bimcell', 'pttcell', 'hat', 'kontör'],
  subscriptions: ['netflix', 'spotify', 'youtube', 'amazon', 'disney', 'exxen', 'blu tv', 'gain', 'abonelik', 'premium', 'apple', 'google play', 'xbox', 'playstation', 'nintendo'],
  rent: ['kira', 'konut', 'daire', 'ev', 'apartman'],
  market: ['market', 'migros', 'a101', 'bim', 'şok', 'carrefour', 'metro', 'file', 'macro', 'happy center'],
};

// Amount patterns for Turkish bills
const AMOUNT_PATTERNS = [
  /(?:toplam|tutar|ödenmesi gereken|ödenecek tutar|son ödeme tutarı|borç tutarı|tahakkuk|net tutar|genel toplam)[:\s]*[₺]?\s*([0-9]+[.,][0-9]{2})/gi,
  /(?:toplam|tutar|ödenmesi gereken|ödenecek)[:\s]*([0-9]+[.,][0-9]{2})\s*(?:tl|₺)/gi,
  /([0-9]+[.,][0-9]{2})\s*(?:tl|₺)/gi,
  /(?:tl|₺)\s*([0-9]+[.,][0-9]{2})/gi,
  /(?:toplam|tutar)[:\s]*₺?\s*([0-9]+[.,][0-9]{2})/gi,
  /([0-9]{1,3}(?:\.[0-9]{3})*,[0-9]{2})/g, // 1.234,56 format
];

// Date patterns for Turkish bills
const DATE_PATTERNS = [
  /(?:son ödeme tarihi|son ödeme|vade tarihi|vade|ödeme tarihi|s\.ö\.t)[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/gi,
  /(\d{2}[.]\d{2}[.]\d{4})/g, // DD.MM.YYYY
  /(\d{2}[/]\d{2}[/]\d{4})/g, // DD/MM/YYYY
];

/**
 * Parse amount from Turkish bill text
 */
function parseAmount(text: string): string | undefined {
  const normalizedText = text.toLowerCase();
  
  for (const pattern of AMOUNT_PATTERNS) {
    pattern.lastIndex = 0; // Reset regex
    const matches = [...normalizedText.matchAll(pattern)];
    
    for (const match of matches) {
      if (match && match[1]) {
        let amount = match[1].replace(/\s/g, '');
        
        // Convert Turkish decimal format (123,45) to standard (123.45)
        // Handle 1.234,56 format (thousand separator + decimal)
        if (amount.includes('.') && amount.includes(',')) {
          // 1.234,56 -> 1234.56
          amount = amount.replace(/\./g, '').replace(',', '.');
        } else if (amount.includes(',')) {
          // 123,45 -> 123.45
          amount = amount.replace(',', '.');
        }
        
        const numValue = parseFloat(amount);
        // Validate it's a reasonable bill amount (1 - 50000 TL)
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
  const normalizedText = text.toLowerCase();
  
  for (const pattern of DATE_PATTERNS) {
    pattern.lastIndex = 0;
    const match = normalizedText.match(pattern);
    
    if (match && match[1]) {
      const dateStr = match[1];
      const parts = dateStr.split(/[./-]/);
      
      if (parts.length === 3) {
        let day = parseInt(parts[0]);
        let month = parseInt(parts[1]);
        let year = parseInt(parts[2]);
        
        // Handle 2-digit year
        if (year < 100) {
          year += 2000;
        }
        
        // Validate date parts
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2024 && year <= 2030) {
          const isoDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
          return isoDate;
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
  
  // Priority order for category detection
  const categoryOrder = ['electricity', 'water', 'gas', 'internet', 'phone', 'subscriptions', 'rent', 'market'];
  
  for (const category of categoryOrder) {
    const keywords = CATEGORY_KEYWORDS[category];
    for (const keyword of keywords) {
      if (lowerText.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }
  return undefined;
}

/**
 * Request camera/gallery permissions
 */
async function requestPermissions(): Promise<boolean> {
  const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
  const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  
  return cameraPermission.granted || mediaPermission.granted;
}

/**
 * Pick and compress image for OCR
 */
async function pickAndCompressImage(useCamera: boolean): Promise<string | null> {
  const hasPermission = await requestPermissions();
  if (!hasPermission) {
    return null;
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8,
    base64: false,
  };

  let result;
  try {
    if (useCamera) {
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      result = await ImagePicker.launchImageLibraryAsync(options);
    }
  } catch (error) {
    console.error('Image picker error:', error);
    return null;
  }

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  const uri = result.assets[0].uri;

  // Compress and resize image for faster OCR
  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return manipResult.base64 || null;
  } catch (error) {
    console.log('Image manipulation failed, trying to read original:', error);
    // Try to read original file as base64
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return base64;
    } catch (readError) {
      console.error('Failed to read image:', readError);
      return null;
    }
  }
}

/**
 * Call OCR.space API to recognize text
 */
async function recognizeText(base64Image: string): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append('apikey', OCR_API_KEY);
    formData.append('base64Image', `data:image/jpeg;base64,${base64Image}`);
    formData.append('language', 'tur'); // Turkish
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2'); // Engine 2 is better for non-Latin scripts

    const response = await fetch(OCR_API_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      console.error('OCR API error:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.IsErroredOnProcessing) {
      console.error('OCR processing error:', data.ErrorMessage);
      return null;
    }

    if (data.ParsedResults && data.ParsedResults.length > 0) {
      return data.ParsedResults[0].ParsedText || null;
    }

    return null;
  } catch (error) {
    console.error('OCR API call failed:', error);
    return null;
  }
}

/**
 * Main function to scan a bill image and extract information
 * Works in Expo Go - no native modules required!
 */
export async function scanBill(useCamera: boolean = true): Promise<BillScanResult> {
  try {
    // Step 1: Pick and compress image
    const base64Image = await pickAndCompressImage(useCamera);
    
    if (!base64Image) {
      return {
        success: false,
        error: 'Fotoğraf seçilemedi veya izin verilmedi.',
      };
    }

    // Step 2: Call OCR API
    const rawText = await recognizeText(base64Image);
    
    if (!rawText || rawText.trim().length === 0) {
      return {
        success: false,
        error: 'Faturada metin bulunamadı. Lütfen daha net bir fotoğraf çekin.',
      };
    }

    console.log('OCR Raw Text:', rawText);

    // Step 3: Parse extracted text
    const amount = parseAmount(rawText);
    const dueDate = parseDueDate(rawText);
    const category = parseCategory(rawText);

    const hasData = amount || dueDate || category;

    return {
      success: true,
      amount,
      dueDate,
      category,
      rawText: rawText.substring(0, 1000), // Limit raw text length
      error: hasData ? undefined : 'Fatura bilgileri otomatik çıkarılamadı. Lütfen kontrol edin veya manuel girin.',
    };

  } catch (error) {
    console.error('Scan error:', error);
    return {
      success: false,
      error: 'Fatura taraması başarısız oldu. Lütfen tekrar deneyin.',
    };
  }
}

/**
 * Scan from gallery
 */
export async function scanBillFromGallery(): Promise<BillScanResult> {
  return scanBill(false);
}

export default {
  scanBill,
  scanBillFromGallery,
};
