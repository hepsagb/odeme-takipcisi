import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, AlertCircle, Download, ListPlus, RefreshCcw, ArrowLeft } from 'lucide-react';
import { ExcelRow, Payment, PaymentCategory, PaymentPeriod } from '../types';

interface ImportExcelProps {
  onImport: (data: Payment[], mode: 'APPEND' | 'REPLACE') => void;
  onCancel: () => void;
}

export const ImportExcel: React.FC<ImportExcelProps> = ({ onImport, onCancel }) => {
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Payment[] | null>(null);

  const determineCategory = (type: string): PaymentCategory => {
    const t = type.toLowerCase();
    
    if (t.includes('dijital')) return 'DIGITAL';
    if (t.includes('fatura')) return 'BILL';
    if (t.includes('kart')) return 'CARD';
    if (t.includes('kredi')) return 'LOAN';
    
    return 'BILL'; // Varsayılan
  };

  const parsePeriod = (val?: string): PaymentPeriod => {
    if (!val) return 'MONTHLY';
    const v = val.toLowerCase();
    if (v.includes('hafta')) return 'WEEKLY'; // Covers "Haftalık"
    if (v.includes('2 hafta') || v.includes('iki hafta')) return 'BIWEEKLY';
    if (v.includes('yıl')) return 'ANNUAL';
    return 'MONTHLY';
  };

  const parseAutoPayment = (val?: string): boolean => {
    if (!val) return false;
    const v = val.toLowerCase();
    return v.includes('evet') || v.includes('var') || v.includes('true');
  };

  const downloadTemplate = () => {
    const headers = [
      'Ad', 'Ödeme Türü', 'Miktar', 'Tarih', 
      'Bitiş Tarihi', 'Asgari Tutar', 
      'Periyot', 'Etiket', 'Taahhüt Bitiş Tarihi', 'Otomatik Ödeme', 'Otomatik Ödeme Bankası'
    ];
    const sampleData = [
      {
        'Ad': 'Netflix',
        'Ödeme Türü': 'Dijital',
        'Miktar': 229.99,
        'Tarih': '25.10.2023',
        'Periyot': 'Aylık',
        'Etiket': 'Eğlence'
      },
      {
        'Ad': 'Spor Salonu',
        'Ödeme Türü': 'Dijital',
        'Miktar': 800,
        'Tarih': '01.11.2023',
        'Periyot': 'Yıllık',
        'Etiket': 'Sağlık'
      },
      {
        'Ad': 'Ev Temizliği',
        'Ödeme Türü': 'Fatura',
        'Miktar': 1500,
        'Tarih': '20.10.2023',
        'Periyot': '2 Haftada Bir',
        'Etiket': 'Ev Gideri'
      },
      {
        'Ad': 'İhtiyaç Kredisi',
        'Ödeme Türü': 'Kredi',
        'Miktar': 5000,
        'Tarih': '15.10.2023',
        'Bitiş Tarihi': '15.10.2024'
      },
      {
        'Ad': 'Bonus Kart',
        'Ödeme Türü': 'Kredi Kartı',
        'Miktar': 0,
        'Tarih': '30.10.2023',
        'Bitiş Tarihi': '30.10.2024',
        'Asgari Tutar': 0,
        'Etiket': 'Gelecek Ekstre'
      },
       {
        'Ad': 'İnternet',
        'Ödeme Türü': 'Fatura',
        'Miktar': 450,
        'Tarih': '20.10.2023',
        'Taahhüt Bitiş Tarihi': '20.10.2025',
        'Otomatik Ödeme': 'Evet',
        'Otomatik Ödeme Bankası': 'Enpara'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Taslak");
    XLSX.writeFile(wb, "odeme_takip_taslak_v5.xlsx");
  };

  const parseDate = (excelDate: string | number | undefined): string | undefined => {
    if (!excelDate) return undefined;
    
    try {
      // 1. Handle Excel Serial Number
      if (typeof excelDate === 'number') {
        const date = new Date((excelDate - (25567 + 2)) * 86400 * 1000);
        return date.toISOString().split('T')[0];
      } 
      
      // 2. Handle String formats
      if (typeof excelDate === 'string') {
        const trimmed = excelDate.trim();
        if (trimmed === '') return undefined;

        // Handle DD.MM.YYYY or DD.MM.YY
        if (trimmed.includes('.')) {
          const parts = trimmed.split('.');
          if (parts.length === 3) {
            let day = parseInt(parts[0], 10);
            let month = parseInt(parts[1], 10);
            let year = parseInt(parts[2], 10);

            if (year < 100) year += 2000;

            const yStr = year.toString();
            const mStr = month.toString().padStart(2, '0');
            const dStr = day.toString().padStart(2, '0');
            return `${yStr}-${mStr}-${dStr}`;
          }
        }

        // Handle standard YYYY-MM-DD
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) {
           return d.toISOString().split('T')[0];
        }
      }
    } catch (e) {
      return undefined;
    }
    return undefined;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        // Allow loose typing to catch 'Durum' and 'Ödenen Tutar' which are not in strict ExcelRow type but might exist in backups
        const data = XLSX.utils.sheet_to_json<any>(ws);

        const formattedPayments: Payment[] = [];
        
        data.forEach((row: any, index: number) => {
          // Changed: We now allow empty amount (defaults to 0) for Credit Cards etc.
          if (!row['Ad']) return;

          let startDateStr = parseDate(row['Tarih']);
          if (!startDateStr) startDateStr = new Date().toISOString().split('T')[0];

          let endDateStr = parseDate(row['Bitiş Tarihi']);
          let commitmentDateStr = parseDate(row['Taahhüt Bitiş Tarihi']);
          
          const pType = row['Ödeme Türü'] || 'Fatura';
          const category = determineCategory(pType);
          const amount = row['Miktar'] ? Number(row['Miktar']) : 0;

          // Restore logic: Check if it's a backup file with status
          const isPaidImport = row['Durum'] === 'Ödendi';
          const paidAmountImport = row['Ödenen Tutar'] ? Number(row['Ödenen Tutar']) : 0;
          
          // --- RECURRING LOGIC: Generate all installments/months if End Date exists ---
          // Hem Kredi (LOAN) hem de Kredi Kartı (CARD) için bitiş tarihi varsa çoğalt
          const isBackup = row['Durum'] !== undefined;
          const isRecurringImport = (category === 'LOAN' || category === 'CARD') && endDateStr && !isBackup;

          if (isRecurringImport) {
            const start = new Date(startDateStr);
            const end = new Date(endDateStr!);
            
            // Loop from start date to end date
            let current = new Date(start);
            let count = 0;

            while (current <= end) {
              formattedPayments.push({
                id: `excel-auto-${Date.now()}-${index}-${count}`,
                name: row['Ad'],
                paymentType: pType,
                category: category,
                amount: amount,
                paidAmount: 0,
                minimumPaymentAmount: row['Asgari Tutar'] ? Number(row['Asgari Tutar']) : undefined,
                date: current.toISOString().split('T')[0],
                isPaid: false,
                endDate: endDateStr,
                period: 'MONTHLY',
                customTag: row['Etiket'],
                // Eğer kart ise ve otomatik ödeme varsa bunları taşıma, genellikle fatura özelliğidir ama zararı yok
                autoPayment: parseAutoPayment(row['Otomatik Ödeme']),
                autoPaymentBank: row['Otomatik Ödeme Bankası']
              });

              // Add 1 month
              current.setMonth(current.getMonth() + 1);
              count++;
              
              // Safety break (10 years)
              if (count > 120) break;
            }
          } else {
            // --- STANDARD LOGIC / BACKUP RESTORE ---
            formattedPayments.push({
              id: `excel-${Date.now()}-${index}`,
              name: row['Ad'],
              paymentType: pType,
              category: category,
              amount: amount,
              paidAmount: paidAmountImport,
              minimumPaymentAmount: row['Asgari Tutar'] ? Number(row['Asgari Tutar']) : undefined,
              date: startDateStr,
              isPaid: isPaidImport,
              endDate: endDateStr,
              
              // New Fields
              period: parsePeriod(row['Periyot']),
              customTag: row['Etiket'],
              commitmentEndDate: commitmentDateStr,
              autoPayment: parseAutoPayment(row['Otomatik Ödeme']),
              autoPaymentBank: row['Otomatik Ödeme Bankası']
            });
          }
        });

        if (formattedPayments.length === 0) {
          setError("Excel dosyasında uygun formatta veri bulunamadı.");
          setPreviewData(null);
        } else {
          setError(null);
          setPreviewData(formattedPayments);
        }
      } catch (err) {
        console.error(err);
        setError("Dosya okunamadı. Lütfen geçerli bir .xlsx dosyası yükleyin.");
        setPreviewData(null);
      }
    };
    reader.readAsBinaryString(file);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-green-600" />
            Excel Yükle
          </h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        {!previewData ? (
          <>
            <div className="bg-blue-50 p-4 rounded-lg mb-6 border border-blue-100 text-sm">
              <div className="flex justify-between items-center mb-2">
                <p className="font-semibold text-blue-800">Excel İpuçları:</p>
                <button 
                  onClick={downloadTemplate}
                  className="text-xs bg-white text-blue-600 border border-blue-200 px-2 py-1 rounded flex items-center gap-1 hover:bg-blue-50"
                >
                  <Download className="w-3 h-3" /> Yeni Taslağı İndir
                </button>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-blue-700 text-xs">
                <li><span className="font-bold">Ad ve Tarih</span> zorunludur.</li>
                <li><span className="font-bold">Tutar:</span> Ekstresi belli olmayan kartlar için boş bırakabilirsiniz (0 olarak kaydedilir).</li>
                <li><span className="font-bold">Kredi Kartları için:</span> Eğer 'Bitiş Tarihi' girerseniz (Örn: 1 yıl sonrası), sistem o tarihe kadar her ay için kart kaydını otomatik oluşturur.</li>
              </ul>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center text-center hover:bg-gray-50 transition-colors relative">
              <Upload className="w-10 h-10 text-gray-400 mb-2" />
              <span className="text-gray-600 font-medium">Dosya Seçin</span>
              <span className="text-xs text-gray-400 mt-1">.xlsx formatında</span>
              <input 
                type="file" 
                accept=".xlsx, .xls"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4 animate-in fade-in">
             <div className="bg-green-50 border border-green-200 p-4 rounded-lg text-center">
                <p className="text-green-800 font-bold text-lg">{previewData.length} Kayıt Bulundu</p>
                <p className="text-green-600 text-xs">Veriler okundu. Kredi/Kart döngüleri (varsa) oluşturuldu.</p>
             </div>

             <button 
               onClick={() => onImport(previewData, 'APPEND')}
               className="w-full flex items-center justify-between p-4 bg-white border border-blue-200 rounded-xl shadow-sm hover:bg-blue-50 transition group"
             >
                <div className="flex items-center gap-3">
                   <div className="bg-blue-100 p-2 rounded-lg text-blue-600 group-hover:bg-blue-200"><ListPlus className="w-5 h-5" /></div>
                   <div className="text-left">
                      <p className="font-bold text-gray-800 text-sm">Mevcutların Altına Ekle</p>
                      <p className="text-xs text-gray-500">Eski veriler kalır, yeniler eklenir.</p>
                   </div>
                </div>
             </button>

             <button 
               onClick={() => onImport(previewData, 'REPLACE')}
               className="w-full flex items-center justify-between p-4 bg-white border border-red-200 rounded-xl shadow-sm hover:bg-red-50 transition group"
             >
                <div className="flex items-center gap-3">
                   <div className="bg-red-100 p-2 rounded-lg text-red-600 group-hover:bg-red-200"><RefreshCcw className="w-5 h-5" /></div>
                   <div className="text-left">
                      <p className="font-bold text-gray-800 text-sm">Tümünü Sil ve Yükle</p>
                      <p className="text-xs text-gray-500">Mevcut veriler silinir, sadece bunlar kalır.</p>
                   </div>
                </div>
             </button>

             <button 
               onClick={() => { setPreviewData(null); setError(null); }}
               className="w-full py-2 text-gray-500 text-sm hover:text-gray-700 flex items-center justify-center gap-1"
             >
               <ArrowLeft className="w-4 h-4" /> Geri Dön (Farklı Dosya Seç)
             </button>
          </div>
        )}
      </div>
    </div>
  );
};