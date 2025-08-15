import OpenAI from 'openai';

interface VoiceMatchResult {
  matched: boolean;
  option?: string;
  confidence?: number;
  reason?: string;
}

export class LLMService {
  private client: OpenAI | null = null;
  private enabled: boolean;
  
  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    this.enabled = !!apiKey;
    
    if (this.enabled) {
      this.client = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: apiKey,
      });
      console.log('✅ LLM服务已启用');
    } else {
      this.client = null;
      console.log('⚠️ LLM服务未启用 - 缺少OPENROUTER_API_KEY');
    }
  }

  /**
   * 智能匹配语音答案到选项
   */
  async matchVoiceAnswer(
    voiceText: string, 
    question: string,
    options: Record<string, string>
  ): Promise<VoiceMatchResult> {
    if (!this.enabled || !this.client) {
      return this.fallbackMatch(voiceText, options);
    }

    const prompt = this.buildMatchPrompt(question, options, voiceText);

    try {
      const completion = await this.client.chat.completions.create({
        model: "openai/gpt-3.5-turbo", // 快速响应
        messages: [
          {
            role: "system",
            content: "你是一个精确的选项匹配助手。分析用户的语音输入，返回最匹配的选项。只返回JSON格式。"
          },
          {
            role: "user", 
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 100,
        response_format: { type: "json_object" }
      });

      const result = completion.choices[0].message.content;
      if (!result) {
        return { matched: false, reason: '无响应' };
      }

      const parsed = JSON.parse(result);
      
      // 验证返回的选项是否有效
      if (parsed.option && options[parsed.option]) {
        return {
          matched: true,
          option: parsed.option,
          confidence: parsed.confidence || 0.8,
          reason: parsed.reason
        };
      }
      
      return { 
        matched: false, 
        reason: parsed.reason || '无法匹配到有效选项' 
      };
      
    } catch (error) {
      console.error('LLM匹配失败:', error);
      // 降级到模糊匹配
      return this.fallbackMatch(voiceText, options);
    }
  }

  /**
   * 构建匹配提示词
   */
  private buildMatchPrompt(
    question: string,
    options: Record<string, string>,
    voiceText: string
  ): string {
    const optionsText = Object.entries(options)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    return `
分析用户的语音回答，匹配到最合适的选项。

题目：${question}

可选选项：
${optionsText}

用户语音输入："${voiceText}"

请分析用户意图并返回JSON格式：
{
  "option": "匹配的选项键(如A、B、C)",
  "confidence": 0.0-1.0的置信度,
  "reason": "匹配理由"
}

如果无法确定，返回：
{
  "option": null,
  "confidence": 0,
  "reason": "无法确定原因"
}

注意：
1. 理解口语化表达，如"第一个"、"选A"、"我觉得是..."
2. 识别同义词，如"非常同意"、"很赞同"、"对的"
3. 处理否定词，如"不同意"、"反对"、"不是"
`;
  }

  /**
   * 降级方案：简单的关键词匹配
   */
  private fallbackMatch(
    voiceText: string,
    options: Record<string, string>
  ): VoiceMatchResult {
    const text = voiceText.toLowerCase();
    
    // 尝试匹配选项键
    for (const key of Object.keys(options)) {
      if (text.includes(key.toLowerCase()) || 
          text.includes(`选${key}`) ||
          text.includes(`选项${key}`)) {
        return {
          matched: true,
          option: key,
          confidence: 0.7,
          reason: '关键词匹配'
        };
      }
    }

    // 尝试匹配选项内容
    for (const [key, value] of Object.entries(options)) {
      // 提取选项文本的关键词
      const optionText = typeof value === 'string' ? value : String(value);
      const keywords = optionText.slice(0, 10).toLowerCase();
      
      if (keywords && text.includes(keywords)) {
        return {
          matched: true,
          option: key,
          confidence: 0.6,
          reason: '内容匹配'
        };
      }
    }

    // 序号匹配
    const numberMap: Record<string, string> = {
      '一': 'A', '第一': 'A', '1': 'A',
      '二': 'B', '第二': 'B', '2': 'B',
      '三': 'C', '第三': 'C', '3': 'C',
      '四': 'D', '第四': 'D', '4': 'D',
      '五': 'E', '第五': 'E', '5': 'E',
    };

    for (const [num, option] of Object.entries(numberMap)) {
      if (text.includes(num) && options[option]) {
        return {
          matched: true,
          option,
          confidence: 0.5,
          reason: '序号匹配'
        };
      }
    }

    return {
      matched: false,
      reason: '无法识别用户意图'
    };
  }

  /**
   * 生成语音提示（用于引导用户）
   */
  generateVoicePrompt(_question: string, options: Record<string, string>): string {
    const optionKeys = Object.keys(options).join('、');
    
    return `请回答这道题。您可以说"选择${optionKeys}"中的一个，或者直接说出您的选择。`;
  }

  /**
   * 检查服务是否可用
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// 单例导出
export const llmService = new LLMService();