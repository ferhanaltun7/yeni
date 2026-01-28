import * as ImagePicker from ‘expo-image-picker’;
import * as ImageManipulator from ‘expo-image-manipulator’;
import axios from ‘axios’;
import AsyncStorage from ‘@react-native-async-storage/async-storage’;

// App shared secret - must match backend
const APP_SHARED_SECRET = ‘butce-asistani-secret-2025’;
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || ‘’;

// Confidence thresholds
const HIGH_CONFIDENCE = 0.70;
const LOW_CONFIDENCE = 0.40;

export interface ParsedField {
value: string | null;
confidence: number;
evidence: string[];
}

export interface OcrResult {
rawText: string;
parsed: {
biller_name: ParsedField;
due_date: ParsedField;
amount_due: ParsedField;
currency: ParsedField;
};
}

export interface OcrReceiptResult {
rawText: string;
parsed: {
store_name: ParsedField;
receipt_date: ParsedField;
total_amount: ParsedField;
currency: ParsedField;
items?: Array<{ name: string; price: number; quantity?: number }>;
};
}

export interface BillScanResult {
success: boolean;
billerName?: string;
dueDate?: string;
amount?: number;
currency?: string;
rawText?: string;
warnings: string[];
error?: string;
}

export interface ReceiptScanResult {
success: boolean;
storeName?: string;
receiptDate?: string;
amount?: number;
currency?: string;
category?: string;
items?: Array<{ name: string; price: number; quantity?: number }>;
rawText?: string;
warnings: string[];
error?: string;
}

async function requestPermissions(): Promise<boolean> {
const camera = await ImagePicker.requestCameraPermissionsAsync();
const media = await ImagePicker.requestMediaLibraryPermissionsAsync();
return camera.granted || media.granted;
}

