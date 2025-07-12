import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Linking } from 'react-native';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import RNFS from 'react-native-fs';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const ScanLicensePlateScreen = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const camera = useRef(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const [isProcessing, setIsProcessing] = useState(false);
  const [boundingBox, setBoundingBox] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission().then((granted) => {
        if (!granted) {
          Alert.alert(
            'Camera Permission Required',
            'Please enable camera access in settings to use this feature.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
        }
      });
    }
  }, [hasPermission]);

  useEffect(() => {
    if (isFocused && camera.current) {
      intervalRef.current = setInterval(() => {
        if (!isProcessing) {
          detectLicensePlate();
        }
      }, 2000);
    }

    return () => clearInterval(intervalRef.current);
  }, [isFocused]);


  const detectLicensePlate = async () => {
    if (!camera.current || isProcessing) return;

    setIsProcessing(true);
    try {
      const photo = await camera.current.takePhoto();
      const base64Image = await RNFS.readFile(photo.path, 'base64');

      const response = await fetch('http://192.168.1.5:5000/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image }),
      });

      const data = await response.json();

      if (data.success && data.boxes.length > 0) {
        const [x1, y1, x2, y2] = data.boxes[0];
        setBoundingBox({ x1, y1, x2, y2, width: photo.width, height: photo.height });
      } else {
        setBoundingBox(null);
      }
    } catch (err) {
      console.log("Detection error:", err);
    } finally {
      setIsProcessing(false);
    }
  };
 
  const capturePhoto = async () => {
    if (camera.current && !isProcessing) {
      setIsProcessing(true);
      try {
        const photo = await camera.current.takePhoto();
        const imagePath = `file://${photo.path}`;
        const result = await TextRecognition.recognize(imagePath);
        const recognizedText = result.text.trim();

        console.log('Full recognized text:', recognizedText);

        const licensePlateText = extractLicensePlate(recognizedText);

        console.log('Extracted License Plate:', licensePlateText);
        if (licensePlateText) {
          navigation.navigate('AddCar', { licensePlate: licensePlateText });
        } else {
          Alert.alert('No License Plate Found', 'Could not detect a valid license plate number. Please try again.');
        }
      } catch (error) {
        console.error('Error capturing or processing photo:', error);
        Alert.alert('Error', 'Failed to process the image. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  // Function to extract license plate from recognized text
  const extractLicensePlate = (text) => {
    console.log('Processing text for license plate extraction:', text);

    // First, look for patterns with dashes as they're more reliable
    const dashPatterns = [
      /[A-Z]{2,3}-\d{2,4}-[A-Z]{1,3}/g,
      /[A-Z]{1,3}-\d{2,4}-[A-Z]{1,3}/g,
      /\d{2,4}-[A-Z]{2,3}-\d{1,3}/g,
      /[A-Z]{2,3}-\d{2,4}/g,
      /\d{2,4}-[A-Z]{2,3}/g,
    ];

    // Check for dash patterns first (most reliable)
    for (const pattern of dashPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        const validMatches = matches.filter(match => {
          const cleanMatch = match.replace(/\s+/g, '').toUpperCase();
          return cleanMatch.length >= 5 &&
            cleanMatch.length <= 10 &&
            /[A-Z]/.test(cleanMatch) &&
            /\d/.test(cleanMatch);
        });

        if (validMatches.length > 0) {
          return validMatches[0].replace(/\s+/g, '').toUpperCase();
        }
      }
    }

    // Check each line individually for license plate patterns
    const lines = text.split('\n');
    const excludeWords = [
      'FORMAT', 'AMERICA', 'AMERICAN', 'MICHIGAN', 'FLORIDA', 'TEXAS',
      'CALIFORNIA', 'NEWYORK', 'GREATLAKES', 'STATE', 'COLORED', 'BORDER',
      'CUSTOM', 'ENGINE', 'BACKGROUND', 'DESIGN', 'PLATE', 'LICENSE',
      'GREAT', 'LAKES', 'ALL', 'CALDORIA', 'JUL', 'HP'
    ];

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and excluded words
      if (!trimmedLine || excludeWords.some(word =>
        trimmedLine.toUpperCase().includes(word) || word.includes(trimmedLine.toUpperCase())
      )) {
        continue;
      }

      // Check if line looks like a license plate (5-8 chars, has both letters and numbers)
      const cleanLine = trimmedLine.replace(/\s+/g, '').toUpperCase();
      if (cleanLine.length >= 5 &&
        cleanLine.length <= 8 &&
        /[A-Z]/.test(cleanLine) &&
        /\d/.test(cleanLine) &&
        !/^\d{4}$/.test(cleanLine)) { // Exclude pure years like "2006"

        console.log('Found potential license plate:', cleanLine);
        return cleanLine;
      }
    }

    // If no individual lines work, try patterns on cleaned text
    const cleanText = text.replace(/\s+/g, '').toUpperCase();

    // Common license plate patterns
    const patterns = [
      /\d[A-Z]{2,3}\d{2,3}/g,    // Like 5NOF222
      /[A-Z]{2,3}\d{2,4}[A-Z]{1,3}/g,
      /[A-Z]{1,3}\d{2,4}[A-Z]{1,3}/g,
      /\d{2,4}[A-Z]{2,3}\d{1,3}/g,
      /[A-Z]{2,3}\d{2,4}/g,
      /\d{2,4}[A-Z]{2,3}/g,
      /[A-Z]{3}\d{3}/g,
      /\d{3}[A-Z]{3}/g,
    ];

    // Try each pattern
    for (const pattern of patterns) {
      const matches = cleanText.match(pattern);
      if (matches) {
        const validMatches = matches.filter(match => {
          // Check if match is not part of excluded words
          const isExcluded = excludeWords.some(word =>
            word.includes(match) || match.includes(word)
          );

          return !isExcluded &&
            match.length >= 5 &&
            match.length <= 8 &&
            /[A-Z]/.test(match) &&
            /\d/.test(match);
        });

        if (validMatches.length > 0) {
          console.log('Found license plate via pattern:', validMatches[0]);
          return validMatches[0];
        }
      }
    }

    return null;
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          No camera device available. Please ensure your device has a back camera or try again.
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.retryText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isFocused}
        photo={true}
        onInitialized={() => console.log('Camera initialized')}
        onError={(error) => {
          console.error('Camera error:', error);
          Alert.alert('Camera Error', error.message);
        }}
      />

      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => navigation.goBack()}
      >
        <Text style={styles.closeText}>✕</Text>
      </TouchableOpacity>

      <View style={styles.bottomContainer}>
        <View style={styles.textWrapper}>
          <Text style={styles.bottomTitle}>Scan License Plate</Text>
          <Text style={styles.bottomSubtitle}>Position License Plate in frame</Text>
        </View>

        <TouchableOpacity
          style={[styles.captureButton, isProcessing && styles.disabledButton]}
          onPress={capturePhoto}
          disabled={isProcessing}
        >
          <Text style={styles.captureText}>
            {isProcessing ? 'Processing...' : 'Capture'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.manualEntry}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.manualText}>Enter License Plate Manually</Text>
        </TouchableOpacity>
      </View>
      {boundingBox && (
        <View
          style={[
            styles.boundingBox,
            {
              left: (boundingBox.x1 / boundingBox.width) * Dimensions.get('window').width,
              top: (boundingBox.y1 / boundingBox.height) * Dimensions.get('window').height,
              width: ((boundingBox.x2 - boundingBox.x1) / boundingBox.width) * Dimensions.get('window').width,
              height: ((boundingBox.y2 - boundingBox.y1) / boundingBox.height) * Dimensions.get('window').height,
            },
          ]}
        />
      )}

    </View>
  );
};

const styles = StyleSheet.create({
  boundingBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'red',
    zIndex: 9999,
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  retryButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#3b82f6',
    borderRadius: 5,
  },
  retryText: {
    color: '#fff',
    fontSize: 16,
  },
  closeButton: {
    position: 'absolute',
    top: 80,
    left: 20,
    zIndex: 10,
  },
  closeText: {
    fontSize: 28,
    color: '#fff',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: SCREEN_HEIGHT * 0.4,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 30,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  textWrapper: {
    alignItems: 'center',
    marginBottom: 20,
  },
  bottomTitle: {
    color: '#fff',
    fontSize: 40, // Increased size
    fontWeight: 'bold',
    marginBottom: 6,
  },
  bottomSubtitle: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  captureButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 8,
    marginBottom: 20,
  },
  disabledButton: {
    backgroundColor: '#666',
  },
  captureText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  manualEntry: {
    position: 'absolute',
    bottom: 25,
  },
  manualText: {
    color: '#3b82f6',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
});

export default ScanLicensePlateScreen;
