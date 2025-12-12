import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { compareTwoStrings, findBestMatch } from 'string-similarity';

import { toast } from 'sonner';
import { 
  Trash2, Edit, Bot, RotateCcw, Clock, Zap, 
  Send, Sparkles, History, Loader2, MessageSquare,
  Check, ImagePlus, X
} from 'lucide-react';
import BackToHomeButton from '@/components/BackToHomeButton';

const agentSchema = z.object({
  name: z.string().min(1, "O nome do agente é obrigatório."),
  instructions: z.string().min(1, "As instruções do agente são obrigatórias."),
  gpt_api_key: z.string().min(1, "A chave da API GPT é obrigatória."),
  gpt_model: z.string().min(1, "Selecione um modelo GPT."),
  response_delay_seconds: z.number().min(5, "Mínimo 5 segundos").max(300, "Máximo 5 minutos"),
  word_delay_seconds: z.number().min(0.5, "Mínimo 0.5 segundos").max(5.0, "Máximo 5 segundos"),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
  allowed_instances: z.array(z.string()).optional(),
});

type Agent = z.infer<typeof agentSchema> & { id: string };

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  proposedPrompt?: string;
  imageUrl?: string; // base64 data URL da imagem anexada
}

interface PromptVersion {
  id: string;
  version_number: number;
  instructions: string;
  version_note: string | null;
  created_at: string;
}

interface DeleteConfirm {
  open: boolean;
  agentId: string | null;
  agentName: string;
}

// Modelos OpenAI atualizados Dezembro 2025 - Fonte: https://openai.com/api/pricing/
// ⚠️ Modelos GPT-5 Series (gpt-5, gpt-5-mini, gpt-5-nano) podem exigir VERIFICAÇÃO DE ORGANIZAÇÃO
// Para verificar: https://platform.openai.com/settings/organization/general → "Verify Organization"
const GPT_MODELS = [
  // === GPT-5.1 SERIES (Novembro 2025) - FLAGSHIP - Não exige verificação ===
  { 
    value: 'gpt-5.1', 
    label: '🌟 GPT-5.1 (Flagship, Melhor Coding/Agentes)', 
    context: 1000000,
    description: 'Modelo flagship. O melhor para coding e tarefas agênticas. Contexto de 1M tokens. Preço: $1.25/$10.00 por 1M tokens.'
  },
  
  // === GPT-5 SERIES (Agosto 2025) - ⚠️ PODE EXIGIR VERIFICAÇÃO DE ORGANIZAÇÃO ===
  { 
    value: 'gpt-5', 
    label: '⭐ GPT-5 (⚠️ Pode exigir verificação)', 
    context: 400000,
    description: '⚠️ PODE EXIGIR VERIFICAÇÃO. Modelo principal GPT-5. Excelente para coding e tarefas complexas. Preço: $1.25/$10.00 por 1M tokens.'
  },
  { 
    value: 'gpt-5-pro', 
    label: '🧠 GPT-5 Pro (Mais Inteligente e Preciso)', 
    context: 400000,
    description: 'O mais inteligente e preciso. Ideal para raciocínio profundo e máxima qualidade. Preço: $15.00/$120.00 por 1M tokens.'
  },
  { 
    value: 'gpt-5-mini', 
    label: '⚡ GPT-5 Mini (⚠️ Pode exigir verificação)', 
    context: 400000,
    description: '⚠️ PODE EXIGIR VERIFICAÇÃO. Excelente equilíbrio entre velocidade, qualidade e preço. Preço: $0.25/$2.00 por 1M tokens.'
  },
  { 
    value: 'gpt-5-nano', 
    label: '🚀 GPT-5 Nano (⚠️ Pode exigir verificação)', 
    context: 400000,
    description: '⚠️ PODE EXIGIR VERIFICAÇÃO. O mais rápido e barato da série GPT-5. Ideal para alto volume. Preço: $0.05/$0.40 por 1M tokens.'
  },
  
  // === GPT-4.1 SERIES (Fine-tunable) ===
  { 
    value: 'gpt-4.1', 
    label: 'GPT-4.1 (Fine-tune, Coding)', 
    context: 1000000,
    description: 'Modelo base para fine-tuning. Melhor que GPT-4 para seguir instruções e tarefas longas. Preço: $3.00/$12.00 por 1M tokens.'
  },
  { 
    value: 'gpt-4.1-mini', 
    label: 'GPT-4.1 Mini (Fine-tune, Econômico)', 
    context: 1000000,
    description: 'Versão econômica do GPT-4.1, ideal para fine-tuning em escala. Preço: $0.80/$3.20 por 1M tokens.'
  },
  { 
    value: 'gpt-4.1-nano', 
    label: 'GPT-4.1 Nano (Fine-tune, Ultra Rápido)', 
    context: 1000000,
    description: 'Menor e mais rápido da série 4.1. Ideal para aplicações em tempo real. Preço: $0.20/$0.80 por 1M tokens.'
  },
  
  // === GPT-4 SERIES (Legado, compatibilidade) ===
  { 
    value: 'gpt-4o', 
    label: 'GPT-4o (Multimodal, Rápido)', 
    context: 128000,
    description: 'GPT-4 Omni - multimodal (texto, imagem, áudio). Rápido e versátil. Modelo legado estável e confiável.'
  },
  { 
    value: 'gpt-4o-mini', 
    label: 'GPT-4o Mini (Econômico)', 
    context: 128000,
    description: 'Versão compacta do GPT-4o. Muito econômico para tarefas simples. Bom para alto volume de requisições.'
  },
  { 
    value: 'gpt-4-turbo', 
    label: 'GPT-4 Turbo (128k)', 
    context: 128000,
    description: 'GPT-4 otimizado para velocidade com contexto de 128k tokens. Modelo legado estável para produção.'
  },
];

// Interface para seções do prompt
interface PromptSection {
  id: string;
  title: string;
  content: string;
  level: number; // 1 = #, 2 = ##, 3 = ###
  startIndex: number;
  endIndex: number;
}

