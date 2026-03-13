/**
 * Translator service types
 */

export interface TranslationConfig {
  provider: 'openai' | 'deepseek' | 'custom';
  apiKey: string;
  apiUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  batchSize: number;
  concurrentRequests: number;
  rateLimitMs: number;
  systemPrompt: string;
  polishPrompt: string;
  keywordPrompt?: string;
}

export interface TranslationRequest {
  id: string;
  type: 'translate' | 'polish' | 'keyword';
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  itemCount: number;
  completedCount: number;
  error?: string;
  systemPrompt?: string;
  userMessage?: string;
  response?: string;
}

export interface TranslateEntryInput {
  id: string;
  source: string;
  context?: string;
}

export interface TranslateEntryOutput {
  id: string;
  target: string;
}

export interface PolishEntryInput {
  id: string;
  target: string;
  context?: string;
}
