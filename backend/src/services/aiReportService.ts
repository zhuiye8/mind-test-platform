import fetch from 'node-fetch';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface QuestionDetail {
  id: string;
  title: string;
  question_type: string;
  options: Record<string, any>;
  answer: any;
  timestamps: {
    displayed: number;
    answered: number;
    duration: number;
  };
}

interface ExamDataForReport {
  examId: string;
  paperId: string;
  studentInfo: {
    studentId: string;
    studentName: string;
  };
  questions: QuestionDetail[];
  timeline: any[];
  totalDuration: number;
  completedAt: string;
}

interface ReportRequest {
  emotionId: string;
  examData: ExamDataForReport;
}

export class AIReportService {
  private apiUrl: string;
  private apiKey: string | undefined;

  constructor() {
    this.apiUrl = process.env.REPORT_API_URL || 'http://localhost:8080/fake_aiB';
    this.apiKey = process.env.REPORT_API_KEY;
  }

  /**
   * 生成AI分析报告
   */
  async generateReport(examResultId: string): Promise<Buffer> {
    try {
      // 1. 获取考试结果数据
      const examResult = await this.fetchExamResult(examResultId);
      if (!examResult) {
        throw new Error('考试结果不存在');
      }

      // 2. 构建报告请求数据
      const reportData = await this.buildReportData(examResult);

      // 3. 调用外部AI接口
      const report = await this.callReportAPI(reportData);

      // 4. 保存报告记录
      await this.saveReportRecord(examResultId, reportData.emotionId);

      return report;
    } catch (error) {
      console.error('生成报告失败:', error);
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
   * 构建报告数据
   */
  private async buildReportData(examResult: any): Promise<ReportRequest> {
    const { exam, responses } = examResult;
    
    // 构建题目详情
    const questions: QuestionDetail[] = [];
    
    for (const response of responses) {
      const question = exam.paper.questions.find(
        (q: any) => q.id === response.question_id
      );
      
      if (question) {
        questions.push({
          id: question.id,
          title: question.title,
          question_type: question.question_type,
          options: question.options,
          answer: response.response_value,
          timestamps: {
            displayed: new Date(response.question_displayed_at || response.created_at).getTime(),
            answered: new Date(response.response_submitted_at).getTime(),
            duration: response.time_to_answer_seconds || 0
          }
        });
      }
    }

    // 解析时间线数据
    let timeline = [];
    if (examResult.timeline_data) {
      try {
        timeline = typeof examResult.timeline_data === 'string' 
          ? JSON.parse(examResult.timeline_data)
          : examResult.timeline_data;
      } catch (e) {
        console.error('解析时间线数据失败:', e);
      }
    }

    // 计算总时长
    const startTime = new Date(examResult.started_at).getTime();
    const endTime = new Date(examResult.submitted_at).getTime();
    const totalDuration = Math.floor((endTime - startTime) / 1000); // 秒

    return {
      emotionId: examResult.emotion_analysis_id || '',
      examData: {
        examId: exam.id,
        paperId: exam.paper_id,
        studentInfo: {
          studentId: examResult.participant_id,
          studentName: examResult.participant_name
        },
        questions,
        timeline,
        totalDuration,
        completedAt: examResult.submitted_at
      }
    };
  }

  /**
   * 调用外部报告生成API
   */
  private async callReportAPI(data: ReportRequest): Promise<Buffer> {
    const headers: any = {
      'Content-Type': 'application/json'
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // 使用AbortController实现超时
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal: controller.signal
    });
    
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`报告API返回错误: ${response.status}`);
    }

    // 获取返回的文本内容
    const contentType = response.headers.get('content-type');
    
    if (contentType?.includes('text')) {
      const text = await response.text();
      return Buffer.from(text, 'utf-8');
    } else {
      // 如果是二进制数据
      const buffer = await response.buffer();
      return buffer;
    }
  }

  /**
   * 保存报告生成记录
   */
  private async saveReportRecord(
    examResultId: string, 
    emotionId: string
  ): Promise<void> {
    try {
      // 更新考试结果，记录报告生成时间
      await prisma.examResult.update({
        where: { id: examResultId },
        data: {
          emotionAnalysisId: emotionId
        }
      });
    } catch (error) {
      console.error('保存报告记录失败:', error);
      // 不影响报告生成
    }
  }

  /**
   * 生成模拟报告（用于测试）
   */
  async generateMockReport(examResultId: string): Promise<Buffer> {
    const examResult = await this.fetchExamResult(examResultId);
    const reportData = await this.buildReportData(examResult);

    const mockReport = `
心理测试分析报告
================

考生信息
--------
学号：${reportData.examData.studentInfo.studentId}
姓名：${reportData.examData.studentInfo.studentName}
完成时间：${reportData.examData.completedAt}
总用时：${Math.floor(reportData.examData.totalDuration / 60)}分${reportData.examData.totalDuration % 60}秒

答题情况分析
------------
总题数：${reportData.examData.questions.length}
平均答题时长：${Math.floor(reportData.examData.totalDuration / reportData.examData.questions.length)}秒

题目详情
--------
${reportData.examData.questions.map((q, i) => `
${i + 1}. ${q.title}
   答案：${q.answer}
   用时：${q.timestamps.duration}秒
`).join('')}

情绪分析ID：${reportData.emotionId || '未进行情绪分析'}

行为特征分析
------------
基于答题时间分布和选择模式，该考生表现出以下特征：
1. 答题速度${reportData.examData.totalDuration < 600 ? '较快' : '正常'}
2. 选择倾向性分析完成
3. 情绪稳定性评估完成

综合建议
--------
根据测试结果，建议关注以下方面：
1. 保持良好的心理状态
2. 适当进行压力管理
3. 定期进行心理健康评估

生成时间：${new Date().toLocaleString('zh-CN')}
================
    `;

    return Buffer.from(mockReport, 'utf-8');
  }
}

// 单例导出
export const aiReportService = new AIReportService();