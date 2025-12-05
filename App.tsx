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
  Copy
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

const App: React.FC = () => {
  // --- Data State ---
  const [payments, setPayments] = useState<Payment[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // --- Auth / Security State ---
  const [isLocked, setIsLocked] = useState(true); // Default locked until checked
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
  const ignoreNextCloudPush = useRef(false); // Prevents sync loop (echo-push)

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
      // Auto-fetch latest data from cloud on app start
      handleCloudPull(config); 
    }

    // REMOVED: Automatic notification request on load (caused error)
    // requestNotificationPermission();

    // 3. Check PIN
    const savedPin = localStorage.getItem(PIN_KEY);
    if (savedPin) {
      setHasPin(true);
      setIsLocked(true); // Lock if PIN exists
    } else {
      setHasPin(false);
      setIsLocked(false); // Unlock if no PIN
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
  }, []);

  // Save data on change (Local + Cloud Auto Push)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payments));

    // If this update came from the cloud, don't push it back!
    if (ignoreNextCloudPush.current) {
      ignoreNextCloudPush.current = false;
      return;
    }

    // Cloud Auto Sync Logic (Debounced)
    if (cloudConfig) {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      
      syncTimeoutRef.current = setTimeout(() => {
        handleCloudPush();
      }, 2000); // Wait 2 seconds after last change before pushing
    }
  }, [payments, cloudConfig]);

  // Timer for Notifications
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
      
      // Auto submit on 4th digit
      if (newPin.length === 4) {
        if (setupPinMode === 'NONE') {
          // Unlock Mode
          const savedPin = localStorage.getItem(PIN_KEY);
          if (newPin === savedPin) {
            setIsLocked(false);
            setPinInput('');
          } else {
            // Shake effect logic could go here
            setTimeout(() => setPinInput(''), 300);
            alert("Hatalı PIN!");
          }
        } else if (setupPinMode === 'CREATE') {
          // Creating PIN step 1
          setTempPin(newPin);
          setSetupPinMode('CONFIRM');
          setPinInput('');
        } else if (setupPinMode === 'CONFIRM') {
          // Creating PIN step 2
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

  const handleBackspace = () => {
    setPinInput(prev => prev.slice(0, -1));
  };

  const removePin = () => {
    if (window.confirm("PIN korumasını kaldırmak istediğinize emin misiniz?")) {
      localStorage.removeItem(PIN_KEY);
      setHasPin(false);
      setIsLocked(false);
    }
  };

  const handleLogout = () => {
    setIsLocked(true);
    setPinInput('');
    setShowSettings(false);
  };

  const clearAllData = () => {
    if (window.confirm("TÜM VERİLER SİLİNECEK! Bu işlem geri alınamaz. Emin misiniz?")) {
       setPayments([]);
       localStorage.removeItem(STORAGE_KEY);
       alert("Veriler sıfırlandı.");
    }
  };

  // --- CLOUD LOGIC ---

  const handleCloudSetup = async (mode: 'CREATE' | 'CONNECT') => {
    const cleanApiKey = cloudInputApiKey.trim();
    const cleanBinId = cloudInputBinId.trim();

    if (!cleanApiKey) {
      alert("Lütfen bir Erişim Anahtarı (API Key) girin.");
      return;
    }

    setIsSyncing(true);

    if (mode === 'CREATE') {
      // Create new bin with current local data
      // Not: Artık serviste veri sarmalanarak gönderiliyor, boş hatası çıkmayacak.
      const binId = await createCloudBin(cleanApiKey, payments);
      if (binId) {
        const newConfig = { apiKey: cleanApiKey, binId, lastSyncedAt: new Date().toISOString() };
        setCloudConfig(newConfig);
        localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(newConfig));
        alert("Gizli Cüzdan başarıyla oluşturuldu!\n\nID'niz oluşturuldu. Şimdi bu ID ve API Key'i diğer cihazlarınızda 'Cüzdana Bağlan' diyerek kullanabilirsiniz.");
        setShowCloudSetup('NONE');
      } else {
        alert("Cüzdan oluşturulamadı. API Key'in geçerli olduğundan ve 'Create' iznine sahip olduğundan emin olun.");
      }
    } else {
      // Connect to existing bin
      if (!cleanBinId) {
        alert("Bağlanmak için Cüzdan Kimliği (ID) gereklidir.");
        setIsSyncing(false);
        return;
      }
      
      const data = await fetchCloudData(cleanBinId, cleanApiKey);
      if (data) {
        ignoreNextCloudPush.current = true; // Don't push back what we just pulled
        setPayments(data); // Replace local with cloud
        const newConfig = { apiKey: cleanApiKey, binId: cleanBinId, lastSyncedAt: new Date().toISOString() };
        setCloudConfig(newConfig);
        localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(newConfig));
        alert("Cüzdana başarıyla bağlanıldı! Veriler indirildi.");
        setShowCloudSetup('NONE');
      } else {
        alert("Bağlantı başarısız. Kimlikleri veya yetkileri kontrol edin.");
      }
    }
    setIsSyncing(false);
  };

  const handleCloudPull = async (config = cloudConfig) => {
    if (!config) return;
    setIsSyncing(true);
    const data = await fetchCloudData(config.binId, config.apiKey);
    if (data) {
      ignoreNextCloudPush.current = true; // Don't push back what we just pulled
      setPayments(data);
      const updatedConfig = { ...config, lastSyncedAt: new Date().toISOString() };
      setCloudConfig(updatedConfig);
      localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(updatedConfig));
    }
    setIsSyncing(false);
  };

  const handleCloudPush = async () => {
    if (!cloudConfig) return;
    // Silent sync indicator could go here
    const success = await updateCloudData(cloudConfig.binId, cloudConfig.apiKey, payments);
    if (success) {
       const updatedConfig = { ...cloudConfig, lastSyncedAt: new Date().toISOString() };
       setCloudConfig(updatedConfig);
       localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(updatedConfig));
    }
  };

  const disconnectCloud = () => {
    if (window.confirm("Bulut bağlantısını kesmek istiyor musunuz? Verileriniz silinmez, sadece senkronizasyon durur.")) {
      setCloudConfig(null);
      localStorage.removeItem(CLOUD_CONFIG_KEY);
      setCloudInputApiKey('');
      setCloudInputBinId('');
    }
  };

  // --- Date Helpers ---

  const getAdjustedDate = (dateStr: string): Date => {
    const date = new Date(dateStr);
    const day = date.getDay(); // 0: Sunday, 6: Saturday

    if (day === 6) {
      date.setDate(date.getDate() + 2);
    } else if (day === 0) {
      date.setDate(date.getDate() + 1);
    }
    return date;
  };

  const isWeekendAdjusted = (dateStr: string): boolean => {
    const original = new Date(dateStr);
    const adjusted = getAdjustedDate(dateStr);
    return original.getTime() !== adjusted.getTime();
  };

  const checkNotifications = (now: Date) => {
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const todayStr = now.toISOString().split('T')[0];
    
    if (minutes !== 0) return;
    if (hours < 10) return;

    const dueToday = payments.filter(p => {
      if (p.isPaid) return false;
      const adjustedDate = getAdjustedDate(p.date);
      const adjustedDateStr = adjustedDate.toISOString().split('T')[0];
      return adjustedDateStr === todayStr;
    });

    if (dueToday.length > 0) {
      if (hours === 10) {
        sendNotification("Ödeme Hatırlatıcı 🔔", `Bugün ödenmesi gereken ${dueToday.length} ödemeniz var!`);
      } else {
        sendNotification("Gecikme Uyarısı ⚠️", `Dikkat! ${dueToday.length} adet ödemeniz hala yapılmadı.`);
      }
    }
  };

  const handleImport = (importedPayments: Payment[], mode: 'APPEND' | 'REPLACE') => {
    if (mode === 'REPLACE') {
       if (window.confirm("DİKKAT: Mevcut tüm verileriniz silinecek ve yerine Excel'deki veriler geçecek. Bu işlem geri alınamaz. Onaylıyor musunuz?")) {
          setPayments(importedPayments);
       } else {
          return; // User cancelled
       }
    } else {
       // APPEND
       setPayments(prev => [...prev, ...importedPayments]);
    }
    setShowImportModal(false);
    setShowSettings(false); // Close settings if opened from there
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
    const fileName = `odeme_yedek_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleInstallClick = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          setDeferredPrompt(null);
        }
      });
    } else {
      setShowInstallHelp(true);
    }
  };

  // --- Logic Helpers ---

  const determineCategory = (type: string): PaymentCategory => {
    if (type === 'Dijital') return 'DIGITAL';
    if (type === 'Fatura') return 'BILL';
    if (type === 'Kredi Kartı') return 'CARD';
    return 'LOAN';
  };

  const validatePaymentEntry = (p: Partial<Payment>): string | null => {
    if (!p.name || !p.amount || !p.date || !p.paymentType) {
      return "Lütfen temel alanları (Ad, Tutar, Tarih, Tür) doldurun.";
    }
    if (p.paymentType === 'Kredi' && !p.endDate) {
      return "Krediler için Bitiş Tarihi zorunludur.";
    }
    if (p.paymentType === 'Kredi Kartı' && (p.minimumPaymentAmount === undefined || p.minimumPaymentAmount === null)) {
      return "Kredi kartları için Asgari Tutar zorunludur.";
    }
    return null;
  };

  // --- Actions ---

  const savePaymentEntry = () => {
    const p = entryModal.payment;
    if (!p) return;

    const error = validatePaymentEntry(p);
    if (error) {
      alert(error);
      return;
    }

    const category = determineCategory(p.paymentType || 'Fatura');
    const isPastEntry = entryModal.isPastPayment;
    
    if (p.id) {
      setPayments(prev => prev.map(item => item.id === p.id ? { ...item, ...p, category } as Payment : item));
    } else {
      const newPayment: Payment = {
        id: `manual-${Date.now()}`,
        name: p.name!,
        paymentType: p.paymentType!,
        category: category,
        amount: Number(p.amount),
        paidAmount: isPastEntry ? Number(p.amount) : 0,
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

  const openPaymentModal = (id: string) => {
    const payment = payments.find(p => p.id === id);
    if (!payment) return;
    setPayAmountInput(payment.amount.toString());
    setPaymentModal({ isOpen: true, paymentId: id });
  };

  const confirmPayment = () => {
    if (!paymentModal.paymentId) return;
    
    const paidVal = parseFloat(payAmountInput);
    if (isNaN(paidVal)) {
      alert("Lütfen geçerli bir tutar girin");
      return;
    }

    setPayments(prev => {
      const currentPayment = prev.find(p => p.id === paymentModal.paymentId);
      if (!currentPayment) return prev;

      const updatedPayments = prev.map(p => 
        p.id === paymentModal.paymentId 
          ? { ...p, isPaid: true, paidAmount: paidVal } 
          : p
      );

      const isFixedTermLoan = currentPayment.category === 'LOAN'; 
      
      if (!isFixedTermLoan) {
        const pDate = new Date(currentPayment.date);
        const nextDate = new Date(pDate);
        
        switch (currentPayment.period) {
          case 'WEEKLY':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
          case 'BIWEEKLY':
            nextDate.setDate(nextDate.getDate() + 14);
            break;
          case 'ANNUAL':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            break;
          case 'MONTHLY':
          default:
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
        }
        
        const nextDateStr = nextDate.toISOString().split('T')[0];

        let shouldGenerate = true;
        if (currentPayment.endDate && nextDate > new Date(currentPayment.endDate)) {
          shouldGenerate = false;
        }

        if (shouldGenerate) {
          const newPayment: Payment = {
            ...currentPayment,
            id: `auto-${Date.now()}`,
            date: nextDateStr,
            isPaid: false,
            paidAmount: 0,
            amount: currentPayment.amount,
            period: currentPayment.period,
            customTag: currentPayment.customTag,
            autoPayment: currentPayment.autoPayment,
            autoPaymentBank: currentPayment.autoPaymentBank,
            commitmentEndDate: currentPayment.commitmentEndDate
          };
          updatedPayments.push(newPayment);
        }
      }

      return updatedPayments;
    });

    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    setPaymentModal({ isOpen: false, paymentId: null });
  };

  const deletePayment = (id: string) => {
    if (window.confirm("Bu kaydı silmek istediğinize emin misiniz?")) {
      setPayments(prev => prev.filter(p => p.id !== id));
    }
  };

  // --- View Logic ---

  const changeMonth = (delta: number) => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setSelectedDate(newDate);
  };

  const getAllPaymentsForMonth = () => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    return payments.filter(p => {
      const pDate = new Date(p.date);
      return pDate.getFullYear() === year && pDate.getMonth() === month;
    });
  };

  const getTabPayments = () => {
    return getAllPaymentsForMonth()
      .filter(p => p.category === activeTab)
      .sort((a, b) => {
        return getAdjustedDate(a.date).getTime() - getAdjustedDate(b.date).getTime();
      });
  };

  const handleAIAnalysis = async () => {
    if (payments.length === 0) {
      alert("Analiz için veri gerekli.");
      return;
    }
    setIsAnalyzing(true);
    const result = await analyzePayments(payments); 
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  // Data for View
  const allMonthPayments = getAllPaymentsForMonth();
  const filteredList = getTabPayments();
  const tabTotalAmount = filteredList.reduce((sum, p) => sum + p.amount, 0);
  const tabPaidAmount = filteredList.reduce((sum, p) => sum + (p.paidAmount || 0), 0);
  const globalTotalAmount = allMonthPayments.reduce((sum, p) => sum + p.amount, 0);
  const monthName = selectedDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });

  // --- Dashboard Stats ---
  const getDashboardStats = () => {
    const now = new Date();
    const trendData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      
      const total = payments
        .filter(p => {
          const pd = new Date(p.date);
          return pd.getFullYear() === year && pd.getMonth() === month && p.isPaid;
        })
        .reduce((sum, p) => sum + (p.paidAmount || 0), 0);
        
      trendData.push({ 
        label: d.toLocaleDateString('tr-TR', { month: 'short' }), 
        amount: total 
      });
    }

    const breakdown = { LOAN: 0, CARD: 0, DIGITAL: 0, BILL: 0 };
    allMonthPayments.forEach(p => {
      breakdown[p.category] += p.amount;
    });

    const tagBreakdown: Record<string, number> = {};
    allMonthPayments.forEach(p => {
      if (p.customTag) {
        tagBreakdown[p.customTag] = (tagBreakdown[p.customTag] || 0) + p.amount;
      }
    });

    return { trendData, breakdown, tagBreakdown };
  };

  const dashboardStats = getDashboardStats();

  const handleDateChangeInModal = (dateStr: string) => {
    const selected = new Date(dateStr);
    const today = new Date();
    today.setHours(0,0,0,0);
    const isPast = selected < today;
    
    setEntryModal(prev => ({ 
      ...prev, 
      payment: { ...prev.payment, date: dateStr },
      isPastPayment: isPast
    }));
  };

  // --- RENDER LOCK SCREEN ---
  
  if (isLocked) {
    return (
      <div className="min-h-screen bg-blue-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center">
           <div className="mb-6 flex justify-center">
             <div className="bg-blue-100 p-4 rounded-full">
               <Lock className="w-10 h-10 text-blue-600" />
             </div>
           </div>
           
           <h2 className="text-2xl font-bold text-gray-800 mb-2">
             {setupPinMode === 'CREATE' ? 'Yeni PIN Oluştur' : 
              setupPinMode === 'CONFIRM' ? 'PIN\'i Doğrula' : 
              'Hoşgeldiniz'}
           </h2>
           <p className="text-gray-500 mb-6 text-sm">
             {setupPinMode === 'NONE' ? 'Devam etmek için 4 haneli PIN kodunuzu girin.' : 
              'Verilerinizi korumak için bir şifre belirleyin.'}
           </p>

           <div className="flex justify-center gap-4 mb-8">
             {[0, 1, 2, 3].map(i => (
               <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${
                 pinInput.length > i ? 'bg-blue-600 border-blue-600' : 'bg-transparent border-gray-300'
               }`} />
             ))}
           </div>

           <div className="grid grid-cols-3 gap-4 mb-4">
             {[1,2,3,4,5,6,7,8,9].map(num => (
               <button 
                 key={num} 
                 onClick={() => handlePinEntry(num.toString())}
                 className="h-16 rounded-2xl bg-gray-50 text-2xl font-bold text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition"
               >
                 {num}
               </button>
             ))}
             <div />
             <button 
                onClick={() => handlePinEntry("0")}
                className="h-16 rounded-2xl bg-gray-50 text-2xl font-bold text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition"
             >
                0
             </button>
             <button 
                onClick={handleBackspace}
                className="h-16 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition"
             >
                <ChevronLeft className="w-8 h-8" />
             </button>
           </div>
           
           {/* If strictly locked but no PIN set (shouldn't happen with useEffect logic but safe fallback) */}
           {!hasPin && setupPinMode === 'NONE' && (
              <button onClick={() => setSetupPinMode('CREATE')} className="text-blue-600 text-sm font-semibold mt-4">
                PIN Oluştur
              </button>
           )}
        </div>
      </div>
    );
  }

  // --- RENDER APP ---

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-lg mx-auto border-x border-gray-200 shadow-xl relative pb-24">
      
      {/* Header */}
      <div className="bg-blue-600 text-white p-6 rounded-b-3xl shadow-lg relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                Ödeme Planlayıcı
                {cloudConfig && <CloudLightning className="w-4 h-4 text-green-300 animate-pulse" />}
              </h1>
              <p className="text-blue-100 text-sm opacity-90">{currentTime.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
            <div className="flex gap-2">
              {/* Sync Button (Visible only if configured) */}
              {cloudConfig && (
                <button 
                  onClick={() => handleCloudPull(cloudConfig)}
                  disabled={isSyncing}
                  className="p-2 bg-indigo-500 rounded-full hover:bg-indigo-400 transition shadow-lg border border-indigo-400"
                  title="Buluttan Çek"
                >
                  {isSyncing ? (
                    <RefreshCw className="w-5 h-5 animate-spin text-white" />
                  ) : (
                    <CloudLightning className="w-5 h-5 text-white" />
                  )}
                </button>
              )}

              {!isStandalone && (
                <button 
                  onClick={handleInstallClick}
                  className="p-2 bg-green-500 rounded-full hover:bg-green-400 animate-pulse shadow-lg"
                  title="Uygulamayı Yükle"
                >
                  <Smartphone className="w-5 h-5 text-white" />
                </button>
              )}
              <button onClick={() => requestNotificationPermission()} className="p-2 bg-blue-500 rounded-full hover:bg-blue-400">
                <Bell className="w-5 h-5" />
              </button>
              <button onClick={() => setShowSettings(true)} className="p-2 bg-blue-700 rounded-full hover:bg-blue-500 relative">
                <Settings className="w-5 h-5" />
                {cloudConfig && <span className="absolute top-1 right-1 w-2 h-2 bg-green-400 rounded-full border border-blue-700"></span>}
              </button>
            </div>
          </div>

          {/* View Switcher */}
          <div className="flex bg-blue-800/50 p-1 rounded-lg mb-4">
            <button 
              onClick={() => setViewMode('LIST')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'LIST' ? 'bg-white text-blue-700 shadow-sm' : 'text-blue-200 hover:text-white'}`}
            >
              <ListFilter className="w-4 h-4" /> Liste
            </button>
            <button 
              onClick={() => setViewMode('DASHBOARD')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-md text-sm font-medium transition ${viewMode === 'DASHBOARD' ? 'bg-white text-blue-700 shadow-sm' : 'text-blue-200 hover:text-white'}`}
            >
              <BarChart2 className="w-4 h-4" /> İstatistikler
            </button>
          </div>

          {viewMode === 'LIST' && (
            <>
              {/* Month Navigator */}
              <div className="flex items-center justify-between bg-blue-700/50 rounded-lg p-2 mb-4">
                <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-blue-600 rounded"><ChevronLeft className="w-5 h-5" /></button>
                <span className="font-semibold">{monthName}</span>
                <button onClick={() => changeMonth(1)} className="p-1 hover:bg-blue-600 rounded"><ChevronRight className="w-5 h-5" /></button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <button 
                    onClick={() => setSummaryModal({ isOpen: true, type: 'EXPECTED' })}
                    className="bg-white/10 backdrop-blur-md rounded-xl p-3 text-left transition hover:bg-white/20 active:scale-95"
                >
                  <p className="text-blue-100 text-[10px] uppercase tracking-wide flex items-center gap-1">
                    Beklenen ({activeTab === 'LOAN' ? 'Kredi' : activeTab === 'CARD' ? 'Kart' : activeTab === 'BILL' ? 'Fatura' : 'Dijital'})
                  </p>
                  <p className="text-xl font-bold">{tabTotalAmount.toLocaleString('tr-TR')} ₺</p>
                </button>
                <button 
                  onClick={() => setSummaryModal({ isOpen: true, type: 'PAID' })}
                  className="bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/10 text-left transition hover:bg-white/20 active:scale-95"
                >
                  <p className="text-green-300 text-[10px] uppercase tracking-wide flex items-center gap-1">
                    Ödenen ({activeTab === 'LOAN' ? 'Kredi' : activeTab === 'CARD' ? 'Kart' : activeTab === 'BILL' ? 'Fatura' : 'Dijital'})
                  </p>
                  <p className="text-xl font-bold text-green-300">{tabPaidAmount.toLocaleString('tr-TR')} ₺</p>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {viewMode === 'LIST' ? (
        <>
          {/* Tabs */}
          <div className="flex items-center justify-around mt-4 px-4 border-b border-gray-200">
            {[
              { id: 'LOAN', label: 'Krediler', icon: Landmark },
              { id: 'CARD', label: 'Kartlar', icon: CreditCard },
              { id: 'DIGITAL', label: 'Dijital', icon: Tv },
              { id: 'BILL', label: 'Faturalar', icon: Zap },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as PaymentCategory)}
                  className={`flex flex-col items-center gap-1 pb-3 px-2 border-b-2 transition-all ${
                    isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="text-xs font-medium">{tab.label}</span>
                </button>
              )
            })}
          </div>

          {/* Action Buttons Row */}
          <div className="px-6 mt-4">
            <button 
              onClick={handleAIAnalysis}
              className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-3 rounded-xl shadow-md flex items-center justify-center gap-2 hover:opacity-90 transition active:scale-95"
            >
              {isAnalyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
              <span className="text-xs font-semibold">Mali Analiz</span>
            </button>
          </div>

          {/* AI Result Area - Structured */}
          {aiAnalysis && (
            <div className={`mx-6 mt-4 border p-5 rounded-2xl shadow-lg relative overflow-hidden ${
              aiAnalysis.status === 'DANGER' ? 'bg-red-50 border-red-200' :
              aiAnalysis.status === 'WARNING' ? 'bg-orange-50 border-orange-200' :
              'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100'
            }`}>
              <button onClick={() => setAiAnalysis(null)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-2 mb-4">
                <div className={`p-2 rounded-full ${
                   aiAnalysis.status === 'DANGER' ? 'bg-red-100 text-red-600' :
                   aiAnalysis.status === 'WARNING' ? 'bg-orange-100 text-orange-600' :
                   'bg-indigo-100 text-indigo-600'
                }`}>
                  <BrainCircuit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-sm">Yapay Zeka Raporu</h3>
                  <p className="text-[10px] text-gray-500">{new Date().toLocaleDateString('tr-TR')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                 <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1 flex items-center gap-1">
                      <Wallet className="w-3 h-3" /> Toplam Borç
                    </p>
                    <p className="text-xl font-bold text-gray-800">{aiAnalysis.totalDebt.toLocaleString('tr-TR')} ₺</p>
                 </div>
                 <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100">
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Acil Ödemeler
                    </p>
                    <p className="text-xl font-bold text-red-500">{aiAnalysis.urgentItems.length} Adet</p>
                 </div>
              </div>

              {aiAnalysis.urgentItems.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-red-500" /> Acil Ödemeler (7 Gün)
                  </h4>
                  <ul className="space-y-1">
                    {aiAnalysis.urgentItems.map((item, idx) => (
                      <li key={idx} className="text-xs bg-white/60 px-2 py-1.5 rounded-lg border border-gray-100 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0"></span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mb-4">
                 <h4 className="text-xs font-bold text-gray-700 mb-2">Özet Durum</h4>
                 <p className="text-xs text-gray-600 leading-relaxed bg-white/50 p-2 rounded-lg">
                   {aiAnalysis.summary}
                 </p>
              </div>

              <div className="bg-white/80 p-3 rounded-xl border border-white/50">
                 <h4 className="text-xs font-bold text-indigo-700 mb-1 flex items-center gap-1">
                   <Lightbulb className="w-3 h-3" /> Tavsiye
                 </h4>
                 <p className="text-xs text-gray-600 italic">
                   "{aiAnalysis.advice}"
                 </p>
              </div>
            </div>
          )}

          {/* List */}
          <div className="flex-1 px-4 mt-4 space-y-3 overflow-y-auto">
            {filteredList.length === 0 ? (
              <div className="text-center text-gray-400 mt-10">
                <CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p>Bu ay için bu kategoride kayıt bulunamadı.</p>
              </div>
            ) : (
              filteredList.map((payment) => {
                const adjustedDate = getAdjustedDate(payment.date);
                const isAdjusted = isWeekendAdjusted(payment.date);
                
                const todayMidnight = new Date();
                todayMidnight.setHours(0,0,0,0);
                const adjustedDateMidnight = new Date(adjustedDate);
                adjustedDateMidnight.setHours(0,0,0,0);

                const isOverdue = !payment.isPaid && adjustedDateMidnight < todayMidnight;
                const isToday = adjustedDateMidnight.getTime() === todayMidnight.getTime();

                return (
                  <div 
                    key={payment.id} 
                    className={`bg-white p-4 rounded-xl border relative transition-all ${
                      payment.isPaid 
                        ? 'border-green-100 bg-green-50/30' 
                        : isOverdue 
                          ? 'border-red-200 shadow-red-100 shadow-md' 
                          : isToday 
                            ? 'border-blue-300 ring-1 ring-blue-100'
                            : 'border-gray-100 shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-start gap-3">
                        <button 
                          onClick={() => !payment.isPaid && openPaymentModal(payment.id)}
                          disabled={payment.isPaid}
                          className="mt-1 transition-transform active:scale-90 focus:outline-none"
                        >
                          {payment.isPaid ? (
                            <CheckCircle className="w-6 h-6 text-green-500" />
                          ) : (
                            <Circle className={`w-6 h-6 ${isOverdue ? 'text-red-400' : 'text-gray-300'} hover:text-blue-500`} />
                          )}
                        </button>
                        <div>
                          <h3 className={`font-bold ${payment.isPaid ? 'text-gray-500' : 'text-gray-800'}`}>
                            {payment.name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500">{payment.paymentType}</span>
                            {payment.customTag && (
                               <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-50 text-pink-600 border border-pink-100 flex items-center gap-0.5">
                                 <Tag className="w-2.5 h-2.5" /> {payment.customTag}
                               </span>
                            )}
                            {(payment.category === 'DIGITAL' || payment.category === 'BILL') && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                payment.period === 'ANNUAL' 
                                  ? 'bg-purple-100 text-purple-700 border-purple-200' 
                                  : 'bg-blue-50 text-blue-600 border-blue-100'
                              }`}>
                                {payment.period === 'ANNUAL' ? 'Yıllık' : 
                                 payment.period === 'WEEKLY' ? 'Haftalık' :
                                 payment.period === 'BIWEEKLY' ? '2 Haftada Bir' : 'Aylık'}
                              </span>
                            )}
                          </div>
                          
                          {payment.isPaid && payment.paidAmount !== payment.amount && (
                            <span className="inline-block mt-1 text-[10px] bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                              Kısmi: {payment.paidAmount?.toLocaleString('tr-TR')} ₺
                            </span>
                          )}
                          
                          {isOverdue && !payment.isPaid && <p className="text-xs text-red-500 font-bold mt-1">Gecikti!</p>}

                          {!payment.isPaid && payment.minimumPaymentAmount && (
                            <div className="mt-1 flex items-center text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded w-fit">
                                <TrendingDown className="w-3 h-3 mr-1" />
                                Asgari: {payment.minimumPaymentAmount.toLocaleString('tr-TR')} ₺
                            </div>
                          )}

                          {payment.category === 'BILL' && (
                            <div className="flex flex-wrap gap-2 mt-1">
                              {payment.autoPayment && (
                                <div className="flex items-center text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded w-fit border border-green-100">
                                  <Landmark className="w-3 h-3 mr-1" />
                                  {payment.autoPaymentBank ? payment.autoPaymentBank : 'Otomatik'}
                                </div>
                              )}
                              {payment.commitmentEndDate && (
                                <div className="flex items-center text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded w-fit border border-indigo-100">
                                  <Handshake className="w-3 h-3 mr-1" />
                                  Bit: {new Date(payment.commitmentEndDate).toLocaleDateString('tr-TR', {month: 'short', year: '2-digit'})}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <p className={`font-bold ${payment.isPaid ? 'text-gray-400' : 'text-gray-900'}`}>
                            {payment.amount.toLocaleString('tr-TR')} ₺
                          </p>
                          {!payment.isPaid && (
                            <button 
                              onClick={() => setEntryModal({ isOpen: true, payment })}
                              className="text-gray-300 hover:text-blue-500"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        
                        <div className="flex flex-col items-end">
                          <p className={`text-xs mt-1 font-medium ${isAdjusted ? 'text-blue-600' : 'text-gray-400'}`}>
                            {adjustedDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'short' })}
                          </p>
                          {isAdjusted && !payment.isPaid && (
                            <p className="text-[9px] text-gray-400 italic">Hafta sonu nedeniyle ertelendi</p>
                          )}
                        </div>

                        {payment.endDate && (
                          <p className="text-[10px] text-gray-400 mt-1">
                            Bitiş: {new Date(payment.endDate).toLocaleDateString('tr-TR', { month: 'short', year: '2-digit'})}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="absolute -bottom-2 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => deletePayment(payment.id)} className="bg-white text-red-400 shadow rounded-full p-1 hover:text-red-600">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      ) : (
        /* --- DASHBOARD VIEW --- */
        <div className="flex-1 px-4 mt-4 pb-20 overflow-y-auto">
          {/* Trend Chart */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-blue-600" /> 6 Aylık Harcama Trendi
            </h3>
            <div className="h-40 flex items-end justify-between gap-2">
              {dashboardStats.trendData.map((data, idx) => {
                const maxVal = Math.max(...dashboardStats.trendData.map(d => d.amount)) || 1;
                const heightPercent = (data.amount / maxVal) * 100;
                return (
                  <div key={idx} className="flex flex-col items-center flex-1">
                    <div 
                      className="w-full bg-blue-100 rounded-t-md relative group hover:bg-blue-200 transition-colors"
                      style={{ height: `${heightPercent || 2}%` }}
                    >
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-10">
                        {data.amount.toLocaleString('tr-TR')} ₺
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-500 mt-2">{data.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-4">
             <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
               <ListFilter className="w-5 h-5 text-orange-500" /> Bu Ayın Dağılımı
             </h3>
             <div className="space-y-4">
                {[
                  { id: 'LOAN', label: 'Krediler', color: 'bg-orange-500', bg: 'bg-orange-100' },
                  { id: 'CARD', label: 'Kartlar', color: 'bg-blue-500', bg: 'bg-blue-100' },
                  { id: 'BILL', label: 'Faturalar', color: 'bg-green-500', bg: 'bg-green-100' },
                  { id: 'DIGITAL', label: 'Dijital', color: 'bg-purple-500', bg: 'bg-purple-100' },
                ].map(cat => {
                  const amount = dashboardStats.breakdown[cat.id as PaymentCategory];
                  const total = globalTotalAmount || 1;
                  const percent = Math.round((amount / total) * 100);
                  
                  return (
                    <div key={cat.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-gray-600">{cat.label}</span>
                        <span className="text-gray-500">{amount.toLocaleString('tr-TR')} ₺ (%{percent})</span>
                      </div>
                      <div className={`w-full h-2.5 rounded-full ${cat.bg}`}>
                        <div className={`h-2.5 rounded-full ${cat.color}`} style={{ width: `${percent}%` }}></div>
                      </div>
                    </div>
                  );
                })}
             </div>
          </div>

          {/* Custom Tag Breakdown */}
          {Object.keys(dashboardStats.tagBreakdown).length > 0 && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Tag className="w-5 h-5 text-pink-500" /> Etiketlere Göre (Bu Ay)
              </h3>
              <div className="flex flex-wrap gap-2">
                 {Object.entries(dashboardStats.tagBreakdown).map(([tag, amount]) => (
                   <div key={tag} className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                     <span className="font-semibold text-gray-700 text-sm">{tag}</span>
                     <span className="text-xs text-gray-500 border-l pl-2 border-gray-300">{amount.toLocaleString('tr-TR')} ₺</span>
                   </div>
                 ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Floating Add Button */}
      <button 
        onClick={() => setEntryModal({ 
          isOpen: true, 
          payment: { 
            date: new Date().toISOString().split('T')[0], 
            paymentType: activeTab === 'DIGITAL' ? 'Dijital' : activeTab === 'BILL' ? 'Fatura' : activeTab === 'CARD' ? 'Kredi Kartı' : 'Kredi',
            period: 'MONTHLY'
          } 
        })}
        className="fixed bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 active:scale-95 transition-transform z-40"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Settings className="w-6 h-6 text-gray-600" /> Ayarlar
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
               {/* Cloud Sync Section - "Hidden Membership" */}
               <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                 <h4 className="text-sm font-bold text-indigo-800 uppercase mb-2 flex items-center gap-1">
                   <Cloud className="w-4 h-4" /> Gizli Cüzdan (Bulut)
                 </h4>
                 
                 {cloudConfig ? (
                   <div className="space-y-3">
                     <div className="bg-white p-3 rounded-lg border border-indigo-100">
                       <div className="flex items-center gap-2 mb-2">
                         <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                         <span className="text-xs font-bold text-green-600">Bağlantı Aktif</span>
                       </div>
                       <p className="text-[10px] text-gray-500 mb-1">Cüzdan Kimliği:</p>
                       <div className="flex items-center gap-1 bg-gray-50 p-1.5 rounded border border-gray-200">
                         <code className="text-xs text-gray-700 flex-1 overflow-hidden text-ellipsis">{cloudConfig.binId}</code>
                         <button onClick={() => navigator.clipboard.writeText(cloudConfig.binId)} className="text-gray-400 hover:text-indigo-600">
                            <Copy className="w-3 h-3" />
                         </button>
                       </div>
                     </div>
                     <button 
                       onClick={() => handleCloudPull()} 
                       disabled={isSyncing}
                       className="w-full py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 flex justify-center items-center gap-2"
                     >
                       {isSyncing ? <RefreshCw className="w-3 h-3 animate-spin"/> : <CloudLightning className="w-3 h-3"/>}
                       Şimdi Senkronize Et
                     </button>
                     <button onClick={disconnectCloud} className="w-full text-center text-xs text-red-400 hover:text-red-600 mt-2">
                       Bağlantıyı Kes
                     </button>
                   </div>
                 ) : (
                   <div className="space-y-3">
                     <p className="text-xs text-indigo-700 leading-tight">
                       Verilerinizi tüm cihazlarınızda (PC, Telefon) eşitlemek için Gizli Cüzdan'ı etkinleştirin.
                     </p>
                     
                     {showCloudSetup === 'NONE' ? (
                       <div className="grid grid-cols-2 gap-2">
                         <button onClick={() => setShowCloudSetup('CREATE')} className="py-2 px-1 bg-white border border-indigo-200 rounded-lg text-xs font-semibold text-indigo-600 hover:bg-indigo-50">
                           Yeni Cüzdan
                         </button>
                         <button onClick={() => setShowCloudSetup('CONNECT')} className="py-2 px-1 bg-indigo-600 rounded-lg text-xs font-semibold text-white hover:bg-indigo-700">
                           Cüzdana Bağlan
                         </button>
                       </div>
                     ) : (
                       <div className="bg-white p-3 rounded-lg space-y-3 animate-in fade-in slide-in-from-bottom-2">
                         <div className="flex justify-between items-center">
                           <span className="text-xs font-bold text-gray-700">
                             {showCloudSetup === 'CREATE' ? 'Yeni Oluştur' : 'Mevcuta Bağlan'}
                           </span>
                           <button onClick={() => setShowCloudSetup('NONE')} className="text-gray-400"><X className="w-3 h-3"/></button>
                         </div>
                         
                         <div>
                           <label className="text-[10px] font-bold text-gray-500 uppercase">1. Erişim Anahtarı (API Key)</label>
                           <input 
                             type="password" 
                             placeholder="JSONBin.io Master Key"
                             value={cloudInputApiKey}
                             onChange={(e) => setCloudInputApiKey(e.target.value)}
                             className="w-full text-xs p-2 border rounded mt-1"
                           />
                           <a href="https://jsonbin.io/app/api-keys" target="_blank" rel="noreferrer" className="text-[9px] text-blue-500 underline mt-1 block">
                             Anahtarı buradan al (Ücretsiz)
                           </a>
                         </div>

                         {showCloudSetup === 'CONNECT' && (
                           <div>
                             <label className="text-[10px] font-bold text-gray-500 uppercase">2. Cüzdan Kimliği (Bin ID)</label>
                             <input 
                               type="text" 
                               placeholder="Diğer cihazdaki ID"
                               value={cloudInputBinId}
                               onChange={(e) => setCloudInputBinId(e.target.value)}
                               className="w-full text-xs p-2 border rounded mt-1"
                             />
                           </div>
                         )}

                         <button 
                           onClick={() => handleCloudSetup(showCloudSetup)}
                           disabled={isSyncing}
                           className="w-full py-2 bg-indigo-600 text-white rounded text-xs font-bold"
                         >
                           {isSyncing ? 'İşleniyor...' : (showCloudSetup === 'CREATE' ? 'Oluştur ve Yükle' : 'Bağlan ve İndir')}
                         </button>
                         <p className="text-[10px] text-gray-400 italic mt-2 text-center">* Kurulum tek seferliktir. Uygulama bilgileri hafızada tutar.</p>
                       </div>
                     )}
                   </div>
                 )}
               </div>

               {/* Security Section */}
               <div className="bg-gray-50 rounded-xl p-4">
                 <h4 className="text-sm font-bold text-gray-500 uppercase mb-3 flex items-center gap-1">
                   <ShieldCheck className="w-4 h-4" /> Güvenlik
                 </h4>
                 {hasPin ? (
                   <div className="space-y-2">
                     <button onClick={removePin} className="w-full text-left p-3 bg-white rounded-lg border border-gray-200 text-red-600 text-sm font-medium hover:bg-red-50">
                       PIN Korumasını Kaldır
                     </button>
                     <button onClick={handleLogout} className="w-full text-left p-3 bg-white rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-100 flex items-center justify-between">
                       Ekranı Kilitle <LogOut className="w-4 h-4"/>
                     </button>
                   </div>
                 ) : (
                   <button onClick={() => { setSetupPinMode('CREATE'); setIsLocked(true); setShowSettings(false); }} className="w-full text-left p-3 bg-white rounded-lg border border-gray-200 text-blue-600 text-sm font-medium hover:bg-blue-50">
                     PIN Kodu Oluştur
                   </button>
                 )}
               </div>

               {/* Data Section */}
               <div className="bg-gray-50 rounded-xl p-4">
                 <h4 className="text-sm font-bold text-gray-500 uppercase mb-3 flex items-center gap-1">
                   <Save className="w-4 h-4" /> Veri Yönetimi
                 </h4>
                 <div className="grid grid-cols-2 gap-2">
                   <button onClick={handleExport} className="p-3 bg-white rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-100 flex flex-col items-center gap-1">
                     <FileDown className="w-5 h-5 text-gray-500" /> Yedekle
                   </button>
                   <button onClick={() => setShowImportModal(true)} className="p-3 bg-white rounded-lg border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-100 flex flex-col items-center gap-1">
                     <Upload className="w-5 h-5 text-gray-500" /> Yükle
                   </button>
                 </div>
                 <button onClick={clearAllData} className="w-full mt-3 text-left p-3 bg-white rounded-lg border border-red-100 text-red-500 text-xs hover:bg-red-50">
                   Tüm Verileri Sıfırla (Dikkat!)
                 </button>
               </div>
            </div>
            
            <div className="mt-6 text-center text-xs text-gray-400">
              v1.3 • Gemini AI • Cloud Sync
            </div>
          </div>
        </div>
      )}

      {/* Payment Confirmation Modal */}
      {paymentModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-gray-800 mb-2">Ödeme Onayı</h3>
            <div className="bg-gray-50 p-3 rounded-lg mb-4 border border-gray-200">
               <label className="text-xs text-gray-500 font-semibold uppercase">Tutar (TL)</label>
               <input 
                 type="number" 
                 value={payAmountInput}
                 onChange={(e) => setPayAmountInput(e.target.value)}
                 className="w-full bg-transparent text-2xl font-bold text-gray-800 outline-none mt-1"
               />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPaymentModal({ isOpen: false, paymentId: null })} className="flex-1 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition">İptal</button>
              <button onClick={confirmPayment} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 transition">Öde</button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Detail Modal */}
      {summaryModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                {summaryModal.type === 'EXPECTED' ? 'Tüm Beklenen Ödemeler' : 'Tüm Yapılan Ödemeler'}
              </h3>
              <button onClick={() => setSummaryModal({ isOpen: false, type: null })} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
              {allMonthPayments
                .filter(p => summaryModal.type === 'EXPECTED' ? true : p.paidAmount > 0) 
                .sort((a,b) => getAdjustedDate(a.date).getTime() - getAdjustedDate(b.date).getTime())
                .map(p => (
                  <div key={p.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div>
                      <div className="flex items-center gap-2">
                         <p className="font-semibold text-gray-700 text-sm">{p.name}</p>
                         {p.customTag && <span className="text-[9px] bg-gray-200 px-1 rounded">{p.customTag}</span>}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{getAdjustedDate(p.date).toLocaleDateString('tr-TR', {day: 'numeric', month: 'long'})}</p>
                    </div>
                    <div className="text-right">
                       <p className={`font-bold ${summaryModal.type === 'EXPECTED' ? 'text-blue-600' : 'text-green-600'}`}>
                         {summaryModal.type === 'EXPECTED' ? p.amount.toLocaleString('tr-TR') : p.paidAmount.toLocaleString('tr-TR')} ₺
                       </p>
                    </div>
                  </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Install Help Modal */}
      {showInstallHelp && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm relative">
            <button 
              onClick={() => setShowInstallHelp(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
            
            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">Uygulamayı Yükle</h3>
            
            <div className="bg-blue-50 p-4 rounded-xl mb-6">
              <p className="text-sm text-blue-800 text-center font-medium">
                Bu uygulamayı telefonuna yükleyerek internetsiz erişebilir ve tam ekran kullanabilirsin.
              </p>
            </div>

            {isIOS ? (
              <div className="space-y-4">
                 <div className="flex items-center gap-4">
                    <div className="bg-gray-100 p-2 rounded-lg"><Share className="w-6 h-6 text-blue-600" /></div>
                    <p className="text-sm text-gray-600">1. Tarayıcının altındaki <strong>Paylaş</strong> butonuna bas.</p>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="bg-gray-100 p-2 rounded-lg"><Plus className="w-6 h-6 text-gray-700" /></div>
                    <p className="text-sm text-gray-600">2. Menüden <strong>"Ana Ekrana Ekle"</strong> seçeneğini bul ve bas.</p>
                 </div>
              </div>
            ) : (
              <div className="space-y-4">
                 <div className="flex items-center gap-4">
                    <div className="bg-gray-100 p-2 rounded-lg"><MoreVertical className="w-6 h-6 text-gray-700" /></div>
                    <p className="text-sm text-gray-600">1. Tarayıcının sağ üst köşesindeki <strong>3 Nokta</strong> menüsüne bas.</p>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="bg-gray-100 p-2 rounded-lg"><Smartphone className="w-6 h-6 text-blue-600" /></div>
                    <p className="text-sm text-gray-600">2. <strong>"Uygulamayı Yükle"</strong> veya <strong>"Ana Ekrana Ekle"</strong> seçeneğine bas.</p>
                 </div>
              </div>
            )}
            
            <button 
              onClick={() => setShowInstallHelp(false)}
              className="w-full mt-6 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition"
            >
              Tamam, Anladım
            </button>
          </div>
        </div>
      )}

      {/* Manual Entry / Edit Modal */}
      {entryModal.isOpen && entryModal.payment && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm overflow-y-auto max-h-[90vh] no-scrollbar">
            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              {entryModal.payment.id ? <Edit2 className="w-5 h-5"/> : <Plus className="w-5 h-5"/>}
              {entryModal.payment.id ? 'Düzenle' : 'Ödeme Ekle'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Ad</label>
                <input 
                  type="text"
                  value={entryModal.payment.name || ''}
                  onChange={(e) => setEntryModal({ ...entryModal, payment: { ...entryModal.payment, name: e.target.value } })}
                  className="w-full border border-gray-300 rounded-lg p-2"
                  placeholder="İsim girin"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Tür</label>
                    <select
                      value={entryModal.payment.paymentType || 'Fatura'}
                      onChange={(e) => setEntryModal({ ...entryModal, payment: { ...entryModal.payment, paymentType: e.target.value } })}
                      className="w-full border border-gray-300 rounded-lg p-2 bg-white"
                    >
                      {PAYMENT_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Tutar (TL)</label>
                    <input 
                      type="number"
                      value={entryModal.payment.amount || ''}
                      onChange={(e) => setEntryModal({ ...entryModal, payment: { ...entryModal.payment, amount: Number(e.target.value) } })}
                      className="w-full border border-gray-300 rounded-lg p-2"
                    />
                 </div>
              </div>

              <div>
                 <label className="block text-xs font-semibold text-gray-500 mb-1">Ödeme Tarihi</label>
                 <input 
                   type="date"
                   value={entryModal.payment.date || ''}
                   onChange={(e) => handleDateChangeInModal(e.target.value)}
                   className="w-full border border-gray-300 rounded-lg p-2"
                 />
                 {entryModal.isPastPayment && !entryModal.payment.id && (
                   <div className="flex items-center gap-2 mt-2 bg-yellow-50 p-2 rounded border border-yellow-200">
                     <CheckCircle className="w-4 h-4 text-yellow-600" />
                     <span className="text-xs text-yellow-800">Geçmiş tarihli. Ödendi olarak işaretlenecek.</span>
                   </div>
                 )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Etiket (Grup)</label>
                    <input 
                      type="text"
                      placeholder="Örn: Tatil, Araba"
                      value={entryModal.payment.customTag || ''}
                      onChange={(e) => setEntryModal({ ...entryModal, payment: { ...entryModal.payment, customTag: e.target.value } })}
                      className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                    />
                 </div>
                 {entryModal.payment.paymentType !== 'Kredi' && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Sıklık</label>
                      <select
                        value={entryModal.payment.period || 'MONTHLY'}
                        onChange={(e) => setEntryModal({ ...entryModal, payment: { ...entryModal.payment, period: e.target.value as PaymentPeriod } })}
                        className="w-full border border-gray-300 rounded-lg p-2 bg-white text-sm"
                      >
                        <option value="WEEKLY">Haftalık</option>
                        <option value="BIWEEKLY">2 Haftada Bir</option>
                        <option value="MONTHLY">Aylık</option>
                        <option value="ANNUAL">Yıllık</option>
                      </select>
                    </div>
                 )}
              </div>

              {determineCategory(entryModal.payment.paymentType || '') === 'BILL' && (
                <div className="space-y-3">
                   <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-indigo-800">Otomatik Ödeme</label>
                        <input 
                          type="checkbox"
                          checked={entryModal.payment.autoPayment || false}
                          onChange={(e) => setEntryModal({ ...entryModal, payment: { ...entryModal.payment, autoPayment: e.target.checked } })}
                          className="w-4 h-4 text-indigo-600 rounded"
                        />
                      </div>
                      {entryModal.payment.autoPayment && (
                        <input 
                          type="text"
                          placeholder="Banka Adı (Örn: Enpara)"
                          value={entryModal.payment.autoPaymentBank || ''}
                          onChange={(e) => setEntryModal({ ...entryModal, payment: { ...entryModal.payment, autoPaymentBank: e.target.value } })}
                          className="w-full text-xs border border-indigo-200 rounded p-1.5"
                        />
                      )}
                   </div>
                </div>
              )}

              {entryModal.payment.paymentType === 'Kredi' && (
                 <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                    <label className="block text-xs font-bold text-orange-800 mb-1">Kredi Bitiş Tarihi</label>
                    <input 
                      type="date"
                      value={entryModal.payment.endDate || ''}
                      onChange={(e) => setEntryModal({ ...entryModal, payment: { ...entryModal.payment, endDate: e.target.value } })}
                      className="w-full border border-orange-200 rounded-lg p-2"
                    />
                 </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setEntryModal({ isOpen: false, payment: null })} className="flex-1 py-3 text-gray-600 hover:bg-gray-100 rounded-xl">İptal</button>
              <button onClick={savePaymentEntry} className="flex-1 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 flex justify-center items-center gap-2">
                <Save className="w-4 h-4" /> Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <ImportExcel onImport={handleImport} onCancel={() => setShowImportModal(false)} />
      )}
    </div>
  );
};

export default App;