import React, { useState, useEffect, useMemo } from 'react';
import {
  Truck,
  Phone,
  MessageCircle,
  MapPin,
  CheckCircle2,
  Clock,
  DollarSign,
  AlertTriangle,
  Navigation,
  Search,
  Filter,
  User,
  ShieldCheck,
  ChevronRight,
  Send,
  X,
  Package,
  ExternalLink,
  RotateCcw,
  Bike,
  LogOut,
  Calendar,
  Copy,
  Check
} from 'lucide-react';
import { Order, OrderStatus, StoreSettings, UserProfile, DriverInfo } from '../types';

interface DriverPortalProps {
  orders: Order[];
  onUpdateDeliveryStatus: (
    orderId: string,
    orderNumber: string,
    status: OrderStatus,
    extraData?: {
      cod_collected?: boolean;
      cod_collected_amount?: number;
      driver_notes?: string;
      driver_name?: string;
      driver_phone?: string;
    }
  ) => Promise<void>;
  settings: StoreSettings;
  currentUser?: UserProfile | null;
  onBackToStore: () => void;
  onOpenAdmin?: () => void;
}

const DEFAULT_DRIVERS: DriverInfo[] = [
  { id: 'drv-01', name: 'الكابتن محمد اليماني', phone: '967777123456', city: 'صنعاء', vehicle_type: 'دراجة نارية 🏍️', active: true },
  { id: 'drv-02', name: 'الكابتن عمار العولقي', phone: '967733987654', city: 'عدن', vehicle_type: 'سيارة 🚗', active: true },
  { id: 'drv-03', name: 'الكابتن طارق الحزمي', phone: '967711555444', city: 'تعز', vehicle_type: 'دراجة نارية 🏍️', active: true },
  { id: 'drv-04', name: 'الكابتن فهد الدوسري', phone: '966501234567', city: 'الرياض', vehicle_type: 'سيارة 🚗', active: true },
];

const LOCAL_DRIVER_SESSION_KEY = 'amazon_duaa_driver_session_v1';

