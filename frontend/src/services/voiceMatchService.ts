/**
 * 语音匹配服务 - 前端接口
 */

interface VoiceMatchRequest {
  voiceText: string;
  question: string;
  options: Record<string, any>;
  questionId: string;
}

interface VoiceMatchResponse {
  matched: boolean;
  option?: string;
  confidence?: number;
  reason?: string;
  fallbackUsed?: boolean;
}

export class VoiceMatchService {
  private apiUrl: string;
  
  constructor() {
    this.apiUrl = '/api/voice/match';
  }

  /**
   * 使用LLM匹配语音答案
   */
  async matchAnswer(
    voiceText: string,
    question: string,
    options: Record<string, any>,
    questionId: string
  ): Promise<VoiceMatchResponse> {
    try {
      console.log('🎙️ 发送语音匹配请求:', { voiceText, questionId });
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voiceText: voiceText.trim(),
          question,
          options: this.normalizeOptions(options),
          questionId
        } as VoiceMatchRequest)
      });

      if (!response.ok) {
        throw new Error(`匹配失败: ${response.status}`);
      }

      const result = await response.json();
      
      console.log('🎙️ 语音匹配结果:', result);
      
      return result as VoiceMatchResponse;
      
    } catch (error) {
      console.error('语音匹配请求失败:', error);
      
      // 降级到本地匹配
      return this.localFallbackMatch(voiceText, options);
    }
  }

  /**
   * 标准化选项格式
   */
  private normalizeOptions(options: Record<string, any>): Record<string, string> {
    const normalized: Record<string, string> = {};
    
    for (const [key, value] of Object.entries(options)) {
      if (typeof value === 'string') {
        normalized[key] = value;
      } else if (typeof value === 'object' && value !== null) {
        normalized[key] = value.text || value.label || String(value);
      } else {
        normalized[key] = String(value);
      }
    }
    
    return normalized;
  }

  /**
   * 本地降级匹配
   */
  private localFallbackMatch(
    voiceText: string, 
    options: Record<string, any>
  ): VoiceMatchResponse {
    const text = voiceText.toLowerCase().trim();
    
    // 直接匹配选项键
    for (const key of Object.keys(options)) {
      const patterns = [
        key.toLowerCase(),
        `选${key}`,
        `选择${key}`,
        `选项${key}`,
        `第${key}个`,
        `${key}选项`
      ];
      
      if (patterns.some(pattern => text.includes(pattern))) {
        return {
          matched: true,
          option: key,
          confidence: 0.7,
          reason: '关键词匹配',
          fallbackUsed: true
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
      '六': 'F', '第六': 'F', '6': 'F'
    };

    for (const [num, option] of Object.entries(numberMap)) {
      if (text.includes(num) && options[option]) {
        return {
          matched: true,
          option,
          confidence: 0.6,
          reason: '序号匹配',
          fallbackUsed: true
        };
      }
    }

    // 内容模糊匹配
    for (const [key, value] of Object.entries(options)) {
      const optionText = this.normalizeOptions({[key]: value})[key];
      const keywords = optionText.slice(0, 8).toLowerCase();
      
      if (keywords && text.includes(keywords)) {
        return {
          matched: true,
          option: key,
          confidence: 0.5,
          reason: '内容匹配',
          fallbackUsed: true
        };
      }
    }

    return {
      matched: false,
      reason: '无法识别语音内容',
      fallbackUsed: true
    };
  }

  /**
   * 生成语音提示文本
   */
  generateVoicePrompt(options: Record<string, any>): string {
    const optionKeys = Object.keys(options);
    const keyList = optionKeys.slice(0, -1).join('、') + 
      (optionKeys.length > 1 ? '或' + optionKeys.slice(-1) : '');
    
    return `请选择${keyList}，或直接说出您的选择`;
  }
}

// 单例导出
export const voiceMatchService = new VoiceMatchService();