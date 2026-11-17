import React, { useState } from 'react';
import { Settings, Save, Check, Phone, DollarSign, Truck, RotateCcw } from 'lucide-react';
import { StoreSettings } from '../types';

interface AdminSettingsProps {
  settings: StoreSettings;
  onSaveSettings: (settings: StoreSettings) => void;
  onResetData: () => void;
  onUpdateUserRole?: (email: string, role: 'staff' | 'user') => Promise<void>;
}

export const AdminSettings: React.FC<AdminSettingsProps> = ({
  settings,
  onSaveSettings,
  onResetData,
  onUpdateUserRole,
}) => {
  const [formData, setFormData] = useState<StoreSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [staffEmail, setStaffEmail] = useState('');
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="bg-white rounded-3xl p-6 sm:p-8 border border-stone-200 shadow-sm mt-8">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-stone-100">
        <div>
          <h3 className="text-lg sm:text-xl font-black text-stone-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-rose-600" />
            <span>إعدادات المتجر ونظام الواتساب</span>
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            ضبط رقم استقبال الطلبات على واتساب، رسوم التوصيل، واسم المتجر
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs sm:text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Store Name */}
          <div>
            <label className="block font-bold text-stone-700 mb-1.5">اسم المتجر</label>
            <input
              type="text"
              required
              value={formData.storeName}
              onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
            />
          </div>

          {/* Tagline */}
          <div>
            <label className="block font-bold text-stone-700 mb-1.5">الشعار التسويقي (Tagline)</label>
            <input
              type="text"
              value={formData.tagline}
              onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
            />
          </div>

          {/* WhatsApp Phone */}
          <div>
            <label className="block font-bold text-stone-700 mb-1.5 flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-emerald-600" />
              رقم الواتساب لاستقبال الطلبات (مع الكود الدولي بدون + أو أصفار)
            </label>
            <input
              type="text"
              required
              value={formData.whatsappNumber}
              onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
              placeholder="مثال: 966501234567 أو 967780187409"
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden font-mono"
            />
            <span className="text-[11px] text-stone-400 mt-1 block">
              سيتم توجيه العملاء إلى wa.me/{formData.whatsappNumber.replace(/\D/g, '')}
            </span>
          </div>

          {/* Currency */}
          <div>
            <label className="block font-bold text-stone-700 mb-1.5 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-rose-600" />
              رمز العملة
            </label>
            <input
              type="text"
              required
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              placeholder="ريال"
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
            />
          </div>

          {/* Delivery Fee */}
          <div>
            <label className="block font-bold text-stone-700 mb-1.5 flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-stone-600" />
              رسوم التوصيل العادية ({formData.currency})
            </label>
            <input
              type="number"
              min="0"
              required
              value={formData.deliveryFee}
              onChange={(e) => setFormData({ ...formData, deliveryFee: Number(e.target.value) })}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
            />
          </div>

          {/* Free Delivery Threshold */}
          <div>
            <label className="block font-bold text-stone-700 mb-1.5">
              الحد الأدنى للشحن المجاني ({formData.currency})
            </label>
            <input
              type="number"
              min="0"
              required
              value={formData.freeDeliveryThreshold}
              onChange={(e) => setFormData({ ...formData, freeDeliveryThreshold: Number(e.target.value) })}
              className="w-full p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-stone-100">
          <button
            type="submit"
            className="bg-stone-900 hover:bg-stone-800 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-md flex items-center gap-2"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>تم حفظ التغييرات بنجاح</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>حفظ إعدادات المتجر</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.confirm('هل تريد استعادة البيانات الافتراضية للمتجر والمنتجات؟')) {
                onResetData();
              }
            }}
            className="text-stone-400 hover:text-rose-600 text-xs font-semibold flex items-center gap-1.5 transition-colors p-2"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة المنتجات والإعدادات الافتراضية</span>
          </button>
        </div>
      </form>

      {/* Staff Management Section */}
      <div className="mt-12 pt-8 border-t border-stone-100">
        <div className="flex items-center gap-2 mb-4">
          <Truck className="w-5 h-5 text-indigo-600" />
          <h3 className="text-lg font-black text-stone-900">إدارة صلاحيات الموظفين (عن بُعد)</h3>
        </div>
        <p className="text-xs text-stone-500 mb-6">
          يمكنك تعيين موظفين لمساعدتك في رفع المنتجات. سيتمكن الموظف من رفع الصور والبيانات كـ "مسودة" فقط، ولن يتمكن من رؤية الطلبات أو الإحصائيات.
        </p>

        <div className="bg-indigo-50/50 border border-indigo-100 p-6 rounded-2xl">
          <label className="block text-xs font-black text-indigo-900 mb-2">إضافة موظف جديد (بالبريد الإلكتروني)</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={staffEmail}
              onChange={(e) => setStaffEmail(e.target.value)}
              placeholder="example@gmail.com"
              className="flex-1 p-3 bg-white border border-stone-200 rounded-2xl focus:border-indigo-500 focus:outline-hidden text-sm"
            />
            <button
              type="button"
              disabled={!staffEmail || isUpdatingRole}
              onClick={async () => {
                if (!onUpdateUserRole) return;
                setIsUpdatingRole(true);
                try {
                  await onUpdateUserRole(staffEmail, 'staff');
                  setStaffEmail('');
                  alert('تمت ترقية المستخدم إلى موظف بنجاح! سيتمكن الآن من دخول بوابة الموظفين.');
                } catch (err: any) {
                  alert(err.message || 'فشل تحديث الصلاحيات. تأكد من أن المستخدم مسجل مسبقاً في الموقع.');
                } finally {
                  setIsUpdatingRole(false);
                }
              }}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-md disabled:opacity-50"
            >
              {isUpdatingRole ? 'جاري التحديث...' : 'تعيين كموظف'}
            </button>
            <button
              type="button"
              disabled={!staffEmail || isUpdatingRole}
              onClick={async () => {
                if (!onUpdateUserRole) return;
                setIsUpdatingRole(true);
                try {
                  await onUpdateUserRole(staffEmail, 'user');
                  setStaffEmail('');
                  alert('تم إلغاء صلاحيات الموظف وتحويله إلى مستخدم عادي.');
                } catch (err: any) {
                  alert(err.message || 'فشل تحديث الصلاحيات.');
                } finally {
                  setIsUpdatingRole(false);
                }
              }}
              className="text-stone-500 hover:text-rose-600 px-4 py-3 rounded-2xl font-bold text-xs transition-colors"
            >
              إلغاء الصلاحية
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;
