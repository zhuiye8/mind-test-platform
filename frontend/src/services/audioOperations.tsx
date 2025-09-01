import { message, Modal } from 'antd';
import { audioApi, audioSettings } from './audioApi';
import type { BatchAudioGenerateRequest } from '../types';

/**
 * 音频操作服务 - 处理音频生成、删除、下载等业务逻辑
 * 包含批量操作和单项操作的完整实现
 */

/**
 * 批量音频生成操作
 * 支持强制重新生成和增量生成两种模式
 */
export class AudioBatchOperations {
  private paperId: string;
  private onDataRefresh: () => Promise<void>;
  private onQuestionsUpdate?: () => void;

  constructor(
    paperId: string, 
    onDataRefresh: () => Promise<void>,
    onQuestionsUpdate?: () => void
  ) {
    this.paperId = paperId;
    this.onDataRefresh = onDataRefresh;
    this.onQuestionsUpdate = onQuestionsUpdate;
  }

  /**
   * 执行批量生成语音文件
   * @param forceRegenerate 是否强制重新生成
   * @returns 生成结果数据
   */
  async executeBatchGenerate(forceRegenerate: boolean = false) {
    try {
      console.log(`🎵 开始批量生成语音文件 (强制重新生成: ${forceRegenerate})`);
      
      const request: BatchAudioGenerateRequest = {
        voiceSettings: audioSettings.load(),
        forceRegenerate
      };

      const response = await audioApi.batchGenerateAudio(this.paperId, request);
      
      if (response.success && response.data) {
        const data = response.data;
        
        // 显示批量生成完成消息
        message.success(
          `批量生成完成！成功: ${data.successCount}, 失败: ${data.failedCount}`
        );
        
        // 如果有生成失败的项目，显示详细错误信息
        if (data.errors && data.errors.length > 0) {
          this.showBatchErrors(data.errors);
        }
        
        // 刷新页面数据
        await this.onDataRefresh();
        this.onQuestionsUpdate?.();
        
        return data;
      }
      
      throw new Error('批量生成请求失败');
    } catch (error: any) {
      console.error('❌ 批量生成语音失败:', error);
      message.error(error?.message || '批量生成失败');
      throw error;
    }
  }

  /**
   * 显示批量生成错误详情弹窗
   * @param errors 错误信息列表
   */
  private showBatchErrors(errors: string[]) {
    Modal.error({
      title: '部分语音生成失败',
      width: 600,
      content: (
        <div>
          <p>以下题目生成失败：</p>
          <div style={{ 
            maxHeight: '300px', 
            overflowY: 'auto',
            border: '1px solid #f0f0f0',
            borderRadius: '4px',
            padding: '8px',
            backgroundColor: '#fafafa'
          }}>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {errors.map((error, index) => (
                <li key={index} style={{ marginBottom: '4px' }}>
                  {error}
                </li>
              ))}
            </ul>
          </div>
          <p style={{ marginTop: '12px', color: '#666', fontSize: '12px' }}>
            💡 提示：可以尝试重新生成失败的项目，或检查网络连接后再次尝试批量生成。
          </p>
        </div>
      )
    });
  }
}

/**
 * 单个题目音频操作
 * 处理单个题目的生成、删除、下载操作
 */
export class AudioSingleOperations {
  private onDataRefresh: () => Promise<void>;
  private onQuestionsUpdate?: () => void;

  constructor(
    onDataRefresh: () => Promise<void>,
    onQuestionsUpdate?: () => void
  ) {
    this.onDataRefresh = onDataRefresh;
    this.onQuestionsUpdate = onQuestionsUpdate;
  }

  /**
   * 生成单个题目的语音文件
   * @param questionId 题目ID
   * @param questionTitle 题目标题（用于日志）
   */
  async generateQuestionAudio(questionId: string, questionTitle?: string) {
    try {
      console.log(`🎵 生成题目语音: ${questionTitle || questionId}`);
      
      const response = await audioApi.generateQuestionAudio(
        questionId, 
        audioSettings.load()
      );
      
      if (response.success) {
        message.success(`语音生成成功 ${questionTitle ? `(${questionTitle.slice(0, 20)}...)` : ''}`);
        await this.onDataRefresh();
        this.onQuestionsUpdate?.();
      } else {
        throw new Error(response.error || '生成失败');
      }
    } catch (error: any) {
      console.error(`❌ 生成题目${questionId}语音失败:`, error);
      message.error(error?.message || '生成语音失败');
    }
  }

