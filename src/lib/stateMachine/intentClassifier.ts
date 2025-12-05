import type { IntentClassification, MessageIntent, LeadTemperature } from './types';

// Hot lead heuristics based on Luchoa-IA spec
const HOT_PATTERNS = [
  /disponibilidade.*(?:chapa|bundle)/i,
  /reserv(?:a|ar)|hold/i,
  /medida|planta/i,
  /endere[cç]o.*entrega/i,
  /(?:polido|escovado)/i,
  /timeline.*embarque/i,
  /quando.*chega/i,
  /pre[cç]o|or[cç]amento|quanto.*custa/i,
  /confirmar.*pedido/i,
];

const WARM_PATTERNS = [
  /interessad[oa]/i,
  /gostaria|quero/i,
  /ver|conhecer|saber mais/i,
  /qual.*diferen[cç]a/i,
];

const COLD_PATTERNS = [
  /n[ãa]o.*interesse/i,
  /talvez|depois/i,
  /no momento.*n[ãa]o/i,
];

const INTENT_PATTERNS: Record<MessageIntent, RegExp[]> = {
  pedido_orcamento: [/pre[cç]o|or[cç]amento|quanto|valor|custo/i],
  pedido_midia: [
    /foto|imagem|v[ií]deo|cat[aá]logo|material.*visual/i,
    /ver.*chapa|mostrar/i,
  ],
  pedido_disponibilidade: [
    /dispon[ií]vel|estoque|tem.*chapa|quantidade/i,
    /quando.*dispon[ií]vel/i,
  ],
  interesse_reserva: [/reserv(?:a|ar)|hold|guardar|segurar/i],
  envio_medidas: [/medida|dimens[ãa]o|tamanho|planta/i],
  confirmacao_acabamento: [/acabamento|polido|escovado|resinado/i],
  pedido_timeline: [
    /prazo|timeline|quando.*chega|data.*entrega|demora/i,
  ],
  negociacao: [
    /desconto|negociar|condi[cç][ãa]o|parcelamento|melhorar.*pre[cç]o/i,
  ],
  confirmacao_pedido: [
    /confirmar.*pedido|fechar|pode.*enviar|vamos.*fechar/i,
  ],
  marcou_reuniao: [
    /reunião|reuni[ãa]o|ligar|call|conversar|agendar/i,
    /(?:segunda|ter[cç]a|quarta|quinta|sexta).*feira/i,
    /\d{1,2}[h:]\d{0,2}/i, // time patterns
  ],
  resposta_vaga: [
    /talvez|n[ãa]o.*certeza|vou.*ver|depois.*falo/i,
    /^(?:ok|sim|n[ãa]o|entendi)$/i,
  ],
  sem_resposta: [],
  unknown: [],
};

export async function classifyIntent(
  messageContent: string,
  gptApiKey: string
): Promise<IntentClassification> {
  // First, try pattern matching (fast path)
  const patternResult = classifyByPatterns(messageContent);
  if (patternResult.confidence > 0.7) {
    return patternResult;
  }

  // Fallback to GPT for complex cases
  try {
    const gptResult = await classifyWithGPT(messageContent, gptApiKey);
    return gptResult;
  } catch (error) {
    console.error('GPT classification failed, using pattern result:', error);
    return patternResult;
  }
}

function classifyByPatterns(messageContent: string): IntentClassification {
  const normalized = messageContent.toLowerCase().trim();

  // Determine temperature
  let temperature: LeadTemperature = 'unknown';
  const hotScore = HOT_PATTERNS.filter((p) => p.test(normalized)).length;
  const warmScore = WARM_PATTERNS.filter((p) => p.test(normalized)).length;
  const coldScore = COLD_PATTERNS.filter((p) => p.test(normalized)).length;

  if (hotScore >= 2 || (hotScore === 1 && normalized.length < 100)) {
    temperature = 'hot';
  } else if (hotScore === 1 || warmScore >= 1) {
    temperature = 'warm';
  } else if (coldScore >= 1) {
    temperature = 'cold';
  }

  // Determine intent
  let bestIntent: MessageIntent = 'unknown';
  let maxMatches = 0;

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    const matches = patterns.filter((p) => p.test(normalized)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      bestIntent = intent as MessageIntent;
    }
  }

  // Determine next stage based on intent
  let nextStage: IntentClassification['nextStage'];
  switch (bestIntent) {
    case 'pedido_midia':
      nextStage = 'OFERTA';
      break;
    case 'pedido_orcamento':
    case 'pedido_disponibilidade':
      nextStage = 'ORCAMENTO';
      break;
    case 'negociacao':
    case 'confirmacao_pedido':
      nextStage = 'NEGOCIACAO';
      break;
  }

  return {
    intent: bestIntent,
    confidence: maxMatches > 0 ? 0.6 + maxMatches * 0.1 : 0.3,
    entities: {},
    temperature,
    nextStage,
  };
}

async function classifyWithGPT(
  messageContent: string,
  gptApiKey: string
): Promise<IntentClassification> {
  const prompt = `You are an intent classifier for a B2B sales conversation about natural stone (granite, quartzite, crystals).

Analyze this message and return a JSON with:
- intent: one of [pedido_orcamento, pedido_midia, pedido_disponibilidade, interesse_reserva, envio_medidas, confirmacao_acabamento, pedido_timeline, negociacao, confirmacao_pedido, marcou_reuniao, resposta_vaga, sem_resposta, unknown]
- confidence: 0.0 to 1.0
- temperature: [cold, warm, hot, unknown]
- entities: any relevant data extracted (dates, materials, quantities, etc.)

Hot signals: availability requests, hold/reserve, measurements, delivery address, finish confirmation, timeline, pricing.
Warm signals: general interest, wants to know more.
Cold signals: not interested, maybe later.

Message: "${messageContent}"

Return ONLY the JSON, no other text.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${gptApiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    throw new Error(`GPT API failed: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content.trim();

  // Parse JSON, handling markdown code blocks
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || [
    null,
    content,
  ];
  const result = JSON.parse(jsonMatch[1]);

  // Map nextStage
  if (result.intent === 'pedido_midia') result.nextStage = 'OFERTA';
  if (
    ['pedido_orcamento', 'pedido_disponibilidade'].includes(result.intent)
  )
    result.nextStage = 'ORCAMENTO';
  if (['negociacao', 'confirmacao_pedido'].includes(result.intent))
    result.nextStage = 'NEGOCIACAO';

  return result as IntentClassification;
}
