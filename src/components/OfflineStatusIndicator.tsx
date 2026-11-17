import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi, RefreshCw, X, Database } from 'lucide-react';

interface OfflineStatusIndicatorProps {
  className?: string;
  onRetryConnection?: () => void;
}

export const OfflineStatusIndicator: React.FC<OfflineStatusIndicatorProps> = ({
  className = '',
  onRetryConnection,
}) => {
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? !navigator.onLine : false;
  });
  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const [showRestored, setShowRestored] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setIsDismissed(false);
      if (wasOffline) {
        setShowRestored(true);
        const timer = setTimeout(() => {
          setShowRestored(false);
          setWasOffline(false);
        }, 4000);
        return () => clearTimeout(timer);
      }
    };

    const handleOffline = () => {
      setIsOffline(true);
      setWasOffline(true);
      setShowRestored(false);
      setIsDismissed(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOffline(true);
      setWasOffline(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      if (onRetryConnection) {
        onRetryConnection();
      }
      // Check actual connectivity via a head fetch
      await fetch('/api/db/products', { method: 'HEAD', cache: 'no-store' });
      setIsOffline(false);
      setShowRestored(true);
      setTimeout(() => setShowRestored(false), 3500);
    } catch {
      // Still offline or failed
      if (typeof navigator !== 'undefined') {
        setIsOffline(!navigator.onLine);
      }
    } finally {
      setIsChecking(false);
    }
  };

  // If connection was restored, show brief success banner
  if (showRestored) {
    return (
      <aside
        aria-label="حالة الاتصال"
        aria-live="polite"
        className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-3 duration-300 pointer-events-auto ${className}`}
      >
        <div className="bg-emerald-950/95 text-emerald-100 border border-emerald-700/60 shadow-2xl rounded-2xl p-3.5 backdrop-blur-md flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
              <Wifi className="w-4 h-4" />
            </span>
            <div>
              <p className="font-bold text-white leading-tight">تمت استعادة الاتصال بالإنترنت</p>
              <p className="text-[11px] text-emerald-300/90 font-normal">تمت مزامنة بيانات المتجر وتحديث المحتوى</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowRestored(false)}
            className="text-emerald-400 hover:text-white p-1 rounded-lg transition-colors"
            title="إغلاق"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </aside>
    );
  }

  // If not offline or user dismissed this notification instance
  if (!isOffline || isDismissed) {
    return null;
  }

  return (
    <aside
      aria-label="حالة عدم الاتصال"
      aria-live="assertive"
      className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-lg z-50 animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-auto ${className}`}
    >
      <div className="bg-stone-900/95 text-stone-100 border border-amber-500/40 shadow-2xl shadow-stone-950/40 rounded-2xl p-3.5 sm:p-4 backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {/* Status Icon */}
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5 border border-amber-500/30">
              <WifiOff className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
            </div>

            {/* Status Content */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-bold text-white">
                  أنت تتصفح في وضع عدم الاتصال (Offline)
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Database className="w-3 h-3" />
                  محتوى محفوظ
                </span>
              </div>
              <p className="text-xs text-stone-300 leading-relaxed font-normal">
                لا يتوفر اتصال بالإنترنت حالياً. يتم عرض المنتجات والبيانات المخزنة محلياً في جهازك لتتمكن من التصفح بسلاسة.
              </p>
            </div>
          </div>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={() => setIsDismissed(true)}
            className="text-stone-400 hover:text-white p-1 rounded-lg transition-colors shrink-0"
            title="إخفاء الإشعار"
            aria-label="إخفاء التنبيه"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Controls */}
        <div className="mt-3 pt-2.5 border-t border-stone-800/80 flex items-center justify-between gap-2 text-xs">
          <span className="text-[11px] text-stone-400">
            سيتم حفظ أي طلبات أو تعديلات تلقائياً للمزامنة لاحقاً
          </span>
          <button
            type="button"
            onClick={handleManualCheck}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-stone-950 font-bold transition-all shadow-sm shrink-0 disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
            <span>{isChecking ? 'جاري الفحص...' : 'إعادة المحاولة'}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
