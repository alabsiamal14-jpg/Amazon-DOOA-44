import React, { useState } from 'react';
import { 
  Sparkles, 
  Plus, 
  Layers, 
  Film, 
  PackageCheck, 
  History, 
  LogOut,
  LayoutDashboard,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';
import { Category, Product, StoreSettings, UserProfile } from '../types';
import { AdminProductForm } from './AdminProductForm';
import { INITIAL_CATEGORIES } from '../data/initialData';

interface StaffDashboardProps {
  currentUser: UserProfile;
  products: Product[];
  settings: StoreSettings;
  onLogout: () => void;
  onProductCreated: (product: Product) => void;
  onProductsCreated: (products: Product[]) => void;
}

export const StaffDashboard: React.FC<StaffDashboardProps> = ({
  currentUser,
  products,
  settings,
  onLogout,
  onProductCreated,
  onProductsCreated,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');

  // Filter products created by this staff member
  const staffProducts = products.filter(p => p.creator_id === currentUser.uid);
  const pendingDrafts = staffProducts.filter(p => p.status === 'draft');
  const publishedItems = staffProducts.filter(p => p.status === 'published');

  return (
    <div className="min-h-screen bg-stone-50 font-['Cairo',sans-serif]">
      {/* Top Header */}
      <header className="bg-gradient-to-r from-rose-700 to-rose-900 text-white shadow-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-inner">
              <Sparkles className="w-6 h-6 text-rose-200" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight">{settings.storeName}</h1>
              <p className="text-[10px] text-rose-100/80 font-bold -mt-0.5">بوابة الموظف - إدارة المنتجات</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-left">
              <p className="text-xs font-black">{currentUser.name}</p>
              <p className="text-[10px] text-rose-100/70">موظف (Staff)</p>
            </div>
            <button
              onClick={onLogout}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 transition-all text-white"
              title="تسجيل الخروج"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Statistics Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
              <Plus className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-stone-500 font-bold uppercase tracking-wider">إجمالي المرفوعات</p>
              <p className="text-xl font-black text-stone-900">{staffProducts.length}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-stone-500 font-bold uppercase tracking-wider">بانتظار المراجعة</p>
              <p className="text-xl font-black text-stone-900">{pendingDrafts.length}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-stone-500 font-bold uppercase tracking-wider">تم النشر</p>
              <p className="text-xl font-black text-stone-900">{publishedItems.length}</p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-stone-200/50 p-1.5 rounded-2xl mb-8 self-start w-fit">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${
              activeTab === 'upload' 
              ? 'bg-white text-rose-700 shadow-md' 
              : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>نظام الرفع الذكي</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${
              activeTab === 'history' 
              ? 'bg-white text-rose-700 shadow-md' 
              : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>تاريخ المرفوعات</span>
          </button>
        </div>

        {/* Content Area */}
        {activeTab === 'upload' ? (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-black text-blue-900">ملاحظة هامة للموظف</h4>
                <p className="text-xs text-blue-800/80 leading-relaxed mt-1 font-bold">
                  سيتم حفظ جميع المنتجات التي تقوم برفعها كـ "مسودة" (Draft). لن تظهر للجمهور إلا بعد مراجعتها واعتمادها من قِبل إدارة المتجر. يرجى التأكد من دقة البيانات وجودة الصور.
                </p>
              </div>
            </div>
            
            <AdminProductForm
              categories={INITIAL_CATEGORIES}
              onProductCreated={onProductCreated}
              onProductsCreated={onProductsCreated}
              settings={settings}
              currentUser={currentUser}
            />
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm">
            <h3 className="text-lg font-black text-stone-900 mb-6 flex items-center gap-2">
              <History className="w-5 h-5 text-rose-600" />
              <span>قائمة المنتجات التي قمت برفعها ({staffProducts.length})</span>
            </h3>

            {staffProducts.length === 0 ? (
              <div className="text-center py-16 text-stone-500 bg-stone-50 rounded-2xl border border-dashed border-stone-200">
                <LayoutDashboard className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-bold">لم تقم برفع أي منتجات بعد</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {staffProducts.map((p) => (
                  <div key={p.id} className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex gap-4">
                    <img 
                      src={p.image_url} 
                      alt={p.title_ar} 
                      className="w-20 h-24 rounded-xl object-cover bg-stone-200 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="text-xs font-black text-stone-900 truncate" title={p.title_ar}>
                          {p.title_ar}
                        </h4>
                        <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${
                          p.status === 'published' 
                          ? 'bg-emerald-100 text-emerald-700' 
                          : 'bg-amber-100 text-amber-700'
                        }`}>
                          {p.status === 'published' ? 'منشور' : 'بانتظار المراجعة'}
                        </span>
                      </div>
                      <p className="text-[10px] text-stone-500 line-clamp-2 mb-2 leading-relaxed font-bold">
                        {p.description_ar}
                      </p>
                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-xs font-black text-rose-600">
                          {p.discount_price ?? p.original_price} {settings.currency}
                        </span>
                        <span className="text-[10px] text-stone-400">
                          {new Date(p.created_at || Date.now()).toLocaleDateString('ar-SA')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
