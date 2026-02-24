'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Image as ImageIcon,
  Package,
  DollarSign,
  Box,
  Tag,
  Star,
} from 'lucide-react';
import clsx from 'clsx';
import { useI18n } from '@/providers/I18nProvider';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface ProductImage {
  url: string;
  altText?: string;
  isPrimary: boolean;
}

interface ProductVariant {
  name: string;
  options: string;
  price?: number;
  sku?: string;
  stockQuantity?: number;
}

interface ProductFormData {
  name: string;
  description: string;
  shortDescription: string;
  price: number;
  compareAtPrice: number;
  currency: string;
  sku: string;
  stockQuantity: number;
  inStock: boolean;
  status: 'active' | 'draft' | 'archived';
  tags: string[];
  categoryIds: string[];
  images: ProductImage[];
  variants: ProductVariant[];
}

interface Category {
  id: string;
  name: string;
}

export default function NewProductPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('basic');
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [tagInput, setTagInput] = useState('');

  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    description: '',
    shortDescription: '',
    price: 0,
    compareAtPrice: 0,
    currency: 'XAF',
    sku: '',
    stockQuantity: 0,
    inStock: true,
    status: 'draft',
    tags: [],
    categoryIds: [],
    images: [],
    variants: [],
  });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await api.getProductCategories({ limit: 100 });
        if (response.success && response.data) {
          const data = response.data.data || response.data;
          setCategories(Array.isArray(data) ? data : data.items || []);
        }
      } catch {
        // Categories are optional
      }
    };
    fetchCategories();
  }, []);

  const updateFormData = (updates: Partial<ProductFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  };

  const handleAddImage = () => {
    if (!newImageUrl.trim()) return;
    const isPrimary = formData.images.length === 0;
    updateFormData({
      images: [...formData.images, { url: newImageUrl.trim(), isPrimary }],
    });
    setNewImageUrl('');
  };

  const handleRemoveImage = (index: number) => {
    const newImages = formData.images.filter((_, i) => i !== index);
    if (newImages.length > 0 && !newImages.some(img => img.isPrimary)) {
      newImages[0].isPrimary = true;
    }
    updateFormData({ images: newImages });
  };

  const handleSetPrimary = (index: number) => {
    const newImages = formData.images.map((img, i) => ({
      ...img,
      isPrimary: i === index,
    }));
    updateFormData({ images: newImages });
  };

  const handleAddVariant = () => {
    updateFormData({
      variants: [...formData.variants, { name: '', options: '', price: undefined, sku: '', stockQuantity: undefined }],
    });
  };

  const handleRemoveVariant = (index: number) => {
    updateFormData({
      variants: formData.variants.filter((_, i) => i !== index),
    });
  };

  const handleUpdateVariant = (index: number, updates: Partial<ProductVariant>) => {
    const newVariants = [...formData.variants];
    newVariants[index] = { ...newVariants[index], ...updates };
    updateFormData({ variants: newVariants });
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags.includes(tag)) {
      updateFormData({ tags: [...formData.tags, tag] });
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag: string) => {
    updateFormData({ tags: formData.tags.filter(t => t !== tag) });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error('Product name is required');
      return;
    }

    setSaving(true);
    try {
      const response = await api.createProduct(formData);
      if (response.success) {
        toast.success(t('products.productCreated'));
        router.push('/products');
      } else {
        toast.error(response.error || 'Error creating product');
      }
    } catch {
      toast.error('Error creating product');
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'basic', name: t('products.basicInfo'), icon: Package },
    { id: 'pricing', name: t('products.pricing'), icon: DollarSign },
    { id: 'inventory', name: t('products.inventory'), icon: Box },
    { id: 'images', name: t('products.images'), icon: ImageIcon },
    { id: 'variants', name: t('products.variants'), icon: Tag },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-6 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/products')}
              className="p-2 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {t('products.create')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('products.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => router.push('/products')}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {t('products.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? t('products.saving') : t('products.save')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Tab Navigation */}
          <div className="lg:col-span-1">
            <nav className="space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={clsx(
                      'w-full flex items-center px-4 py-3 text-left rounded-lg transition-colors',
                      activeTab === tab.id
                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                    )}
                  >
                    <Icon className="w-5 h-5 mr-3" />
                    <span className="font-medium">{tab.name}</span>
                  </button>
                );
              })}
            </nav>

            {/* Status select */}
            <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('products.status')}
              </label>
              <select
                value={formData.status}
                onChange={(e) => updateFormData({ status: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                <option value="draft">{t('products.draft')}</option>
                <option value="active">{t('products.active')}</option>
                <option value="archived">{t('products.archived')}</option>
              </select>
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              {/* Basic Info Tab */}
              {activeTab === 'basic' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('products.name')} *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => updateFormData({ name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('products.shortDescription')}
                    </label>
                    <input
                      type="text"
                      value={formData.shortDescription}
                      onChange={(e) => updateFormData({ shortDescription: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('products.description')}
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => updateFormData({ description: e.target.value })}
                      rows={5}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('products.tags')}
                    </label>
                    <div className="flex items-center space-x-2 mb-2">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        placeholder="Add a tag..."
                      />
                      <button
                        onClick={handleAddTag}
                        className="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    {formData.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {formData.tags.map(tag => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                          >
                            {tag}
                            <button onClick={() => handleRemoveTag(tag)} className="ml-1 hover:text-green-600">
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Categories */}
                  {categories.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('products.categories')}
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800">
                        {categories.map(cat => (
                          <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData.categoryIds.includes(cat.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  updateFormData({ categoryIds: [...formData.categoryIds, cat.id] });
                                } else {
                                  updateFormData({ categoryIds: formData.categoryIds.filter(id => id !== cat.id) });
                                }
                              }}
                              className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{cat.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Pricing Tab */}
              {activeTab === 'pricing' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('products.price')} *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => updateFormData({ price: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('products.compareAtPrice')}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.compareAtPrice}
                        onChange={(e) => updateFormData({ compareAtPrice: parseFloat(e.target.value) || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('products.currency')}
                    </label>
                    <select
                      value={formData.currency}
                      onChange={(e) => updateFormData({ currency: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="XAF">XAF (CFA Franc)</option>
                      <option value="USD">USD (US Dollar)</option>
                      <option value="EUR">EUR (Euro)</option>
                      <option value="GBP">GBP (British Pound)</option>
                      <option value="NGN">NGN (Nigerian Naira)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Inventory Tab */}
              {activeTab === 'inventory' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('products.sku')}
                    </label>
                    <input
                      type="text"
                      value={formData.sku}
                      onChange={(e) => updateFormData({ sku: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('products.stockQuantity')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.stockQuantity}
                      onChange={(e) => updateFormData({ stockQuantity: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                  <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                    <div>
                      <label className="text-sm font-medium text-gray-900 dark:text-white">
                        {t('products.inStock')}
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Track stock availability for this product
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.inStock}
                        onChange={(e) => updateFormData({ inStock: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
                    </label>
                  </div>
                </div>
              )}

              {/* Images Tab */}
              {activeTab === 'images' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t('products.addImage')}
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={newImageUrl}
                        onChange={(e) => setNewImageUrl(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddImage())}
                        placeholder={t('products.imageUrl')}
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                      <button
                        onClick={handleAddImage}
                        className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        {t('products.addImage')}
                      </button>
                    </div>
                  </div>

                  {formData.images.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {formData.images.map((img, index) => (
                        <div
                          key={index}
                          className={clsx(
                            'relative border-2 rounded-lg overflow-hidden',
                            img.isPrimary ? 'border-green-500' : 'border-gray-200 dark:border-gray-700'
                          )}
                        >
                          <img
                            src={img.url}
                            alt={`Product ${index + 1}`}
                            className="w-full h-40 object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" fill="%23ccc"><rect width="100" height="100"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" font-size="12" fill="%23999">No Image</text></svg>';
                            }}
                          />
                          <div className="absolute top-2 right-2 flex space-x-1">
                            {!img.isPrimary && (
                              <button
                                onClick={() => handleSetPrimary(index)}
                                className="p-1 bg-white dark:bg-gray-800 rounded shadow hover:bg-gray-100 dark:hover:bg-gray-700"
                                title={t('products.primaryImage')}
                              >
                                <Star className="w-4 h-4 text-yellow-500" />
                              </button>
                            )}
                            <button
                              onClick={() => handleRemoveImage(index)}
                              className="p-1 bg-white dark:bg-gray-800 rounded shadow hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                          {img.isPrimary && (
                            <div className="absolute bottom-0 left-0 right-0 bg-green-600 text-white text-xs text-center py-1">
                              {t('products.primaryImage')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {formData.images.length === 0 && (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No images added yet. Add image URLs above.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Variants Tab */}
              {activeTab === 'variants' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      {t('products.variants')}
                    </h3>
                    <button
                      onClick={handleAddVariant}
                      className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      {t('products.addVariant')}
                    </button>
                  </div>

                  {formData.variants.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <Tag className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        No variants added yet.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {formData.variants.map((variant, index) => (
                        <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Variant {index + 1}
                            </h4>
                            <button
                              onClick={() => handleRemoveVariant(index)}
                              className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                {t('products.variantName')}
                              </label>
                              <input
                                type="text"
                                value={variant.name}
                                onChange={(e) => handleUpdateVariant(index, { name: e.target.value })}
                                placeholder="e.g. Small, Red"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                {t('products.variantOptions')}
                              </label>
                              <input
                                type="text"
                                value={variant.options}
                                onChange={(e) => handleUpdateVariant(index, { options: e.target.value })}
                                placeholder="e.g. Size, Color"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                {t('products.price')}
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={variant.price || ''}
                                onChange={(e) => handleUpdateVariant(index, { price: parseFloat(e.target.value) || undefined })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                {t('products.sku')}
                              </label>
                              <input
                                type="text"
                                value={variant.sku || ''}
                                onChange={(e) => handleUpdateVariant(index, { sku: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
