import { GoogleGenerativeAI } from "@google/generative-ai";

// Ler chave de API do ambiente (VITE_ para Vite)
const API_KEY = import.meta.env.VITE_GOOGLE_AI_API_KEY;

if (!API_KEY) {
  throw new Error("VITE_GOOGLE_AI_API_KEY não encontrada nas variáveis de ambiente");
}

// Inicializar o Gemini
const genAI = new GoogleGenerativeAI(API_KEY);

// Lista de modelos Gemini 2.5 para fallback
const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
];

// Modelo principal Gemini 2.5 Flash (funciona na API v1beta)
export const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/**
 * Função para chamar Gemini com sistema de fallback entre modelos
 * Tenta cada modelo na ordem até conseguir sucesso
 */
export async function callGeminiWithFallback(prompt: string, options?: { temperature?: number; maxOutputTokens?: number }) {
  const { temperature = 0.7, maxOutputTokens = 32000 } = options || {};
  
  for (const modelName of MODELS) {
    try {
      console.log(`🔄 Tentando modelo: ${modelName}`);
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: { temperature, maxOutputTokens }
      });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      console.log(`✅ Sucesso com modelo: ${modelName}`);
      return text;
    } catch (error) {
      console.error(`❌ Erro com modelo ${modelName}:`, error);
      // Continua para o próximo modelo
    }
  }
  
  throw new Error("Todos os modelos Gemini 2.5 falharam");
}

// Função para testar a API
export async function testGeminiAPI() {
  try {
    const text = await callGeminiWithFallback("Olá, você está funcionando?");
    console.log("Gemini 2.5 API funcionando:", text);
    return true;
  } catch (error) {
    console.error("Erro na API Gemini 2.5:", error);
    return false;
  }
}

// Exportar a instância do genAI para uso em outras funções
export { genAI };
