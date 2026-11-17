import React from 'react';
import { X, ShoppingBag, MessageCircle } from 'lucide-react';
import { Product, StoreSettings } from '../types';
import { generateSingleProductWhatsAppUrl } from '../lib/whatsapp';
import { getProductPricing } from '../lib/pricing';

interface QuickViewModalProps {
  product: Product;
  onClose: () => void;
  onAddToCart: (product: Product) => void;
  settings: StoreSettings;
  isInCart: boolean;
}

export const QuickViewModal: React.FC<QuickViewModalProps> = ({
  product,
  onClose,
  onAddToCart,
  settings,
  isInCart,
}) => {
  const whatsappUrl = generateSingleProductWhatsAppUrl(product, settings);
  const pricing = getProductPricing(product);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col sm:flex-row overflow-hidden relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-white/80 hover:bg-white rounded-full text-stone-600 hover:text-stone-900 shadow-xs"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Image Area */}
        <div className="w-full sm:w-1/2 aspect-square sm:aspect-auto bg-stone-100 flex items-center justify-center">
          <img
            src={product.image_url || undefined}
            alt={product.title_ar}
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80';
            }}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Content Area */}
        <div className="p-6 sm:p-8 flex-1 flex flex-col">
          <span className="text-xs font-medium text-rose-600 bg-rose-50 px-2 py-1 rounded-md w-fit mb-2">
            {product.category_name}
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-stone-900 mb-2 leading-tight">
            {product.title_ar}
          </h2>
          <p className="text-stone-600 text-sm leading-relaxed mb-6 flex-1">
            {product.description_ar}
          </p>

          <div className="flex items-center gap-2 mb-6">
            <span className="text-2xl font-black text-rose-600">
              {pricing.finalPrice} {settings.currency}
            </span>
            {pricing.hasDiscount && (
              <span className="text-sm text-stone-400 line-through">
                {pricing.originalPrice} {settings.currency}
              </span>
            )}
            {pricing.hasDiscount && (
              <span className="bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs">
                خصم {pricing.discountPercent}%
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                onAddToCart(product);
                onClose();
              }}
              className="bg-stone-900 hover:bg-stone-800 text-white font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              {isInCart ? 'أضف المزيد' : 'أضف للسلة'}
            </button>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all"
            >
              <MessageCircle className="w-4 h-4" />
              واتساب
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickViewModal;
