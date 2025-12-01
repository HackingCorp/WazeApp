'use client';

import React, { useState } from 'react';
import { SubscriptionManager } from '@/components/billing/SubscriptionManager';
import { useAuth } from '@/providers/AuthProvider';
import toast from 'react-hot-toast';

export default function BillingPage() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const currentPlan = user?.organization?.plan?.toLowerCase() || 'free';
  const billingCycle = 'monthly'; // Default for now since it's not in the organization structure

  const handlePlanChange = async (planId: string) => {
    setIsLoading(true);
    
    try {
      // In a real app, this would call your API
      const response = await fetch('/api/billing/change-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ planId }),
      });

      if (response.ok) {
        toast.success('Plan updated successfully!');
        // Refresh user data or redirect
        window.location.reload();
      } else {
        throw new Error('Failed to update plan');
      }
    } catch (error) {
      console.error('Failed to change plan:', error);
      toast.error('Failed to update plan. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBillingCycleChange = async (cycle: 'monthly' | 'annual') => {
    setIsLoading(true);
    
    try {
      // In a real app, this would call your API
      const response = await fetch('/api/billing/change-cycle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cycle }),
      });

      if (response.ok) {
        toast.success('Billing cycle updated successfully!');
      } else {
        throw new Error('Failed to update billing cycle');
      }
    } catch (error) {
      console.error('Failed to change billing cycle:', error);
      toast.error('Failed to update billing cycle. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SubscriptionManager
        currentPlan={currentPlan}
        billingCycle={billingCycle}
        onPlanChange={handlePlanChange}
        onBillingCycleChange={handleBillingCycleChange}
        isLoading={isLoading}
      />
    </div>
  );
}