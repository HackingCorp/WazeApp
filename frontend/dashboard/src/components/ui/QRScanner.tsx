'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Camera, 
  CameraOff, 
  QrCode, 
  Upload, 
  X, 
  RotateCcw,
  Zap,
  ZapOff,
  Monitor,
  Smartphone,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import clsx from 'clsx';

interface QRScannerProps {
  onScan?: (data: string) => void;
  onError?: (error: string) => void;
  width?: number | string;
  height?: number | string;
  className?: string;
  showToggle?: boolean;
  continuous?: boolean;
  facingMode?: 'user' | 'environment';
}

interface DetectedQR {
  data: string;
  timestamp: number;
  format?: string;
}

export function QRScanner({
  onScan,
  onError,
  width = 300,
  height = 300,
  className = '',
  showToggle = true,
  continuous = false,
  facingMode = 'environment',
}: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<DetectedQR | null>(null);
  const [currentFacingMode, setCurrentFacingMode] = useState(facingMode);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize QR code detection (simplified version - would use a library like qr-scanner)
  const detectQRCode = useCallback((canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
    const context = canvas.getContext('2d');
    if (!context || !video) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // This is a placeholder - in a real implementation, you'd use a QR detection library
    // like jsQR, qr-scanner, or zxing-js/library
    
    // For demo purposes, we'll simulate QR detection
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    // Placeholder detection logic
    // In reality, you'd call something like: jsQR(imageData.data, imageData.width, imageData.height)
    return null;
  }, []);

  const scanFrame = useCallback(() => {
    if (!isScanning || !videoRef.current || !canvasRef.current) return;

    const detected = detectQRCode(canvasRef.current, videoRef.current);
    
    if (detected) {
      const qrData: DetectedQR = {
        data: (detected as any).data || 'https://wizeapp.demo',
        timestamp: Date.now(),
        format: (detected as any).format || 'QR_CODE',
      };
      
      setLastScan(qrData);
      onScan?.(qrData.data);
      
      if (!continuous) {
        setIsScanning(false);
        stopStream();
      }
    }

    if (isScanning) {
      animationRef.current = requestAnimationFrame(scanFrame);
    }
  }, [isScanning, continuous, onScan, detectQRCode]);

  const startStream = useCallback(async () => {
    try {
      setError(null);
      
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: currentFacingMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      };

      // Add flash support for supported devices
      if (flashEnabled) {
        (constraints.video as any).torch = true;
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setHasPermission(true);
      setIsScanning(true);
      
      // Start scanning after video is ready
      setTimeout(() => {
        scanFrame();
      }, 500);

    } catch (err: any) {
      const errorMessage = err.name === 'NotAllowedError' 
        ? 'Camera permission denied'
        : err.name === 'NotFoundError'
        ? 'No camera found'
        : `Camera error: ${err.message}`;
        
      setError(errorMessage);
      setHasPermission(false);
      onError?.(errorMessage);
    }
  }, [currentFacingMode, flashEnabled, scanFrame, onError]);

  const stopStream = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScanning(false);
  }, []);

  const toggleCamera = useCallback(() => {
    setCurrentFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  }, []);

  const toggleFlash = useCallback(async () => {
    if (!streamRef.current) return;

    try {
      const track = streamRef.current.getVideoTracks()[0];
      const capabilities = track.getCapabilities();
      
      if ((capabilities as any).torch) {
        await track.applyConstraints({
          advanced: [{ torch: !flashEnabled } as any]
        });
        setFlashEnabled(!flashEnabled);
      }
    } catch (err) {
      console.warn('Flash not supported:', err);
    }
  }, [flashEnabled]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Detect QR code from uploaded image
        const detected = detectQRCode(canvas, img as any);
        if (detected) {
          const qrData: DetectedQR = {
            data: (detected as any).data || 'Scanned from image',
            timestamp: Date.now(),
            format: 'QR_CODE',
          };
          setLastScan(qrData);
          onScan?.(qrData.data);
        } else {
          setError('No QR code found in the image');
          onError?.('No QR code found in the image');
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [onScan, onError, detectQRCode]);

  // Get available cameras
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices()
      .then(devices => {
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);
      })
      .catch(console.error);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  const ScannerOverlay = () => (
    <div className="absolute inset-0 flex items-center justify-center">
      {/* Scanning frame */}
      <div className="relative w-48 h-48 border-2 border-white rounded-lg">
        {/* Corner indicators */}
        <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-primary-400"></div>
        <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-primary-400"></div>
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-primary-400"></div>
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-primary-400"></div>
        
        {/* Scanning line animation */}
        {isScanning && (
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary-400 to-transparent animate-pulse">
            <div className="w-full h-full animate-[scan_2s_linear_infinite]"></div>
          </div>
        )}
        
        {/* Success indicator */}
        {lastScan && !continuous && (
          <div className="absolute inset-0 bg-green-500 bg-opacity-20 flex items-center justify-center rounded-lg">
            <CheckCircle className="w-12 h-12 text-green-400" />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={`relative ${className}`}>
      <div 
        className="relative bg-black rounded-lg overflow-hidden"
        style={{ width, height }}
      >
        {/* Video stream */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
        />
        
        {/* Hidden canvas for QR detection */}
        <canvas
          ref={canvasRef}
          className="hidden"
        />
        
        {/* Scanner overlay */}
        {isScanning && <ScannerOverlay />}
        
        {/* Error state */}
        {error && (
          <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center">
            <div className="text-center text-white p-4">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
              <p className="text-sm">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  startStream();
                }}
                className="mt-3 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded text-sm transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        
        {/* Permission request */}
        {hasPermission === null && (
          <div className="absolute inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center">
            <div className="text-center text-white p-4">
              <Camera className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">Camera access required</p>
            </div>
          </div>
        )}
        
        {/* Controls overlay */}
        <div className="absolute top-2 right-2 flex flex-col space-y-2">
          {showToggle && (
            <>
              {/* Camera flip */}
              {devices.length > 1 && (
                <button
                  onClick={toggleCamera}
                  className="p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-75 transition-all"
                  title="Switch camera"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
              
              {/* Flash toggle */}
              <button
                onClick={toggleFlash}
                className={clsx(
                  'p-2 bg-black bg-opacity-50 text-white rounded-full hover:bg-opacity-75 transition-all',
                  flashEnabled && 'bg-yellow-500 bg-opacity-75'
                )}
                title={flashEnabled ? 'Turn off flash' : 'Turn on flash'}
              >
                {flashEnabled ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
              </button>
            </>
          )}
        </div>
        
        {/* Bottom controls */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-4">
          {/* Start/Stop scanning */}
          <button
            onClick={isScanning ? stopStream : startStream}
            className={clsx(
              'p-3 rounded-full shadow-lg transition-all',
              isScanning
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-primary-500 hover:bg-primary-600 text-white'
            )}
            title={isScanning ? 'Stop scanning' : 'Start scanning'}
          >
            {isScanning ? <CameraOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
          </button>
          
          {/* Upload from file */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-3 bg-gray-600 hover:bg-gray-700 text-white rounded-full shadow-lg transition-all"
            title="Upload image"
          >
            <Upload className="w-5 h-5" />
          </button>
        </div>
      </div>
      
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />
      
      {/* Last scan result */}
      {lastScan && (
        <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
          <div className="flex items-start">
            <QrCode className="w-5 h-5 text-green-600 dark:text-green-400 mt-0.5 mr-3 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                QR Code Detected
              </p>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1 break-all">
                {lastScan.data}
              </p>
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                {new Date(lastScan.timestamp).toLocaleTimeString()}
              </p>
            </div>
            <button
              onClick={() => setLastScan(null)}
              className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      {/* Add scanning animation keyframes to your global CSS */}
      <style jsx>{`
        @keyframes scan {
          0% { transform: translateY(0); }
          100% { transform: translateY(192px); }
        }
      `}</style>
    </div>
  );
}