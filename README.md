# 💸 Ödeme Takipçisi (PWA)

**Ödeme Takipçisi**, kişisel borçlarınızı, kredi kartı harcamalarınızı, faturalarınızı ve dijital aboneliklerinizi takip etmenizi sağlayan; verilerinizi sadece kendi cihazınızda saklayan güvenli ve akıllı bir finans asistanıdır.

![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3-38bdf8)
![Gemini AI](https://img.shields.io/badge/Google-Gemini_AI-8e75b2)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)

## 🌟 Özellikler

### 🔒 Gizlilik ve Güvenlik
*   **Yerel Veri:** Tüm verileriniz tarayıcınızın `LocalStorage` alanında saklanır. Hiçbir sunucuya gönderilmez.
*   **PIN Koruması:** Uygulamaya girişte 4 haneli PIN kodu sorarak meraklı gözlerden korur.

### 📱 Mobil Uyumluluk (PWA)
*   **Uygulama Gibi Çalışır:** Android ve iOS cihazlara yüklenebilir.
*   **Çevrimdışı Erişim:** İnternetiniz olmasa bile verilerinize erişebilirsiniz.
*   **Tam Ekran Deneyimi:** Tarayıcı çubukları olmadan doğal bir uygulama hissi verir.

### 🧠 Yapay Zeka Desteği (Gemini AI)
*   **Mali Analiz:** Tek tuşla tüm borç durumunuzu analiz eder ve size özel finansal tavsiyeler verir.
*   **Akıllı Özet:** Ödenmemiş borçları ve yaklaşan ödemeleri özetler.

### 📊 Veri Yönetimi
*   **Excel İçe/Dışa Aktarma:** Verilerinizi `.xlsx` formatında yedekleyebilir veya toplu veri yükleyebilirsiniz.
*   **Dashboard:** 6 aylık harcama trendlerini ve kategori dağılımını grafiklerle gösterir.
*   **Akıllı Tarih:** Ödeme günü hafta sonuna geliyorsa otomatik olarak Pazartesi'ye erteler.

### 🔔 Bildirimler
*   Ödeme günü geldiğinde saat 10:00'da hatırlatma yapar.
*   Ödeme yapılmazsa her saat başı nazikçe uyarır.

---

## 🚀 Kurulum (Local)

Projeyi kendi bilgisayarınızda çalıştırmak için:

1.  **Repoyu klonlayın:**
    ```bash
    git clone https://github.com/KULLANICI_ADINIZ/odeme-takipcisi.git
    cd odeme-takipcisi
    ```

2.  **Paketleri yükleyin:**
    ```bash
    npm install
    ```

3.  **API Anahtarını Ayarlayın:**
    *   Ana dizinde `.env` dosyası oluşturun.
    *   İçine şu satırı ekleyin:
        ```env
        VITE_API_KEY=AIzaSy... (Gemini API Anahtarınız)
        ```

4.  **Projeyi Başlatın:**
    ```bash
    npm run dev
    ```

---

## 🌐 Canlıya Alma (Vercel)

Bu proje Vercel üzerinde çalışmak üzere optimize edilmiştir.

1.  GitHub reponuzu Vercel'e bağlayın.
2.  **Environment Variables** kısmına gidin.
3.  **Name:** `API_KEY`
4.  **Value:** `AIzaSy...` (Google AI Studio'dan aldığınız anahtar)
5.  **Deploy** butonuna basın.

---

## 📂 Excel Yükleme Formatı

Toplu veri yüklemek için Excel dosyanızın sütun başlıkları aşağıdaki gibi olmalıdır:

| Sütun Başlığı | Açıklama | Örnek |
| :--- | :--- | :--- |
| **Ad** | Ödemenin adı | Netflix, Kira, Bonus Kart |
| **Ödeme Türü** | Kredi, Kredi Kartı, Dijital, Fatura | Fatura |
| **Miktar** | Tutar (Sayısal) | 1500 |
| **Tarih** | GG.AA.YYYY formatında | 25.10.2024 |
| **Periyot** | (Opsiyonel) Sıklık | Aylık, Yıllık, Haftalık |
| **Etiket** | (Opsiyonel) Özel grup adı | Tatil, Market |
| **Bitiş Tarihi** | (Sadece Krediler İçin) | 25.10.2025 |
| **Asgari Tutar** | (Sadece Kredi Kartları İçin) | 5000 |

*Uygulama içindeki "Excel Yükle" penceresinden örnek taslağı indirebilirsiniz.*

---

## 🛠 Kullanılan Teknolojiler

*   **Frontend:** React, TypeScript, Vite
*   **Styling:** Tailwind CSS
*   **Icons:** Lucide React
*   **AI:** Google Generative AI SDK (Gemini)
*   **Data Handling:** SheetJS (xlsx)
*   **Effects:** Canvas Confetti

---

## ⚠️ Lisans ve Sorumluluk Reddi

Bu proje açık kaynaklıdır (MIT License). 
Uygulama kişisel finans takibi amacıyla geliştirilmiştir. Veriler sadece kullanıcının cihazında (LocalStorage) saklanır. Cihazın sıfırlanması veya tarayıcı verilerinin temizlenmesi durumunda veriler kaybolabilir. Lütfen düzenli olarak "Yedekle" özelliğini kullanın.