export const DriverPortal: React.FC<DriverPortalProps> = ({
  orders,
  onUpdateDeliveryStatus,
  settings,
  currentUser,
  onBackToStore,
  onOpenAdmin,
}) => {
  // Current active driver session
  const [activeDriver, setActiveDriver] = useState<DriverInfo>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_DRIVER_SESSION_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    if (currentUser?.role === 'driver') {
      return {
        id: currentUser.uid,
        name: currentUser.name || 'مندوب التوصيل',
        phone: currentUser.phone || '967770000000',
        city: currentUser.city || 'صنعاء',
        active: true,
      };
    }
    return DEFAULT_DRIVERS[0];
  });

  const [isChangingDriver, setIsChangingDriver] = useState(false);
  const [customDriverName, setCustomDriverName] = useState('');
  const [customDriverPhone, setCustomDriverPhone] = useState('');
  const [customDriverCity, setCustomDriverCity] = useState('صنعاء');

  // Filter & Search states
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'out_for_delivery' | 'delivered' | 'failed'>('active');
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [confirmDeliveryOrder, setConfirmDeliveryOrder] = useState<Order | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');
  const [codAmountConfirmed, setCodAmountConfirmed] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [rescheduleOrder, setRescheduleOrder] = useState<Order | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState<string>('العميل لم يرد على الاتصال');
  const [rescheduleNotes, setRescheduleNotes] = useState<string>('');

  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const saveDriverSession = (driver: DriverInfo) => {
    setActiveDriver(driver);
    localStorage.setItem(LOCAL_DRIVER_SESSION_KEY, JSON.stringify(driver));
    setIsChangingDriver(false);
    showToast(`تم تفعيل جلسة المندوب: ${driver.name} (${driver.city})`);
  };

  // Filter Orders for this driver/city
  const driverOrders = useMemo(() => {
    return orders.filter((o) => {
      // 1. Matches this driver or is unassigned in driver's city
      const isAssignedToThisDriver = o.driver_phone === activeDriver.phone || o.driver_name === activeDriver.name;
      const isUnassignedInSameCity = !o.driver_name && o.city && activeDriver.city && o.city.includes(activeDriver.city);
      const matchesDriverOrCity = isAssignedToThisDriver || isUnassignedInSameCity;

      // 2. City filter
      const matchesCity = selectedCity === 'all' || (o.city && o.city.includes(selectedCity));

      // 3. Status filter
      let matchesStatus = true;
      if (statusFilter === 'active') {
        matchesStatus = o.status === 'pending' || o.status === 'processing' || o.status === 'shipped' || o.status === 'out_for_delivery';
      } else if (statusFilter === 'out_for_delivery') {
        matchesStatus = o.status === 'out_for_delivery';
      } else if (statusFilter === 'delivered') {
        matchesStatus = o.status === 'delivered';
      } else if (statusFilter === 'failed') {
        matchesStatus = o.status === 'cancelled';
      }

      // 4. Search Query
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        o.order_number.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_phone.includes(q) ||
        o.address.toLowerCase().includes(q);

      return matchesDriverOrCity && matchesCity && matchesStatus && matchesSearch;
    });
  }, [orders, activeDriver, selectedCity, statusFilter, searchQuery]);

  // Statistics for Current Driver's Shift
  const shiftStats = useMemo(() => {
    const assigned = orders.filter((o) => o.driver_phone === activeDriver.phone || o.driver_name === activeDriver.name);
    const delivered = assigned.filter((o) => o.status === 'delivered');
    const outForDelivery = assigned.filter((o) => o.status === 'out_for_delivery');
    const totalCashCollected = delivered.reduce((sum, o) => {
      // If COD was collected, add total amount
      if (o.payment_method !== 'bank_transfer' && o.payment_method !== 'mada') {
        return sum + (o.cod_collected_amount || o.total_amount);
      }
      return sum;
    }, 0);

    const pendingDeliveries = assigned.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');

    return {
      totalAssigned: assigned.length,
      deliveredCount: delivered.length,
      outForDeliveryCount: outForDelivery.length,
      pendingCount: pendingDeliveries.length,
      totalCashCollected,
    };
  }, [orders, activeDriver]);

  // Handle Start Delivery ("في الطريق")
  const handleStartDelivery = async (order: Order) => {
    try {
      setIsSubmitting(true);
      await onUpdateDeliveryStatus(order.id, order.order_number, 'out_for_delivery', {
        driver_name: activeDriver.name,
        driver_phone: activeDriver.phone,
        driver_notes: 'الكابتن في الطريق للعميل الآن',
      });
      showToast(`الطلب #${order.order_number} أصبح الآن (في الطريق للعميل) 🚚`);
    } catch (err: any) {
      showToast(`خطأ في تحديث الحالة: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Confirm Delivered & COD Collected
  const handleConfirmDelivery = async () => {
    if (!confirmDeliveryOrder) return;
    try {
      setIsSubmitting(true);
      await onUpdateDeliveryStatus(confirmDeliveryOrder.id, confirmDeliveryOrder.order_number, 'delivered', {
        cod_collected: codAmountConfirmed,
        cod_collected_amount: codAmountConfirmed ? confirmDeliveryOrder.total_amount : 0,
        driver_notes: deliveryNotes || 'تم التسليم بنجاح واستلام المبلغ نقداً',
        driver_name: activeDriver.name,
        driver_phone: activeDriver.phone,
      });

      showToast(`🎉 تم تسليم الطلب #${confirmDeliveryOrder.order_number} وتحصيل ${confirmDeliveryOrder.total_amount} ${settings.currency} بنجاح!`);
      setConfirmDeliveryOrder(null);
      setDeliveryNotes('');
    } catch (err: any) {
      showToast(`خطأ في تأكيد التسليم: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Reschedule or Delivery Issue
  const handleConfirmReschedule = async () => {
    if (!rescheduleOrder) return;
    try {
      setIsSubmitting(true);
      const noteText = `تعذر التوصيل: ${rescheduleReason}${rescheduleNotes ? ` - ${rescheduleNotes}` : ''}`;
      await onUpdateDeliveryStatus(rescheduleOrder.id, rescheduleOrder.order_number, 'pending', {
        driver_notes: noteText,
        driver_name: activeDriver.name,
        driver_phone: activeDriver.phone,
      });

      showToast(`تم تسجيل الملاحظة للطلب #${rescheduleOrder.order_number} وإعادته للمتابعة`);
      setRescheduleOrder(null);
      setRescheduleNotes('');
    } catch (err: any) {
      showToast(`خطأ في تحديث الحالة: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate WhatsApp Delivery Notification URL
  const getWhatsAppDeliveryNoticeUrl = (order: Order) => {
    const cleanPhone = order.customer_phone.replace(/\D/g, '');
    const text = `السلام عليكم ورحمة الله وبركاته يا ${order.customer_name} 🌸\nأنا مندوب التوصيل (${activeDriver.name}) من متجر *${settings.storeName}*.\nأنا متوجه إليك الآن لتسليم طلبك رقم: *#${order.order_number}*.\n\n📍 العنوان المسجل: ${order.city} - ${order.address}\n💵 المبلغ المطلوب نقداً: *${order.total_amount} ${settings.currency}*\n\nيرجى تأكيد مناسبة الوقت والموقع لاستلام الشحنة، وشكراً لك! ✨`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  };

  // Generate End-of-Shift Cash Report for Store Admin
  const getShiftReportWhatsAppUrl = () => {
    const adminPhone = settings.whatsappNumber.replace(/\D/g, '');
    const dateStr = new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
    const text = `🛵 *تقرير توريد الوردية والكاش اليومي - متجر ${settings.storeName}*\n\n👤 *المندوب:* ${activeDriver.name}\n📞 *الجوال:* ${activeDriver.phone}\n📍 *المدينة:* ${activeDriver.city}\n📅 *التاريخ:* ${dateStr}\n\n📊 *ملخص الرحلات:*
- إجمالي الطلبات المكلفة: ${shiftStats.totalAssigned}
- تم تسليمها بنجاح: ${shiftStats.deliveredCount}
- متبقية / قيد الانتظار: ${shiftStats.pendingCount}
\n💰 *إجمالي الكاش المحصل بيدي الجاهز للتوريد:*
*${shiftStats.totalCashCollected} ${settings.currency}*
\nأرجو تأكيد الاستلام وتوريد المبالغ، شكراً لكم!`;

    return `https://wa.me/${adminPhone}?text=${encodeURIComponent(text)}`;
  };

  const handleCopyPhone = (phone: string, id: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedPhoneId(id);
    setTimeout(() => setCopiedPhoneId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-stone-100/80 font-['Cairo',sans-serif] text-right pb-24" dir="rtl">
      {/* Top Mobile Bar */}
      <header className="bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 text-white sticky top-0 z-40 shadow-lg border-b border-stone-700">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-stone-950 flex items-center justify-center font-black shadow-md">
              <Bike className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-black tracking-tight">{settings.storeName}</h1>
                <span className="bg-amber-400 text-stone-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                  بوابة المندوب
                </span>
              </div>
              <p className="text-[11px] text-stone-300 font-bold">
                {activeDriver.name} • {activeDriver.city}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsChangingDriver(!isChangingDriver)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-amber-300 border border-white/15 transition-all flex items-center gap-1.5 cursor-pointer"
              title="تغيير المندوب"
            >
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تبديل الكابتن</span>
            </button>

            <button
              onClick={onBackToStore}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-stone-200 transition-all cursor-pointer"
              title="العودة للمتجر"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Toast Notice */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-stone-950 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold border border-stone-800 animate-in fade-in duration-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <section className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Driver Selection Modal / Dropdown */}
        {isChangingDriver && (
          <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-md space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="font-black text-sm text-stone-900 flex items-center gap-2">
                <User className="w-4 h-4 text-rose-600" />
                <span>اختر اسم الكابتن المسند له التوصيل</span>
              </h3>
              <button
                onClick={() => setIsChangingDriver(false)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {DEFAULT_DRIVERS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => saveDriverSession(d)}
                  className={`p-3 rounded-2xl border text-right transition-all flex items-center justify-between cursor-pointer ${
                    activeDriver.id === d.id
                      ? 'bg-rose-50 border-rose-400 text-rose-950 font-black ring-2 ring-rose-200'
                      : 'bg-stone-50 border-stone-200 text-stone-800 hover:bg-stone-100'
                  }`}
                >
                  <div>
                    <p className="text-xs font-black">{d.name}</p>
                    <p className="text-[10px] text-stone-500 font-mono" dir="ltr">{d.phone}</p>
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-stone-200 text-stone-700">
                    {d.city}
                  </span>
                </button>
              ))}
            </div>

            {/* Custom Driver Entry */}
            <div className="pt-3 border-t border-stone-100 space-y-2">
              <span className="text-xs font-bold text-stone-600 block">أو تسجيل مندوب جديد / إدخال يدوي:</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="اسم المندوب"
                  value={customDriverName}
                  onChange={(e) => setCustomDriverName(e.target.value)}
                  className="text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-rose-500"
                />
                <input
                  type="text"
                  placeholder="رقم الجوال (مثال: 967770000000)"
                  value={customDriverPhone}
                  onChange={(e) => setCustomDriverPhone(e.target.value)}
                  className="text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl focus:outline-rose-500"
                />
                <button
                  onClick={() => {
                    if (!customDriverName.trim() || !customDriverPhone.trim()) {
                      showToast('يرجى كتابة الاسم ورقم الهاتف للمندوب');
                      return;
                    }
                    saveDriverSession({
                      id: `custom-${Date.now()}`,
                      name: customDriverName.trim(),
                      phone: customDriverPhone.trim(),
                      city: customDriverCity,
                      active: true,
                    });
                  }}
                  className="bg-stone-900 hover:bg-rose-600 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-colors cursor-pointer"
                >
                  دخول بهذا المندوب
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 1. Shift Metrics Card (الكاش وحالة الرحلات) */}
        <div className="bg-gradient-to-br from-stone-900 via-stone-950 to-stone-900 text-white rounded-3xl p-5 sm:p-6 shadow-xl border border-stone-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-800">
            <div>
              <span className="text-amber-400 text-xs font-bold block mb-0.5">ملخص وردية التوصيل اليومية</span>
              <h2 className="text-lg sm:text-xl font-black flex items-center gap-2">
                <span>الكابتن {activeDriver.name}</span>
                <span className="text-xs font-bold text-stone-400 font-mono">({activeDriver.phone})</span>
              </h2>
            </div>

            <a
              href={getShiftReportWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black px-4 py-2.5 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer self-start sm:self-auto"
            >
              <Send className="w-4 h-4" />
              <span>مشاركة تقرير الكاش مع الإدارة</span>
            </a>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/5 p-3.5 rounded-2xl border border-white/10">
              <span className="text-[11px] text-stone-400 font-bold block mb-1">الطلبات المكلفة</span>
              <span className="text-2xl font-black text-white">{shiftStats.totalAssigned}</span>
            </div>

            <div className="bg-sky-500/10 p-3.5 rounded-2xl border border-sky-500/20">
              <span className="text-[11px] text-sky-300 font-bold block mb-1">جاري توصيلها</span>
              <span className="text-2xl font-black text-sky-400">{shiftStats.outForDeliveryCount}</span>
            </div>

            <div className="bg-emerald-500/10 p-3.5 rounded-2xl border border-emerald-500/20">
              <span className="text-[11px] text-emerald-300 font-bold block mb-1">تم تسليمها بنجاح</span>
              <span className="text-2xl font-black text-emerald-400">{shiftStats.deliveredCount}</span>
            </div>

            <div className="bg-amber-500/15 p-3.5 rounded-2xl border border-amber-500/30">
              <span className="text-[11px] text-amber-300 font-bold block mb-1">الكاش المحصل بيدك</span>
              <span className="text-xl sm:text-2xl font-black text-amber-400">
                {shiftStats.totalCashCollected} <span className="text-xs">{settings.currency}</span>
              </span>
            </div>
          </div>
        </div>

        {/* 2. Filters & Status Tabs */}
        <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm space-y-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-bold">
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-4 py-2 rounded-xl transition-all shrink-0 cursor-pointer ${
                statusFilter === 'active'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              قيد التوصيل الآن ({shiftStats.pendingCount})
            </button>

            <button
              onClick={() => setStatusFilter('out_for_delivery')}
              className={`px-3.5 py-2 rounded-xl transition-all shrink-0 cursor-pointer ${
                statusFilter === 'out_for_delivery'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              في الطريق للعميل ({shiftStats.outForDeliveryCount})
            </button>

            <button
              onClick={() => setStatusFilter('delivered')}
              className={`px-3.5 py-2 rounded-xl transition-all shrink-0 cursor-pointer ${
                statusFilter === 'delivered'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              تم التسليم ({shiftStats.deliveredCount})
            </button>

            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3.5 py-2 rounded-xl transition-all shrink-0 cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              جميع الطلبات ({orders.length})
            </button>
          </div>

          {/* Search & City Filter */}
          <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-stone-100">
            <div className="relative flex-1 w-full">
              <input
                type="text"
                placeholder="بحث برقم الطلب، اسم العميل، الشارع، أو الجوال..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs p-2.5 pr-8 bg-stone-50 border border-stone-200 rounded-xl focus:outline-rose-500"
              />
              <Search className="w-3.5 h-3.5 text-stone-400 absolute right-2.5 top-3" />
            </div>

            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="text-xs p-2.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700 w-full sm:w-44"
            >
              <option value="all">كل المدن</option>
              <option value="صنعاء">صنعاء</option>
              <option value="عدن">عدن</option>
              <option value="تعز">تعز</option>
              <option value="الرياض">الرياض</option>
              <option value="جدة">جدة</option>
            </select>
          </div>
        </div>

        {/* 3. Driver Orders List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="font-black text-sm text-stone-800 flex items-center gap-2">
              <Package className="w-4 h-4 text-rose-600" />
              <span>قائمة شحنات المندوب ({driverOrders.length})</span>
            </h3>
            <span className="text-[11px] text-stone-500 font-bold">
              اضغط على أزرار الاتصال أو الخرائط للتحرك فوراً
            </span>
          </div>

          {driverOrders.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-stone-300 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto text-stone-400">
                <Truck className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-stone-800">لا توجد طلبات في هذا القسم حالياً</h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                جميع الشحنات المحددة تم الانتهاء منها أو لا توجد طلبات مسندة لهذا المندوب في المدينة المختارة.
              </p>
            </div>
          ) : (
            driverOrders.map((order) => {
              const isDelivered = order.status === 'delivered';
              const isOutForDelivery = order.status === 'out_for_delivery';
              const cleanPhone = order.customer_phone.replace(/\D/g, '');
              const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.city} ${order.address}`)}`;
              const waUrl = getWhatsAppDeliveryNoticeUrl(order);

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-3xl border transition-all p-5 shadow-sm space-y-4 ${
                    isDelivered
                      ? 'border-emerald-200 bg-emerald-50/20'
                      : isOutForDelivery
                      ? 'border-sky-300 ring-2 ring-sky-100'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  {/* Top Card Info */}
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-stone-100">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-black text-sm text-stone-900">#{order.order_number}</span>
                        <span
                          className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                            isDelivered
                              ? 'bg-emerald-100 text-emerald-800'
                              : isOutForDelivery
                              ? 'bg-sky-100 text-sky-800 animate-pulse'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isDelivered
                            ? 'تم التسليم والكاش محصل 💵'
                            : isOutForDelivery
                            ? 'في الطريق للعميل 🚚'
                            : 'جاهز للاستلام والتوصيل 📦'}
                        </span>
                      </div>
                      <h4 className="text-base font-black text-stone-900">{order.customer_name}</h4>
                    </div>

                    {/* Amount to collect */}
                    <div className="text-left bg-rose-50 px-3.5 py-2 rounded-2xl border border-rose-100 shrink-0">
                      <span className="text-[10px] text-rose-800 font-bold block">المبلغ المطلوب نقداً:</span>
                      <span className="text-base font-black text-rose-600">
                        {order.total_amount} <span className="text-xs">{settings.currency}</span>
                      </span>
                    </div>
                  </div>

                  {/* Customer Location & Phone Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-stone-50 p-3.5 rounded-2xl border border-stone-100">
                    <div className="space-y-1">
                      <span className="text-[11px] text-stone-400 font-bold block">العنوان والتفاصيل:</span>
                      <p className="font-bold text-stone-800 flex items-start gap-1.5 leading-snug">
                        <MapPin className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <span>{order.city} - {order.address}</span>
                      </p>
                      {order.notes && (
                        <p className="text-[11px] text-amber-800 bg-amber-50 p-1.5 rounded-lg border border-amber-200 mt-1">
                          ملاحظة العميل: {order.notes}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <span className="text-[11px] text-stone-400 font-bold block">رقم الجوال:</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-stone-900 text-sm" dir="ltr">
                          {order.customer_phone}
                        </span>
                        <button
                          onClick={() => handleCopyPhone(order.customer_phone, order.id)}
                          className="p-1 rounded-md hover:bg-stone-200 text-stone-500 cursor-pointer"
                          title="نسخ الرقم"
                        >
                          {copiedPhoneId === order.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Order Items Preview (Collapsible) */}
                  <div className="text-xs text-stone-600 bg-white p-2.5 rounded-xl border border-stone-100 flex items-center justify-between">
                    <span>
                      محتويات الشحنة: <strong className="text-stone-900">{order.items.length} أصناف</strong> ({order.items.map(i => `${i.title_ar} × ${i.quantity}`).join(', ')})
                    </span>
                    <span className="text-[11px] text-stone-400">
                      طريقة الدفع: {order.payment_method === 'bank_transfer' ? 'تحويل بنكي' : 'الدفع عند الاستلام (COD)'}
                    </span>
                  </div>

                  {/* 4. Action Buttons Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                    {/* 1. Direct Phone Call */}
                    <a
                      href={`tel:${cleanPhone}`}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Phone className="w-4 h-4" />
                      <span>اتصال هاتفي</span>
                    </a>

                    {/* 2. WhatsApp Message */}
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>واتساب العميل</span>
                    </a>

                    {/* 3. Google Maps Navigation */}
                    <a
                      href={mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>خرائط Google</span>
                    </a>

                    {/* 4. Status Update Buttons */}
                    {!isDelivered ? (
                      isOutForDelivery ? (
                        <button
                          onClick={() => setConfirmDeliveryOrder(order)}
                          className="bg-rose-600 hover:bg-rose-700 text-white py-2.5 px-3 rounded-2xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md transition-colors cursor-pointer animate-pulse"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>تم التسليم والكاش 💵</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartDelivery(order)}
                          className="bg-stone-900 hover:bg-stone-800 text-white py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                        >
                          <Truck className="w-4 h-4" />
                          <span>بدء التوصيل 🚚</span>
                        </button>
                      )
                    ) : (
                      <div className="bg-emerald-50 text-emerald-800 py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 border border-emerald-200">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>تم الإنجاز بنجاح</span>
                      </div>
                    )}
                  </div>

                  {/* Reschedule Button when order is in transit */}
                  {!isDelivered && (
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => setRescheduleOrder(order)}
                        className="text-[11px] text-stone-500 hover:text-rose-600 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                        <span>تعذر التوصيل / تأجيل الموعد؟</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ======================= MODAL 1: CONFIRM CASH & DELIVERY ======================= */}
      {confirmDeliveryOrder && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-stone-200 space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-base text-stone-900">تأكيد تسليم الطلب وتحصيل الكاش</h3>
                  <p className="text-xs text-stone-400">طلب #{confirmDeliveryOrder.order_number}</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmDeliveryOrder(null)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-center space-y-1">
              <span className="text-xs font-bold text-emerald-800 block">المبلغ المطلوب استلامه نقداً:</span>
              <span className="text-2xl font-black text-emerald-700 font-mono">
                {confirmDeliveryOrder.total_amount} {settings.currency}
              </span>
              <p className="text-[11px] text-emerald-900 font-bold">
                العميل: {confirmDeliveryOrder.customer_name} ({confirmDeliveryOrder.city})
              </p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 rounded-2xl bg-stone-50 border border-stone-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={codAmountConfirmed}
                  onChange={(e) => setCodAmountConfirmed(e.target.checked)}
                  className="w-5 h-5 accent-emerald-600 rounded cursor-pointer"
                />
                <span className="text-xs font-bold text-stone-800 leading-snug">
                  أؤكد استلام كامل المبلغ نقداً ({confirmDeliveryOrder.total_amount} {settings.currency}) من العميل
                </span>
              </label>

              <div>
                <label className="block text-xs font-bold text-stone-600 mb-1">
                  ملاحظات المندوب (اختياري):
                </label>
                <input
                  type="text"
                  placeholder="مثال: تم التسليم للعميل شخصياً أمام باب المنزل"
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-emerald-500 font-semibold"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
              <button
                onClick={() => setConfirmDeliveryOrder(null)}
                disabled={isSubmitting}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-3 rounded-2xl text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmDelivery}
                disabled={isSubmitting || !codAmountConfirmed}
                className="flex-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-2xl text-xs font-black shadow-md transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span>جاري التأكيد...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>تأكيد التسليم وتوريد الكاش</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= MODAL 2: RESCHEDULE / CANCEL ======================= */}
      {rescheduleOrder && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-stone-200 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-stone-900">تسجيل مشكلة أو تأجيل التوصيل</h3>
                  <p className="text-xs text-stone-400">طلب #{rescheduleOrder.order_number}</p>
                </div>
              </div>
              <button
                onClick={() => setRescheduleOrder(null)}
                className="text-stone-400 hover:text-stone-700 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-600 mb-1.5">سبب تعذر التوصيل:</label>
                <select
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-2xl font-bold text-stone-800"
                >
                  <option value="العميل لم يرد على الاتصال">العميل لم يرد على الاتصال عدة مرات</option>
                  <option value="العميل طلب تأجيل الموعد ليوم آخر">العميل طلب تأجيل الموعد لوقت لاحق</option>
                  <option value="العنوان غير واضح ومغلق">العنوان غير واضح / التليفون مغلق</option>
                  <option value="العميل غير متواجد بالموقع">العميل خارج المنزل حالياً</option>
                  <option value="العميل طلب إلغاء الطلب">العميل رفض الاستلام / طلب الإلغاء</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-600 mb-1">تفاصيل إضافية للمدير:</label>
                <textarea
                  rows={3}
                  value={rescheduleNotes}
                  onChange={(e) => setRescheduleNotes(e.target.value)}
                  placeholder="اكتب أي ملاحظة عن الموعد البديل أو رد العميل..."
                  className="w-full text-xs p-3 bg-stone-50 border border-stone-200 rounded-2xl focus:outline-amber-500 font-semibold"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-stone-100">
              <button
                onClick={() => setRescheduleOrder(null)}
                className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 py-3 rounded-2xl text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmReschedule}
                disabled={isSubmitting}
                className="flex-2 bg-amber-600 hover:bg-amber-700 text-white py-3 rounded-2xl text-xs font-black shadow-md cursor-pointer transition-colors"
              >
                حفظ وإشعار الإدارة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
