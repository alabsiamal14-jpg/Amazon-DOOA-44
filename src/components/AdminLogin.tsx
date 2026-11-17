import React, { useState } from 'react';
import { Lock, KeyRound, Store, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { AdminUser, StoreSettings } from '../types';
import { setAdminSession } from '../lib/storage';

interface AdminLoginProps {
  settings: StoreSettings;
  onLoginSuccess: (user: AdminUser) => void;
  onBackToStore: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({
  onLoginSuccess,
  onBackToStore,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'فشل تسجيل الدخول. تحقق من اسم المستخدم وكلمة المرور.');
      }

      if (!data.token || !data.user) {
        throw new Error('استجابة غير صالحة من خادم المصادقة');
      }

      const adminUser: AdminUser = {
        ...data.user,
        token: data.token,
      };

      setAdminSession(adminUser, data.token);
      onLoginSuccess(adminUser);
    } catch (err: any) {
      setError(err.message || 'فشل الاتصال بخادم الأمان');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-xl border border-stone-200">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-sm">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-stone-900">تسجيل دخول لوحة الإدارة</h2>
          <p className="text-xs text-stone-500 mt-1">
            منطقة مخصصة ومحمية لإدارة المنتجات، الطلبات، وتحليلات المتجر
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">اسم المستخدم</label>
            <input
              type="text"
              required
              disabled={loading}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full text-sm p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden disabled:opacity-50"
              placeholder="اسم مستخدم الإدارة"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">كلمة المرور</label>
            <div className="relative">
              <input
                type="password"
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-sm p-3 pr-10 bg-stone-50 border border-stone-200 rounded-2xl focus:bg-white focus:border-rose-500 focus:outline-hidden disabled:opacity-50"
                placeholder="أدخل كلمة المرور"
              />
              <KeyRound className="w-4 h-4 text-stone-400 absolute right-3.5 top-3.5" />
            </div>
            <p className="text-[11px] text-stone-400 mt-1.5">
              مصادقة الخادم مؤمنة بنظام حماية ضد محاولات التخمين والتشفير الرقمي.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white py-3.5 px-4 rounded-2xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>جاري التحقق من الصلاحيات...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5" />
                <span>تسجيل الدخول</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-stone-100 text-center">
          <button
            onClick={onBackToStore}
            disabled={loading}
            className="text-xs font-bold text-stone-500 hover:text-stone-800 flex items-center justify-center gap-1.5 mx-auto transition-colors"
          >
            <Store className="w-4 h-4 text-rose-600" />
            <span>العودة لصفحة المتجر الرئيسية للعملاء</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