// Função para extrair seções do prompt
const extractPromptSections = (prompt: string): PromptSection[] => {
  const sections: PromptSection[] = [];
  const sectionRegex = /^(#{1,4})\s*(.+?)(?:\s*\(.*?\))?\s*$/gm;
  let match;
  
  while ((match = sectionRegex.exec(prompt)) !== null) {
    if (sections.length > 0) {
      sections[sections.length - 1].endIndex = match.index;
      sections[sections.length - 1].content = prompt.slice(sections[sections.length - 1].startIndex, match.index).trim();
    }
    
    sections.push({
      id: `section-${sections.length}`,
      title: match[2].trim(),
      content: '',
      level: match[1].length,
      startIndex: match.index,
      endIndex: prompt.length
    });
  }
  
  if (sections.length > 0) {
    sections[sections.length - 1].content = prompt.slice(sections[sections.length - 1].startIndex).trim();
  }
  
  return sections;
};

// ====================================================================
// ARQUITETURA SIMPLIFICADA DO ASSISTENTE DE PROMPT
// ====================================================================
// O assistente recebe o prompt COMPLETO e retorna o prompt COMPLETO 
// atualizado. Não há mais merge complexo com regex - apenas 
// substituição direta. Isso evita:
// 1. Crescimento infinito do prompt (quando seção não era encontrada)
// 2. Bugs de regex com caracteres especiais
// 3. Duplicação de seções
//
// O modelo GPT decide como reorganizar/melhorar o prompt, e o usuário
// pode usar o histórico de versões para desfazer se necessário.
// ====================================================================

// Função para testar se um modelo GPT funciona
const testGPTModel = async (apiKey: string, model: string): Promise<{ success: boolean; message: string; responseTime?: number }> => {
  const startTime = Date.now();
  try {
    // === CONFIGURAÇÃO DE MODELOS OPENAI (Dezembro 2025) ===
    const isGpt5Series = model.startsWith('gpt-5');
    const isGpt51 = model.startsWith('gpt-5.1');
    const isGpt5Pro = model === 'gpt-5-pro';
    const isGpt41Series = model.startsWith('gpt-4.1');
    const isOSeries = model.startsWith('o3') || model.startsWith('o4');
    
    // Reasoning models: GPT-5 e O-series (usam developer role + max_completion_tokens)
    // Non-reasoning: GPT-4.1 e legados (usam system role + max_tokens)
    const isReasoningModel = isGpt5Series || isOSeries;
    
    // Token parameter
    const tokenParam = isReasoningModel ? { max_completion_tokens: 200 } : { max_tokens: 50 };
    
    // Role: developer para reasoning models, system para non-reasoning
    const systemRole = isReasoningModel ? 'developer' : 'system';
    
    // Parâmetros extras
    let extraParams: Record<string, any> = {};
    
    if (isGpt5Series) {
      if (isGpt5Pro) {
        extraParams = { reasoning_effort: "medium" };
      } else if (isGpt51) {
        extraParams = { reasoning_effort: "none", temperature: 0 };
      } else {
        // gpt-5, gpt-5-mini, gpt-5-nano requerem reasoning_effort (mínimo low)
        extraParams = { reasoning_effort: "low" };
      }
    } else if (isOSeries) {
      extraParams = { reasoning_effort: "low" };
    } else if (isGpt41Series) {
      extraParams = { temperature: 0 };
    } else {
      // Modelos legados
      extraParams = { temperature: 0 };
    }
    
    console.log(`[testGPTModel] Testing ${model} | systemRole: ${systemRole} | extraParams:`, extraParams);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: systemRole, content: 'You are a helpful assistant. Respond briefly.' },
          { role: 'user', content: 'Respond with only: OK' }
        ],
        ...tokenParam,
        ...extraParams
      })
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `Erro ${response.status}`;
      
      // Verificar se é erro de modelo não existente
      if (errorMsg.includes('does not exist') || errorMsg.includes('not found') || response.status === 404) {
        return { success: false, message: `❌ Modelo "${model}" NÃO EXISTE na API OpenAI` };
      }
      return { success: false, message: `❌ Erro: ${errorMsg}` };
    }

    const data = await response.json();
    console.log('GPT Response:', JSON.stringify(data, null, 2));
    
    // Verificar se há resposta válida
    if (data.choices?.[0]) {
      const content = data.choices[0]?.message?.content || '';
      const finishReason = data.choices[0]?.finish_reason;
      const usedReasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens > 0;
      
      // Modelo funciona se:
      // 1. Retornou conteúdo
      // 2. Ou terminou com 'stop' 
      // 3. Ou usou reasoning tokens (modelos GPT-5/O-series)
      if (content || finishReason === 'stop' || usedReasoningTokens) {
        const modelInfo = data.model || model;
        return { success: true, message: `✅ ${modelInfo} OK! (${responseTime}ms)`, responseTime };
      }
    }
    return { success: false, message: `❌ Resposta inesperada: ${JSON.stringify(data).substring(0, 100)}` };
  } catch (error: any) {
    return { success: false, message: `❌ Erro: ${error.message}` };
  }
};

/**
 * Normaliza unicode usando NFKD para remover diferenças de:
 * - Hyphens diferentes (U+2011 vs U+002D)
 * - Quotes curly vs straight
 * - Ligaduras (ﬀ vs ff)
 */
const normalizeUnicode = (text: string): string => {
  // NFKD decompõe caracteres combinados
  let normalized = text.normalize('NFKD');
  // Remove marcas diacríticas (acentos)
  normalized = normalized.replace(/[\u0300-\u036f]/g, '');
  // Normaliza espaços em branco (tabs, múltiplos espaços)
  normalized = normalized.replace(/\s+/g, ' ');
  // Normaliza hyphens (todos os tipos para hyphen-minus regular)
  normalized = normalized.replace(/[\u2010-\u2015\u2012\u2013\u2014\u2011\u2010]/g, '-');
  // Normaliza quotes curly para straight
  normalized = normalized.replace(/[\u201c\u201d\u201e\u201f]/g, '"');
  // Normaliza apostrophes curly para straight
  normalized = normalized.replace(/[\u2018\u2019\u201b]/g, "'");
  return normalized.toLowerCase().trim();
};

/**
 * Encontra o melhor match fuzzy em um texto
 * Retorna: { index: número da posição, matchText: texto encontrado, similarity: score 0-1 }
 */
const findFuzzyMatch = (
  searchText: string,
  document: string,
  threshold: number = 0.85
): { index: number; matchText: string; similarity: number } | null => {
  if (!searchText || searchText.length < 3) return null;
  
  const normalized = normalizeUnicode;
  const searchNorm = normalized(searchText);
  const docNorm = normalized(document);
  
  // Estratégia 1: Procurar por linhas (melhor para documentos com múltiplas linhas)
  const lines = document.split('\n');
  let bestMatch: { index: number; matchText: string; similarity: number } | null = null;
  let charIndex = 0;
  
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNorm = normalized(line);
    
    // Verificar se encontra exatamente na linha normalizada
    if (lineNorm.includes(searchNorm)) {
      const idx = lineNorm.indexOf(searchNorm);
      return {
        index: charIndex + idx,
        matchText: line.substring(idx, idx + searchText.length),
        similarity: 1.0
      };
    }
    
    const similarity = compareTwoStrings(searchNorm, lineNorm);
    if (similarity > threshold) {
      return {
        index: charIndex,
        matchText: line,
        similarity: similarity
      };
    }
    
    // Se não encontrou na linha inteira, procurar em chunks da linha
    if (line.length > searchText.length) {
      const chunkSize = searchText.length + 20;
      for (let i = 0; i <= line.length - searchText.length; i += Math.max(1, Math.floor(searchText.length / 2))) {
        const chunk = line.substring(i, Math.min(i + chunkSize, line.length));
        const chunkNorm = normalized(chunk);
        const chunkSimilarity = compareTwoStrings(searchNorm, chunkNorm);
        
        if (chunkSimilarity > (bestMatch?.similarity || threshold)) {
          bestMatch = {
            index: charIndex + i,
            matchText: chunk,
            similarity: chunkSimilarity
          };
        }
      }
    }
    
    charIndex += line.length + 1; // +1 para o '\n'
  }
  
  return bestMatch;
};

/**
 * Aplica edição com fuzzy matching
 * Tenta encontrar o texto mesmo com diferenças de codificação unicode
 */
const applyFuzzyEdit = (
  document: string,
  searchText: string,
  replaceText: string,
  threshold: number = 0.85
): { success: boolean; result: string; matchedText?: string } => {
  // Primeiro tenta exact match (mais rápido)
  if (document.includes(searchText)) {
    return {
      success: true,
      result: document.replace(searchText, replaceText),
      matchedText: searchText
    };
  }
  
  // Se falhar, tenta fuzzy match
  const match = findFuzzyMatch(searchText, document, threshold);
  
  if (!match) {
    return {
      success: false,
      result: document,
      matchedText: undefined
    };
  }
  
  // Encontrou um match fuzzy - remover o trecho encontrado e inserir o novo
  const before = document.substring(0, match.index);
  const after = document.substring(match.index + match.matchText.length);
  
  return {
    success: true,
    result: before + replaceText + after,
    matchedText: match.matchText
  };
};

