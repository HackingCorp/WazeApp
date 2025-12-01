'use client';

import React from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';

interface LogoProps {
  collapsed?: boolean;
  className?: string;
}

export function Logo({ collapsed = false, className = '' }: LogoProps) {
  return (
    <Link 
      href="/dashboard"
      className={`flex items-center transition-all duration-200 ${className}`}
    >
      <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-sm">
        <MessageCircle className="w-5 h-5 text-white" />
      </div>
      
      {!collapsed && (
        <div className="ml-3">
          <h1 className="text-xl font-bold bg-gradient-to-r from-green-600 to-green-700 dark:from-green-400 dark:to-green-500 bg-clip-text text-transparent">
            WizeApp
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
            AI Agents Platform
          </p>
        </div>
      )}
    </Link>
  );
}