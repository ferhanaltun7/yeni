import * as ImagePicker from 'expo-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as ImageManipulator from 'expo-image-manipulator';

export interface BillScanResult {
  success: boolean;
  amount?: string;
  dueDate?: string;
  category?: string;
  rawText?: string;
  error?: string;
}

// Category detection keywords
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  electricity: ['elektrik', 'enerji', 'aydem', 'enerjisa', 'tedaş', 'başkent', 'bedaş', 'gediz', 'toroslar'],
  water: ['su', 'iski', 'aski', 'izsu', 'buski', 'deski', 'meski'],
  gas: ['doğalgaz', 'gaz', 'igdaş', 'egegaz', 'başkentgaz', 'izmirgaz', 'bursagaz'],
  internet: ['internet', 'ttnet', 'türk telekom', 'turknet', 'superonline', 'vodafone', 'turkcell'],
  phone: ['telefon', 'gsm', 'mobil', 'cep', 'turkcell', 'vodafone', 'türk telekom'],
  subscriptions: ['netflix', 'spotify', 'youtube', 'amazon', 'disney', 'exxen', 'blu tv', 'gain', 'abonelik'],
  rent: ['kira', 'konut', 'daire'],
  market: ['market', 'migros', 'a101', 'bim', 'şok', 'carrefour'],
};

// Amount patterns for Turkish bills
const AMOUNT_PATTERNS = [
  /(?:toplam|tutar|ödenmesi gereken|ödenecek|son ödeme tutarı|borç|gecikme|tahakkuk)[:\s]*([0-9.,]+)\s*(?:tl|₺)?/i,
  /([0-9]+[.,][0-9]{2})\s*(?:tl|₺)/i,
  /(?:tl|₺)\s*([0-9]+[.,][0-9]{2})/i,
  /(?:toplam|tutar)[:\s]*₺?\s*([0-9.,]+)/i,
];

// Date patterns for Turkish bills
const DATE_PATTERNS = [
  /(?:son ödeme|vade|ödeme tarihi|son ödeme tarihi)[:\s]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/i,
  /(\d{1,2}[./-]\d{1,2}[./-]\d{4})/g,
  /(\d{2}[./-]\d{2}[./-]\d{2,4})/g,
];

/**
 * Parse amount from Turkish bill text
 */
function parseAmount(text: string): string | undefined {
  for (const pattern of AMOUNT_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // Clean and normalize the amount
      let amount = match[1].replace(/\s/g, '');
      // Convert Turkish decimal format (123,45) to standard (123.45)
      if (amount.includes(',') && !amount.includes('.')) {
        amount = amount.replace(',', '.');
      } else if (amount.includes(',') && amount.includes('.')) {
        // Handle 1.234,56 format
        amount = amount.replace(/\./g, '').replace(',', '.');
      }
      // Validate it's a reasonable bill amount (1 - 50000 TL)
      const numValue = parseFloat(amount);
      if (!isNaN(numValue) && numValue > 0 && numValue < 50000) {
        return amount;
      }
    }
  }
  return undefined;
}

/**
 * Parse due date from Turkish bill text
 */
function parseDueDate(text: string): string | undefined {
  // First try to find explicit "son ödeme" patterns
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const dateStr = match[1];
      // Parse and validate date
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
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2024) {
          // Return in ISO format for the date picker
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
 * Request camera permissions
 */
async function requestPermissions(): Promise<boolean> {
  const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
  const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  
  return cameraPermission.granted && mediaPermission.granted;
}

/**
 * Pick image from camera or gallery
 */
export async function pickImage(useCamera: boolean = true): Promise<string | null> {
  const hasPermission = await requestPermissions();
  if (!hasPermission) {
    return null;
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8,
  };

  let result;
  if (useCamera) {
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }

  if (!result.canceled && result.assets[0]) {
    return result.assets[0].uri;
  }
  return null;
}

/**
 * Resize image for faster OCR processing
 */
async function resizeImage(uri: string): Promise<string> {
  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    return manipResult.uri;
  } catch (error) {
    console.log('Image resize failed, using original:', error);
    return uri;
  }
}

/**
 * Main function to scan a bill image and extract information
 */
export async function scanBill(useCamera: boolean = true): Promise<BillScanResult> {
  try {
    // Step 1: Pick image
    const imageUri = await pickImage(useCamera);
    if (!imageUri) {
      return {
        success: false,
        error: 'Fotoğraf seçilemedi veya izin verilmedi.',
      };
    }

    // Step 2: Resize image for faster processing
    const resizedUri = await resizeImage(imageUri);

    // Step 3: Run ML Kit Text Recognition
    const result = await TextRecognition.recognize(resizedUri);
    
    if (!result || !result.text || result.text.trim().length === 0) {
      return {
        success: false,
        error: 'Faturada metin bulunamadı. Lütfen daha net bir fotoğraf çekin.',
      };
    }

    const rawText = result.text;
    console.log('OCR Raw Text:', rawText);

    // Step 4: Parse extracted text
    const amount = parseAmount(rawText);
    const dueDate = parseDueDate(rawText);
    const category = parseCategory(rawText);

    // Check if we found any useful information
    const hasData = amount || dueDate || category;

    return {
      success: true,
      amount,
      dueDate,
      category,
      rawText: rawText.substring(0, 500), // Limit raw text length
      error: hasData ? undefined : 'Fatura bilgileri otomatik çıkarılamadı. Lütfen manuel girin.',
    };

  } catch (error) {
    console.error('OCR Error:', error);
    return {
      success: false,
      error: 'Fatura taraması başarısız oldu. Lütfen tekrar deneyin veya manuel girin.',
    };
  }
}

/**
 * Scan from gallery instead of camera
 */
export async function scanBillFromGallery(): Promise<BillScanResult> {
  return scanBill(false);
}

export default {
  scanBill,
  scanBillFromGallery,
  pickImage,
};
