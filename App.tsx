import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  CreditCard, 
  Trash2, 
  CheckCircle, 
  Circle, 
  Upload, 
  BrainCircuit, 
  Bell,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Tv,
  Zap,
  Edit2,
  Calendar as CalendarIcon,
  X,
  TrendingDown,
  Save,
  Landmark,
  Handshake,
  ListFilter,
  BarChart2,
  Tag,
  Smartphone,
  Share,
  MoreVertical,
  Settings,
  ShieldCheck,
  Lock,
  LogOut,
  FileDown,
  AlertTriangle,
  Wallet,
  CheckCheck,
  Lightbulb,
  Cloud,
  CloudLightning,
  Link as LinkIcon,
  Copy,
  CalendarRange,
  CalendarDays,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Payment, PaymentCategory, PAYMENT_TYPES, PaymentPeriod, AiAnalysisData, CloudConfig } from './types';
import { ImportExcel } from './components/ImportExcel';
import { analyzePayments } from './services/geminiService';
import { createCloudBin, fetchCloudData, updateCloudData } from './services/cloudService';
import { requestNotificationPermission, sendNotification } from './utils/notifications';
import confetti from 'canvas-confetti';

const STORAGE_KEY = 'odeme_takipcisi_data';
const PIN_KEY = 'odeme_takipcisi_pin';
const CLOUD_CONFIG_KEY = 'odeme_takipcisi_cloud_config';
const LAST_NOTIFIED_KEY = 'odeme_takipcisi_last_notified';

