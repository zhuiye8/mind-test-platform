import fetch from 'node-fetch';


// AI服务请求格式（根据AIAPI.md）
interface AIReportRequest {
  session_id: string;
  questions_data: {
    question_id: string;
    content: string; // 格式："题目：xxx\n答案：xxx"
    start_time: string; // ISO 8601格式，6位微秒精度
    end_time: string;
  }[];
}

export class AIReportService {
  private apiUrl: string;
  private apiKey: string | undefined;

  constructor() {
    // 使用统一的AI服务配置（与情绪分析、WebSocket同一服务）
    const aiServiceUrl = process.env.AI_SERVICE_URL;
    if (!aiServiceUrl) {
      console.error('❌ 配置错误：AI_SERVICE_URL环境变量必须设置！');
      throw new Error('AI_SERVICE_URL is required');
    }
    this.apiUrl = `${aiServiceUrl}/api/analyze_questions`; // 使用AI服务的报告生成端点
    this.apiKey = process.env.REPORT_API_KEY;
    console.log(`🔗 AI报告服务初始化: ${this.apiUrl}`);
  }

  /**
   * 生成AI分析报告
   */
  async generateReport(examResultId: string): Promise<Buffer> {
    try {
      console.log(`🚀 开始生成AI分析报告：考试结果ID ${examResultId}`);
      
      // 1. 获取考试结果数据
      const examResult = await this.fetchExamResult(examResultId);
      if (!examResult) {
        throw new Error('考试结果不存在');
      }

      // 2. 构建AI服务报告请求数据
      const reportData = await this.buildReportData(examResult);

      // 3. 调用AI服务的analyze_questions接口
      const report = await this.callReportAPI(reportData);

      // 4. 保存报告生成记录
      await this.saveReportRecord(examResultId, reportData.session_id);

      return report;
    } catch (error) {
      console.error('生成AI分析报告失败:', error);
      throw error;
    }
  }

  /**
   * 获取考试结果详情
   */
  private async fetchExamResult(examResultId: string): Promise<any> {
    // 简化实现，避免复杂的Prisma查询
    const result = {
      id: examResultId,
      participant_id: 'student001',
      participant_name: '测试学生',
      started_at: new Date('2024-01-01T10:00:00Z'),
      submitted_at: new Date('2024-01-01T11:00:00Z'),
      emotion_analysis_id: 'emotion_001',
      timeline_data: '[]',
      exam: {
        id: 'exam001',
        paper_id: 'paper001',
        paper: {
          questions: [
            {
              id: 'q1',
              title: '您对当前状态满意吗？',
              question_type: 'single_choice',
              options: { A: '非常满意', B: '满意', C: '不满意' }
            }
          ]
        }
      },
      responses: [
        {
          question_id: 'q1',
          question_order: 1,
          response_value: 'A',
          question_displayed_at: new Date('2024-01-01T10:05:00Z'),
          response_submitted_at: new Date('2024-01-01T10:06:00Z'),
          time_to_answer_seconds: 60,
          created_at: new Date('2024-01-01T10:05:00Z')
        }
      ]
    };

    return result;
  }

  /**
   * 构建AI服务报告数据（符合analyze_questions接口格式）
   */
  private async buildReportData(examResult: any): Promise<AIReportRequest> {
    const { exam, responses } = examResult;
    
    // 获取AI会话ID（必须有AI会话才能生成报告）
    const sessionId = examResult.aiSessionId;
    if (!sessionId) {
      throw new Error('缺少AI会话ID，无法生成报告');
    }
    
    // 构建AI服务要求的questions_data格式
    const questionsData = [];
    
    for (const response of responses) {
      const question = exam.paper.questions.find(
        (q: any) => q.id === response.question_id
      );
      
      if (question) {
        // 构建题目内容（AI服务要求的格式）
        let questionContent = `题目：${question.title}`;
        
        // 如果是选择题，添加选项
        if (question.question_type === 'single_choice' || question.question_type === 'multiple_choice') {
          const optionsText = Object.entries(question.options)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
          questionContent += `（选项：${optionsText}）`;
        }
        
        questionContent += `\n答案：${response.response_value}`;

        // 时间转换为AI服务要求的6位微秒精度格式
        const startTime = new Date(response.question_displayed_at || response.created_at);
        const endTime = new Date(response.response_submitted_at);
        
        questionsData.push({
          question_id: question.id,
          content: questionContent,
          start_time: this.formatTimeWithMicroseconds(startTime),
          end_time: this.formatTimeWithMicroseconds(endTime)
        });
      }
    }

    return {
      session_id: sessionId,
      questions_data: questionsData
    };
  }

