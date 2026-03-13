/**
 * Configuration types
 */

export interface AIConfig {
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

export interface AppConfig {
  lastProjectPath?: string;
  recentProjects?: string[];
  [key: string]: any;
}