const AgentConfiguration = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm>({ open: false, agentId: null, agentName: '' });
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Chat IA states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatImage, setChatImage] = useState<string | null>(null); // base64 data URL
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [promptVersions, setPromptVersions] = useState<PromptVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [isTestingModel, setIsTestingModel] = useState(false);
  const [modelTestResult, setModelTestResult] = useState<string | null>(null);
  const [isPreservationTesting, setIsPreservationTesting] = useState(false);
  const [preservationTestResults, setPreservationTestResults] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof agentSchema>>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      name: "",
      instructions: "",
      gpt_api_key: "",
      gpt_model: "gpt-5-mini",
      response_delay_seconds: 30,
      word_delay_seconds: 1.6,
      is_active: true,
      is_default: false,
      allowed_instances: [],
    },
  });

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Carregar versões quando editar agente
  useEffect(() => {
    if (editingAgentId) {
      fetchPromptVersions(editingAgentId);
      // Adicionar mensagem de boas-vindas
      const sections = extractPromptSections(form.getValues('instructions'));
      setChatMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Olá! 👋 Sou seu assistente de calbiramento para melhorar o seu agente ia "${form.getValues('name')}".

**📊 Seu Agente tem ${sections.length} seções estruturadas.**

## Como funciona:
1. 📝 Me diga o que quer melhorar (ex: "melhore a saudação", "adicione tratamento de objeções")
2. 🔍 Eu identifico QUAL SEÇÃO será afetada
3. ✅ Você aprova e eu ATUALIZO apenas aquela seção
4. 💾 O histórico de versões é mantido automaticamente

## Exemplos de pedidos:
- "Quero que a saudação seja mais direta"
- "Adicione uma seção sobre como lidar com silêncio"
- "Melhore as regras anti-erro"
- "Torne o tom mais profissional na seção de identidade"

⚠️ **Eu SEMPRE ATUALIZO seções específicas** - nunca substituo o prompt inteiro!`,
        timestamp: new Date()
      }]);
    } else {
      setChatMessages([]);
      setPromptVersions([]);
    }
  }, [editingAgentId]);

  const fetchPromptVersions = async (agentId: string) => {
    try {
      const { data, error } = await supabase
        .from('agent_prompt_versions')
        .select('*')
        .eq('agent_id', agentId)
        .order('version_number', { ascending: false })
        .limit(20);
      
      if (!error && data) {
        setPromptVersions(data);
      }
    } catch (err) {
      console.error('Erro ao carregar versões:', err);
    }
  };

  const savePromptVersion = async (instructions: string, note: string) => {
    if (!editingAgentId) return;
    
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      // Pegar próximo número de versão
      const nextVersion = promptVersions.length > 0 
        ? promptVersions[0].version_number + 1 
        : 1;

      const { error } = await supabase
        .from('agent_prompt_versions')
        .insert({
          agent_id: editingAgentId,
          user_id: user.user.id,
          instructions,
          version_number: nextVersion,
          version_note: note,
          is_current: true
        });

      if (!error) {
        fetchPromptVersions(editingAgentId);
        toast.success(`Versão ${nextVersion} salva no histórico!`);
      }
    } catch (err) {
      console.error('Erro ao salvar versão:', err);
    }
  };

  const restoreVersion = async (version: PromptVersion) => {
    form.setValue('instructions', version.instructions, { shouldDirty: true, shouldValidate: true });
    
    // Adicionar mensagem no chat
    setChatMessages(prev => [...prev, {
      id: `restore-${Date.now()}`,
      role: 'system',
      content: `✅ Restaurada versão ${version.version_number} de ${new Date(version.created_at).toLocaleString('pt-BR')}`,
      timestamp: new Date()
    }]);
  };

  // Handler para seleção de imagem via input file
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[handleImageSelect] Arquivo selecionado:', e.target.files);
    const file = e.target.files?.[0];
    if (!file) {
      console.log('[handleImageSelect] Nenhum arquivo');
      return;
    }
    
    // Validar tipo de arquivo
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione uma imagem (PNG, JPG, etc.)');
      return;
    }
    
    // Validar tamanho (max 20MB para OpenAI)
    if (file.size > 20 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 20MB');
      return;
    }
    
    console.log('[handleImageSelect] Convertendo para base64:', file.name, file.type, file.size);
    
    // Converter para base64
    const reader = new FileReader();
    reader.onload = () => {
      console.log('[handleImageSelect] Base64 pronto, tamanho:', (reader.result as string).length);
      setChatImage(reader.result as string);
      toast.success('Imagem anexada com sucesso!');
    };
    reader.onerror = () => {
      console.error('[handleImageSelect] Erro ao ler arquivo');
      toast.error('Erro ao ler a imagem');
    };
    reader.readAsDataURL(file);
    
    // Limpar input para permitir selecionar a mesma imagem novamente
    e.target.value = '';
  };

  // Handler para colar imagem do clipboard (Ctrl+V)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    
    console.log('[handlePaste] Clipboard items:', items.length);
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log('[handlePaste] Item:', item.type, item.kind);
      
      if (item.type.startsWith('image/')) {
        e.preventDefault(); // Prevenir paste de texto
        
        const file = item.getAsFile();
        if (!file) {
          console.log('[handlePaste] Não conseguiu obter arquivo');
          continue;
        }
        
        console.log('[handlePaste] Imagem encontrada no clipboard:', file.type, file.size);
        
        // Validar tamanho
        if (file.size > 20 * 1024 * 1024) {
          toast.error('A imagem deve ter no máximo 20MB');
          return;
        }
        
        // Converter para base64
        const reader = new FileReader();
        reader.onload = () => {
          console.log('[handlePaste] Base64 pronto, tamanho:', (reader.result as string).length);
          setChatImage(reader.result as string);
          toast.success('🖼️ Print colado com sucesso!');
        };
        reader.onerror = () => {
          console.error('[handlePaste] Erro ao ler imagem do clipboard');
          toast.error('Erro ao processar a imagem');
        };
        reader.readAsDataURL(file);
        
        return; // Só processar a primeira imagem
      }
    }
  };

  const sendChatMessage = async () => {
    console.log('[sendChatMessage] Iniciando...', { chatInput: chatInput.trim(), hasImage: !!chatImage, isAiLoading, editingAgentId });
    
    // Permitir envio se tiver texto OU imagem
    if ((!chatInput.trim() && !chatImage) || isAiLoading || !editingAgentId) {
      console.log('[sendChatMessage] Retornando cedo:', { 
        noChatInput: !chatInput.trim(),
        noImage: !chatImage,
        isLoading: isAiLoading, 
        noAgentId: !editingAgentId 
      });
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: chatInput.trim() || '(imagem enviada)',
      timestamp: new Date(),
      imageUrl: chatImage || undefined
    };

    // Guardar referência da imagem antes de limpar
    const currentImage = chatImage;

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatImage(null);
    setIsAiLoading(true);

    try {
      const currentInstructions = form.getValues('instructions');
      const apiKey = form.getValues('gpt_api_key');
      
      // USAR O MESMO MODELO CONFIGURADO NO AGENTE
      // Se não tiver modelo configurado, usar gpt-5-mini como fallback
      const agentModel = form.getValues('gpt_model') || 'gpt-5-mini';
      
      console.log('[chat] 🤖 Usando modelo do agente:', agentModel);

      if (!apiKey) {
        throw new Error('Configure a chave da API GPT primeiro');
      }

      // Preparar histórico de conversa (limitar para economizar tokens)
      // Para mensagens com imagem, não incluir no histórico (muito pesado)
      const conversationHistory = chatMessages
        .filter(m => m.role !== 'system' && !m.imageUrl)
        .slice(-4)
        .map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content.length > 2000 ? m.content.slice(0, 2000) + '...' : m.content
        }));

      // ARQUITETURA ULTRA-RÁPIDA: GPT retorna INSTRUÇÕES, não reescreve documento!
      // Usar search-and-replace é 10x mais rápido que reescrever tudo
      // 1. resposta_chat: Explica o que vai fazer
      // 2. operacao: "nenhuma" ou "editar"
      // 3. edicoes: Array de {buscar: "texto exato", substituir: "novo texto"}
      
      const systemPrompt = `Você é um assistente especializado em editar playbooks de vendas.

CRÍTICO: NUNCA reescreva o documento inteiro! Use search-and-replace para ser RÁPIDO.

IMPORTANTE:
- Seja conversacional e amigável na resposta do chat
- Para PERGUNTAS: use operacao="nenhuma"
- Para EDIÇÕES: use operacao="editar" e forneça array de edicoes
- Cada edição tem: "buscar" (texto EXATO do documento) e "substituir" (novo texto)
- Exemplo: {"buscar": "tom profissional", "substituir": "tom persuasivo e agressivo"}
- Use múltiplas edições pequenas ao invés de reescrever seções grandes
- Identifique 2-5 trechos específicos para melhorar, não o documento todo!`;

      // Construir mensagem do usuário - com ou sem imagem
      let userMessageContent: any;
      
      if (currentImage) {
        // Mensagem com imagem - usar formato vision
        userMessageContent = [
          {
            type: 'text',
            text: `DOCUMENTO ATUAL DO PLAYBOOK:
\`\`\`
${currentInstructions}
\`\`\`

MENSAGEM DO USUÁRIO:
${userMessage.content || 'Analise a imagem e use as informações para calibrar o playbook.'}`
          },
          {
            type: 'image_url',
            image_url: {
              url: currentImage,
              detail: 'high' // alta qualidade para ler textos na imagem
            }
          }
        ];
        console.log('[chat] 🖼️ Mensagem inclui imagem (vision mode)');
      } else {
        // Mensagem só texto
        userMessageContent = `DOCUMENTO ATUAL DO PLAYBOOK:
\`\`\`
${currentInstructions}
\`\`\`

MENSAGEM DO USUÁRIO:
${userMessage.content}`;
      }

      console.log('[chat] 🚀 Iniciando chamada à API OpenAI (JSON Schema)...');
      console.log('[chat] 📊 Modelo:', agentModel);
      console.log('[chat] 📏 Tamanho do prompt atual:', currentInstructions.length, 'caracteres');
      console.log('[chat] 🖼️ Com imagem:', !!currentImage);
      
      // === CONFIGURAÇÃO DE MODELOS OPENAI (Dezembro 2025) ===
      // GPT-5.x: usam role "developer" (reasoning models)
      // GPT-4.1.x: usam role "system" (non-reasoning, mais rápidos)
      // Modelos legados (gpt-4o, gpt-4-turbo): usam role "system" + temperature
      const isGpt5Series = agentModel.startsWith('gpt-5');
      const isGpt51 = agentModel.startsWith('gpt-5.1');
      const isGpt5Pro = agentModel === 'gpt-5-pro';
      const isGpt41Series = agentModel.startsWith('gpt-4.1');
      const isOSeries = agentModel.startsWith('o3') || agentModel.startsWith('o4');
      
      // Role: developer APENAS para GPT-5 e O-series (reasoning models)
      // GPT-4.1 e legados usam 'system'
      const isReasoningModel = isGpt5Series || isOSeries;
      const systemRole = isReasoningModel ? "developer" : "system";
      
      // Token param: max_completion_tokens para reasoning, max_tokens para non-reasoning
      const useCompletionTokens = isReasoningModel;
      
      // CÁLCULO DINÂMICO DE TOKENS BASEADO NO TAMANHO DO PROMPT
      // O schema pede o documento completo de volta, então precisamos de tokens suficientes
      // Aproximação: 1 token ≈ 3.5 caracteres em português (margem de segurança)
      // A resposta JSON contém: documento_atualizado (~mesmo tamanho) + resposta_chat (~1000) + overhead JSON (~500)
      const promptChars = currentInstructions.length;
      const estimatedDocTokens = Math.ceil(promptChars / 3); // Documento pode ficar maior
      const responseOverhead = 2000; // Para resposta_chat + JSON overhead
      const maxTokens = Math.min(Math.max(estimatedDocTokens + responseOverhead, 4000), 64000); // Min 4k, max 64k
      
      console.log(`[chat] 📐 Prompt: ${promptChars} chars → doc: ~${estimatedDocTokens} tokens → max: ${maxTokens}`);
      
      // Token parameter: max_completion_tokens para reasoning models, max_tokens para non-reasoning
      const tokenParam = useCompletionTokens ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens };
      
      // Parâmetros extras (reasoning_effort / temperature)
      let extraParams: Record<string, any> = {};
      
      if (isGpt5Series) {
        // GPT-5 series requer reasoning_effort
        if (isGpt5Pro) {
          extraParams = { reasoning_effort: "medium" };
        } else if (isGpt51) {
          // gpt-5.1 com reasoning=none pode usar temperature
          extraParams = { reasoning_effort: "none", temperature: 0.3 };
        } else {
          // gpt-5, gpt-5-mini, gpt-5-nano: mínimo é "low"
          extraParams = { reasoning_effort: "low" };
        }
      } else if (isOSeries) {
        extraParams = { reasoning_effort: "low" };
      } else if (isGpt41Series) {
        // GPT-4.1 suporta temperature
        extraParams = { temperature: 0.3 };
      } else {
        // Modelos legados (gpt-4o, gpt-4-turbo, etc)
        extraParams = { temperature: 0.3 };
      }
      
      console.log(`[chat] 🧠 Modelo: ${agentModel} | isReasoning: ${isReasoningModel} | systemRole: ${systemRole}`);
      console.log(`[chat] 📦 extraParams:`, extraParams);
      
      // TIMEOUT REDUZIDO: nova arquitetura só retorna mudanças, não documento completo
      // Isso permite timeouts muito menores mesmo para prompts grandes
      const baseTimeout = 30000; // 30 segundos base
      const extraTimePerKChar = 2000; // +2 segundos por 1000 caracteres (reduzido de 8s)
      const calculatedTimeout = Math.min(baseTimeout + (promptChars / 1000) * extraTimePerKChar, 90000); // Máx 90 segundos
      
      console.log(`[chat] ⏱️ Timeout calculado: ${Math.round(calculatedTimeout/1000)}s para prompt de ${promptChars} chars`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error(`[chat] ⏰ Timeout de ${Math.round(calculatedTimeout/1000)} segundos atingido!`);
        controller.abort();
      }, calculatedTimeout);
      
      // Ajustar mensagens do histórico para usar o role correto
      const adjustedConversationHistory = conversationHistory.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      }));
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: agentModel,
          messages: [
            { role: systemRole, content: systemPrompt },
            ...adjustedConversationHistory,
            { role: 'user', content: userMessageContent }
          ],
          ...tokenParam,
          ...extraParams,
          // CRÍTICO: response_format com JSON Schema garante resposta válida
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'ChatResponse',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  resposta_chat: {
                    type: 'string',
                    description: 'Resposta conversacional para o usuário. Explique as mudanças que fará.'
                  },
                  operacao: {
                    type: 'string',
                    enum: ['nenhuma', 'editar'],
                    description: 'nenhuma=sem mudanças, editar=aplicar edições via search-and-replace'
                  },
                  edicoes: {
                    type: 'array',
                    description: 'Array de edições (search-and-replace). Vazio se operacao=nenhuma.',
                    items: {
                      type: 'object',
                      properties: {
                        buscar: {
                          type: 'string',
                          description: 'Texto EXATO do documento a ser substituído. Deve existir no documento.'
                        },
                        substituir: {
                          type: 'string',
                          description: 'Novo texto que substituirá o texto buscado.'
                        }
                      },
                      required: ['buscar', 'substituir'],
                      additionalProperties: false
                    }
                  }
                },
                required: ['resposta_chat', 'operacao', 'edicoes'],
                additionalProperties: false
              }
            }
          }
        })
      });
      
      // Limpar o timeout após receber resposta
      clearTimeout(timeoutId);
      console.log('[chat] ✅ Resposta recebida da API');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[chat] ❌ OpenAI API Error:', errorData);
        const errorMsg = errorData.error?.message || `Erro ${response.status} na API do GPT`;
        throw new Error(errorMsg);
      }

      const data = await response.json();
      console.log('[chat] 📊 Tokens usados:', data.usage);
      
      const responseContent = data.choices[0]?.message?.content || '';
      console.log('[chat] 📝 Tamanho da resposta:', responseContent.length, 'caracteres');

      // Parsear JSON (garantido válido pelo response_format)
      let proposedPrompt: string | null = null;
      let assistantContent = '';
      let warningMessage = '';
      
      try {
        const result = JSON.parse(responseContent);
        console.log('[chat] ✅ JSON parseado com sucesso');
        console.log('[chat] 💬 Resposta chat:', result.resposta_chat?.substring(0, 100) + '...');
        console.log('[chat] 🔄 Operação:', result.operacao);
        
        // Usar a resposta conversacional do GPT
        assistantContent = result.resposta_chat || 'Processado com sucesso.';
        
        // Processar baseado no tipo de operação
        if (result.operacao === 'editar' && result.edicoes && result.edicoes.length > 0) {
          // Aplicar edições via search-and-replace
          let updatedDoc = currentInstructions;
          let totalChanges = 0;
          let failedChanges = 0;
          
          console.log(`[chat] ✂️ Aplicando ${result.edicoes.length} edições com fuzzy matching...`);
          
          for (const edicao of result.edicoes) {
            const { buscar, substituir } = edicao;
            
            // Usar fuzzy matching com threshold 85%
            const fuzzyResult = applyFuzzyEdit(updatedDoc, buscar, substituir, 0.85);
            
            if (fuzzyResult.success) {
              updatedDoc = fuzzyResult.result;
              totalChanges++;
              const matchType = fuzzyResult.matchedText === buscar ? '✅ EXACT' : '✨ FUZZY';
              console.log(`[chat] ${matchType} Edição ${totalChanges}: "${buscar.substring(0, 50)}..." → "${substituir.substring(0, 50)}..."`);
              if (fuzzyResult.matchedText !== buscar) {
                console.log(`[chat]    Encontrado via fuzzy: "${fuzzyResult.matchedText?.substring(0, 50)}..."`);
              }
            } else {
              failedChanges++;
              console.log(`[chat] ⚠️ Texto não encontrado (fuzzy match falhou): "${buscar.substring(0, 50)}..."`);
            }
          }
          
          if (totalChanges > 0) {
            const sizeDiff = updatedDoc.length - currentInstructions.length;
            
            console.log(`[chat] 📊 Resultado: ${totalChanges} edições aplicadas, ${failedChanges} falharam`);
            console.log(`[chat] 📏 Diferença: ${sizeDiff > 0 ? '+' : ''}${sizeDiff} caracteres`);
            
            proposedPrompt = updatedDoc;
            assistantContent += `\n\n✅ **${totalChanges} alteração(ões) pronta(s)!** (${sizeDiff > 0 ? '+' : ''}${sizeDiff} caracteres)\n_Clique em "Aplicar Alterações" para confirmar._`;
            
            if (failedChanges > 0) {
              warningMessage = `\n\n⚠️ **NOTA**: ${failedChanges} edição(ões) não foi(ram) encontrada(s) no texto.`;
            }
          } else {
            assistantContent += `\n\n⚠️ Nenhuma edição pôde ser aplicada (textos não encontrados).`;
            warningMessage = `\n\n💡 **DICA**: Tente descrever a mudança de forma mais específica, citando trechos exatos do documento.`;
          }
          
        } else if (result.operacao === 'nenhuma') {
          // Apenas conversa, sem alterações
          console.log('[chat] 💬 Apenas conversa, sem alterações no documento');
        }
        
      } catch (parseError) {
        console.error('[chat] ❌ Erro ao parsear JSON:', parseError);
        console.log('[chat] 🔍 Tentando extração manual de conteúdo...');
        
        // Fallback: tentar extrair a resposta manualmente
        try {
          const respostaChatMatch = responseContent.match(/"resposta_chat"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
          if (respostaChatMatch && respostaChatMatch[1]) {
            const extractedResponse = respostaChatMatch[1]
              .replace(/\\n/g, '\n')
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\');
            
            console.log('[chat] ✅ Resposta extraída manualmente:', extractedResponse.substring(0, 100) + '...');
            assistantContent = extractedResponse;
            
            // Verificar se houve alteração
            const alteracaoMatch = responseContent.match(/"alteracao_feita"\s*:\s*(true|false)/);
            if (alteracaoMatch && alteracaoMatch[1] === 'true') {
              // Tentar extrair documento atualizado
              const docMatch = responseContent.match(/"documento_atualizado"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
              if (docMatch && docMatch[1]) {
                const updatedDoc = docMatch[1]
                  .replace(/\\n/g, '\n')
                  .replace(/\\"/g, '"')
                  .replace(/\\\\/g, '\\');
                
                if (updatedDoc.length > 100) {
                  proposedPrompt = updatedDoc;
                  const sizeDiff = updatedDoc.length - currentInstructions.length;
                  const diffText = sizeDiff > 0 
                    ? `(+${sizeDiff} caracteres)` 
                    : sizeDiff < 0 
                      ? `(${sizeDiff} caracteres)` 
                      : '(mesmo tamanho)';
                  assistantContent += `\n\n✅ **Alteração pronta!** ${diffText}\n_Clique em "Aplicar Alterações" para confirmar._`;
                }
              }
            }
          } else {
            assistantContent = 'Desculpe, ocorreu um erro ao processar a resposta. Tente novamente.';
          }
        } catch (fallbackError) {
          console.error('[chat] ❌ Fallback também falhou:', fallbackError);
          assistantContent = 'Desculpe, ocorreu um erro ao processar a resposta. Tente novamente.';
        }
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: assistantContent + warningMessage,
        timestamp: new Date(),
        proposedPrompt: proposedPrompt || undefined
      };

      setChatMessages(prev => [...prev, assistantMessage]);

    } catch (error: any) {
      console.error('[chat] ❌ Erro na chamada:', error);
      
      // Detectar se foi timeout/abort
      const isTimeout = error.name === 'AbortError';
      const errorText = isTimeout 
        ? 'A requisição demorou demais. Seu Agente é grande - isso pode levar até 3 minutos. Tente novamente.'
        : error.message;
      
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'system',
        content: `❌ Erro: ${errorText}`,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, errorMessage]);
      toast.error(errorText);
    } finally {
      setIsAiLoading(false);
    }
  };

  const applyProposedPrompt = async (proposedPrompt: string, messageId: string) => {
    const previousInstructions = form.getValues('instructions');
    
    // NOVA ARQUITETURA SIMPLIFICADA
    // O prompt proposto já é o prompt COMPLETO atualizado
    // Não há mais merge - apenas substituição direta
    
    // Salvar versão anterior no histórico (backup automático)
    await savePromptVersion(previousInstructions, `Backup antes de atualização via chat IA`);
    
    // Aplicar prompt completo (substituição direta)
    form.setValue('instructions', proposedPrompt, { shouldDirty: true, shouldValidate: true });
    
    // Calcular diferença para feedback
    const sizeDiff = proposedPrompt.length - previousInstructions.length;
    const diffText = sizeDiff > 0 
      ? `(+${sizeDiff} caracteres)` 
      : sizeDiff < 0 
        ? `(${sizeDiff} caracteres)` 
        : '(mesmo tamanho)';
    
    const feedbackMsg = `✅ **Prompt atualizado com sucesso!** ${diffText}\nUse o histórico de versões para desfazer se necessário.`;
    
    // Marcar mensagem como aplicada
    setChatMessages(prev => prev.map(msg => 
      msg.id === messageId 
        ? { ...msg, proposedPrompt: undefined, content: msg.content + `\n\n${feedbackMsg}` }
        : msg
    ));
    
    // Salvar nova versão
    await savePromptVersion(proposedPrompt, `Prompt atualizado via chat IA`);
    
    toast.success(`Prompt atualizado com sucesso! ${diffText}`);
  };

  // TESTE AUTOMATIZADO DE PRESERVAÇÃO
  // Simula vários pedidos de edição e verifica se o GPT preserva o conteúdo
  const runPreservationTest = async () => {
    const currentInstructions = form.getValues('instructions');
    const apiKey = form.getValues('gpt_api_key');

    if (!apiKey) {
      toast.error('Configure a chave da API GPT primeiro');
      return;
    }

    if (currentInstructions.length < 100) {
      toast.error('Adicione um prompt de agente antes de testar');
      return;
    }

    setIsPreservationTesting(true);
    setPreservationTestResults('🔄 Executando teste de preservação com 3 edições...');

    // 3 testes sequenciais que modificam o documento progressivamente
    const testCases = [
      { name: 'Adicionar regra', request: 'Adicione uma regra simples: "Sempre use tom positivo"' },
      { name: 'Modificar item', request: 'Altere alguma saudação ou expressão para ser mais amigável' },
      { name: 'Inserir exemplo', request: 'Adicione um exemplo curto de resposta simpática' }
    ];

    const results: Array<{name: string, success: boolean, sizeBefore: number, sizeAfter: number, details: string}> = [];
    
    // Documento que será modificado progressivamente
    let workingDocument = currentInstructions;
    
    // System prompt SEARCH_MARKERS (mesmo usado no chat)
    const getSystemPrompt = (doc: string) => `Você é um editor cirúrgico de playbooks de vendas. 

## FORMATO OBRIGATÓRIO DE RESPOSTA

Primeiro, explique brevemente o que vai fazer (1 linha).
Depois, use EXATAMENTE este formato:

@BUSCAR: [texto EXATO do documento que será usado como referência]
@ACAO: [INSERIR_APOS | INSERIR_ANTES | SUBSTITUIR | REMOVER]
@CONTEUDO:
[seu novo conteúdo aqui]
@FIM

## REGRAS ABSOLUTAS

1. O texto em @BUSCAR deve ser cópia EXATA do documento (com **, *, etc)
2. NUNCA retorne o documento inteiro
3. Uma edição por resposta
4. Preserve toda a formatação Markdown

## DOCUMENTO ATUAL
${doc}`;

    // Parser SEARCH_MARKERS
    const parseAndApply = (doc: string, gptResponse: string) => {
      const searchPattern = /@BUSCAR:\s*(.+?)(?:\n|$)[\s\S]*?@ACAO:\s*(INSERIR_APOS|INSERIR_ANTES|SUBSTITUIR|REMOVER)[\s\S]*?@CONTEUDO:\s*([\s\S]*?)@FIM/i;
      const match = gptResponse.match(searchPattern);
      
      if (!match) return { success: false, result: doc, error: 'Formato não reconhecido' };
      
      const searchText = match[1].trim();
      const action = match[2].toUpperCase().trim();
      const newContent = match[3].trim();
      
      let searchIndex = doc.indexOf(searchText);
      if (searchIndex === -1) {
        // Busca fuzzy
        searchIndex = doc.toLowerCase().indexOf(searchText.toLowerCase());
      }
      
      if (searchIndex === -1) return { success: false, result: doc, error: 'Texto não encontrado' };
      
      let updatedDoc = doc;
      if (action === 'SUBSTITUIR') {
        updatedDoc = doc.substring(0, searchIndex) + newContent + doc.substring(searchIndex + searchText.length);
      } else if (action === 'INSERIR_APOS') {
        const endIdx = searchIndex + searchText.length;
        updatedDoc = doc.substring(0, endIdx) + '\n' + newContent + doc.substring(endIdx);
      } else if (action === 'INSERIR_ANTES') {
        updatedDoc = doc.substring(0, searchIndex) + newContent + '\n' + doc.substring(searchIndex);
      } else if (action === 'REMOVER') {
        updatedDoc = doc.substring(0, searchIndex) + doc.substring(searchIndex + searchText.length);
      }
      
      return { success: true, result: updatedDoc };
    };

    for (const test of testCases) {
      const sizeBefore = workingDocument.length;
      
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: getSystemPrompt(workingDocument) },
              { role: 'user', content: test.request }
            ],
            temperature: 0.3,
            max_tokens: 2000
          })
        });

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        const parseResult = parseAndApply(workingDocument, content);
        
        if (parseResult.success) {
          workingDocument = parseResult.result;
          const sizeAfter = workingDocument.length;
          const diff = sizeAfter - sizeBefore;
          
          results.push({
            name: test.name,
            success: true,
            sizeBefore,
            sizeAfter,
            details: `✅ ${sizeBefore} → ${sizeAfter} (${diff >= 0 ? '+' : ''}${diff} chars)`
          });
        } else {
          results.push({
            name: test.name,
            success: false,
            sizeBefore,
            sizeAfter: sizeBefore,
            details: `❌ ${parseResult.error || 'Falha ao aplicar'}`
          });
        }
      } catch (error: any) {
        results.push({
          name: test.name,
          success: false,
          sizeBefore,
          sizeAfter: sizeBefore,
          details: `❌ Erro: ${error.message}`
        });
      }

      // Pequena pausa entre testes
      await new Promise(r => setTimeout(r, 500));
    }

    const successCount = results.filter(r => r.success).length;
    const totalTests = results.length;
    const finalSize = workingDocument.length;
    const originalSize = currentInstructions.length;
    
    const resultText = `## 🧪 Teste de Preservação SEARCH_MARKERS

**Taxa: ${successCount}/${totalTests} (${((successCount/totalTests)*100).toFixed(0)}%)**

${results.map(r => `• **${r.name}**: ${r.details}`).join('\n')}

---
📊 Original: ${originalSize} chars → Final: ${finalSize} chars
📈 Diferença total: ${finalSize - originalSize >= 0 ? '+' : ''}${finalSize - originalSize} chars
${successCount === totalTests ? '✅ Todas as edições preservaram o documento!' : '⚠️ Algumas edições falharam'}`;

    setPreservationTestResults(resultText);
    setIsPreservationTesting(false);

    if (successCount === totalTests) {
      toast.success(`✅ Todos os ${totalTests} testes passaram!`);
    } else {
      toast.warning(`⚠️ ${successCount}/${totalTests} testes passaram`);
    }
  };

  const resetToDefaults = () => {
    form.setValue('response_delay_seconds', 30);
    form.setValue('word_delay_seconds', 1.6);
    toast.success("Valores de delay redefinidos para o padrão!");
  };

  const fetchAgents = async () => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast.error("Você precisa estar logado para ver os agentes.");
        return;
      }

      const { data, error } = await supabase
        .from('agents')
        .select('*');

      if (error) {
        toast.error("Erro ao carregar agentes: " + error.message);
      } else {
        setAgents(data as Agent[]);
      }
    } catch (err) {
      toast.error("Erro ao carregar agentes");
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const onSubmit = async (values: z.infer<typeof agentSchema>) => {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast.error("Você precisa estar logado para criar/editar agentes.");
        return;
      }

      if (editingAgentId) {
        // Verificar se instructions mudou para salvar versão
        const currentAgent = agents.find(a => a.id === editingAgentId);
        const instructionsChanged = currentAgent && currentAgent.instructions !== values.instructions;
        
        const { error } = await supabase
          .from('agents')
          .update(values)
          .eq('id', editingAgentId);

        if (error) {
          toast.error("Erro ao atualizar agente: " + error.message);
        } else {
          // Salvar versão se instructions foi modificado (edição manual ou via chat)
          if (instructionsChanged) {
            await savePromptVersion(values.instructions, 'Edição manual do prompt');
          }
          
          toast.success("Agente atualizado com sucesso!");
          setEditingAgentId(null);
          form.reset({
            name: "",
            instructions: "",
            gpt_api_key: "",
            gpt_model: "gpt-5-mini",
            response_delay_seconds: 30,
            word_delay_seconds: 1.6,
          });
          fetchAgents();
        }
      } else {
        const { error } = await supabase
          .from('agents')
          .insert({ ...values, user_id: user.user.id });

        if (error) {
          toast.error("Erro ao criar agente: " + error.message);
        } else {
          toast.success("Agente criado com sucesso!");
          form.reset({
            name: "",
            instructions: "",
            gpt_api_key: "",
            gpt_model: "gpt-5-mini",
            response_delay_seconds: 30,
            word_delay_seconds: 1.6,
          });
          fetchAgents();
        }
      }
    } catch (err) {
      toast.error("Erro ao salvar agente");
    }
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgentId(agent.id);
    form.reset(agent);
  };

  const openDeleteConfirm = (agent: Agent) => {
    setDeleteConfirm({
      open: true,
      agentId: agent.id,
      agentName: agent.name
    });
  };

  const handleDelete = async () => {
    if (!deleteConfirm.agentId) return;
    
    setIsDeleting(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast.error("Você precisa estar logado para deletar agentes.");
        return;
      }

      const { error } = await supabase
        .from('agents')
        .delete()
        .eq('id', deleteConfirm.agentId)
        .eq('user_id', user.user.id);

      if (error) {
        toast.error("Erro ao deletar agente: " + error.message);
      } else {
        toast.success("Agente deletado com sucesso!");
        setDeleteConfirm({ open: false, agentId: null, agentName: '' });
        fetchAgents();
      }
    } catch (err) {
      toast.error("Erro ao deletar agente");
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelEdit = () => {
    setEditingAgentId(null);
    setChatMessages([]);
    setPromptVersions([]);
    form.reset({
      name: "",
      instructions: "",
      gpt_api_key: "",
      gpt_model: "gpt-5-mini",
      response_delay_seconds: 30,
      word_delay_seconds: 1.6,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto p-4">
        <BackToHomeButton />
        <h1 className="text-3xl font-bold mb-6 text-center">Configuração do Agente de Prospecção</h1>

        {/* Layout de duas colunas quando editando */}
        <div className={`grid gap-6 ${editingAgentId ? 'grid-cols-1 lg:grid-cols-[1.35fr_1fr]' : 'grid-cols-1 max-w-3xl mx-auto'}`}>
          
          {/* Coluna Esquerda - Formulário */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  {editingAgentId ? "Editar Agente" : "Criar Novo Agente"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="instructions"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center justify-between">
                            <span>Instruções do Agente (Prompt GPT)</span>
                            {editingAgentId && promptVersions.length > 0 && (
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setShowVersions(!showVersions)}
                                className="text-xs"
                              >
                                <History className="h-3 w-3 mr-1" />
                                {promptVersions.length} versões
                              </Button>
                            )}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Você é um agente de vendas amigável e persuasivo. Seu objetivo é..."
                              className="min-h-[60vh] font-mono text-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                          {editingAgentId && (
                            <p className="text-xs text-muted-foreground">
                              💡 Use o chat ao lado para melhorar este prompt com ajuda da IA
                            </p>
                          )}
                        </FormItem>
                      )}
                    />

                    {/* Versões do Prompt */}
                    {showVersions && promptVersions.length > 0 && (
                      <Card className="bg-muted/50">
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <History className="h-4 w-4" />
                            Histórico de Versões
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-2">
                          <ScrollArea className="h-[150px]">
                            <div className="space-y-2">
                              {promptVersions.map((version) => (
                                <div 
                                  key={version.id}
                                  className="flex items-center justify-between p-2 rounded bg-background hover:bg-accent/50 transition-colors"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary" className="text-xs">
                                        v{version.version_number}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(version.created_at).toLocaleString('pt-BR')}
                                      </span>
                                    </div>
                                    {version.version_note && (
                                      <p className="text-xs text-muted-foreground truncate mt-1">
                                        {version.version_note}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => restoreVersion(version)}
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    )}

                    <Tabs defaultValue="geral" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
                        <TabsTrigger value="geral">Geral</TabsTrigger>
                        <TabsTrigger value="modelo">Modelo</TabsTrigger>
                        <TabsTrigger value="chaves">Chaves</TabsTrigger>
                        <TabsTrigger value="ritmo">Ritmo</TabsTrigger>
                      </TabsList>

                      <TabsContent value="geral" className="space-y-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nome do Agente</FormLabel>
                              <FormControl>
                                <Input placeholder="Agente de Vendas B2B" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TabsContent>

                      <TabsContent value="modelo" className="space-y-4">
                        <FormField
                          control={form.control}
                          name="gpt_model"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Modelo GPT</FormLabel>
                              <div className="flex gap-2">
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="flex-1">
                                      <SelectValue placeholder="Selecione o modelo GPT" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {GPT_MODELS.map((model) => (
                                      <SelectItem
                                        key={model.value}
                                        value={model.value}
                                        title={model.description}
                                        className="cursor-pointer"
                                      >
                                        {model.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isTestingModel || !form.getValues('gpt_api_key')}
                                  onClick={async () => {
                                    const apiKey = form.getValues('gpt_api_key');
                                    const model = field.value;
                                    if (!apiKey) {
                                      toast.error('Configure a chave API primeiro');
                                      return;
                                    }
                                    setIsTestingModel(true);
                                    setModelTestResult(null);
                                    const result = await testGPTModel(apiKey, model);
                                    setModelTestResult(result.message);
                                    setIsTestingModel(false);
                                    if (result.success) {
                                      toast.success(result.message);
                                    } else {
                                      toast.error(result.message);
                                    }
                                  }}
                                >
                                  {isTestingModel ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    '🧪 Testar'
                                  )}
                                </Button>
                              </div>
                              {modelTestResult && (
                                <p className={`text-xs mt-1 ${modelTestResult.includes('✅') ? 'text-green-600' : 'text-red-600'}`}>
                                  {modelTestResult}
                                </p>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TabsContent>

                      <TabsContent value="chaves" className="space-y-4">
                        <FormField
                          control={form.control}
                          name="gpt_api_key"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Chave da API GPT</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="sk-proj-..." {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </TabsContent>

                      <TabsContent value="ritmo" className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="response_delay_seconds"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="flex items-center gap-1 text-xs">
                                  <Clock className="h-3 w-3" />
                                  Leitura (seg)
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="word_delay_seconds"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="flex items-center gap-1 text-xs">
                                  <Zap className="h-3 w-3" />
                                  Por Palavra (seg)
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    {...field}
                                    onChange={(e) => field.onChange(Number(e.target.value))}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>
                      </TabsContent>
                    </Tabs>

                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1">
                        {editingAgentId ? "Salvar Alterações" : "Criar Agente"}
                      </Button>
                      <Button type="button" variant="outline" size="icon" onClick={resetToDefaults}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {editingAgentId && (
                      <Button type="button" variant="ghost" onClick={cancelEdit} className="w-full">
                        Cancelar Edição
                      </Button>
                    )}
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* Lista de Agentes */}
            {!editingAgentId && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Meus Agentes</CardTitle>
                </CardHeader>
                <CardContent>
                  {agents.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum agente configurado ainda.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {agents.map((agent) => (
                        <div 
                          key={agent.id} 
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0 mr-4">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium truncate">{agent.name}</h3>
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {agent.gpt_model}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {agent.instructions}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(agent)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openDeleteConfirm(agent)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Coluna Direita - Chat IA (só aparece quando editando) */}
          {editingAgentId && (
            <Card className="flex flex-col h-[calc(100vh-200px)] sticky top-4">
              <CardHeader className="pb-3 border-b shrink-0">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                    <span>Calibramento de IA</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPreservationTesting || !form.getValues('gpt_api_key') || form.getValues('instructions').length < 100}
                      onClick={runPreservationTest}
                      className="text-xs"
                    >
                      {isPreservationTesting ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <span>🧪</span>
                      )}
                      {isPreservationTesting ? 'Testando...' : 'Testar Preservação'}
                    </Button>
                    <Badge variant="outline" className="text-xs">
                      <MessageSquare className="h-3 w-3 mr-1" />
                      {chatMessages.filter(m => m.role === 'user').length}
                    </Badge>
                  </div>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Converse comigo para melhorar as instruções do seu agente
                </p>
                {/* Resultados do teste de preservação */}
                {preservationTestResults && (
                  <div className="mt-2 p-2 bg-muted rounded text-xs whitespace-pre-wrap">
                    {preservationTestResults}
                  </div>
                )}
              </CardHeader>
              
              <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
                {/* Mensagens do Chat */}
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[90%] rounded-lg p-3 ${
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : message.role === 'system'
                              ? 'bg-muted text-muted-foreground text-sm'
                              : 'bg-accent'
                          }`}
                        >
                          {/* Exibir imagem anexada se houver */}
                          {message.imageUrl && (
                            <div className="mb-2">
                              <img 
                                src={message.imageUrl} 
                                alt="Imagem enviada" 
                                className="max-h-48 w-auto rounded-lg"
                              />
                            </div>
                          )}
                          
                          <div className="text-sm whitespace-pre-wrap">
                            {message.content.split('```').map((part, i) => {
                              if (i % 2 === 1) {
                                // É um bloco de código
                                const lines = part.split('\n');
                                const code = lines.slice(1).join('\n');
                                return (
                                  <pre key={i} className="bg-gray-900 text-gray-100 p-3 rounded my-2 overflow-x-auto text-xs">
                                    <code>{code || part}</code>
                                  </pre>
                                );
                              }
                              return <span key={i}>{part}</span>;
                            })}
                          </div>
                          
                          {/* Botão para aplicar prompt proposto */}
                          {message.proposedPrompt && (
                            <div className="mt-3 pt-3 border-t-2 border-green-500/50 bg-green-500/10 -mx-3 -mb-3 p-3 rounded-b-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <Check className="h-4 w-4 text-green-600" />
                                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                  Prompt pronto para aplicar!
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => applyProposedPrompt(message.proposedPrompt!, message.id)}
                                  className="flex-1 bg-green-600 hover:bg-green-700"
                                >
                                  <Check className="h-3 w-3 mr-1" />
                                  ✅ Aplicar no Formulário
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setChatMessages(prev => prev.map(msg => 
                                      msg.id === message.id 
                                        ? { ...msg, proposedPrompt: undefined, content: msg.content + '\n\n❌ **Proposta rejeitada pelo usuário.**' }
                                        : msg
                                    ));
                                  }}
                                >
                                  ❌ Rejeitar
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground mt-2 text-center">
                                📝 Uma versão será salva no histórico antes de aplicar
                              </p>
                            </div>
                          )}
                          
                          <p className="text-[10px] opacity-50 mt-2">
                            {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))}
                    
                    {isAiLoading && (
                      <div className="flex justify-start">
                        <div className="bg-accent rounded-lg p-3">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Analisando e gerando sugestões...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div ref={chatEndRef} />
                  </div>
                </ScrollArea>
                
                {/* Input do Chat */}
                <div className="p-4 border-t shrink-0 bg-background">
                  {/* Preview da imagem anexada */}
                  {chatImage && (
                    <div className="mb-3 relative inline-block">
                      <img 
                        src={chatImage} 
                        alt="Imagem anexada" 
                        className="h-20 w-auto rounded-lg border shadow-sm"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                        onClick={() => setChatImage(null)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">
                        🖼️ Imagem pronta para enviar
                      </p>
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    {/* Input de arquivo oculto */}
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleImageSelect}
                      accept="image/*"
                      className="hidden"
                    />
                    
                    {/* Botão de anexar imagem */}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isAiLoading || !form.getValues('gpt_api_key')}
                      title="Anexar imagem para calibrar o prompt"
                    >
                      <ImagePlus className="h-4 w-4" />
                    </Button>
                    
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={chatImage ? "Descreva o que quer calibrar com base na imagem..." : "O que você quer melhorar no prompt? (Cole prints com Ctrl+V)"}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendChatMessage();
                        }
                      }}
                      onPaste={handlePaste}
                      disabled={isAiLoading || !form.getValues('gpt_api_key')}
                    />
                    <Button 
                      onClick={sendChatMessage} 
                      disabled={isAiLoading || (!chatInput.trim() && !chatImage) || !form.getValues('gpt_api_key')}
                      size="icon"
                    >
                      {isAiLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {!form.getValues('gpt_api_key') && (
                    <p className="text-xs text-destructive mt-2">
                      ⚠️ Configure a chave da API GPT para usar o assistente
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Lista de Agentes quando editando (abaixo do formulário) */}
        {editingAgentId && agents.length > 0 && (
          <Card className="mt-6">
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Outros Agentes</CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              <div className="flex gap-2 overflow-x-auto pb-2">
                {agents.filter(a => a.id !== editingAgentId).map((agent) => (
                  <Button 
                    key={agent.id} 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleEdit(agent)}
                    className="shrink-0"
                  >
                    <Bot className="h-3 w-3 mr-1" />
                    {agent.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog de Confirmação de Exclusão */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Excluir Agente?"
        description={`Tem certeza que deseja excluir o agente "${deleteConfirm.agentName}"?\n\nEsta ação é IRREVERSÍVEL e você:\n• Perderá todas as configurações do agente\n• Perderá todo o histórico de prompts\n• Campanhas usando este agente ficarão sem agente`}
        confirmText="Sim, Excluir Agente"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
    </div>
  );
};

export default AgentConfiguration;
