import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BillScanResult {
  success: boolean;
  amount?: number;
  dueDate?: string;
  category?: string;
  title?: string;
  rawText?: string;
  error?: string;
}

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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
  if (!hasPermission) {
    console.log('Permissions not granted');
    return null;
  }

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

  if (result.canceled || !result.assets[0]) {
    console.log('Image picking cancelled');
    return null;
  }

  // Compress and resize image
  try {
    console.log('Compressing image...');
    const manipResult = await ImageManipulator.manipulateAsync(
      result.assets[0].uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    console.log('Image compressed, base64 length:', manipResult.base64?.length);
    return manipResult.base64 || null;
  } catch (error) {
    console.error('Image manipulation failed:', error);
    return null;
  }
}

/**
 * Main scan function - sends to backend for Google Vision OCR + AI parsing
 */
export async function scanBill(useCamera: boolean = true): Promise<BillScanResult> {
  try {
    // Step 1: Pick and compress image
    console.log('Starting bill scan...');
    const base64Image = await pickAndCompressImage(useCamera);
    
    if (!base64Image) {
      return {
        success: false,
        error: 'Fotoğraf seçilemedi veya izin verilmedi.',
      };
    }

    // Step 2: Send to backend for processing
    console.log('Sending to backend for OCR + AI processing...');
    const token = await AsyncStorage.getItem('session_token');
    
    const response = await axios.post(
      `${API_URL}/api/bills/scan`,
      { image_base64: base64Image },
      { 
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 second timeout for OCR + AI
      }
    );

    console.log('Backend response:', response.data);

    if (response.data.success) {
      return {
        success: true,
        title: response.data.title,
        amount: response.data.amount,
        dueDate: response.data.due_date,
        category: response.data.category,
        rawText: response.data.raw_text,
        error: response.data.error,
      };
    } else {
      return {
        success: false,
        rawText: response.data.raw_text,
        error: response.data.error || 'Tarama başarısız oldu.',
      };
    }

  } catch (error: any) {
    console.error('Scan error:', error);
    
    if (error.response) {
      console.error('Response error:', error.response.data);
      return {
        success: false,
        error: error.response.data?.detail || 'Sunucu hatası oluştu.',
      };
    }
    
    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        error: 'İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.',
      };
    }
    
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

export default { scanBill, scanBillFromGallery };
