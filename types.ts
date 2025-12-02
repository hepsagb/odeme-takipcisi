
export type PaymentCategory = 'LOAN' | 'CARD' | 'BILL' | 'DIGITAL';

export const PAYMENT_TYPES = ['Kredi', 'Kredi Kartı', 'Dijital', 'Fatura'] as const;
export type PaymentTypeLiteral = typeof PAYMENT_TYPES[number];

export type PaymentPeriod = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'ANNUAL';

export interface Payment {
  id: string;
  name: string; 
  paymentType: string; 
  category: PaymentCategory;
  amount: number; 
  paidAmount: number; 
  minimumPaymentAmount?: number; 
  date: string; 
  isPaid: boolean;
  endDate?: string; // Krediler için bitiş tarihi
  notes?: string;
  
  // New Fields
  period?: PaymentPeriod; // Sıklık
  customTag?: string; // Özel Grup/Kategori (Örn: Tatil, Market)
  
  commitmentEndDate?: string; // For Bills
  autoPayment?: boolean; // For Bills
  autoPaymentBank?: string; // For Bills
}

export interface ExcelRow {
  'Ad': string;
  'Ödeme Türü': string;
  'Miktar': number;
  'Tarih': string | number;
  'Bitiş Tarihi'?: string | number; 
  'Asgari Tutar'?: number;
  'Periyot'?: string; // Haftalık / Aylık / Yıllık
  'Etiket'?: string; // Özel Grup
  'Taahhüt Bitiş Tarihi'?: string | number;
  'Otomatik Ödeme'?: string; // Evet / Var
  'Otomatik Ödeme Bankası'?: string;
  'Durum'?: string;
  'Ödenen Tutar'?: number;
}

export enum FilterType {
  ALL = 'ALL',
  PENDING = 'PENDING',
  PAID = 'PAID',
}

export interface AiAnalysisData {
  totalDebt: number;
  urgentItems: string[];
  summary: string;
  advice: string;
  status: 'GOOD' | 'WARNING' | 'DANGER';
}

export interface CloudConfig {
  apiKey: string;
  binId: string;
  lastSyncedAt?: string;
}
