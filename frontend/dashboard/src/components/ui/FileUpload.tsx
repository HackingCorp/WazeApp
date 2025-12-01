'use client';

import React, { useState, useCallback, useRef } from 'react';
import { 
  Upload, 
  File, 
  Image as ImageIcon, 
  FileText, 
  Video,
  Music,
  Archive,
  X,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { apiHelpers } from '@/lib/api';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  thumbnail?: string;
  status: 'uploading' | 'completed' | 'error';
  progress: number;
  error?: string;
}

interface FileUploadProps {
  onUpload?: (files: UploadedFile[]) => void;
  onRemove?: (fileId: string) => void;
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  maxFiles?: number;
  showPreview?: boolean;
  className?: string;
  disabled?: boolean;
}

const ACCEPTED_FILE_TYPES = {
  'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
  'video/*': ['.mp4', '.avi', '.mov', '.webm'],
  'audio/*': ['.mp3', '.wav', '.ogg'],
  'application/pdf': ['.pdf'],
  'text/*': ['.txt', '.md', '.csv'],
  'application/json': ['.json'],
  'application/zip': ['.zip', '.rar', '.7z'],
};

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_FILES = 5;

export function FileUpload({
  onUpload,
  onRemove,
  accept = 'image/*,video/*,audio/*,application/pdf,text/*',
  multiple = true,
  maxSize = DEFAULT_MAX_SIZE,
  maxFiles = DEFAULT_MAX_FILES,
  showPreview = true,
  className = '',
  disabled = false,
}: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const abortControllers = useRef<Map<string, AbortController>>(new Map());

  const generateFileId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string, name: string) => {
    if (type.startsWith('image/')) return ImageIcon;
    if (type.startsWith('video/')) return Video;
    if (type.startsWith('audio/')) return Music;
    if (type === 'application/pdf' || name.endsWith('.pdf')) return FileText;
    if (type.includes('zip') || type.includes('rar') || name.match(/\.(zip|rar|7z)$/)) return Archive;
    return File;
  };

  const uploadFile = async (file: File): Promise<UploadedFile> => {
    const fileId = generateFileId();
    const abortController = new AbortController();
    abortControllers.current.set(fileId, abortController);

    const uploadedFile: UploadedFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'uploading',
      progress: 0,
    };

    setUploadedFiles(prev => [...prev, uploadedFile]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadedFiles(prev =>
          prev.map(f =>
            f.id === fileId && f.progress < 90
              ? { ...f, progress: f.progress + 10 }
              : f
          )
        );
      }, 200);

      const response = await apiHelpers.media.upload(formData);

      clearInterval(progressInterval);
      abortControllers.current.delete(fileId);

      const completedFile: UploadedFile = {
        ...uploadedFile,
        status: 'completed',
        progress: 100,
        url: response.data.url,
        thumbnail: response.data.thumbnail,
      };

      setUploadedFiles(prev =>
        prev.map(f => (f.id === fileId ? completedFile : f))
      );

      return completedFile;
    } catch (error: any) {
      abortControllers.current.delete(fileId);
      
      const errorFile: UploadedFile = {
        ...uploadedFile,
        status: 'error',
        progress: 0,
        error: error.message || 'Upload failed',
      };

      setUploadedFiles(prev =>
        prev.map(f => (f.id === fileId ? errorFile : f))
      );

      throw error;
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[], rejectedFiles: any[]) => {
    if (disabled) return;

    // Handle rejected files
    rejectedFiles.forEach(({ file, errors }) => {
      errors.forEach((error: any) => {
        if (error.code === 'file-too-large') {
          toast.error(`${file.name} is too large. Maximum size is ${formatFileSize(maxSize)}`);
        } else if (error.code === 'file-invalid-type') {
          toast.error(`${file.name} is not a supported file type`);
        } else {
          toast.error(`${file.name}: ${error.message}`);
        }
      });
    });

    // Check max files limit
    if (uploadedFiles.length + acceptedFiles.length > maxFiles) {
      toast.error(`You can only upload up to ${maxFiles} files`);
      acceptedFiles = acceptedFiles.slice(0, maxFiles - uploadedFiles.length);
    }

    // Upload accepted files
    const uploadPromises = acceptedFiles.map(uploadFile);

    try {
      const results = await Promise.allSettled(uploadPromises);
      const successfulUploads = results
        .filter((result): result is PromiseFulfilledResult<UploadedFile> => 
          result.status === 'fulfilled'
        )
        .map(result => result.value);

      if (onUpload && successfulUploads.length > 0) {
        onUpload(successfulUploads);
      }

      const failedCount = results.filter(result => result.status === 'rejected').length;
      if (failedCount > 0) {
        toast.error(`${failedCount} file(s) failed to upload`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Some files failed to upload');
    }
  }, [uploadedFiles.length, maxFiles, maxSize, onUpload, disabled]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: accept.split(',').reduce((acc, type) => {
      acc[type.trim() as keyof typeof ACCEPTED_FILE_TYPES] = ACCEPTED_FILE_TYPES[type.trim() as keyof typeof ACCEPTED_FILE_TYPES] || [];
      return acc;
    }, {} as Record<string, string[]>),
    maxSize,
    multiple,
    disabled,
  });

  const removeFile = (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (file?.status === 'uploading') {
      const controller = abortControllers.current.get(fileId);
      controller?.abort();
      abortControllers.current.delete(fileId);
    }

    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
    onRemove?.(fileId);
  };

  const retryUpload = async (fileId: string) => {
    const file = uploadedFiles.find(f => f.id === fileId);
    if (!file || file.status !== 'error') return;

    // Create a new File object (this is a simplified approach)
    // In a real implementation, you'd need to store the original File object
    toast('Retry functionality would re-upload the file', { icon: 'ℹ️' });
  };

  const FilePreview = ({ file }: { file: UploadedFile }) => {
    const Icon = getFileIcon(file.type, file.name);
    
    return (
      <div className="relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          {/* File icon or thumbnail */}
          <div className="flex-shrink-0">
            {file.thumbnail ? (
              <img
                src={file.thumbnail}
                alt={file.name}
                className="w-10 h-10 rounded-md object-cover"
              />
            ) : (
              <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-md flex items-center justify-center">
                <Icon className="w-5 h-5 text-gray-400" />
              </div>
            )}
          </div>

          {/* File info */}
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {file.name}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatFileSize(file.size)}
            </p>

            {/* Progress bar */}
            {file.status === 'uploading' && (
              <div className="mt-2">
                <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div
                    className="bg-primary-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${file.progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {file.progress}% uploaded
                </p>
              </div>
            )}

            {/* Error message */}
            {file.status === 'error' && file.error && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                {file.error}
              </p>
            )}
          </div>

          {/* Status icon and actions */}
          <div className="flex items-center space-x-2">
            {file.status === 'uploading' && (
              <Loader2 className="w-4 h-4 text-primary-600 animate-spin" />
            )}
            {file.status === 'completed' && (
              <Check className="w-4 h-4 text-green-600" />
            )}
            {file.status === 'error' && (
              <button
                onClick={() => retryUpload(file.id)}
                className="text-red-600 hover:text-red-700 p-1 rounded"
                title="Retry upload"
              >
                <AlertCircle className="w-4 h-4" />
              </button>
            )}
            
            {/* Remove button */}
            <button
              onClick={() => removeFile(file.id)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded"
              title="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={clsx(
          'relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer',
          isDragActive
            ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <input {...getInputProps()} />
        
        <div className="space-y-4">
          <div className="mx-auto w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
            <Upload className={clsx(
              'w-6 h-6',
              isDragActive ? 'text-primary-600' : 'text-gray-400'
            )} />
          </div>
          
          <div>
            {isDragActive ? (
              <p className="text-primary-600 font-medium">Drop files here...</p>
            ) : (
              <>
                <p className="text-gray-900 dark:text-white font-medium">
                  Drop files here, or <span className="text-primary-600">browse</span>
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Supports: Images, videos, documents, archives
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Max {formatFileSize(maxSize)} per file, up to {maxFiles} files
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* File previews */}
      {showPreview && uploadedFiles.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">
            Uploaded Files ({uploadedFiles.length})
          </h4>
          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <FilePreview key={file.id} file={file} />
            ))}
          </div>
        </div>
      )}

      {/* Upload summary */}
      {uploadedFiles.length > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>
            {uploadedFiles.filter(f => f.status === 'completed').length} of{' '}
            {uploadedFiles.length} files uploaded
          </span>
          <button
            onClick={() => {
              // Clear all completed files
              const completedFiles = uploadedFiles.filter(f => f.status === 'completed');
              completedFiles.forEach(f => removeFile(f.id));
            }}
            className="text-primary-600 hover:text-primary-700 dark:text-primary-400"
          >
            Clear completed
          </button>
        </div>
      )}
    </div>
  );
}