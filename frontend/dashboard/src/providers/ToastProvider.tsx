'use client';

import React from 'react';
import { Toaster } from 'react-hot-toast';

export function ToastProvider({ children }: { children: React.ReactNode }) {

  return (
    <>
      {children}
      <Toaster
        position="top-right"
        reverseOrder={false}
        gutter={8}
        containerClassName=""
        containerStyle={{}}
        toastOptions={{
          duration: 4000,
          className: 'dark:bg-gray-800 dark:text-white dark:border-gray-700',
          style: {
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: '500',
            padding: '12px 16px',
          },
          success: {
            iconTheme: {
              primary: '#22c55e',
              secondary: '#ffffff',
            },
            style: {
              border: '1px solid #22c55e',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#ffffff',
            },
            style: {
              border: '1px solid #ef4444',
            },
          },
          loading: {
            iconTheme: {
              primary: '#3b82f6',
              secondary: '#ffffff',
            },
          },
        }}
      />
    </>
  );
}