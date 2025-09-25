import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Modal, Button, Space, Typography, Alert, Progress, Result, Card } from 'antd';
import { 
  CheckCircleOutlined, 
  ExclamationCircleOutlined, 
  LoadingOutlined,
  SendOutlined,
  ReloadOutlined,
  CloseOutlined
} from '@ant-design/icons';
import { enhancedPublicApi } from '../../services/enhancedPublicApi';
import logger from '../../utils/logger';
import { validateRequiredQuestions } from '../../utils/validation';
import type { Question } from '../../types';
import type { ParticipantInfo } from './ExamStateManager';

const { Title, Text, Paragraph } = Typography;

interface ExamSubmissionManagerProps {
  examUuid: string;
  participantInfo: ParticipantInfo;
  answers: Record<string, any>;
  questions: Question[];
  examStartTime: Date | null;
  deviceTestResults?: any;
  timelineData?: any;
  voiceInteractions?: any;
  onSubmissionStart?: () => void;
  onSubmissionSuccess?: (result: any) => void;
  onSubmissionError?: (error: string) => void;
  onSubmissionCancel?: () => void;
  onTimeoutInvalid?: (details?: { validationErrors: string[] }) => void;
}

interface SubmissionState {
  submitting: boolean;
  submitted: boolean;
  error: string | null;
  retryCount: number;
  showConfirmModal: boolean;
  validationErrors: string[];
  timeoutInvalid: boolean;
  result: any;
}

// 暴露给父组件的方法接口
export interface ExamSubmissionManagerRef {
  showSubmissionConfirm: (isTimeout?: boolean) => void;
}

