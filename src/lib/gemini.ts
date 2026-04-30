import { GoogleGenerativeAI } from "@google/generative-ai";

// Ler chave de API do ambiente (VITE_ para Vite)
const API_KEY = import.meta.env.VITE_GOOGLE_AI_API_KEY;

if (!API_KEY) {
  throw new Error("VITE_GOOGLE_AI_API_KEY não encontrada nas variáveis de ambiente");
}

// Inicializar o Gemini
const genAI = new GoogleGenerativeAI(API_KEY);

// Modelo Gemini 2.5 Pro (funciona na API v1beta)
export const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

// Função para testar a API
export async function testGeminiAPI() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
    const result = await model.generateContent("Olá, você está funcionando?");
    const response = await result.response;
    const text = response.text();
    console.log("Gemini 2.5 Pro API funcionando:", text);
    return true;
  } catch (error) {
    console.error("Erro na API Gemini 2.5 Pro:", error);
    return false;
  }
}

// Exportar a instância do genAI para uso em outras funções
export { genAI };
