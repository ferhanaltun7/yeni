import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ocrAPI, BillScanResult } from './api';

export type { BillScanResult };

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
    console.log('Image manipulation failed:', error);
    return null;
  }
}

/**
 * Main function to scan a bill image and extract information
 * Uses backend API with OCR + AI parsing
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

    // Step 2: Send to backend for OCR + AI processing
    console.log('Sending image to backend for OCR...');
    const result = await ocrAPI.scanBill(base64Image);
    
    return result;

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
