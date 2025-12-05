/**
 * Language Detection Service (GPT-Powered)
 * Usa GPT do agente configurado no sistema para detectar idioma com alta precisão
 */

import { supabase } from '@/integrations/supabase/client';

export class LanguageDetector {
  private supabaseClient = supabase;

  /**
   * Detectar idioma de uma mensagem usando GPT
   * Retorna: 'pt', 'en', 'es', 'ar'
   */
  async detectLanguage(text: string, gptApiKey: string): Promise<string> {
    try {
      const prompt = `Detecte o idioma da seguinte mensagem e responda APENAS com o código ISO 639-1 (2 letras):

Mensagem: "${text}"

Responda SOMENTE com: pt, en, es ou ar`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gptApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 5,
          temperature: 0.1,
        }),
      });

      const data = await response.json();
      const detectedLang = data.choices[0]?.message?.content?.trim().toLowerCase();
      
      // Validar resposta
      const validLangs = ['pt', 'en', 'es', 'ar'];
      if (validLangs.includes(detectedLang)) {
        return detectedLang;
      }

      return 'pt'; // Default
    } catch (error) {
      console.error('GPT language detection failed:', error);
      return 'pt'; // Fallback
    }
  }

  /**
   * Detectar idioma de um participante baseado em suas mensagens (usando GPT)
   */
  async detectParticipantLanguage(participantId: string, gptApiKey: string): Promise<string> {
    // Buscar últimas 10 mensagens do usuário
    const { data: messages, error } = await this.supabaseClient
      .from('whatsapp_messages')
      .select('message_content, sender')
      .eq('session_id', participantId)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (error || !messages || messages.length === 0) {
      return 'pt'; // Default
    }

    // Agregar apenas mensagens do cliente
    const clientMessages = messages
      .filter(m => m.sender === 'client')
      .map(m => m.message_content)
      .join('. ');

    if (!clientMessages) return 'pt';

    // Detectar idioma usando GPT
    return await this.detectLanguage(clientMessages, gptApiKey);
  }

  /**
   * Atualizar idioma de um participante
   */
  async updateParticipantLanguage(
    participantId: string, 
    gptApiKey: string,
    language?: string
  ): Promise<string | null> {
    const detectedLanguage = language || await this.detectParticipantLanguage(participantId, gptApiKey);

    const { error } = await this.supabaseClient
      .from('campaign_participants')
      .update({
        language: detectedLanguage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', participantId);

    if (error) {
      console.error('Erro ao atualizar idioma do participante:', error);
      return null;
    }

    return detectedLanguage;
  }

  /**
   * Processar mensagem recebida e detectar idioma via GPT
   */
  async processIncomingMessage(
    participantId: string, 
    messageContent: string,
    gptApiKey: string
  ): Promise<string> {
    // Detectar idioma da mensagem via GPT
    const language = await this.detectLanguage(messageContent, gptApiKey);

    // Buscar idioma atual do participante
    const { data: participant } = await this.supabaseClient
      .from('campaign_participants')
      .select('language, contact_count')
      .eq('id', participantId)
      .single();

    // Se idioma diferente ou ainda não definido, atualizar
    if (!participant?.language || participant.language !== language) {
      await this.updateParticipantLanguage(participantId, gptApiKey, language);
      return language;
    }

    return participant.language;
  }

  /**
   * Gerar saudação personalizada no idioma detectado via GPT
   * O GPT decide a melhor saudação baseado no contexto
   */
  async generateGreeting(language: string, gptApiKey: string, context?: string): Promise<string> {
    try {
      const prompt = `Gere uma saudação profissional e calorosa no idioma "${language}".
${context ? `Contexto: ${context}` : ''}

Responda apenas com a saudação, sem aspas ou formatação adicional.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gptApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 50,
          temperature: 0.7,
        }),
      });

      const data = await response.json();
      return data.choices[0]?.message?.content?.trim() || 'Hello!';
    } catch (error) {
      console.error('GPT greeting generation failed:', error);
      // Fallback básico
      const fallbacks: Record<string, string> = {
        pt: 'Olá! Como posso ajudar?',
        en: 'Hello! How can I help you?',
        es: '¡Hola! ¿Cómo puedo ayudarte?',
        ar: 'مرحبا! كيف يمكنني مساعدتك؟',
      };
      return fallbacks[language] || fallbacks.pt;
    }
  }

  /**
   * Traduzir qualquer mensagem via GPT para o idioma do cliente
   */
  async translateMessage(
    message: string, 
    targetLanguage: string,
    gptApiKey: string
  ): Promise<string> {
    try {
      const prompt = `Traduza a seguinte mensagem para o idioma "${targetLanguage}" mantendo o tom profissional e o contexto:

"${message}"

Responda apenas com a tradução, sem aspas ou formatação adicional.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${gptApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.3,
        }),
      });

      const data = await response.json();
      return data.choices[0]?.message?.content?.trim() || message;
    } catch (error) {
      console.error('GPT translation failed:', error);
      return message; // Retorna original se falhar
    }
  }
}

/**
 * Helper para criar instância
 */
export function createLanguageDetector() {
  return new LanguageDetector();
}