const ExamSubmissionManager = forwardRef<ExamSubmissionManagerRef, ExamSubmissionManagerProps>((
  {
    examUuid,
    participantInfo,
    answers,
    questions,
    examStartTime,
    deviceTestResults,
    timelineData,
    voiceInteractions,
    onSubmissionStart,
    onSubmissionSuccess,
    onSubmissionError,
    onSubmissionCancel,
    onTimeoutInvalid
  },
  ref
) => {
  const [submissionState, setSubmissionState] = useState<SubmissionState>({
    submitting: false,
    submitted: false,
    error: null,
    retryCount: 0,
    showConfirmModal: false,
    validationErrors: [],
    timeoutInvalid: false,
    result: null
  });

  // 验证答案完整性
  const validateAnswers = useCallback((): string[] => {
    const errors: string[] = [];
    
    // 使用统一的校验函数：默认所有题为必答，除非题目显式 is_required === false
    const validation = validateRequiredQuestions(questions, answers);
    if (!validation.isValid) {
      // 生成友好的错误信息
      validation.unansweredRequired.forEach((q, idx) => {
        errors.push(`未回答必答题 (#${idx + 1}): ${q.title}`);
      });
    }
    
    // 检查是否有任何答案（兜底）
    if (Object.keys(answers).length === 0) {
      errors.push('请至少回答一道题目');
    }
    
    return errors;
  }, [answers, questions]);

    // 提交考试
  const handleSubmitExam = useCallback(async (isTimeout: boolean = false) => {
    if (!participantInfo || !examUuid) {
      const error = '缺少必要信息，无法提交考试';
      setSubmissionState(prev => ({ ...prev, error }));
      onSubmissionError?.(error);
      return;
    }

    // 如果不是超时提交，先验证答案
    if (!isTimeout) {
      const validationErrors = validateAnswers();
      if (validationErrors.length > 0) {
        setSubmissionState(prev => ({ ...prev, validationErrors }));
        return;
      }
    }

    try {
      setSubmissionState(prev => ({ 
        ...prev, 
        submitting: true, 
        error: null,
        showConfirmModal: false
      }));

      onSubmissionStart?.();

      // 准备提交数据
      const submissionData = {
        participant_id: participantInfo.participantId,
        participant_name: participantInfo.participantName,
        answers,
        started_at: examStartTime?.toISOString(),
        submitted_at: new Date().toISOString(),
        is_timeout: isTimeout,
        // 交互数据
        timeline_data: timelineData,
        voice_interactions: voiceInteractions,
        device_test_results: deviceTestResults
      };

      // 不打印敏感数据，仅记录动作级日志
      logger.info('开始提交考试');

      const response = await enhancedPublicApi.submitExam(examUuid, submissionData);

      if (response.success) {
        setSubmissionState(prev => ({ 
          ...prev, 
          submitted: true,
          submitting: false,
          result: response.data
        }));

        // 清除本地存储的答案（使用包含participantId的键名）
        localStorage.removeItem(`exam_answers_${examUuid}_${participantInfo.participantId}`);
        localStorage.removeItem(`exam_progress_${examUuid}_${participantInfo.participantId}`);
        localStorage.removeItem(`participantInfo_${examUuid}`);

        logger.info('考试提交成功');
        onSubmissionSuccess?.(response.data);

      } else {
        throw new Error(response.error?.toString() || '提交失败，请重试');
      }

    } catch (error) {
      logger.error('考试提交失败', error);
      const errorMsg = error instanceof Error ? error.message : '网络错误，请检查网络连接';
      
      setSubmissionState(prev => ({ 
        ...prev, 
        error: errorMsg,
        submitting: false,
        retryCount: prev.retryCount + 1
      }));

      onSubmissionError?.(errorMsg);
    }
  }, [
    participantInfo, 
    examUuid, 
    answers, 
    examStartTime, 
    timelineData, 
    voiceInteractions, 
    deviceTestResults,
    validateAnswers,
    onSubmissionStart,
    onSubmissionSuccess,
    onSubmissionError
  ]);

  // 显示提交确认对话框（依赖已定义的 handleSubmitExam）
  const showSubmissionConfirm = useCallback((isTimeout: boolean = false) => {
    const validationErrors = validateAnswers();

    if (isTimeout && validationErrors.length > 0) {
      setSubmissionState(prev => ({
        ...prev,
        validationErrors,
        timeoutInvalid: true,
        showConfirmModal: false,
        error: null,
      }));
      return;
    }

    setSubmissionState(prev => ({
      ...prev,
      showConfirmModal: true,
      validationErrors,
      error: null
    }));

    if (isTimeout) {
      // 时间到自动提交
      handleSubmitExam(true);
    }
  }, [validateAnswers, handleSubmitExam]);

  // 使用 useImperativeHandle 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    showSubmissionConfirm
  }), [showSubmissionConfirm]);

  // 重试提交
  const handleRetrySubmission = useCallback(() => {
    handleSubmitExam(false);
  }, [handleSubmitExam]);

  // 取消提交
  const handleCancelSubmission = useCallback(() => {
    setSubmissionState(prev => ({ 
      ...prev, 
      showConfirmModal: false,
      validationErrors: [],
      error: null
    }));
    onSubmissionCancel?.();
  }, [onSubmissionCancel]);

  const handleTimeoutInvalidConfirm = useCallback(() => {
    setSubmissionState(prev => {
      onTimeoutInvalid?.({ validationErrors: prev.validationErrors });
      return {
        ...prev,
        timeoutInvalid: false,
        validationErrors: [],
      };
    });
  }, [onTimeoutInvalid]);

  // 获取答题统计
  const getAnswerStats = useCallback(() => {
    const totalQuestions = questions.length;
    const answeredQuestions = Object.keys(answers).length;
    const completionRate = Math.round((answeredQuestions / totalQuestions) * 100);

    return {
      total: totalQuestions,
      answered: answeredQuestions,
      unanswered: totalQuestions - answeredQuestions,
      completionRate
    };
  }, [questions, answers]);

  const stats = getAnswerStats();

  return (
    <>
      <Modal
        title="考试已结束"
        open={submissionState.timeoutInvalid}
        footer={[
          <Button key="confirm" type="primary" onClick={handleTimeoutInvalidConfirm}>
            我知道了
          </Button>,
        ]}
        closable={false}
        centered
      >
        <Result
          status="warning"
          title="考试时间已到，仍有必答题未完成"
          subTitle="本次作答已作废，请与监考老师联系重新安排考试。"
          icon={<ExclamationCircleOutlined style={{ color: '#faad14' }} />}
        />
        {submissionState.validationErrors.length > 0 && (
          <Alert
            type="warning"
            showIcon
            message="未完成的题目"
            description={
              <ul style={{ paddingLeft: 20, margin: '8px 0' }}>
                {submissionState.validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            }
          />
        )}
      </Modal>

      {/* 提交确认对话框 */}
      <Modal
        title={
          <Space>
            <SendOutlined className="text-blue-500" />
            确认提交考试
          </Space>
        }
        open={submissionState.showConfirmModal}
        footer={null}
        closable={false}
        centered
        width={500}
      >
        <div className="py-4">
          {/* 答题统计 */}
          <Card className="mb-4" size="small">
            <div className="text-center">
              <Title level={4} className="mb-2">答题完成情况</Title>
              <Progress
                type="circle"
                percent={stats.completionRate}
                format={() => `${stats.answered}/${stats.total}`}
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
              />
              <div className="mt-3">
                <Space split={<span className="text-gray-300">|</span>}>
                  <Text type="success">已答: {stats.answered}题</Text>
                  <Text type="secondary">未答: {stats.unanswered}题</Text>
                </Space>
              </div>
            </div>
          </Card>

          {/* 验证错误 */}
          {submissionState.validationErrors.length > 0 && (
            <Alert
              message="发现以下问题"
              description={
                <ul className="mb-0">
                  {submissionState.validationErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              }
              type="warning"
              className="mb-4"
              icon={<ExclamationCircleOutlined />}
            />
          )}

          {/* 提示信息 */}
          <Alert
            message="提交后将无法修改答案"
            description="请确认您的答案无误后点击提交。提交后系统会自动为您生成考试报告。"
            type="info"
            className="mb-4"
          />

          {/* 操作按钮 */}
          <div className="flex justify-end">
            <Space>
              <Button onClick={handleCancelSubmission}>
                继续答题
              </Button>
              <Button
                type="primary"
                onClick={() => handleSubmitExam(false)}
                disabled={submissionState.validationErrors.length > 0}
              >
                确认提交
              </Button>
            </Space>
          </div>
        </div>
      </Modal>

      {/* 提交中状态 */}
      <Modal
        title="正在提交考试"
        open={submissionState.submitting}
        footer={null}
        closable={false}
        centered
      >
        <div className="text-center py-8">
          <LoadingOutlined className="text-4xl text-blue-500 mb-4" />
          <Title level={4}>正在提交您的答案...</Title>
          <Text type="secondary">请稍候，不要关闭浏览器</Text>
          {submissionState.retryCount > 0 && (
            <div className="mt-4">
              <Text type="secondary">重试次数: {submissionState.retryCount}/3</Text>
            </div>
          )}
        </div>
      </Modal>

      {/* 提交成功 */}
      <Modal
        title="考试提交成功"
        open={submissionState.submitted && !submissionState.error}
        footer={
          <Button
            type="primary"
            onClick={() => {
              // 方法1：如果是脚本打开的窗口
              if (window.opener) {
                window.close();
                return;
              }
              
              // 方法2：尝试各种关闭方式
              try {
                // 尝试直接关闭
                window.close();
                
                // 如果上面失败，尝试其他方法
                const w: any = window as any;
                w.open('about:blank', '_self');
                w.close();
              } catch (error) {
                console.warn('页签关闭失败:', error);
              }
              
              // 方法3：如果无法关闭，显示提示信息
              setTimeout(() => {
                // 替换当前页面内容为完成提示
                document.body.innerHTML = `
                  <div style="
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    text-align: center;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                  ">
                    <div style="
                      background: rgba(255,255,255,0.1);
                      padding: 40px;
                      border-radius: 20px;
                      backdrop-filter: blur(10px);
                      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                    ">
                      <h1 style="font-size: 3em; margin-bottom: 20px; font-weight: 300;">🎉 考试已完成</h1>
                      <p style="font-size: 1.5em; margin: 0; opacity: 0.9;">您可以安全地关闭此页签了</p>
                      <div style="margin-top: 30px; font-size: 0.9em; opacity: 0.7;">
                        答案已成功提交，感谢您的参与！
                      </div>
                    </div>
                  </div>
                `;
                document.title = '考试已完成';
              }, 100);
            }}
          >
            关闭页面
          </Button>
        }
        closable={false}
        centered
      >
        <Result
          icon={<CheckCircleOutlined className="text-green-500" />}
          title="考试提交成功！"
          subTitle={
            <div>
              <Paragraph>您的答案已成功提交，系统正在生成分析报告</Paragraph>
              {submissionState.result?.score && (
                <div className="mt-4 p-4 bg-green-50 rounded-lg">
                  <Text strong>得分: {submissionState.result.score}分</Text>
                </div>
              )}
            </div>
          }
        />
      </Modal>

      {/* 提交失败 */}
      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined className="text-red-500" />
            提交失败
          </Space>
        }
        open={submissionState.error !== null && !submissionState.submitting}
        footer={null}
        closable={false}
        centered
      >
        <div className="py-4">
          <Alert
            message={submissionState.error}
            type="error"
            className="mb-4"
          />

          <div className="text-center">
            <Space>
              {submissionState.retryCount < 3 && (
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  onClick={handleRetrySubmission}
                >
                  重试提交
                </Button>
              )}
              
              <Button
                icon={<CloseOutlined />}
                onClick={() => setSubmissionState(prev => ({ ...prev, error: null }))}
              >
                稍后提交
              </Button>
            </Space>
          </div>
        </div>
      </Modal>
    </>
  );
});

// 设置显示名称用于React DevTools
ExamSubmissionManager.displayName = 'ExamSubmissionManager';

export { ExamSubmissionManager, type ExamSubmissionManagerProps, type ExamSubmissionManagerRef };
export default ExamSubmissionManager;
