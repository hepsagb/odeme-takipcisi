
import { GoogleGenAI, Type } from "@google/genai";
import { Payment, AiAnalysisData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzePayments = async (payments: Payment[]): Promise<AiAnalysisData | null> => {
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
      
      Lütfen finansal durumumu analiz et ve JSON formatında yanıt ver.
      "status" alanı için: Eğer borçlar yönetilebilir ise "GOOD", kritik ise "WARNING", çok acil ve yüksek ise "DANGER" değerini kullan.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            totalDebt: { 
              type: Type.NUMBER, 
              description: "Toplam ödenmemiş borç miktarı" 
            },
            urgentItems: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: "Önümüzdeki 7 gün içinde ödenmesi gereken ödemelerin isimleri" 
            },
            summary: { 
              type: Type.STRING, 
              description: "Finansal durum hakkında 1-2 cümlelik kısa özet" 
            },
            advice: { 
              type: Type.STRING, 
              description: "Kısa, motive edici veya uyarıcı bir finansal tavsiye" 
            },
            status: { 
              type: Type.STRING, 
              description: "Finansal sağlık durumu: GOOD, WARNING veya DANGER" 
            }
          },
          required: ["totalDebt", "urgentItems", "summary", "advice", "status"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AiAnalysisData;
    }
    return null;
  } catch (error) {
    console.error("Gemini AI Error:", error);
    return null;
  }
};