  /**
   * 删除单个题目的语音文件
   * @param questionId 题目ID
   * @param questionTitle 题目标题（用于确认对话框）
   */
  async deleteQuestionAudio(questionId: string, questionTitle: string) {
    return new Promise<void>((resolve, reject) => {
      Modal.confirm({
        title: '确认删除语音文件',
        content: (
          <div>
            <p>确定要删除以下题目的语音文件吗？</p>
            <p style={{ 
              fontWeight: 'bold', 
              padding: '8px 12px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              marginTop: '12px'
            }}>
              {questionTitle}
            </p>
            <p style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
              删除后可以重新生成，但需要重新等待生成时间。
            </p>
          </div>
        ),
        onOk: async () => {
          try {
            console.log(`🗑️ 删除题目语音: ${questionTitle}`);
            
            const response = await audioApi.deleteQuestionAudio(questionId);
            
            if (response.success) {
              message.success('语音文件已删除');
              await this.onDataRefresh();
              this.onQuestionsUpdate?.();
              resolve();
            } else {
              throw new Error(response.error || '删除失败');
            }
          } catch (error: any) {
            console.error(`❌ 删除题目${questionId}语音失败:`, error);
            message.error(error?.message || '删除语音失败');
            reject(error);
          }
        },
        onCancel: () => {
          resolve(); // 取消操作也算成功完成
        }
      });
    });
  }

  /**
   * 下载单个题目的语音文件
   * @param questionId 题目ID
   * @param questionTitle 题目标题（用于文件名）
   */
  async downloadQuestionAudio(questionId: string, questionTitle: string) {
    try {
      console.log(`⬇️ 下载题目语音: ${questionTitle}`);
      
      const blob = await audioApi.downloadAudio(questionId, 'question_audio.mp3');
      
      // 创建安全的文件名（移除特殊字符）
      const safeFileName = questionTitle
        .slice(0, 20)
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, '')
        .trim();
      
      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeFileName || '题目'}_语音.mp3`;
      
      // 添加到DOM，触发下载，然后清理
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      message.success('开始下载语音文件');
    } catch (error: any) {
      console.error(`❌ 下载题目${questionId}语音失败:`, error);
      message.error(error?.message || '下载失败，请检查网络连接或稍后重试');
    }
  }
}

/**
 * 音频状态格式化工具
 * 提供音频状态相关的格式化和判断函数
 */
export const AudioStatusUtils = {
  /**
   * 格式化音频时长显示
   * @param duration 时长（秒）
   * @returns 格式化后的时长字符串
   */
  formatDuration: (duration: number | null | undefined): string => {
    if (!duration || duration <= 0) return '-';
    
    if (duration < 60) {
      return `${Math.round(duration)}秒`;
    } else if (duration < 3600) {
      const minutes = Math.floor(duration / 60);
      const seconds = Math.round(duration % 60);
      return `${minutes}分${seconds}秒`;
    } else {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      return `${hours}时${minutes}分`;
    }
  },

  /**
   * 判断音频是否可访问
   * @param question 题目对象
   * @returns 是否可访问音频
   */
  isAudioAccessible: (question: any): boolean => {
    return Boolean(
      question.audioAccessible && 
      question.audio_status === 'ready'
    );
  },

  /**
   * 获取音频状态的显示文本
   * @param status 音频状态
   * @param needsUpdate 是否需要更新
   * @returns 状态显示文本
   */
  getStatusText: (status: string, needsUpdate?: boolean): string => {
    if (needsUpdate) return '需要更新';
    
    switch (status) {
      case 'ready': return '已完成';
      case 'generating': return '生成中';
      case 'pending': return '等待中';
      case 'error': return '生成失败';
      default: return '无语音';
    }
  },

  /**
   * 获取音频状态的颜色
   * @param status 音频状态
   * @param needsUpdate 是否需要更新
   * @returns 状态颜色
   */
  getStatusColor: (status: string, needsUpdate?: boolean): string => {
    if (needsUpdate) return 'orange';
    
    switch (status) {
      case 'ready': return 'green';
      case 'generating': return 'blue';
      case 'pending': return 'gold';
      case 'error': return 'red';
      default: return 'default';
    }
  }
};