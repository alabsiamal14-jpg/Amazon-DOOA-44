import React from 'react';
import { ShieldCheck, Truck, RotateCcw, Headphones } from 'lucide-react';

export const TrustBadgesBar: React.FC = () => {
  return (
    <div className="bg-gradient-to-r from-stone-100 via-rose-50/40 to-stone-100 border-y border-stone-200/80 py-8 my-8 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex items-center gap-3.5 p-4 bg-white rounded-2xl border border-stone-200/80 shadow-xs hover:shadow-md transition-all group">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-black text-xs sm:text-sm text-stone-900">منتجات أصلية 100%</h4>
            <p className="text-[11px] text-stone-500 mt-0.5">ضمان الجودة ومستوردة بمعايير عالمية</p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 p-4 bg-white rounded-2xl border border-stone-200/80 shadow-xs hover:shadow-md transition-all group">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-black text-xs sm:text-sm text-stone-900">شحن سريع ومبرد</h4>
            <p className="text-[11px] text-stone-500 mt-0.5">توصيل آمن لجميع المدن والمحافظات</p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 p-4 bg-white rounded-2xl border border-stone-200/80 shadow-xs hover:shadow-md transition-all group">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-black text-xs sm:text-sm text-stone-900">استبدال واسترجاع مرن</h4>
            <p className="text-[11px] text-stone-500 mt-0.5">ضمان استرداد الأموال خلال 7 أيام</p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 p-4 bg-white rounded-2xl border border-stone-200/80 shadow-xs hover:shadow-md transition-all group">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <Headphones className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-black text-xs sm:text-sm text-stone-900">خدمة عملاء VIP</h4>
            <p className="text-[11px] text-stone-500 mt-0.5">دعم فوري ومباشر عبر واتساب</p>
          </div>
        </div>
      </div>
    </div>
  );
};