async function pickAndCompressImage(useCamera: boolean): Promise<{ base64: string; mimeType: string } | null> {
if (!(await requestPermissions())) return null;

const options: ImagePicker.ImagePickerOptions = {
mediaTypes: ImagePicker.MediaTypeOptions.Images,
allowsEditing: true,
quality: 0.8,
};

const result = useCamera
? await ImagePicker.launchCameraAsync(options)
: await ImagePicker.launchImageLibraryAsync(options);

if (result.canceled || !result.assets[0]) return null;

const uri = result.assets[0].uri;
const mimeType = uri.toLowerCase().endsWith(’.png’) ? ‘image/png’ : ‘image/jpeg’;

try {
const manipResult = await ImageManipulator.manipulateAsync(
uri,
[{ resize: { width: 1500 } }],
{ compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
);
return { base64: manipResult.base64 || ‘’, mimeType: ‘image/jpeg’ };
} catch (error) {
console.error(‘Image compression failed:’, error);
return null;
}
}

// ============== BILL SCANNING ==============

export async function scanBill(useCamera: boolean = true): Promise<BillScanResult> {
const warnings: string[] = [];

try {
const image = await pickAndCompressImage(useCamera);
if (!image) {
return { success: false, warnings, error: ‘Fotoğraf seçilemedi veya izin verilmedi.’ };
}

```
console.log('Calling OCR API...');
const token = await AsyncStorage.getItem('session_token');

const response = await axios.post<OcrResult>(
  `${API_URL}/api/ocr/bill`,
  { imageBase64: image.base64, mimeType: image.mimeType },
  {
    headers: {
      'Content-Type': 'application/json',
      'x-app-secret': APP_SHARED_SECRET,
      'Authorization': `Bearer ${token}`,
    },
    timeout: 45000,
  }
);

const { rawText, parsed } = response.data;
console.log('OCR Response:', JSON.stringify(parsed, null, 2));

if (!rawText || rawText.length < 10) {
  return { success: false, warnings, error: 'Faturada metin bulunamadı. Daha net fotoğraf çekin.' };
}

let billerName: string | undefined;
let dueDate: string | undefined;
let amount: number | undefined;
let currency: string | undefined;

if (parsed.biller_name.value && parsed.biller_name.confidence >= LOW_CONFIDENCE) {
  billerName = parsed.biller_name.value;
  if (parsed.biller_name.confidence < HIGH_CONFIDENCE) {
    warnings.push(`Kurum adı kontrol edin: "${billerName}"`);
  }
}

if (parsed.due_date.value && parsed.due_date.confidence >= LOW_CONFIDENCE) {
  dueDate = parsed.due_date.value;
  if (parsed.due_date.confidence < HIGH_CONFIDENCE) {
    warnings.push('Son ödeme tarihini kontrol edin');
  }
}

if (parsed.amount_due.value && parsed.amount_due.confidence >= LOW_CONFIDENCE) {
  amount = parseFloat(parsed.amount_due.value);
  if (isNaN(amount)) amount = undefined;
  if (amount && parsed.amount_due.confidence < HIGH_CONFIDENCE) {
    warnings.push('Tutarı kontrol edin');
  }
}

if (parsed.currency.value) {
  currency = parsed.currency.value;
}

const hasData = billerName || dueDate || amount;

return {
  success: true,
  billerName,
  dueDate,
  amount,
  currency,
  rawText: rawText.substring(0, 500),
  warnings,
  error: hasData ? undefined : 'Bilgiler tam çıkarılamadı. Lütfen manuel doldurun.',
};
```

} catch (error: any) {
console.error(‘OCR error:’, error);

```
if (error.response?.status === 401) {
  return { success: false, warnings, error: 'Yetkilendirme hatası.' };
}

if (error.code === 'ECONNABORTED') {
  return { success: false, warnings, error: 'İşlem zaman aşımına uğradı.' };
}

return { success: false, warnings, error: 'Tarama başarısız. Tekrar deneyin.' };
```

}
}

export async function scanBillFromGallery(): Promise<BillScanResult> {
return scanBill(false);
}

// ============== RECEIPT SCANNING ==============

export async function scanReceipt(useCamera: boolean = true): Promise<ReceiptScanResult> {
const warnings: string[] = [];

try {
const image = await pickAndCompressImage(useCamera);
if (!image) {
return { success: false, warnings, error: ‘Fotoğraf seçilemedi veya izin verilmedi.’ };
}

```
console.log('Calling Receipt OCR API...');
const token = await AsyncStorage.getItem('session_token');

const response = await axios.post<OcrReceiptResult>(
  `${API_URL}/api/ocr/receipt`,
  { imageBase64: image.base64, mimeType: image.mimeType },
  {
    headers: {
      'Content-Type': 'application/json',
      'x-app-secret': APP_SHARED_SECRET,
      'Authorization': `Bearer ${token}`,
    },
    timeout: 45000,
  }
);

const { rawText, parsed } = response.data;
console.log('Receipt OCR Response:', JSON.stringify(parsed, null, 2));

if (!rawText || rawText.length < 10) {
  return { success: false, warnings, error: 'Fişte metin bulunamadı. Daha net fotoğraf çekin.' };
}

let storeName: string | undefined;
let receiptDate: string | undefined;
let amount: number | undefined;
let currency: string | undefined;
let category: string | undefined;
let items: Array<{ name: string; price: number; quantity?: number }> | undefined;

// Store name
if (parsed.store_name.value && parsed.store_name.confidence >= LOW_CONFIDENCE) {
  storeName = parsed.store_name.value;
  if (parsed.store_name.confidence < HIGH_CONFIDENCE) {
    warnings.push(`Mağaza adı kontrol edin: "${storeName}"`);
  }
}

// Receipt date
if (parsed.receipt_date.value && parsed.receipt_date.confidence >= LOW_CONFIDENCE) {
  receiptDate = parsed.receipt_date.value;
  if (parsed.receipt_date.confidence < HIGH_CONFIDENCE) {
    warnings.push('Tarihi kontrol edin');
  }
}

// Amount
if (parsed.total_amount.value && parsed.total_amount.confidence >= LOW_CONFIDENCE) {
  amount = parseFloat(parsed.total_amount.value);
  if (isNaN(amount)) amount = undefined;
  if (amount && parsed.total_amount.confidence < HIGH_CONFIDENCE) {
    warnings.push('Tutarı kontrol edin');
  }
}

// Currency
if (parsed.currency.value) {
  currency = parsed.currency.value;
}

// Items
if (parsed.items && parsed.items.length > 0) {
  items = parsed.items;
}

// Auto-detect category based on store name
if (storeName) {
  category = detectReceiptCategory(storeName);
}

const hasData = storeName || receiptDate || amount;

return {
  success: true,
  storeName,
  receiptDate,
  amount,
  currency,
  category,
  items,
  rawText: rawText.substring(0, 500),
  warnings,
  error: hasData ? undefined : 'Bilgiler tam çıkarılamadı. Lütfen manuel doldurun.',
};
```

} catch (error: any) {
console.error(‘Receipt OCR error:’, error);

```
if (error.response?.status === 401) {
  return { success: false, warnings, error: 'Yetkilendirme hatası.' };
}

if (error.code === 'ECONNABORTED') {
  return { success: false, warnings, error: 'İşlem zaman aşımına uğradı.' };
}

return { success: false, warnings, error: 'Tarama başarısız. Tekrar deneyin.' };
```

}
}

export async function scanReceiptFromGallery(): Promise<ReceiptScanResult> {
return scanReceipt(false);
}

// Helper function to detect category based on store name
function detectReceiptCategory(storeName: string): string {
const lower = storeName.toLowerCase();

// Market
const markets = [‘migros’, ‘carrefour’, ‘bim’, ‘a101’, ‘şok’, ‘sok’, ‘file’, ‘macro’, ‘metro’, ‘kipa’, ‘happy’];
if (markets.some(m => lower.includes(m))) return ‘market’;

// Restaurant
const restaurants = [‘restoran’, ‘restaurant’, ‘kebap’, ‘döner’, ‘lokanta’];
if (restaurants.some(r => lower.includes(r))) return ‘restaurant’;

// Cafe
const cafes = [‘starbucks’, ‘kahve’, ‘cafe’, ‘kafe’, ‘espresso’];
if (cafes.some(c => lower.includes(c))) return ‘cafe’;

// Fast food
const fastfood = [‘mcdonalds’, “mcdonald’s”, ‘burger king’, ‘dominos’, ‘pizza’, ‘popeyes’, ‘kfc’];
if (fastfood.some(f => lower.includes(f))) return ‘fastfood’;

// Clothing
const clothing = [‘lcw’, ‘lc waikiki’, ‘koton’, ‘defacto’, ‘mavi’, ‘colins’, ‘zara’, ‘h&m’];
if (clothing.some(c => lower.includes(c))) return ‘clothing’;

// Electronics
const electronics = [‘teknosa’, ‘mediamarkt’, ‘vatan’, ‘apple’, ‘samsung’];
if (electronics.some(e => lower.includes(e))) return ‘electronics’;

// Pharmacy
const pharmacy = [‘eczane’, ‘pharmacy’];
if (pharmacy.some(p => lower.includes(p))) return ‘pharmacy’;

// Fuel
const fuel = [‘shell’, ‘bp’, ‘opet’, ‘petrol’];
if (fuel.some(f => lower.includes(f))) return ‘fuel’;

return ‘other’;
}

export default { scanBill, scanBillFromGallery, scanReceipt, scanReceiptFromGallery };