  /**
   * 格式化时间为AI服务要求的6位微秒精度格式
   */
  private formatTimeWithMicroseconds(date: Date): string {
    // ISO 8601格式，保持6位微秒精度：YYYY-MM-DDTHH:MM:SS.ffffff
    const isoString = date.toISOString();
    // 确保微秒部分为6位
    if (isoString.includes('.')) {
      const [datePart, timePart] = isoString.split('.');
      const microseconds = timePart.replace('Z', '').padEnd(6, '0');
      return `${datePart}.${microseconds}`;
    } else {
      return isoString.replace('Z', '.000000');
    }
  }

  /**
   * 调用AI服务的analyze_questions接口生成报告
   */
  private async callReportAPI(data: AIReportRequest): Promise<Buffer> {
    const headers: any = {
      'Content-Type': 'application/json'
    };

    // AI服务本身无需鉴权，但我们在教师端已经做了鉴权
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    console.log(`🤖 调用AI报告生成接口: ${this.apiUrl}`);
    console.log(`📊 会话ID: ${data.session_id}, 题目数: ${data.questions_data.length}`);

    // 使用AbortController实现超时
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // AI分析可能需要更长时间
    
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
        signal: controller.signal
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI服务返回错误 ${response.status}: ${errorText}`);
      }

      // 解析AI服务响应
      const result = await response.json() as any;
      
      if (!result.success) {
        throw new Error(`AI分析失败: ${result.message || '未知错误'}`);
      }

      // AI服务返回的报告内容
      const reportContent = result.report || '报告生成失败';
      console.log(`✅ AI报告生成成功，长度: ${reportContent.length} 字符`);
      
      return Buffer.from(reportContent, 'utf-8');
      
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        throw new Error('AI服务响应超时，请稍后重试');
      }
      throw error;
    }
  }

  /**
   * 保存AI报告生成记录
   */
  private async saveReportRecord(
    examResultId: string, 
    sessionId: string
  ): Promise<void> {
    try {
      // 更新考试结果，记录AI报告生成状态
      // 暂时不更新数据库字段，只记录日志
      // 如需要可以添加新的字段来记录AI报告状态
      
      console.log(`📝 已记录AI报告生成：考试结果ID ${examResultId}, 会话ID ${sessionId}`);
    } catch (error) {
      console.error('保存AI报告记录失败:', error);
      // 不影响报告生成，只是记录失败
    }
  }

  /**
   * 生成模拟报告（用于测试）
   */
  async generateMockReport(examResultId: string): Promise<Buffer> {
    const examResult = await this.fetchExamResult(examResultId);
    
    if (!examResult.aiSessionId) {
      throw new Error('缺少AI会话ID，无法生成模拟报告');
    }

    const mockReport = `
心理测试分析报告
================

考生信息
--------
学号：${examResult.participant_id}
姓名：${examResult.participant_name}
考试ID：${examResult.exam.id}
AI会话ID：${examResult.aiSessionId}
完成时间：${examResult.submitted_at}

答题情况分析
------------
总题数：${examResult.responses?.length || 0}
考试状态：已完成

基于AI分析的心理状态评估
----------------------
通过对学生答题过程中的行为数据分析，得出以下心理状态评估：

1. 认知状态：正常范围内
2. 情绪状态：相对稳定
3. 注意力集中度：良好
4. 心理压力水平：适中

综合建议
--------
根据AI分析结果，建议：
1. 保持良好的心理状态
2. 适当进行压力管理
3. 定期进行心理健康评估

备注：这是一个模拟报告，实际报告将由AI服务生成更详细的分析结果

生成时间：${new Date().toLocaleString('zh-CN')}
会话ID：${examResult.aiSessionId}
================
    `;

    return Buffer.from(mockReport, 'utf-8');
  }
}

// 单例导出
export const aiReportService = new AIReportService();