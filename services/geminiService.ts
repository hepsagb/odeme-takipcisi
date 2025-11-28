import { GoogleGenAI } from "@google/genai";
import { Payment } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzePayments = async (payments: Payment[]): Promise<string> => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const unpaidPayments = payments.filter(p => !p.isPaid);
    
    // Simplification of data for the AI prompt to save tokens
    const dataSummary = JSON.stringify(unpaidPayments.map(p => ({
      name: p.name,
      type: p.paymentType,
      amount: p.amount,
      date: p.date
    })));

    const prompt = `
      Sen benim kişisel finans asistanımsın. Aşağıda ödenmemiş ödemelerimin bir listesi var.
      Bugünün tarihi: ${today}.
      
      Veri: ${dataSummary}
      
      Lütfen bana kısa ve öz bir özet geç.
      1. Toplam kalan borcum ne kadar?
      2. Önümüzdeki 7 gün içinde acil ödenmesi gerekenler neler?
      3. Finansal durumumla ilgili kısa, motive edici veya uyarıcı bir tavsiye ver.
      
      Yanıtı Türkçe ver ve HTML formatında değil, düz metin (markdown) olarak ver.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 } // Speed over deep reasoning
      }
    });

    return response.text || "Analiz yapılamadı.";
  } catch (error) {
    console.error("Gemini AI Error:", error);
    return "AI servisine şu an erişilemiyor. Lütfen API anahtarınızı kontrol edin.";
  }
};