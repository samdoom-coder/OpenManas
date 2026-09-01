// AI Provider Abstraction — keep provider-specific logic centralized
export interface AIProvider {
  id: string
  name: string
  models: string[]
  capabilities: string[]
}

export interface AIModelConfig {
  writing?: string
  reasoning?: string
  embeddings?: string
  stt?: string
  tts?: string
}

export class AIService {
  private providers = new Map<string, AIProvider>()
  private config: AIModelConfig = {}

  register(provider: AIProvider) {
    this.providers.set(provider.id, provider)
  }
  listProviders() { return Array.from(this.providers.values()) }
  setModelConfig(cfg: AIModelConfig) { this.config = cfg }
  getConfig() { return this.config }

  // central generation entry — routes to preferred provider
  async generate(task: keyof AIModelConfig | 'default', prompt: string, context?: string): Promise<string> {
    // mock implementation — in prod would call provider API
    await new Promise(r => setTimeout(r, 600))
    const ctx = context ? `\nContext: ${context.slice(0,400)}` : ''
    return `✨ [${task}] Response for: "${prompt.slice(0,80)}"${ctx}\n\nThis is a simulated AI response. Connect your provider in Settings → AI to get real generation.`
  }

  // context builder abstraction
  buildContext(currentPage?: string, blocks?: string[], records?: string[]): string {
    return [
      currentPage ? `Current page: ${currentPage}` : '',
      blocks?.length ? `Blocks: ${blocks.slice(0,10).join(' | ')}` : '',
      records?.length ? `Records: ${records.slice(0,10).join(' | ')}` : ''
    ].filter(Boolean).join('\n')
  }
}

export const aiService = new AIService()

// Pre-register providers
aiService.register({ id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'o1'], capabilities: ['write','reason','code'] })
aiService.register({ id: 'anthropic', name: 'Anthropic', models: ['claude-3.5-sonnet', 'claude-3-haiku'], capabilities: ['write','reason'] })
aiService.register({ id: 'google', name: 'Google', models: ['gemini-1.5-pro', 'gemini-2.0-flash'], capabilities: ['multimodal'] })
aiService.register({ id: 'deepseek', name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-coder'], capabilities: ['code','reason'] })
aiService.register({ id: 'openrouter', name: 'OpenRouter', models: ['auto'], capabilities: ['router'] })
