import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Plus,
  Send,
  Loader2,
  Trash2,
  Edit,
  Search,
  MessageSquare,
  Paperclip,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  User,
  ExternalLink,
  ChevronRight,
  TrendingDown,
  Percent,
  Settings,
  X,
  FileText,
  DollarSign
} from 'lucide-react';
import { getAuthHeadersAsync } from '../lib/storage';
import { PricingConversation, PricingMessage, SupplierRegistryItem, PriceObservation } from '../features/pricing-ai/types';

export const PricingAIDashboard: React.FC = () => {
  // Navigation tabs: 'chat' | 'suppliers' | 'observations'
  const [activeSubTab, setActiveSubTab] = useState<'chat' | 'suppliers' | 'observations'>('chat');

  // Conversations states
  const [conversations, setConversations] = useState<PricingConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingConv, setIsCreatingConv] = useState(false);
  const [editingConvId, setEditingConvId] = useState<string>('');
  const [editingTitle, setEditingTitle] = useState('');

  // Messages states
  const [messages, setMessages] = useState<PricingMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [attachment, setAttachment] = useState<{ base64: string; name: string; mimeType: string } | null>(null);

  // Suppliers states
  const [suppliers, setSuppliers] = useState<SupplierRegistryItem[]>([]);
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierBusiness, setNewSupplierBusiness] = useState('');
  const [newSupplierPhone, setNewSupplierPhone] = useState('');
  const [newSupplierCountry, setNewSupplierCountry] = useState('اليمن');
  const [newSupplierCity, setNewSupplierCity] = useState('');
  const [newSupplierNotes, setNewSupplierNotes] = useState('');
  const [supplierSearch, setSupplierSupplierSearch] = useState('');
  const [selectedSupplierForTimeline, setSelectedSupplierForTimeline] = useState<string | null>(null);
  const [supplierPriceHistory, setSupplierPriceHistory] = useState<PriceObservation[]>([]);

  // Price observations states
  const [observations, setObservations] = useState<PriceObservation[]>([]);
  const [obsFilter, setObsFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // Purchase Dialog state
  const [purchaseMsgSupplier, setPurchaseMsgSupplier] = useState<SupplierRegistryItem | null>(null);
  const [purchaseProductsText, setPurchaseProductsText] = useState('سيروم الحلزون الكوري × 2\nكريم مرطب سنتيلا × 1');

  // Local Toasts
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const messageEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeSubTab === 'chat') {
      scrollToBottom();
    }
  }, [messages, activeSubTab]);

  // Initial data loading
  useEffect(() => {
    loadConversations();
    loadSuppliers();
    loadObservations();
  }, []);

  // Reload messages when active conversation changes
  useEffect(() => {
    if (activeConvId) {
      loadMessages(activeConvId);
    } else {
      setMessages([]);
    }
  }, [activeConvId]);

  // Load suppliers prices when supplier timeline is requested
  useEffect(() => {
    if (selectedSupplierForTimeline) {
      loadSupplierPrices(selectedSupplierForTimeline);
    } else {
      setSupplierPriceHistory([]);
    }
  }, [selectedSupplierForTimeline]);

  // Fetch conversations
  const loadConversations = async () => {
    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) return;
      const res = await fetch('/api/pricing-ai/conversations', {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        if (data.length > 0 && !activeConvId) {
          setActiveConvId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Failed to load conversations:', e);
    }
  };

  // Fetch messages
  const loadMessages = async (convId: string) => {
    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) return;
      const res = await fetch(`/api/pricing-ai/conversations/${convId}/messages`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) {
      console.error('Failed to load messages:', e);
    }
  };

  // Fetch suppliers
  const loadSuppliers = async () => {
    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) return;
      const res = await fetch('/api/pricing-ai/suppliers', {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data);
      }
    } catch (e) {
      console.error('Failed to load suppliers:', e);
    }
  };

  // Fetch price history for specific supplier
  const loadSupplierPrices = async (supplierId: string) => {
    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) return;
      const res = await fetch(`/api/pricing-ai/suppliers/${supplierId}/prices`, {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        setSupplierPriceHistory(data);
      }
    } catch (e) {
      console.error('Failed to load supplier prices:', e);
    }
  };

  // Fetch all price observations
  const loadObservations = async () => {
    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) return;
      const res = await fetch('/api/pricing-ai/prices/observations', {
        headers: authHeaders
      });
      if (res.ok) {
        const data = await res.json();
        setObservations(data);
      }
    } catch (e) {
      console.error('Failed to load observations:', e);
    }
  };

  // New conversation
  const handleNewConversation = async () => {
    setIsCreatingConv(true);
    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) return;
      const res = await fetch('/api/pricing-ai/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ title: `جلسة تسعير ذكية #${conversations.length + 1}` })
      });
      if (res.ok) {
        const data = await res.json();
        setConversations([data, ...conversations]);
        setActiveConvId(data.id);
        setActiveSubTab('chat');
        showToast('تم فتح جلسة محادثة ذكية جديدة.', 'success');
      }
    } catch (e) {
      showToast('فشل إنشاء محادثة جديدة.', 'error');
    } finally {
      setIsCreatingConv(false);
    }
  };

  // Delete conversation
  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('هل أنتِ متأكدة من حذف هذه المحادثة وجميع رسائلها؟')) return;

    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) return;
      const res = await fetch(`/api/pricing-ai/conversations/${convId}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      if (res.ok) {
        setConversations(conversations.filter(c => c.id !== convId));
        if (activeConvId === convId) {
          setActiveConvId('');
        }
        showToast('تم حذف المحادثة وجزئيات الذاكرة المرتبطة بها.', 'info');
      }
    } catch (e) {
      showToast('فشل حذف المحادثة.', 'error');
    }
  };

  // Rename conversation
  const handleStartRename = (convId: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConvId(convId);
    setEditingTitle(title);
  };

  const handleSaveRename = async (convId: string) => {
    if (!editingTitle.trim()) return;
    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) return;
      const res = await fetch(`/api/pricing-ai/conversations/${convId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ title: editingTitle })
      });
      if (res.ok) {
        setConversations(conversations.map(c => c.id === convId ? { ...c, title: editingTitle } : c));
        setEditingConvId('');
        showToast('تم تعديل عنوان المحادثة.', 'success');
      }
    } catch (e) {
      showToast('فشل حفظ العنوان الجديد.', 'error');
    }
  };

  // File Upload Handling
  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('حجم الملف كبير جداً. الحد الأقصى 10 ميجابايت.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({
        base64: reader.result as string,
        name: file.name,
        mimeType: file.type
      });
      showToast(`تم إدراج المرفق: ${file.name}`, 'info');
    };
    reader.readAsDataURL(file);
  };

  // Send message to Gemini
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() && !attachment) return;
    if (!activeConvId) {
      showToast('يرجى فتح أو إنشاء محادثة جديدة أولاً.', 'error');
      return;
    }

    setIsSending(true);
    const sentText = inputMessage;
    const sentAttachment = attachment;
    setInputMessage('');
    setAttachment(null);

    // Append raw user message locally first
    const tempUserMsgId = `temp-${Date.now()}`;
    const tempUserMsg: PricingMessage = {
      id: tempUserMsgId,
      conversationId: activeConvId,
      role: 'user',
      content: sentText,
      createdAt: new Date().toISOString(),
      ...(sentAttachment ? { attachments: [{ name: sentAttachment.name, url: sentAttachment.base64, mimeType: sentAttachment.mimeType }] } : {})
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) return;

      const res = await fetch(`/api/pricing-ai/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          content: sentText,
          attachment: sentAttachment
        })
      });

      if (!res.ok) {
        throw new Error('فشلت استجابة خادم الذكاء الاصطناعي.');
      }

      const json = await res.json();
      if (json.success && json.message) {
        // Replace temp and set final messages list
        loadMessages(activeConvId);
        loadSuppliers();
        loadObservations();
        showToast('تم استخراج الأسعار وتلقي الرد الذكي بنجاح!', 'success');
      }

    } catch (err: any) {
      showToast(err.message || 'فشلت معالجة وإرسال الرسالة.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  // Approve price observation
  const handleApprovePrice = async (obsId: string) => {
    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) return;

      const res = await fetch('/api/pricing-ai/prices/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ id: obsId })
      });

      if (res.ok) {
        showToast('تم اعتماد السعر وحفظه بنجاح.', 'success');
        loadObservations();
        if (selectedSupplierForTimeline) {
          loadSupplierPrices(selectedSupplierForTimeline);
        }
        if (activeConvId) {
          loadMessages(activeConvId);
        }
      }
    } catch (e) {
      showToast('فشل اعتماد السعر.', 'error');
    }
  };

  // Reject price observation
  const handleRejectPrice = async (obsId: string) => {
    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) return;

      const res = await fetch('/api/pricing-ai/prices/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({ id: obsId })
      });

      if (res.ok) {
        showToast('تم رفض عرض السعر الحالي.', 'info');
        loadObservations();
        if (selectedSupplierForTimeline) {
          loadSupplierPrices(selectedSupplierForTimeline);
        }
        if (activeConvId) {
          loadMessages(activeConvId);
        }
      }
    } catch (e) {
      showToast('فشل تعديل حالة السعر.', 'error');
    }
  };

  // Delete price observation
  const handleDeletePrice = async (obsId: string) => {
    if (!window.confirm('هل تريد حذف سجل السعر هذا نهائياً من أرشيف الأسعار؟')) return;
    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) return;

      const res = await fetch(`/api/pricing-ai/prices/${obsId}`, {
        method: 'DELETE',
        headers: authHeaders
      });

      if (res.ok) {
        showToast('تم حذف السعر بنجاح.', 'info');
        loadObservations();
        if (selectedSupplierForTimeline) {
          loadSupplierPrices(selectedSupplierForTimeline);
        }
      }
    } catch (e) {
      showToast('فشل حذف السعر.', 'error');
    }
  };

  // Register manual new supplier
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim() || !newSupplierPhone.trim()) {
      showToast('الاسم ورقم الهاتف مطلوبان.', 'error');
      return;
    }

    try {
      const authHeaders = await getAuthHeadersAsync();
      if (!authHeaders.Authorization) return;

      const res = await fetch('/api/pricing-ai/suppliers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          name: newSupplierName,
          businessName: newSupplierBusiness,
          whatsappPhone: newSupplierPhone,
          country: newSupplierCountry,
          city: newSupplierCity,
          notes: newSupplierNotes
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        showToast(`تم تسجيل المورد بنجاح بكود: ${json.supplier.code}`, 'success');
        loadSuppliers();
        setIsCreatingSupplier(false);
        // Reset inputs
        setNewSupplierName('');
        setNewSupplierBusiness('');
        setNewSupplierPhone('');
        setNewSupplierCity('');
        setNewSupplierNotes('');
      } else {
        throw new Error(json.error || 'فشل تسجيل المورد.');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Open WhatsApp Link
  const handleOpenWhatsApp = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    try {
      window.open(`https://wa.me/${clean}`, '_blank');
    } catch (e) {
      console.warn('Iframe blocked window.open:', e);
    }
  };

  // Generate Purchase Message Context
  const handleOpenPurchaseMsgDialog = (supplier: SupplierRegistryItem) => {
    setPurchaseMsgSupplier(supplier);
    setPurchaseProductsText('سيروم الحلزون الكوري × 2\nكريم مرطب سنتيلا × 1');
  };

  const handleCopyPurchaseMsg = () => {
    if (!purchaseMsgSupplier) return;
    const msg = `السلام عليكم ورحمة الله وبركاته، يا ${purchaseMsgSupplier.name} (${purchaseMsgSupplier.businessName || 'المحترم'})\n\nأود طلب كمية المنتجات التالية المرتبطة بـ أمازون دعاء:\n${purchaseProductsText}\n\nيرجى تأكيد تكلفة الشراء الإجمالية وتجهيز الشحنة. شكراً لكم.`;
    navigator.clipboard.writeText(msg);
    showToast('تم نسخ رسالة طلب الشراء للحافظة بنجاح!', 'success');
    setPurchaseMsgSupplier(null);
  };

  // Filtering lists
  const filteredConversations = conversations.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    s.code.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    s.whatsappPhone.includes(supplierSearch)
  );

  const filteredObservations = observations.filter(obs => {
    if (obsFilter === 'all') return true;
    return obs.approvalStatus === obsFilter;
  });

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden flex flex-col md:flex-row h-[78vh] animate-fadeIn font-['Cairo',sans-serif]">
      
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-xl border animate-fadeIn ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : toast.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <Sparkles className="w-4.5 h-4.5 text-rose-500 shrink-0" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* -------------------------------------------------------------------
          LEFT SIDEBAR: Chat Sessions & Registry Tabs
         ------------------------------------------------------------------- */}
      <div className="w-full md:w-80 bg-stone-50 border-b md:border-b-0 md:border-l border-stone-200 flex flex-col h-full shrink-0">
        
        {/* Profile/Role tag */}
        <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-stone-100/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-stone-900 text-white flex items-center justify-center font-bold text-xs shadow-sm">
              AD
            </div>
            <div>
              <span className="text-[10px] text-rose-600 font-bold block leading-none">مساعد الأسعار والتسعير الذكي</span>
              <span className="text-xs font-black text-stone-900 leading-tight">الذاكرة التجارية الدائمة</span>
            </div>
          </div>
          <span className="text-[9px] bg-rose-50 text-rose-700 px-2 py-1 rounded-lg border border-rose-100 font-bold">
            مسؤول النظام
          </span>
        </div>

        {/* Global tab selectors (Chat, Suppliers, Price Timeline) */}
        <div className="p-2 border-b border-stone-200 grid grid-cols-3 gap-1 bg-white">
          <button
            onClick={() => setActiveSubTab('chat')}
            className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'chat'
                ? 'bg-rose-50 text-rose-700 border border-rose-100 shadow-xs'
                : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100/50'
            }`}
          >
            ChatGPT
          </button>
          <button
            onClick={() => { setActiveSubTab('suppliers'); setSelectedSupplierForTimeline(null); }}
            className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'suppliers'
                ? 'bg-rose-50 text-rose-700 border border-rose-100 shadow-xs'
                : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100/50'
            }`}
          >
            سجل التجار
          </button>
          <button
            onClick={() => setActiveSubTab('observations')}
            className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'observations'
                ? 'bg-rose-50 text-rose-700 border border-rose-100 shadow-xs'
                : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100/50'
            }`}
          >
            مسودات الأسعار
          </button>
        </div>

        {/* Dynamic Sidebar Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {activeSubTab === 'chat' ? (
            /* Chat Session list with dynamic search */
            <>
              <div className="relative">
                <Search className="absolute right-2.5 top-2.5 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="ابحث في جلسات الأسعار..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:outline-rose-500"
                />
              </div>

              <button
                onClick={handleNewConversation}
                disabled={isCreatingConv}
                className="w-full bg-stone-900 hover:bg-stone-800 disabled:bg-stone-400 text-white py-2 px-4 rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isCreatingConv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>بدء جلسة تسعير جديدة</span>
              </button>

              <div className="space-y-1 pr-1">
                <span className="text-[10px] font-bold text-stone-400 block pb-1 border-b border-stone-100 uppercase tracking-wider">سجل جلسات المراجعة</span>
                
                {filteredConversations.length === 0 ? (
                  <div className="text-center py-6 text-stone-400 text-[10px]">
                    لا توجد محادثات محفوظة تطابق البحث.
                  </div>
                ) : (
                  filteredConversations.map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => setActiveConvId(conv.id)}
                      className={`group p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between border ${
                        activeConvId === conv.id
                          ? 'bg-rose-50/50 border-rose-200/60 text-rose-800'
                          : 'bg-white hover:bg-stone-100 border-stone-200/50 text-stone-700'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <MessageSquare className="w-4 h-4 shrink-0 text-stone-400" />
                        {editingConvId === conv.id ? (
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onBlur={() => handleSaveRename(conv.id)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(conv.id)}
                            className="bg-white border border-stone-300 rounded px-1.5 py-0.5 text-xs font-bold focus:outline-rose-500 text-stone-800 flex-1"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="text-[11px] font-bold truncate leading-snug">{conv.title}</span>
                        )}
                      </div>

                      {/* Side actions (edit, delete) */}
                      {editingConvId !== conv.id && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={(e) => handleStartRename(conv.id, conv.title, e)}
                            className="p-1 hover:bg-stone-200 text-stone-400 hover:text-stone-800 rounded transition-all cursor-pointer"
                          >
                            <Edit className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteConversation(conv.id, e)}
                            className="p-1 hover:bg-rose-100 text-stone-400 hover:text-rose-600 rounded transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : activeSubTab === 'suppliers' ? (
            /* Suppliers Registry quick details / active search list */
            <>
              <div className="relative">
                <Search className="absolute right-2.5 top-2.5 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="ابحث عن تاجر أو كود..."
                  value={supplierSearch}
                  onChange={(e) => setSupplierSupplierSearch(e.target.value)}
                  className="w-full pl-3 pr-8 py-2 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:outline-rose-500"
                />
              </div>

              <button
                onClick={() => setIsCreatingSupplier(true)}
                className="w-full bg-stone-900 hover:bg-stone-800 text-white py-2 px-4 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة وتوثيق تاجر جديد</span>
              </button>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-stone-400 block pb-1 border-b border-stone-100 uppercase tracking-wider">سجل الموردين المعتمدين</span>
                {filteredSuppliers.length === 0 ? (
                  <div className="text-center py-6 text-stone-400 text-[10px]">لا يوجد تجار مسجلين حالياً.</div>
                ) : (
                  filteredSuppliers.map(s => (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSupplierForTimeline(s.id)}
                      className={`p-2.5 rounded-xl cursor-pointer transition-all border ${
                        selectedSupplierForTimeline === s.id
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : 'bg-white hover:bg-stone-100 border-stone-200/50 text-stone-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-rose-600 text-xs">{s.code}</span>
                        <span className="text-[10px] text-stone-400">{s.city || 'منطقة غير محددة'}</span>
                      </div>
                      <h4 className="font-bold text-xs mt-1 text-stone-900 truncate">{s.name}</h4>
                      {s.businessName && <p className="text-[10px] text-stone-400 truncate">{s.businessName}</p>}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            /* Price timeline Filters */
            <div className="space-y-3 font-bold text-xs">
              <span className="text-[10px] font-bold text-stone-400 block pb-1 border-b border-stone-100 uppercase tracking-wider">تصفية مسودات الأسعار</span>
              
              <button
                onClick={() => setObsFilter('all')}
                className={`w-full text-right p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                  obsFilter === 'all' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-white border-stone-200 text-stone-600'
                }`}
              >
                <span>الكل (غير المحددة)</span>
                <span className="bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md text-[10px]">{observations.length}</span>
              </button>

              <button
                onClick={() => setObsFilter('pending')}
                className={`w-full text-right p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                  obsFilter === 'pending' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-white border-stone-200 text-stone-600'
                }`}
              >
                <span>معلقة وبانتظار الاعتماد</span>
                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md text-[10px]">
                  {observations.filter(o => o.approvalStatus === 'pending').length}
                </span>
              </button>

              <button
                onClick={() => setObsFilter('approved')}
                className={`w-full text-right p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                  obsFilter === 'approved' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-white border-stone-200 text-stone-600'
                }`}
              >
                <span>معتمدة رسمياً</span>
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md text-[10px]">
                  {observations.filter(o => o.approvalStatus === 'approved').length}
                </span>
              </button>

              <button
                onClick={() => setObsFilter('rejected')}
                className={`w-full text-right p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                  obsFilter === 'rejected' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-white border-stone-200 text-stone-600'
                }`}
              >
                <span>مرفوضة وملغاة</span>
                <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-md text-[10px]">
                  {observations.filter(o => o.approvalStatus === 'rejected').length}
                </span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------------
          RIGHT CONTENT PANEL: Main Screen View
         ------------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col h-full bg-white relative">
        {activeSubTab === 'chat' ? (
          /* Active Pricing chat session screen */
          activeConvId ? (
            <>
              {/* Chat Session Header */}
              <div className="p-4 border-b border-stone-200 bg-stone-50/40 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-sm text-stone-900">
                    {conversations.find(c => c.id === activeConvId)?.title || 'جلسة المراجعة'}
                  </h3>
                  <span className="text-[10px] text-stone-500 font-bold block">
                    مستندة إلى قاعدة المعرفة التجارية والتاريخ الفعلي للأسعار في أمازون دعاء
                  </span>
                </div>
                <div className="text-[10px] bg-rose-50 text-rose-700 px-3 py-1.5 rounded-xl border border-rose-100 font-bold">
                  🤖 محرك Gemini 3.8-Flash
                </div>
              </div>

              {/* Chat Message Lists scroll area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center h-full py-10 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center border border-rose-100 shadow-xs animate-bounce">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div className="space-y-1 max-w-sm">
                      <h4 className="font-black text-stone-900 text-sm">مساعد الأسعار بذاكرة التجار جاهز!</h4>
                      <p className="text-[11px] text-stone-500 leading-relaxed font-bold">
                        أدخلي رسالة أو ارفعي فاتورة تاجر، مثال: "هذا السعر أخذته اليوم من أبو صالح، منتج سيروم الحلزون بـ 9000" وسيقوم النظام بمطابقة التاجر وحفظ السجل التاريخي تلقائياً.
                      </p>
                    </div>
                  </div>
                ) : (
                  messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 max-w-3xl ${msg.role === 'user' ? 'mr-auto flex-row-reverse' : 'ml-auto'}`}
                    >
                      {/* Avatar */}
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-xs border ${
                        msg.role === 'user' ? 'bg-stone-900 text-white border-stone-800' : 'bg-rose-50 text-rose-600 border-rose-100'
                      }`}>
                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                      </div>

                      {/* Content block */}
                      <div className="space-y-2">
                        <div className={`p-4 rounded-2xl text-xs font-bold leading-relaxed border ${
                          msg.role === 'user'
                            ? 'bg-stone-900 text-white border-stone-800 rounded-tr-none text-right'
                            : 'bg-stone-50 border-stone-200/60 text-stone-800 rounded-tl-none text-right'
                        }`}>
                          <p className="whitespace-pre-line">{msg.content}</p>

                          {/* Image attachments if any */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-3">
                              {msg.attachments.map((att, i) => (
                                <div key={i} className="max-w-xs rounded-xl overflow-hidden border border-stone-200 shadow-sm bg-white p-1">
                                  {att.mimeType.startsWith('image/') ? (
                                    <img src={att.url} alt={att.name} className="max-h-48 object-cover rounded-lg" />
                                  ) : (
                                    <div className="p-3 flex items-center gap-2">
                                      <FileText className="w-6 h-6 text-rose-500" />
                                      <span className="truncate block font-mono text-[10px] text-stone-700">{att.name}</span>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* If Assistant response, render Gorgeous extracted entities cards with action buttons */}
                        {msg.role === 'assistant' && msg.extractedEntities && (msg.extractedEntities.products?.length || 0) > 0 && (
                          <div className="bg-white border border-stone-200 shadow-xs rounded-2xl p-4 space-y-3 max-w-md animate-fadeIn text-right">
                            <h5 className="font-black text-xs text-rose-700 pb-1.5 border-b border-stone-100 flex items-center gap-1.5 justify-end">
                              <span>قائمة الأسعار المكتشفة والمسجلة</span>
                              <Clock className="w-4 h-4" />
                            </h5>

                            <div className="space-y-2.5">
                              {msg.extractedEntities.products?.map((prod: any, idx) => {
                                const matchedObs = observations.find(o => o.productName === prod.name && o.messageId === msg.id) || 
                                  observations.find(o => o.productName === prod.name);
                                
                                const salePrice = Math.round(Number(prod.supplierCost) * 1.3);
                                const isApproved = matchedObs?.approvalStatus === 'approved';
                                const isRejected = matchedObs?.approvalStatus === 'rejected';

                                return (
                                  <div key={idx} className="bg-stone-50 border border-stone-100 rounded-xl p-3 text-[11px] font-bold space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-stone-900 font-extrabold">{prod.name}</span>
                                      {matchedObs && (
                                        <span className={`text-[9px] px-2 py-0.5 rounded-lg border font-bold ${
                                          isApproved
                                            ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                                            : isRejected
                                            ? 'bg-rose-50 border-rose-100 text-rose-800'
                                            : 'bg-amber-50 border-amber-100 text-amber-800 animate-pulse'
                                        }`}>
                                          {isApproved ? 'معتمد' : isRejected ? 'مرفوض' : 'معلق للمراجعة'}
                                        </span>
                                      )}
                                    </div>

                                    <div className="grid grid-cols-3 gap-2 text-[10px] text-stone-500 pt-1 border-t border-stone-100/50">
                                      <div>
                                        <span className="block text-[9px] text-stone-400">تكلفة الشراء</span>
                                        <span className="font-mono text-stone-900">{prod.supplierCost} YER</span>
                                      </div>
                                      <div>
                                        <span className="block text-[9px] text-stone-400">سعر العميل المقترح</span>
                                        <span className="font-mono text-emerald-700 font-black">{salePrice} YER</span>
                                      </div>
                                      <div>
                                        <span className="block text-[9px] text-stone-400">هامش الربح</span>
                                        <span className="text-rose-600 font-black">30%</span>
                                      </div>
                                    </div>

                                    {matchedObs && !isApproved && !isRejected && (
                                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-stone-100/50">
                                        <button
                                          onClick={() => handleApprovePrice(matchedObs.id)}
                                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[9px] py-1.5 rounded-lg cursor-pointer transition-colors text-center"
                                        >
                                          اعتماد ونشر السعر
                                        </button>
                                        <button
                                          onClick={() => handleRejectPrice(matchedObs.id)}
                                          className="bg-stone-200 hover:bg-rose-100 hover:text-rose-700 text-stone-600 font-bold text-[9px] px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
                                        >
                                          رفض
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isSending && (
                  <div className="flex gap-3 max-w-xs mr-auto">
                    <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center animate-spin shrink-0">
                      <Loader2 className="w-4 h-4" />
                    </div>
                    <div className="bg-stone-50 border border-stone-200 p-3 rounded-2xl text-xs font-bold text-stone-500 leading-relaxed animate-pulse">
                      جاري تحليل الفاتورة واستدعاء معلومات الذاكرة...
                    </div>
                  </div>
                )}
                <div ref={messageEndRef} />
              </div>

              {/* Chat Input panel */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-stone-200 bg-stone-50/50 flex flex-col gap-2 relative">
                {attachment && (
                  <div className="flex items-center justify-between bg-white border border-stone-200 px-3 py-1.5 rounded-xl text-[10px] font-bold text-stone-700 max-w-xs animate-fadeIn shadow-xs">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-rose-500" />
                      <span className="truncate max-w-[150px]">{attachment.name}</span>
                    </div>
                    <button type="button" onClick={() => setAttachment(null)} className="text-stone-400 hover:text-stone-800">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {/* Paperclip */}
                  <button
                    type="button"
                    onClick={() => document.getElementById('chat-attachment')?.click()}
                    className="p-3 bg-white hover:bg-stone-100 text-stone-500 hover:text-stone-800 border border-stone-200 rounded-xl transition-all cursor-pointer shrink-0"
                  >
                    <Paperclip className="w-4.5 h-4.5" />
                  </button>
                  <input
                    id="chat-attachment"
                    type="file"
                    accept="image/*,application/pdf,text/plain"
                    onChange={handleAttachmentChange}
                    className="hidden"
                  />

                  {/* Input message text field */}
                  <input
                    type="text"
                    placeholder="اكتبي رسالة تسعير أو استعلام (مثال: كم كان آخر سعر لسيروم X من أبو صالح؟)..."
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    disabled={isSending}
                    className="flex-1 p-3 bg-white border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:outline-rose-500 placeholder:text-stone-400"
                  />

                  {/* Send Button */}
                  <button
                    type="submit"
                    disabled={isSending || (!inputMessage.trim() && !attachment)}
                    className="p-3 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 text-white rounded-xl shadow-md transition-all cursor-pointer shrink-0"
                  >
                    <Send className="w-4.5 h-4.5" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-center h-full py-10 space-y-3">
              <MessageSquare className="w-12 h-12 text-stone-300" />
              <h4 className="font-black text-stone-900 text-sm">لم يتم اختيار أي جلسة محادثة</h4>
              <p className="text-[11px] text-stone-500 max-w-xs font-bold">يرجى الضغط على بدء جلسة تسعير جديدة أو تصفح الجلسات المحفوظة من الشريط الجانبي.</p>
            </div>
          )
        ) : activeSubTab === 'suppliers' ? (
          /* Suppliers Registry Screen View */
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
              <div>
                <h3 className="font-black text-sm text-stone-900 flex items-center gap-1.5">
                  <span>سجل الموردين والتاجر الموحد</span>
                  <TrendingUp className="w-5 h-5 text-rose-600" />
                </h3>
                <p className="text-[10px] text-stone-400">إدارة معلومات الموردين واستعراض تاريخ أسعار الشراء وتجهيز طلبات المشتريات.</p>
              </div>
            </div>

            {selectedSupplierForTimeline ? (
              /* Specific Supplier Details and price history list (Timeline) */
              <div className="space-y-6 animate-fadeIn">
                <button
                  onClick={() => setSelectedSupplierForTimeline(null)}
                  className="text-[10px] bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center gap-1"
                >
                  <ChevronRight className="w-4 h-4" />
                  <span>الرجوع لكافة التجار</span>
                </button>

                {(() => {
                  const s = suppliers.find(su => su.id === selectedSupplierForTimeline);
                  if (!s) return null;

                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start text-xs font-bold">
                      {/* Left: Supplier Info card */}
                      <div className="lg:col-span-1 bg-stone-50 border border-stone-200 rounded-2xl p-5 space-y-4 text-right">
                        <div>
                          <span className="font-mono font-black text-rose-600 text-sm block">{s.code}</span>
                          <h4 className="font-black text-sm text-stone-900 mt-1">{s.name}</h4>
                          {s.businessName && <p className="text-[10px] text-stone-500">{s.businessName}</p>}
                        </div>

                        <div className="space-y-2.5 pt-3 border-t border-stone-200 text-[11px] text-stone-600">
                          <div className="flex justify-between">
                            <span className="text-stone-400">جوال الواتساب:</span>
                            <span className="font-mono text-stone-900">{s.whatsappPhone}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-stone-400">الموقع:</span>
                            <span>{s.city ? `${s.city}، ${s.country}` : s.country}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-stone-400">تاريخ التسجيل:</span>
                            <span className="font-mono">{s.createdAt.split('T')[0]}</span>
                          </div>
                          <div className="pt-2">
                            <span className="text-stone-400 block mb-1">ملاحظات تجارية:</span>
                            <p className="bg-white p-2.5 rounded-xl border border-stone-200 text-stone-700 text-[10px]">{s.notes || 'لا توجد ملاحظات للمورد.'}</p>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-stone-200 flex flex-col gap-2">
                          <button
                            onClick={() => handleOpenWhatsApp(s.whatsappPhone)}
                            className="w-full bg-stone-900 hover:bg-stone-800 text-white font-bold py-2 rounded-xl text-center cursor-pointer transition-colors flex items-center justify-center gap-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>فتح محادثة واتساب</span>
                          </button>
                          <button
                            onClick={() => handleOpenPurchaseMsgDialog(s)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl text-center cursor-pointer transition-colors flex items-center justify-center gap-1"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>تجهيز رسالة طلب الشراء</span>
                          </button>
                        </div>
                      </div>

                      {/* Right: Supplier Price history (Timeline) */}
                      <div className="lg:col-span-2 bg-white border border-stone-200 rounded-2xl p-5 space-y-4 text-right">
                        <h4 className="font-black text-stone-950 text-xs pb-2 border-b border-stone-100 flex items-center gap-1 justify-end">
                          <span>الخط الزمني لأسعار المورد (Price Timeline)</span>
                          <TrendingUp className="w-4 h-4 text-rose-600" />
                        </h4>

                        {supplierPriceHistory.length === 0 ? (
                          <div className="text-center py-10 text-stone-400 text-[10px]">لا توجد أسعار مسجلة مع هذا المورد حتى الآن.</div>
                        ) : (
                          <div className="relative border-r border-stone-100 pr-4 space-y-4">
                            {supplierPriceHistory.map(p => (
                              <div key={p.id} className="relative animate-fadeIn text-[11px] font-bold">
                                {/* Timeline Bullet dot */}
                                <div className={`absolute -right-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${
                                  p.approvalStatus === 'approved' ? 'bg-emerald-500 border-white shadow-xs' : 'bg-amber-400 border-white'
                                }`} />

                                <div className="bg-stone-50 border border-stone-200/60 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-extrabold text-stone-900">{p.productName}</span>
                                      <span className="text-[10px] text-stone-400">{p.observedAt}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 mt-2 text-[10px] text-stone-500">
                                      <div>
                                        <span>تكلفة المورد:</span>
                                        <strong className="text-stone-900 font-mono block">{p.supplierCost} {p.currency}</strong>
                                      </div>
                                      <div>
                                        <span>سعر البيع المقترح:</span>
                                        <strong className="text-emerald-700 font-mono block">{p.calculatedSalePrice} YER</strong>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                                    {p.approvalStatus === 'pending' ? (
                                      <>
                                        <button
                                          onClick={() => handleApprovePrice(p.id)}
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
                                        >
                                          اعتماد
                                        </button>
                                        <button
                                          onClick={() => handleRejectPrice(p.id)}
                                          className="bg-white hover:bg-rose-100 hover:text-rose-700 border border-stone-200 text-stone-600 font-bold text-[10px] px-2 py-1.5 rounded-lg cursor-pointer transition-colors"
                                        >
                                          رفض
                                        </button>
                                      </>
                                    ) : (
                                      <span className={`text-[9px] px-2 py-0.5 rounded-lg border font-black ${
                                        p.approvalStatus === 'approved' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'
                                      }`}>
                                        {p.approvalStatus === 'approved' ? 'مقبول ومعتمد' : 'مرفوض'}
                                      </span>
                                    )}
                                    <button
                                      onClick={() => handleDeletePrice(p.id)}
                                      className="p-1.5 hover:bg-rose-50 text-stone-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* All Suppliers Grid */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-bold">
                {filteredSuppliers.map(s => (
                  <div key={s.id} className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 flex flex-col justify-between text-right space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-rose-600 text-xs">{s.code}</span>
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-100 px-2 py-0.5 rounded-md text-[9px] font-black">نشط</span>
                      </div>
                      <h4 className="font-black text-xs text-stone-900 mt-2 truncate">{s.name}</h4>
                      {s.businessName && <p className="text-[10px] text-stone-400 truncate">{s.businessName}</p>}
                      <p className="text-[10px] text-stone-500 mt-2 font-bold truncate">📞 جوال: {s.whatsappPhone}</p>
                    </div>

                    <div className="pt-3 border-t border-stone-200/50 flex gap-1.5">
                      <button
                        onClick={() => setSelectedSupplierForTimeline(s.id)}
                        className="flex-1 bg-stone-900 hover:bg-stone-800 text-white py-1.5 rounded-xl cursor-pointer text-center text-[10px] transition-colors"
                      >
                        الخط الزمني للأسعار
                      </button>
                      <button
                        onClick={() => handleOpenWhatsApp(s.whatsappPhone)}
                        className="p-1.5 bg-white hover:bg-stone-100 border border-stone-200 text-stone-600 rounded-xl transition-colors cursor-pointer shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* All Price Observations screen ( مسودات الأسعار ) */
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            <div className="pb-4 border-b border-stone-100">
              <h3 className="font-black text-sm text-stone-900">سجل عروض ومسودات أسعار الموردين المستخرجة</h3>
              <p className="text-[10px] text-stone-400">استعرض كافة عينات الأسعار المكتشفة بواسطة الذكاء الاصطناعي، واعتمادها رسمياً لنشرها على المتجر وتحديث قائمة المنتجات.</p>
            </div>

            {filteredObservations.length === 0 ? (
              <div className="text-center py-20 text-stone-400 text-[10px]">لا توجد مسودات أسعار تطابق التصفية الحالية.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs font-bold text-stone-700 border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-400 text-[10px] uppercase">
                      <th className="py-2.5 px-3">التاريخ</th>
                      <th className="py-2.5 px-3">المنتج</th>
                      <th className="py-2.5 px-3">المورد والرمز</th>
                      <th className="py-2.5 px-3 text-left">سعر الشراء</th>
                      <th className="py-2.5 px-3 text-left">سعر العميل المقترح</th>
                      <th className="py-2.5 px-3">الحالة</th>
                      <th className="py-2.5 px-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredObservations.map(obs => {
                      const isApproved = obs.approvalStatus === 'approved';
                      const isRejected = obs.approvalStatus === 'rejected';

                      return (
                        <tr key={obs.id} className="hover:bg-stone-50/50 transition-all">
                          <td className="py-3 px-3 font-mono text-[10px] text-stone-400">{obs.observedAt}</td>
                          <td className="py-3 px-3 font-extrabold text-stone-900">{obs.productName}</td>
                          <td className="py-3 px-3">
                            <span className="font-mono font-black text-rose-600 block text-[10px]">{obs.supplierCode}</span>
                            <span className="text-[10px] text-stone-500">{obs.supplierName}</span>
                          </td>
                          <td className="py-3 px-3 text-left font-mono font-black text-stone-900">{obs.supplierCost} {obs.currency}</td>
                          <td className="py-3 px-3 text-left font-mono font-black text-emerald-700">{obs.calculatedSalePrice} YER</td>
                          <td className="py-3 px-3">
                            <span className={`text-[9px] px-2 py-0.5 rounded-lg border font-black ${
                              isApproved ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : isRejected ? 'bg-rose-50 border-rose-100 text-rose-800' : 'bg-amber-50 border-amber-100 text-amber-800'
                            }`}>
                              {isApproved ? 'معتمد' : isRejected ? 'مرفوض' : 'معلق'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {!isApproved && !isRejected && (
                                <>
                                  <button
                                    onClick={() => handleApprovePrice(obs.id)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[9px] px-2.5 py-1 rounded-lg cursor-pointer"
                                  >
                                    اعتماد
                                  </button>
                                  <button
                                    onClick={() => handleRejectPrice(obs.id)}
                                    className="bg-stone-200 hover:bg-rose-100 text-stone-600 hover:text-rose-700 font-bold text-[9px] px-2 py-1 rounded-lg cursor-pointer"
                                  >
                                    رفض
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => handleDeletePrice(obs.id)}
                                className="p-1 hover:bg-rose-100 text-stone-400 hover:text-rose-600 rounded transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------------
          MODALS & DIALOGS
         ------------------------------------------------------------------- */}

      {/* Create Supplier Dialog Modal */}
      {isCreatingSupplier && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-stone-200 shadow-2xl space-y-4 text-right">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <button onClick={() => setIsCreatingSupplier(false)} className="text-stone-400 hover:text-stone-800 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
              <h3 className="font-black text-sm text-stone-900 flex items-center gap-1.5">
                <span>توثيق وتسجيل مورد جديد</span>
                <Plus className="w-4 h-4 text-rose-600" />
              </h3>
            </div>

            <form onSubmit={handleCreateSupplier} className="space-y-3 font-bold text-xs text-stone-700">
              <div>
                <label className="block text-[10px] text-stone-400 mb-1">اسم المورد المعتمد *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: شركة أبو صالح لمواد التجميل"
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[10px] text-stone-400 mb-1">الاسم التجاري / الشركة</label>
                <input
                  type="text"
                  placeholder="مثال: أبو صالح للتجارة والاستيراد"
                  value={newSupplierBusiness}
                  onChange={(e) => setNewSupplierBusiness(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-[10px] text-stone-400 mb-1">رقم هاتف جوال الواتساب *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 966501234567"
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-left"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">الدولة</label>
                  <input
                    type="text"
                    value={newSupplierCountry}
                    onChange={(e) => setNewSupplierCountry(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1">المدينة</label>
                  <input
                    type="text"
                    placeholder="مثال: صنعاء"
                    value={newSupplierCity}
                    onChange={(e) => setNewSupplierCity(e.target.value)}
                    className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-stone-400 mb-1">ملاحظات تجارية داخلية</label>
                <textarea
                  rows={2}
                  placeholder="اكتب أي معلومات عن الموثوقية، طرق الدفع، الشحن والتخزين..."
                  value={newSupplierNotes}
                  onChange={(e) => setNewSupplierNotes(e.target.value)}
                  className="w-full p-2.5 bg-stone-50 border border-stone-200 rounded-xl text-[11px]"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-3 rounded-xl shadow-md transition-all cursor-pointer text-center text-xs mt-4"
              >
                تأكيد وتسجيل المورد سحابياً
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Prepare Purchase Message Modal */}
      {purchaseMsgSupplier && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-stone-200 shadow-2xl space-y-4 text-right">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <button onClick={() => setPurchaseMsgSupplier(null)} className="text-stone-400 hover:text-stone-800 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
              <h3 className="font-black text-sm text-stone-900 flex items-center gap-1.5">
                <span>تجهيز رسالة طلب الشراء لـ واتساب</span>
                <FileText className="w-4 h-4 text-emerald-600" />
              </h3>
            </div>

            <div className="space-y-3 font-bold text-xs text-stone-700">
              <p className="text-stone-500 leading-relaxed text-[11px]">
                سيقوم النظام بدمج كود المورد وتفاصيل المنتجات وتوليد رسالة رسمية مخصصة لإرسالها للتاجر لتجنب حدوث أي خطأ في طلب الشراء:
              </p>

              <div>
                <label className="block text-[10px] text-stone-400 mb-1">قائمة المنتجات المطلوبة وتفاصيلها</label>
                <textarea
                  rows={4}
                  value={purchaseProductsText}
                  onChange={(e) => setPurchaseProductsText(e.target.value)}
                  className="w-full p-3 bg-stone-50 border border-stone-200 rounded-xl font-mono text-stone-800 text-[11px]"
                />
              </div>

              <button
                onClick={handleCopyPurchaseMsg}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl shadow-md transition-all cursor-pointer text-center text-xs"
              >
                نسخ الرسالة الجاهزة للحافظة
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PricingAIDashboard;
