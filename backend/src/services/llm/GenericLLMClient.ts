import axios from 'axios';

export type LLMOptions = {
  apiBase?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  // If true, use chat.completions endpoint; otherwise completions
  useChat?: boolean;
};

export class GenericLLMClient {
  private apiBase: string;
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private timeoutMs: number;
  private useChat: boolean;

  constructor(opts?: LLMOptions) {
    this.apiBase = (opts?.apiBase || process.env.LLM_API_BASE || process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
    this.apiKey = opts?.apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
    this.model = opts?.model || process.env.LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-nano';
    this.temperature = typeof opts?.temperature === 'number' ? opts.temperature : (process.env.LLM_TEMPERATURE ? Number(process.env.LLM_TEMPERATURE) : 0.7);
    this.maxTokens = typeof opts?.maxTokens === 'number' ? opts.maxTokens : (process.env.LLM_MAX_TOKENS ? Number(process.env.LLM_MAX_TOKENS) : 2000);
    this.timeoutMs = typeof opts?.timeoutMs === 'number' ? opts.timeoutMs : (process.env.LLM_TIMEOUT_MS ? Number(process.env.LLM_TIMEOUT_MS) : 60000);
    this.useChat = typeof opts?.useChat === 'boolean' ? opts.useChat : (process.env.LLM_USE_CHAT ? process.env.LLM_USE_CHAT === 'true' : true);
  }

  async generate(prompt: string): Promise<string> {
    if (!this.apiKey) throw new Error('LLM_API_KEY 未配置');

    if (this.useChat) {
      const url = `${this.apiBase}/v1/chat/completions`;
      const payload = {
        model: this.model,
        messages: [
          { role: 'system', content: '你是一名专业的学生心理咨询师。输出必须为简体中文。' },
          { role: 'user', content: prompt },
        ],
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      } as any;
      const res = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.timeoutMs,
      });
      const content = res.data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('LLM 返回空内容');
      return String(content);
    } else {
      const url = `${this.apiBase}/v1/completions`;
      const payload = {
        model: this.model,
        prompt,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      } as any;
      const res = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.timeoutMs,
      });
      const text = res.data?.choices?.[0]?.text;
      if (!text) throw new Error('LLM 返回空内容');
      return String(text);
    }
  }
}