const App: React.FC = () => {
  // --- Data State ---
  const [payments, setPayments] = useState<Payment[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // --- Auth / Security State ---
  const [isLocked, setIsLocked] = useState(true);
  const [pinInput, setPinInput] = useState('');
  const [setupPinMode, setSetupPinMode] = useState<'NONE' | 'CREATE' | 'CONFIRM'>('NONE');
  const [tempPin, setTempPin] = useState('');
  const [hasPin, setHasPin] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // --- Cloud Sync State ---
  const [cloudConfig, setCloudConfig] = useState<CloudConfig | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudInputApiKey, setCloudInputApiKey] = useState('');
  const [cloudInputBinId, setCloudInputBinId] = useState('');
  const [showCloudSetup, setShowCloudSetup] = useState<'NONE' | 'CREATE' | 'CONNECT'>('NONE');
  const syncTimeoutRef = useRef<any>(null);
  const ignoreNextCloudPush = useRef(false);

  // --- UI State ---
  const [showImportModal, setShowImportModal] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  
  // View Modes: LIST | DASHBOARD
  const [viewMode, setViewMode] = useState<'LIST' | 'DASHBOARD'>('LIST');

  // Navigation and Logic
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [activeTab, setActiveTab] = useState<PaymentCategory>('LOAN');
  
  // Filter Logic
  const [dateFilterMode, setDateFilterMode] = useState<'MONTH' | 'RANGE'>('MONTH');
  const [customDateRange, setCustomDateRange] = useState<{start: string, end: string}>({
    start: new Date().toISOString().split('T')[0],
    end: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0]
  });
  
  // Payment Modal State
  const [paymentModal, setPaymentModal] = useState<{ isOpen: boolean; paymentId: string | null }>({
    isOpen: false,
    paymentId: null
  });
  const [payAmountInput, setPayAmountInput] = useState<string>('');

  // Add/Edit Modal State
  const [entryModal, setEntryModal] = useState<{ isOpen: boolean; payment: Partial<Payment> | null; isPastPayment?: boolean }>({
    isOpen: false,
    payment: null,
    isPastPayment: false
  });

  // Summary Detail Modal State
  const [summaryModal, setSummaryModal] = useState<{ isOpen: boolean; type: 'EXPECTED' | 'PAID' | null }>({
    isOpen: false,
    type: null
  });

  // --- INITIALIZATION ---

  useEffect(() => {
    // 1. Load Data
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      setPayments(JSON.parse(savedData));
    }
    
    // 2. Load Cloud Config
    const savedCloud = localStorage.getItem(CLOUD_CONFIG_KEY);
    if (savedCloud) {
      const config = JSON.parse(savedCloud);
      setCloudConfig(config);
      handleCloudPull(config); 
    }

    // 3. Check PIN
    const savedPin = localStorage.getItem(PIN_KEY);
    if (savedPin) {
      setHasPin(true);
      setIsLocked(true);
    } else {
      setHasPin(false);
      setIsLocked(false);
    }

    // 4. PWA Checks
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsStandalone(isInStandaloneMode);

    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    // 5. Check notifications on mount
    checkNotifications(new Date());
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payments));

    if (ignoreNextCloudPush.current) {
      ignoreNextCloudPush.current = false;
      return;
    }

    if (cloudConfig) {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        handleCloudPush();
      }, 2000);
    }
  }, [payments, cloudConfig]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      checkNotifications(now);
    }, 60000);
    return () => clearInterval(timer);
  }, [payments]);

  // --- AUTH LOGIC ---

  const handlePinEntry = (num: string) => {
    if (pinInput.length < 4) {
      const newPin = pinInput + num;
      setPinInput(newPin);
      if (newPin.length === 4) {
        if (setupPinMode === 'NONE') {
          const savedPin = localStorage.getItem(PIN_KEY);
          if (newPin === savedPin) {
            setIsLocked(false);
            setPinInput('');
          } else {
            setTimeout(() => setPinInput(''), 300);
            alert("Hatalı PIN!");
          }
        } else if (setupPinMode === 'CREATE') {
          setTempPin(newPin);
          setSetupPinMode('CONFIRM');
          setPinInput('');
        } else if (setupPinMode === 'CONFIRM') {
          if (newPin === tempPin) {
            localStorage.setItem(PIN_KEY, newPin);
            setHasPin(true);
            setSetupPinMode('NONE');
            setIsLocked(false);
            setPinInput('');
            alert("PIN Kodu başarıyla oluşturuldu!");
          } else {
            alert("PIN kodları eşleşmedi. Tekrar deneyin.");
            setSetupPinMode('CREATE');
            setPinInput('');
            setTempPin('');
          }
        }
      }
    }
  };

  const handleBackspace = () => setPinInput(prev => prev.slice(0, -1));
  const removePin = () => { if (window.confirm("PIN korumasını kaldırmak istediğinize emin misiniz?")) { localStorage.removeItem(PIN_KEY); setHasPin(false); setIsLocked(false); } };
  const handleLogout = () => { setIsLocked(true); setPinInput(''); setShowSettings(false); };
  const clearAllData = () => { if (window.confirm("TÜM VERİLER SİLİNECEK! Emin misiniz?")) { setPayments([]); localStorage.removeItem(STORAGE_KEY); alert("Veriler sıfırlandı."); } };

  // --- CLOUD LOGIC ---

  const handleCloudSetup = async (mode: 'CREATE' | 'CONNECT') => {
    const cleanApiKey = cloudInputApiKey.trim();
    const cleanBinId = cloudInputBinId.trim();
    if (!cleanApiKey) { alert("Lütfen bir API Key girin."); return; }
    setIsSyncing(true);
    if (mode === 'CREATE') {
      const binId = await createCloudBin(cleanApiKey, payments);
      if (binId) {
        const newConfig = { apiKey: cleanApiKey, binId, lastSyncedAt: new Date().toISOString() };
        setCloudConfig(newConfig);
        localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(newConfig));
        alert("Cüzdan oluşturuldu!");
        setShowCloudSetup('NONE');
      } else {
        alert("Cüzdan oluşturulamadı.");
      }
    } else {
      if (!cleanBinId) { alert("Bağlanmak için Cüzdan Kimliği gereklidir."); setIsSyncing(false); return; }
      const data = await fetchCloudData(cleanBinId, cleanApiKey);
      if (data) {
        ignoreNextCloudPush.current = true;
        setPayments(data);
        const newConfig = { apiKey: cleanApiKey, binId: cleanBinId, lastSyncedAt: new Date().toISOString() };
        setCloudConfig(newConfig);
        localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(newConfig));
        alert("Bağlanıldı!");
        setShowCloudSetup('NONE');
      } else {
        alert("Bağlantı başarısız.");
      }
    }
    setIsSyncing(false);
  };

  const handleCloudPull = async (config = cloudConfig) => {
    if (!config) return;
    setIsSyncing(true);
    const data = await fetchCloudData(config.binId, config.apiKey);
    if (data) {
      ignoreNextCloudPush.current = true;
      setPayments(data);
      const updatedConfig = { ...config, lastSyncedAt: new Date().toISOString() };
      setCloudConfig(updatedConfig);
      localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(updatedConfig));
    }
    setIsSyncing(false);
  };

  const handleCloudPush = async () => {
    if (!cloudConfig) return;
    const success = await updateCloudData(cloudConfig.binId, cloudConfig.apiKey, payments);
    if (success) {
       const updatedConfig = { ...cloudConfig, lastSyncedAt: new Date().toISOString() };
       setCloudConfig(updatedConfig);
       localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(updatedConfig));
    }
  };

  const disconnectCloud = () => { if (window.confirm("Bulut bağlantısını kesmek istiyor musunuz?")) { setCloudConfig(null); localStorage.removeItem(CLOUD_CONFIG_KEY); setCloudInputApiKey(''); setCloudInputBinId(''); } };

  // --- Date Helpers ---

  const getAdjustedDate = (dateStr: string): Date => {
    const date = new Date(dateStr);
    const day = date.getDay();
    if (day === 6) { date.setDate(date.getDate() + 2); } else if (day === 0) { date.setDate(date.getDate() + 1); }
    return date;
  };

  const isWeekendAdjusted = (dateStr: string): boolean => {
    const original = new Date(dateStr);
    const adjusted = getAdjustedDate(dateStr);
    return original.getTime() !== adjusted.getTime();
  };

  const checkNotifications = (now: Date) => {
    const hours = now.getHours();
    const todayStr = now.toISOString().split('T')[0];
    const lastNotified = localStorage.getItem(LAST_NOTIFIED_KEY);
    
    // Sadece saat 10:00 - 22:00 arası ve bugün henüz bildirim atılmadıysa
    if (hours < 10 || hours > 22 || lastNotified === todayStr) return;

    const dueToday = payments.filter(p => {
      if (p.isPaid) return false;
      const adjustedDate = getAdjustedDate(p.date);
      const adjustedDateStr = adjustedDate.toISOString().split('T')[0];
      return adjustedDateStr === todayStr;
    });

    if (dueToday.length > 0) {
      sendNotification("Ödeme Hatırlatıcı 🔔", `Bugün ödenmesi gereken ${dueToday.length} ödemeniz var!`);
      localStorage.setItem(LAST_NOTIFIED_KEY, todayStr);
    }
  };

  const handleImport = (importedPayments: Payment[], mode: 'APPEND' | 'REPLACE') => {
    if (mode === 'REPLACE') {
       if (window.confirm("DİKKAT: Tüm verileriniz silinecek. Emin misiniz?")) { setPayments(importedPayments); } else { return; }
    } else {
       setPayments(prev => [...prev, ...importedPayments]);
    }
    setShowImportModal(false);
    setShowSettings(false);
  };

  const handleExport = () => {
    const exportData = payments.map(p => ({
      'Ad': p.name,
      'Ödeme Türü': p.paymentType,
      'Miktar': p.amount,
      'Tarih': p.date, 
      'Bitiş Tarihi': p.endDate || '',
      'Asgari Tutar': p.minimumPaymentAmount || '',
      'Periyot': p.period || 'Aylık',
      'Etiket': p.customTag || '',
      'Taahhüt Bitiş Tarihi': p.commitmentEndDate || '',
      'Otomatik Ödeme': p.autoPayment ? 'Evet' : 'Hayır',
      'Otomatik Ödeme Bankası': p.autoPaymentBank || '',
      'Durum': p.isPaid ? 'Ödendi' : 'Bekliyor',
      'Ödenen Tutar': p.paidAmount || 0
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Yedek");
    XLSX.writeFile(wb, `odeme_yedek_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleInstallClick = () => { if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.then((choiceResult: any) => { if (choiceResult.outcome === 'accepted') setDeferredPrompt(null); }); } else { setShowInstallHelp(true); } };
  const toggleAutoPayment = (id: string, currentStatus: boolean | undefined) => { setPayments(prev => prev.map(p => p.id === id ? { ...p, autoPayment: !currentStatus } : p )); };

  // --- Logic Helpers ---

  const determineCategory = (type: string): PaymentCategory => {
    const t = type.toLowerCase();
    if (t.includes('dijital')) return 'DIGITAL';
    if (t.includes('fatura')) return 'BILL';
    if (t.includes('kart')) return 'CARD';
    if (t.includes('kredi')) return 'LOAN';
    return 'BILL';
  };

  const validatePaymentEntry = (p: Partial<Payment>): string | null => {
    if (!p.name || !p.date || !p.paymentType) return "Temel alanları doldurun.";
    if (p.paymentType === 'Kredi' && !p.endDate) return "Krediler için Bitiş Tarihi zorunludur.";
    if (p.paymentType === 'Kredi Kartı' && (p.minimumPaymentAmount === undefined || p.minimumPaymentAmount === null)) return "Asgari Tutar zorunludur (0 girebilirsiniz).";
    return null;
  };

  // --- Actions ---

  const savePaymentEntry = () => {
    const p = entryModal.payment;
    if (!p) return;
    const error = validatePaymentEntry(p);
    if (error) { alert(error); return; }
    const category = determineCategory(p.paymentType || 'Fatura');
    const isPastEntry = entryModal.isPastPayment;
    const finalAmount = p.amount !== undefined ? Number(p.amount) : 0;
    if (p.id) {
      setPayments(prev => prev.map(item => item.id === p.id ? { ...item, ...p, amount: finalAmount, category } as Payment : item));
    } else {
      const newPayment: Payment = {
        id: `manual-${Date.now()}`,
        name: p.name!,
        paymentType: p.paymentType!,
        category: category,
        amount: finalAmount,
        paidAmount: isPastEntry ? finalAmount : 0,
        minimumPaymentAmount: p.minimumPaymentAmount ? Number(p.minimumPaymentAmount) : undefined,
        date: p.date!,
        isPaid: isPastEntry || false,
        endDate: p.endDate,
        period: p.period || 'MONTHLY',
        customTag: p.customTag,
        commitmentEndDate: p.commitmentEndDate,
        autoPayment: p.autoPayment,
        autoPaymentBank: p.autoPaymentBank
      };
      setPayments(prev => [...prev, newPayment]);
    }
    setEntryModal({ isOpen: false, payment: null });
  };

  const duplicatePayment = () => {
    const p = entryModal.payment;
    if (!p || !p.date) return;
    const currentD = new Date(p.date);
    currentD.setMonth(currentD.getMonth() + 1);
    const nextDateStr = currentD.toISOString().split('T')[0];
    const newPayment: Payment = {
        id: `copy-${Date.now()}`,
        name: p.name || 'Kopya',
        paymentType: p.paymentType || 'Fatura',
        category: determineCategory(p.paymentType || ''),
        amount: Number(p.amount || 0),
        paidAmount: 0,
        minimumPaymentAmount: p.minimumPaymentAmount ? Number(p.minimumPaymentAmount) : undefined,
        date: nextDateStr,
        isPaid: false,
        endDate: p.endDate,
        period: p.period || 'MONTHLY',
        customTag: p.customTag,
        commitmentEndDate: p.commitmentEndDate,
        autoPayment: p.autoPayment,
        autoPaymentBank: p.autoPaymentBank
    };
    setPayments(prev => [...prev, newPayment]);
    setEntryModal({ isOpen: false, payment: null });
    confetti({ particleCount: 30, spread: 50, origin: { y: 0.7 } });
  };

  const openPaymentModal = (id: string) => {
    const payment = payments.find(p => p.id === id);
    if (!payment) return;
    setPayAmountInput(payment.amount > 0 ? payment.amount.toString() : '');
    setPaymentModal({ isOpen: true, paymentId: id });
  };

  const confirmPayment = () => {
    if (!paymentModal.paymentId) return;
    const paidVal = parseFloat(payAmountInput);
    if (isNaN(paidVal)) { alert("Geçerli bir tutar girin"); return; }
    setPayments(prev => {
      const currentPayment = prev.find(p => p.id === paymentModal.paymentId);
      if (!currentPayment) return prev;
      const finalOriginalAmount = currentPayment.amount === 0 ? paidVal : currentPayment.amount;
      const updatedPayments = prev.map(p => p.id === paymentModal.paymentId ? { ...p, isPaid: true, paidAmount: paidVal, amount: finalOriginalAmount } : p );
      const isFixedTermLoan = currentPayment.category === 'LOAN'; 
      if (!isFixedTermLoan) {
        const pDate = new Date(currentPayment.date);
        const nextDate = new Date(pDate);
        switch (currentPayment.period) {
          case 'WEEKLY': nextDate.setDate(nextDate.getDate() + 7); break;
          case 'BIWEEKLY': nextDate.setDate(nextDate.getDate() + 14); break;
          case 'ANNUAL': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
          default: nextDate.setMonth(nextDate.getMonth() + 1); break;
        }
        const nextDateStr = nextDate.toISOString().split('T')[0];
        let shouldGenerate = true;
        if (currentPayment.endDate && nextDate > new Date(currentPayment.endDate)) shouldGenerate = false;
        if (shouldGenerate) {
          const newPayment: Payment = { ...currentPayment, id: `auto-${Date.now()}`, date: nextDateStr, isPaid: false, paidAmount: 0, amount: currentPayment.amount === 0 ? 0 : currentPayment.amount };
          updatedPayments.push(newPayment);
        }
      }
      return updatedPayments;
    });
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    setPaymentModal({ isOpen: false, paymentId: null });
  };

  const deletePayment = (id: string) => { if (window.confirm("Silmek istediğinize emin misiniz?")) setPayments(prev => prev.filter(p => p.id !== id)); };

  const changeMonth = (delta: number) => { const newDate = new Date(selectedDate); newDate.setMonth(newDate.getMonth() + delta); setSelectedDate(newDate); };

  const getPaymentsForCurrentView = () => {
    if (dateFilterMode === 'MONTH') {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth();
      return payments.filter(p => {
        const pDate = new Date(p.date);
        return pDate.getFullYear() === year && pDate.getMonth() === month;
      });
    } else {
      const start = new Date(customDateRange.start); start.setHours(0,0,0,0);
      const end = new Date(customDateRange.end); end.setHours(23,59,59,999);
      return payments.filter(p => { const pDate = new Date(p.date); return pDate >= start && pDate <= end; });
    }
  };

  const getTabPayments = () => {
    return getPaymentsForCurrentView()
      .filter(p => p.category === activeTab)
      .sort((a, b) => {
        // 1. Ödenmeyenler üstte (isPaid: false -> 0, true -> 1)
        if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
        // 2. Kendi içlerinde tarihe göre
        return getAdjustedDate(a.date).getTime() - getAdjustedDate(b.date).getTime();
      });
  };

  const handleAIAnalysis = async () => { if (payments.length === 0) { alert("Analiz için veri gerekli."); return; } setIsAnalyzing(true); const result = await analyzePayments(payments); setAiAnalysis(result); setIsAnalyzing(false); };

  const displayedPayments = getPaymentsForCurrentView();
  const filteredList = getTabPayments();
  const tabTotalAmount = filteredList.reduce((sum, p) => sum + p.amount, 0);
  const tabPaidAmount = filteredList.reduce((sum, p) => sum + (p.paidAmount || 0), 0);
  const globalTotalAmount = displayedPayments.reduce((sum, p) => sum + p.amount, 0);
  const monthName = selectedDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  const getDashboardStats = () => {
    const now = new Date();
    const trendData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear(); const month = d.getMonth();
      const total = payments.filter(p => { const pd = new Date(p.date); return pd.getFullYear() === year && pd.getMonth() === month && p.isPaid; }).reduce((sum, p) => sum + (p.paidAmount || 0), 0);
      trendData.push({ label: d.toLocaleDateString('tr-TR', { month: 'short' }), amount: total });
    }
    const breakdown = { LOAN: 0, CARD: 0, DIGITAL: 0, BILL: 0 };
    displayedPayments.forEach(p => { breakdown[p.category] += p.amount; });
    const tagBreakdown: Record<string, number> = {};
    displayedPayments.forEach(p => { if (p.customTag) tagBreakdown[p.customTag] = (tagBreakdown[p.customTag] || 0) + p.amount; });
    return { trendData, breakdown, tagBreakdown };
  };

  const dashboardStats = getDashboardStats();

  const handleDateChangeInModal = (dateStr: string) => {
    const selected = new Date(dateStr); const today = new Date(); today.setHours(0,0,0,0);
    const isPast = selected < today;
    setEntryModal(prev => ({ ...prev, payment: { ...prev.payment, date: dateStr }, isPastPayment: isPast }));
  };

  if (isLocked) {
    return (
      <div className="min-h-screen bg-blue-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center">
           <div className="mb-6 flex justify-center"><div className="bg-blue-100 p-4 rounded-full"><Lock className="w-10 h-10 text-blue-600" /></div></div>
           <h2 className="text-2xl font-bold text-gray-800 mb-2">{setupPinMode === 'CREATE' ? 'Yeni PIN Oluştur' : setupPinMode === 'CONFIRM' ? 'PIN Doğrula' : 'Hoşgeldiniz'}</h2>
           <p className="text-gray-500 mb-6 text-sm">Devam etmek için 4 haneli PIN kodunuzu girin.</p>
           <div className="flex justify-center gap-4 mb-8">
             {[0, 1, 2, 3].map(i => (<div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${pinInput.length > i ? 'bg-blue-600 border-blue-600' : 'bg-transparent border-gray-300'}`} />))}
           </div>
           <div className="grid grid-cols-3 gap-4 mb-4">
             {[1,2,3,4,5,6,7,8,9].map(num => (<button key={num} onClick={() => handlePinEntry(num.toString())} className="h-16 rounded-2xl bg-gray-50 text-2xl font-bold text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition">{num}</button>))}
             <div /><button onClick={() => handlePinEntry("0")} className="h-16 rounded-2xl bg-gray-50 text-2xl font-bold text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition">0</button>
             <button onClick={handleBackspace} className="h-16 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition"><ChevronLeft className="w-8 h-8" /></button>
           </div>
           {!hasPin && setupPinMode === 'NONE' && (<button onClick={() => setSetupPinMode('CREATE')} className="text-blue-600 text-sm font-semibold mt-4">PIN Oluştur</button>)}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto border-x border-gray-200 shadow-xl relative pb-24">
      
      {/* Header */}
      <div className="bg-blue-600 text-white p-6 rounded-b-3xl shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">Ödemelerim</h1>
              <p className="text-blue-100 text-sm opacity-90">{currentTime.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
            <div className="flex gap-2">
              {cloudConfig && (<button onClick={() => handleCloudPull(cloudConfig)} disabled={isSyncing} className="p-2 bg-indigo-500 rounded-full hover:bg-indigo-400 transition shadow-lg border border-indigo-400">{isSyncing ? (<RefreshCw className="w-5 h-5 animate-spin text-white" />) : (<CloudLightning className="w-5 h-5 text-white" />)}</button>)}
              {!isStandalone && (<button onClick={handleInstallClick} className="p-2 bg-green-500 rounded-full hover:bg-green-400 shadow-lg"><Smartphone className="w-5 h-5 text-white" /></button>)}
              <button onClick={() => requestNotificationPermission()} className="p-2 bg-blue-500 rounded-full hover:bg-blue-400"><Bell className="w-5 h-5" /></button>
              <button onClick={() => setShowSettings(true)} className="p-2 bg-blue-700 rounded-full hover:bg-blue-500 relative"><Settings className="w-5 h-5" />{cloudConfig && <span className="absolute top-1 right-1 w-2 h-2 bg-green-400 rounded-full border border-blue-700"></span>}</button>
            </div>
          </div>

          <div className="flex bg-blue-800/50 p-1 rounded-lg mb-4">
            <button onClick={() => setViewMode('LIST')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'LIST' ? 'bg-white text-blue-700 shadow-sm' : 'text-blue-200 hover:text-white'}`}><ListFilter className="w-4 h-4" /> Liste</button>
            <button onClick={() => setViewMode('DASHBOARD')} className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'DASHBOARD' ? 'bg-white text-blue-700 shadow-sm' : 'text-blue-200 hover:text-white'}`}><BarChart2 className="w-4 h-4" /> İstatistikler</button>
          </div>

          {viewMode === 'LIST' && (
            <>
              <div className="bg-blue-700/50 rounded-lg p-2 mb-4 flex flex-col gap-2">
                 <div className="flex items-center justify-center gap-3 mb-1">
                    <button onClick={() => setDateFilterMode('MONTH')} className={`text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 transition ${dateFilterMode === 'MONTH' ? 'bg-white text-blue-700' : 'text-blue-200 hover:bg-blue-600/50'}`}><CalendarDays className="w-3 h-3"/> Aylık Görünüm</button>
                    <button onClick={() => setDateFilterMode('RANGE')} className={`text-[10px] font-bold px-3 py-1 rounded-full flex items-center gap-1 transition ${dateFilterMode === 'RANGE' ? 'bg-white text-blue-700' : 'text-blue-200 hover:bg-blue-600/50'}`}><CalendarRange className="w-3 h-3"/> Tarih Aralığı</button>
                 </div>
                 {dateFilterMode === 'MONTH' ? (<div className="flex items-center justify-between"><button onClick={() => changeMonth(-1)} className="p-1 hover:bg-blue-600 rounded text-white"><ChevronLeft className="w-5 h-5" /></button><span className="font-semibold text-white">{monthName}</span><button onClick={() => changeMonth(1)} className="p-1 hover:bg-blue-600 rounded text-white"><ChevronRight className="w-5 h-5" /></button></div>) : (<div className="flex items-center gap-2 bg-blue-800/30 p-1.5 rounded-lg"><input type="date" value={customDateRange.start} onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))} className="flex-1 bg-white/10 border border-blue-400/30 rounded px-2 py-1 text-xs text-white outline-none focus:border-white"/><span className="text-white text-xs">-</span><input type="date" value={customDateRange.end} onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))} className="flex-1 bg-white/10 border border-blue-400/30 rounded px-2 py-1 text-xs text-white outline-none focus:border-white"/></div>)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setSummaryModal({ isOpen: true, type: 'EXPECTED' })} className="bg-white/10 backdrop-blur-md rounded-xl p-3 text-left transition hover:bg-white/20 active:scale-95"><p className="text-blue-100 text-[10px] uppercase tracking-wide">Beklenen</p><p className="text-xl font-bold">{tabTotalAmount.toLocaleString('tr-TR')} ₺</p></button>
                <button onClick={() => setSummaryModal({ isOpen: true, type: 'PAID' })} className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10 text-left transition hover:bg-white/20 active:scale-95"><p className="text-green-300 text-[10px] uppercase tracking-wide">Ödenen</p><p className="text-xl font-bold text-green-300">{tabPaidAmount.toLocaleString('tr-TR')} ₺</p></button>
              </div>
            </>
          )}
        </div>
      </div>

      {viewMode === 'LIST' ? (
        <>
          <div className="flex items-center justify-around mt-4 px-4 border-b border-gray-200">
            {[{ id: 'LOAN', label: 'Krediler', icon: Landmark },{ id: 'CARD', label: 'Kartlar', icon: CreditCard },{ id: 'DIGITAL', label: 'Dijital', icon: Tv },{ id: 'BILL', label: 'Faturalar', icon: Zap }].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as PaymentCategory)} className={`flex flex-col items-center gap-1 pb-3 px-2 border-b-2 transition-all ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400'}`}><tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'}`} /><span className="text-xs font-medium">{tab.label}</span></button>
            ))}
          </div>

          <div className="px-6 mt-4"><button onClick={handleAIAnalysis} className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-3 rounded-xl shadow-md flex items-center justify-center gap-2 hover:opacity-90 transition active:scale-95">{isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}<span className="text-xs font-semibold">Mali Analiz</span></button></div>

          {aiAnalysis && (
            <div className={`mx-6 mt-4 border p-5 rounded-2xl shadow-lg relative ${aiAnalysis.status === 'DANGER' ? 'bg-red-50 border-red-200' : aiAnalysis.status === 'WARNING' ? 'bg-orange-50 border-orange-200' : 'bg-indigo-50 border-indigo-100'}`}>
              <button onClick={() => setAiAnalysis(null)} className="absolute top-3 right-3 text-gray-400"><X className="w-5 h-5" /></button>
              <div className="flex items-center gap-2 mb-4"><div className={`p-2 rounded-full ${aiAnalysis.status === 'DANGER' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}><BrainCircuit className="w-5 h-5" /></div><h3 className="font-bold text-gray-800 text-sm">Yapay Zeka Raporu</h3></div>
              <p className="text-xs text-gray-600 leading-relaxed">{aiAnalysis.summary}</p>
              <p className="text-xs text-indigo-700 mt-2 italic">"{aiAnalysis.advice}"</p>
            </div>
          )}

          <div className="flex-1 px-4 mt-4 space-y-3 overflow-y-auto">
            {filteredList.length === 0 ? (<div className="text-center text-gray-400 mt-10"><CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-30" /><p>Kayıt bulunamadı.</p></div>) : (
              filteredList.map((payment) => {
                const adjustedDate = getAdjustedDate(payment.date); const isAdjusted = isWeekendAdjusted(payment.date);
                const isOverdue = !payment.isPaid && new Date(adjustedDate) < new Date(new Date().setHours(0,0,0,0));
                return (
                  <div key={payment.id} className={`bg-white p-4 rounded-xl border relative transition-all ${payment.isPaid ? 'border-green-100 bg-green-50/30 opacity-80' : isOverdue ? 'border-red-200 shadow-red-100 shadow-md' : 'border-gray-100 shadow-sm'}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3">
                        <button onClick={() => !payment.isPaid && openPaymentModal(payment.id)} disabled={payment.isPaid} className="mt-1">{payment.isPaid ? <CheckCircle className="w-6 h-6 text-green-500" /> : <Circle className={`w-6 h-6 ${isOverdue ? 'text-red-400' : 'text-gray-300'}`} />}</button>
                        <div>
                          <h3 className={`font-bold ${payment.isPaid ? 'text-gray-500' : 'text-gray-800'}`}>{payment.name}</h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500">{payment.paymentType}</span>
                            {payment.customTag && (<span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-50 text-pink-600 border border-pink-100">{payment.customTag}</span>)}
                          </div>
                          {isOverdue && !payment.isPaid && <p className="text-xs text-red-500 font-bold mt-1">Gecikti!</p>}
                          {!payment.isPaid && payment.minimumPaymentAmount !== undefined && <p className="text-[10px] text-orange-600 mt-1">Asgari: {payment.minimumPaymentAmount.toLocaleString('tr-TR')} ₺</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${payment.isPaid ? 'text-gray-400' : 'text-gray-900'}`}>{payment.amount.toLocaleString('tr-TR')} ₺</p>
                        <p className={`text-xs mt-1 ${isAdjusted ? 'text-blue-600' : 'text-gray-400'}`}>{adjustedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</p>
                        {!payment.isPaid && (<button onClick={() => setEntryModal({ isOpen: true, payment })} className="text-gray-300 hover:text-blue-500 ml-2 mt-1"><Edit2 className="w-3.5 h-3.5" /></button>)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 px-4 mt-4 pb-20 overflow-y-auto">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4"><h3 className="font-bold text-gray-800 mb-4">6 Aylık Trend</h3><div className="h-40 flex items-end justify-between gap-2">{dashboardStats.trendData.map((data, idx) => { const maxVal = Math.max(...dashboardStats.trendData.map(d => d.amount)) || 1; return (<div key={idx} className="flex flex-col items-center flex-1"><div className="w-full bg-blue-100 rounded-t-md relative hover:bg-blue-200 transition-colors" style={{ height: `${(data.amount / maxVal) * 100 || 2}%` }}><div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] py-1 px-2 rounded opacity-0 hover:opacity-100 z-10">{data.amount.toLocaleString('tr-TR')}</div></div><span className="text-[10px] text-gray-500 mt-2">{data.label}</span></div>);})}</div></div>
        </div>
      )}
      
      <button onClick={() => setEntryModal({ isOpen: true, payment: { date: new Date().toISOString().split('T')[0], paymentType: 'Fatura' } })} className="fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg z-40"><Plus className="w-6 h-6" /></button>

      {entryModal.isOpen && entryModal.payment && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto no-scrollbar">
            <h3 className="text-lg font-bold text-gray-800 mb-4">{entryModal.payment.id ? 'Düzenle' : 'Ödeme Ekle'}</h3>
            <div className="space-y-4">
              <div><label className="text-xs font-semibold text-gray-500">Ad</label><input type="text" value={entryModal.payment.name || ''} onChange={(e) => setEntryModal({ ...entryModal, payment: { ...entryModal.payment, name: e.target.value } })} className="w-full border rounded-lg p-2" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-gray-500">Tür</label><select value={entryModal.payment.paymentType || 'Fatura'} onChange={(e) => setEntryModal({ ...entryModal, payment: { ...entryModal.payment, paymentType: e.target.value } })} className="w-full border rounded-lg p-2 bg-white">{PAYMENT_TYPES.map(t => (<option key={t} value={t}>{t}</option>))}</select></div>
                <div><label className="text-xs font-semibold text-gray-500">Tutar</label><input type="number" value={entryModal.payment.amount || ''} onChange={(e) => setEntryModal({ ...entryModal, payment: { ...entryModal.payment, amount: Number(e.target.value) } })} className="w-full border rounded-lg p-2" /></div>
              </div>
              <div><label className="text-xs font-semibold text-gray-500">Tarih</label><input type="date" value={entryModal.payment.date || ''} onChange={(e) => handleDateChangeInModal(e.target.value)} className="w-full border rounded-lg p-2" /></div>
              
              {entryModal.payment.paymentType === 'Kredi Kartı' && (
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <label className="text-xs font-bold text-blue-800">Asgari Ödeme Tutarı</label>
                  <input type="number" value={entryModal.payment.minimumPaymentAmount !== undefined ? entryModal.payment.minimumPaymentAmount : ''} onChange={(e) => setEntryModal({ ...entryModal, payment: { ...entryModal.payment, minimumPaymentAmount: Number(e.target.value) } })} className="w-full border border-blue-200 rounded-lg p-2 mt-1" placeholder="0 girebilirsiniz" />
                </div>
              )}

              {entryModal.payment.paymentType === 'Kredi' && (
                <div className="bg-orange-50 p-3 rounded-lg border border-orange-100"><label className="text-xs font-bold text-orange-800">Kredi Bitiş Tarihi</label><input type="date" value={entryModal.payment.endDate || ''} onChange={(e) => setEntryModal({ ...entryModal, payment: { ...entryModal.payment, endDate: e.target.value } })} className="w-full border border-orange-200 rounded-lg p-2 mt-1" /></div>
              )}
            </div>
            <div className="flex gap-3 mt-6">
              {entryModal.payment.id && (<button onClick={duplicatePayment} className="p-3 bg-purple-100 text-purple-600 rounded-xl"><Copy className="w-4 h-4" /></button>)}
              <button onClick={() => setEntryModal({ isOpen: false, payment: null })} className="flex-1 py-3 text-gray-600">İptal</button>
              <button onClick={savePaymentEntry} className="flex-1 py-3 bg-blue-600 text-white font-semibold rounded-xl">Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {paymentModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm"><div className="bg-white rounded-2xl p-6 w-full max-w-sm"><h3 className="text-lg font-bold mb-4">Ödeme Yap</h3><input type="number" value={payAmountInput} onChange={(e) => setPayAmountInput(e.target.value)} className="w-full text-2xl font-bold p-3 border rounded-xl mb-6" /><div className="flex gap-3"><button onClick={() => setPaymentModal({ isOpen: false, paymentId: null })} className="flex-1 py-3 text-gray-500">İptal</button><button onClick={confirmPayment} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl">Öde</button></div></div></div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold">Ayarlar</h3><button onClick={() => setShowSettings(false)}><X className="w-6 h-6" /></button></div>
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-xl"><h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Veri Yönetimi</h4><div className="grid grid-cols-2 gap-2"><button onClick={handleExport} className="p-3 bg-white border rounded-lg text-sm flex items-center gap-2 justify-center"><FileDown className="w-4 h-4" /> Yedekle</button><button onClick={() => setShowImportModal(true)} className="p-3 bg-white border rounded-lg text-sm flex items-center gap-2 justify-center"><Upload className="w-4 h-4" /> Yükle</button></div></div>
              <button onClick={handleLogout} className="w-full p-3 border rounded-lg text-red-500 flex items-center justify-between">Ekranı Kilitle <LogOut className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}
      
      {showImportModal && (<ImportExcel onImport={handleImport} onCancel={() => setShowImportModal(false)} />)}
    </div>
  );
};

export default App;