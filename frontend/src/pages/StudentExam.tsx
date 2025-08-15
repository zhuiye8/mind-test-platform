import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import {
  Card,
  Form,
  Input,
  Button,
  Space,
  Typography,
  Progress,
  Radio,
  Checkbox,
  message,
  Modal,
  Spin,
  Empty,
  Alert,
  Divider,
  Row,
  Col,
  Badge,
  Avatar,
  Tag,
  Tooltip,
  FloatButton,
} from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  SendOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  MenuOutlined,
  EyeOutlined,
  BulbOutlined,
  HeartOutlined,
  SecurityScanOutlined,
  RocketOutlined,
  FireOutlined,
  StarOutlined,
  ThunderboltOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { Question } from '../types';
import { publicApi } from '../services/api';
import { validateRequiredQuestions } from '../utils/validation';
import DeviceTest from '../components/DeviceTest';
import AudioFilePlayer, { type AudioFilePlayerRef } from '../components/AudioFilePlayer';
import { audioApi } from '../services/audioApi';
// import EmotionAnalyzer from '../components/EmotionAnalyzer'; // 已移除，改用外部AI服务
import { useTimelineRecorder } from '../utils/timelineRecorder';
// import { useAIApi } from '../services/aiApi'; // 已移除旧的AI功能

const { Title, Text } = Typography;
const { TextArea } = Input;

// 模拟的公开API接口（实际应该从后端获取）
interface ExamInfo {
  id: string;
  title: string;
  description?: string; // 试卷描述
  duration_minutes: number;
  password_required: boolean; // 修复字段名，与后端API保持一致
  questions?: Question[]; // questions字段可能为undefined（需要密码时不返回）
  shuffle_questions: boolean;
  allow_empty_answers?: boolean; // 是否允许空选
  required_questions?: string[]; // 必答题目ID列表
}

interface StudentInfo {
  student_id: string;
  student_name: string;
}

const StudentExam: React.FC = () => {
  const { examUuid } = useParams<{ examUuid: string }>();
  const navigate = useNavigate();
  const [modal, contextHolder] = Modal.useModal();
  
  // 考试状态管理
  const [exam, setExam] = useState<ExamInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<'password' | 'info' | 'device-test' | 'description' | 'exam' | 'completed'>('password');
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [examStartTime, setExamStartTime] = useState<Date | null>(null); // 答题实际开始时间
  
  // 沉浸式UI状态
  const [showQuestionNav, setShowQuestionNav] = useState(false);
  const [questionTransition, setQuestionTransition] = useState(false);
  
  // AI功能状态
  const [deviceTestResults, setDeviceTestResults] = useState<any>(null);
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);
  const [examResultId, setExamResultId] = useState<string | null>(null);
  const [aiSessionCreated, setAiSessionCreated] = useState<boolean>(false);
  // const [websocketConnected, setWebsocketConnected] = useState<boolean>(false);
  
  // AI失败处理状态
  const [aiFailureModalVisible, setAiFailureModalVisible] = useState<boolean>(false);
  const [aiRetryCount, setAiRetryCount] = useState<number>(0);
  const [aiFailureError, setAiFailureError] = useState<string>('');
  const [aiRetryInProgress, setAiRetryInProgress] = useState<boolean>(false);
  const maxRetries = 3;
  
  // WebSocket重试状态
  const [wsRetryCount, setWsRetryCount] = useState<number>(0);
  const [wsConnecting, setWsConnecting] = useState<boolean>(false);
  const maxWSRetries = 5;
  
  // AI API hooks
  const timelineRecorder = useTimelineRecorder();
  // const aiApi = useAIApi(); // 已移除旧的AI功能
  
  // 引用
  const audioPlayerRef = useRef<AudioFilePlayerRef>(null);
  const socketRef = useRef<Socket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (examUuid) {
      loadExamInfo();
    }
  }, [examUuid]);

  // 计时器效果
  useEffect(() => {
    if (currentStep === 'exam' && timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            // 时间到，自动提交
            handleSubmitExam(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [currentStep, timeRemaining]);

  // 自动保存答案到localStorage
  useEffect(() => {
    if (examUuid && Object.keys(answers).length > 0) {
      localStorage.setItem(`exam_${examUuid}_answers`, JSON.stringify(answers));
    }
  }, [examUuid, answers]);

  // 记录题目显示事件
  useEffect(() => {
    const allQuestions = getVisibleQuestions();
    const currentQuestion = allQuestions[currentQuestionIndex];
    if (currentQuestion && currentStep === 'exam') {
      timelineRecorder.recordQuestionEvent(
        'question_show',
        currentQuestion.id,
        currentQuestionIndex,
        {
          questionTitle: currentQuestion.title,
          questionType: currentQuestion.question_type,
        }
      );
    }
  }, [currentQuestionIndex, currentStep, exam?.questions]);

  // 加载考试信息
  const loadExamInfo = async () => {
    if (!examUuid) {
      message.error('无效的考试链接');
      return;
    }

    try {
      setLoading(true);
      // 调用实际的公开API
      const response = await publicApi.getExam(examUuid);
      
      if (response.success && response.data) {
        const examData = response.data;
        
        // 设置考试信息
        setExam(examData);
        setTimeRemaining(examData.duration_minutes * 60);
        
        // 如果不需要密码，直接进入设备检测
        if (!examData.password_required) {
          setCurrentStep('device-test');
        }

        // 尝试恢复之前保存的答案
        const savedAnswers = localStorage.getItem(`exam_${examUuid}_answers`);
        if (savedAnswers) {
          setAnswers(JSON.parse(savedAnswers));
        }
      } else {
        message.error(response.error || '加载考试信息失败');
      }
    } catch (error: any) {
      console.error('加载考试信息失败:', error);
      message.error(error.response?.data?.error || '加载考试信息失败，请检查链接是否正确');
    } finally {
      setLoading(false);
    }
  };

  // 密码验证
  const handlePasswordSubmit = async (values: { password: string }) => {
    if (!examUuid) return;
    
    try {
      const response = await publicApi.verifyPassword(examUuid, values.password);
      if (response.success) {
        message.success('密码验证成功');
        
        // 密码验证成功后，重新获取完整的考试信息（包含题目）
        try {
          const examResponse = await publicApi.getExam(examUuid, values.password);
          if (examResponse.success && examResponse.data) {
            const examData = examResponse.data;
            setExam(examData);
            setTimeRemaining(examData.duration_minutes * 60);
            
            // 确保获取到题目数据后再跳转到设备检测
            if (examData.questions && examData.questions.length > 0) {
              setCurrentStep('device-test');
            } else {
              message.error('获取考试题目失败，请刷新页面重试');
            }
          } else {
            message.error('获取考试信息失败，请刷新页面重试');
          }
        } catch (examError) {
          console.error('获取完整考试信息失败:', examError);
          message.error('获取考试信息失败，请刷新页面重试');
        }
      } else {
        message.error(response.error || '密码错误，请重试');
      }
    } catch (error) {
      message.error('密码验证失败，请重试');
    }
  };

  // 学生信息提交
  const handleStudentInfoSubmit = async (values: StudentInfo) => {
    if (!examUuid) return;
    
    try {
      // 检查重复提交
      const response = await publicApi.checkDuplicateSubmission(examUuid, values.student_id);
      if (response.success && response.data?.canSubmit) {
        // 没有重复提交，可以继续
        setStudentInfo(values);
        
        // 启动时间线记录器
        if (examUuid && values.student_id) {
          timelineRecorder.startSession(examUuid, values.student_id);
        }
        
        // 创建AI分析会话（在学生信息提交后立即创建）
        try {
          await createAISession(values);
          
          // 检查是否有试卷描述，决定下一步
          if (exam?.description && exam.description.trim()) {
            setCurrentStep('description');
          } else {
            setCurrentStep('exam');
            // 直接开始答题时记录开始时间
            setExamStartTime(new Date());
          }
        } catch (error: any) {
          if (error.message === 'CANCELLED') {
            // 用户取消了AI会话创建，回到学生信息页面
            message.info('已取消考试开始，请重新填写信息', 2);
            return; // 不继续到下一步
          }
          // 其他错误重新抛出
          throw error;
        }
        
        // 记录考试开始事件（包含AI会话信息）
        timelineRecorder.recordEvent('exam_start', {
          actualStartTime: new Date().toISOString(),
          aiSessionEnabled: aiSessionCreated,
          aiSessionId: aiSessionId,
        });
      } else {
        // API返回success:false，不应该到这里，但以防万一
        message.error('您已经提交过本次考试，请勿重复提交');
      }
    } catch (error: any) {
      console.error('检查重复提交失败:', error);
      // 处理重复提交错误 - 这是主要的错误处理路径
      if (error.response?.status === 409) {
        // HTTP 409状态码表示冲突（重复提交）
        message.error(error.response?.data?.error || '您已经提交过本次考试，请勿重复提交');
      } else {
        // 其他错误
        message.error('验证失败，请重试');
      }
    }
  };

  // 设备测试完成处理
  const handleDeviceTestComplete = (results: any) => {
    setDeviceTestResults(results);
    
    // 记录设备测试结果
    timelineRecorder.recordEvent('custom', {
      eventName: 'device_test_completed',
      deviceResults: results,
    });

    // 设备测试完成后，跳转到信息录入页面
    setCurrentStep('info');
  };

  // 跳过设备测试
  const handleSkipDeviceTest = () => {
    setDeviceTestResults({
      cameraAvailable: false,
      microphoneAvailable: false,
      cameraPermission: false,
      microphonePermission: false,
      testPassed: false,
    });
    
    // 记录跳过设备测试
    timelineRecorder.recordEvent('custom', {
      eventName: 'device_test_skipped',
    });

    // 跳过设备测试后，也跳转到信息录入页面
    setCurrentStep('info');
  };



  // 获取所有题目列表（简化版 - 移除条件逻辑）
  const getVisibleQuestions = useCallback((): Question[] => {
    if (!exam || !exam.questions) return [];
    // 简化：返回所有题目，不再进行条件评估
    return exam.questions;
  }, [exam?.questions]);

  // 答案更新处理
  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
    
    // 记录答案变更事件
    timelineRecorder.recordQuestionEvent(
      'question_answer_change',
      questionId,
      currentQuestionIndex,
      { answer: value, answerLength: typeof value === 'string' ? value.length : 1 }
    );
  };


  // 旧的情绪分析事件处理函数（已移除，改用外部AI服务）
  // const handleTimelineEvent = (event: string, timestamp: number, metadata?: any) => {
  //   timelineRecorder.recordEvent('custom', {
  //     eventName: event,
  //     timestamp,
  //     ...metadata,
  //   }, currentQuestion?.id, currentQuestionIndex);
  // };

  // const handleEmotionData = (data: any) => {
  //   timelineRecorder.recordEmotionEvent('emotion_analysis_data', {
  //     emotionData: data,
  //   });
  // };

  // const handleEmotionAnalysisComplete = (analysisId: string) => {
  //   setEmotionAnalysisId(analysisId);
  //   timelineRecorder.recordEmotionEvent('emotion_analysis_end', {
  //     analysisId,
  //   });
  // };

  // 提交考试
  const handleSubmitExam = async (isTimeout: boolean = false) => {
    try {
      setSubmitting(true);
      
      // 使用验证工具函数
      const allQuestions = getVisibleQuestions();
      const validation = validateRequiredQuestions(allQuestions, answers);

      // 简化提交验证提示
      if (!isTimeout && !validation.isValid) {
        const totalQuestions = allQuestions.length;
        
        const title = '还有必填题目未完成';
        const description = (
          <div>
            <p>还有 <strong style={{color: '#ff4d4f'}}>{validation.unansweredRequired.length}</strong> 道必填题目未回答。</p>
            <div style={{marginTop: '12px', fontSize: '13px', color: '#666'}}>
              <div>• 总题目：{totalQuestions} 题</div>
              <div>• 必填题目：{validation.totalRequired} 题</div>
              <div>• 已完成必填：{validation.answeredRequired} 题</div>
            </div>
            <p style={{marginTop: '12px', color: '#1890ff'}}>
              <strong>提示：</strong>请确保完成所有必填题目后再提交。
            </p>
          </div>
        );
          
        // 必填题未完成，不能提交
        modal.warning({
          title,
          content: description,
          okText: '继续答题',
          width: 520,
        });
        return;
      }

      // 显示提交确认弹窗
      const questionsForSubmit = getVisibleQuestions();
      const answeredCount = Object.keys(answers).length;
      const totalCount = questionsForSubmit.length;
      const startTime = examStartTime || new Date();
      const currentTime = new Date();
      const duration = Math.floor((currentTime.getTime() - startTime.getTime()) / 1000);
      const durationText = duration < 60 ? `${duration}秒` : 
                          duration < 3600 ? `${Math.floor(duration / 60)}分${duration % 60}秒` :
                          `${Math.floor(duration / 3600)}小时${Math.floor((duration % 3600) / 60)}分`;

      const confirmed = await new Promise<boolean>((resolve) => {
        modal.confirm({
          title: '确认提交答卷',
          width: 480,
          content: (
            <div style={{ lineHeight: 1.6, marginTop: 16 }}>
              <div style={{ marginBottom: 16, padding: 16, background: '#f5f5f5', borderRadius: 8 }}>
                <div style={{ marginBottom: 8 }}>
                  <strong>📊 答题统计</strong>
                </div>
                <div>• 总题目数：{totalCount} 题</div>
                <div>• 已回答：{answeredCount} 题</div>
                <div>• 答题用时：{durationText}</div>
                {aiSessionId && (
                  <div style={{ color: '#1890ff' }}>• AI智能分析：已启用 🤖</div>
                )}
              </div>
              <div style={{ color: '#666' }}>
                <strong style={{ color: '#ff4d4f' }}>⚠️ 提醒：</strong>
                提交后将无法修改答案，请确认所有题目都已认真作答。
              </div>
            </div>
          ),
          okText: '确认提交',
          cancelText: '继续答题',
          okType: 'primary',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });

      if (!confirmed) {
        return; // 用户取消提交
      }

      await submitToServer();
    } catch (error) {
      console.error('提交失败:', error);
      message.error('提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  // AI失败处理函数
  const handleAISessionFailure = (error: string): Promise<'continue' | 'retry' | 'cancel' | 'retry_success'> => {
    return new Promise((resolve) => {
      setAiFailureError(error);
      setAiFailureModalVisible(true);
      
      // 将resolve函数保存到组件状态中，用于按钮点击时调用
      (window as any).aiFailureResolve = resolve;
    });
  };

  // 处理重试响应的辅助函数
  const handleRetryResponse = async (retryResponse: any, _studentData: any, _examUuid: string): Promise<boolean> => {
    if (retryResponse.success && retryResponse.data) {
      // 检查重试是否真正成功
      const retrySuccessful = retryResponse.data.aiSessionId && !retryResponse.data.warning;
      
      if (retrySuccessful) {
        console.log('[AI会话] AI会话重试成功:', retryResponse.data);
        
        setAiSessionId(retryResponse.data.aiSessionId);
        setExamResultId(retryResponse.data.examResultId);
        setAiSessionCreated(true);
        
        // 建立WebSocket连接
        const wsConnected = await connectWebSocket(retryResponse.data.aiSessionId);
        if (!wsConnected) {
          console.warn('[WebSocket] WebSocket重试连接失败，但AI会话已创建');
        }
        
        // 记录AI会话重试成功事件
        timelineRecorder.recordEvent('custom', {
          type: 'ai_session_retry_success',
          sessionId: retryResponse.data.aiSessionId,
          examResultId: retryResponse.data.examResultId,
          retryCount: aiRetryCount,
          message: retryResponse.data.message,
        });
        
        return true;
      } else {
        // 重试仍然失败
        console.warn('[AI会话] AI会话重试失败（接口成功但AI失败）:', retryResponse.data.warning || 'aiSessionId为空');
        return false; // 返回false表示重试失败
      }
    } else {
      // 重试请求失败
      console.warn('[AI会话] AI会话重试请求失败:', retryResponse.error);
      return false; // 返回false表示重试失败
    }
  };

  const handleAIFailureOption = async (option: 'continue' | 'retry' | 'cancel') => {
    if (option === 'retry') {
      // 重试时不关闭模态框，而是在模态框中显示重试进度
      if (aiRetryCount >= maxRetries) {
        message.error(`已达到最大重试次数(${maxRetries})，请选择其他选项`);
        return;
      }
      
      setAiRetryCount(prev => prev + 1);
      setAiRetryInProgress(true);
      
      try {
        const studentData = studentInfo;
        const examUuid = window.location.pathname.split('/').pop();
        
        if (!studentData || !examUuid) {
          throw new Error('缺少必要信息');
        }
        
        // 使用重试API
        const retryResponse = await publicApi.retryAISession(examUuid, {
          student_id: studentData.student_id,
          student_name: studentData.student_name,
        });
        
        const retryResult = await handleRetryResponse(retryResponse, studentData, examUuid);
        
        if (retryResult) {
          // 重试成功，关闭模态框
          setAiFailureModalVisible(false);
          if ((window as any).aiFailureResolve) {
            (window as any).aiFailureResolve('retry_success');
            delete (window as any).aiFailureResolve;
          }
        } else {
          // 重试失败，更新错误信息但保持模态框开启
          const errorMsg = getErrorMessage(retryResponse.data?.warning || retryResponse.error || '重试失败');
          setAiFailureError(errorMsg);
        }
      } catch (error: any) {
        console.error('[AI会话] 重试失败:', error);
        const errorMsg = getErrorMessage(error.message || '重试过程中发生错误');
        setAiFailureError(errorMsg);
      } finally {
        setAiRetryInProgress(false);
      }
    } else {
      // continue 或 cancel 时关闭模态框
      setAiFailureModalVisible(false);
      if ((window as any).aiFailureResolve) {
        (window as any).aiFailureResolve(option);
        delete (window as any).aiFailureResolve;
      }
    }
  };

  const getErrorMessage = (error: string): string => {
    if (error.includes('ECONNREFUSED') || error.includes('502')) {
      return '无法连接到情绪分析服务器，请检查网络连接';
    } else if (error.includes('timeout')) {
      return '连接超时，服务器响应过慢';
    } else if (error.includes('503') || error.includes('Service Unavailable')) {
      return '情绪分析服务暂时不可用';
    }
    return error || '情绪分析服务连接失败';
  };

  // 创建AI分析会话
  const createAISession = async (studentData: StudentInfo, _isRetry: boolean = false): Promise<boolean> => {
    if (!studentData || !examUuid || aiSessionCreated) {
      return false;
    }

    try {
      console.log('[AI会话] 开始创建AI分析会话...');
      const startTime = new Date();
      
      const response = await publicApi.createAISession(examUuid, {
        student_id: studentData.student_id,
        student_name: studentData.student_name,
        started_at: startTime.toISOString(),
      });

      if (response.success && response.data) {
        // 检查AI会话是否真正创建成功
        const aiSessionCreated = response.data.aiSessionId && !response.data.warning;
        
        if (aiSessionCreated) {
          console.log('[AI会话] AI会话创建成功:', response.data);
          
          setAiSessionId(response.data.aiSessionId);
          setExamResultId(response.data.examResultId);
          setAiSessionCreated(true);
          
          // 建立WebSocket连接
          if (response.data.aiSessionId) {
            const wsConnected = await connectWebSocket(response.data.aiSessionId);
            if (!wsConnected) {
              console.warn('[WebSocket] WebSocket连接失败，但AI会话已创建，将继续进行考试');
            }
          }
          
          // 记录AI会话创建事件
          timelineRecorder.recordEvent('custom', {
            type: 'ai_session_created',
            sessionId: response.data.aiSessionId,
            examResultId: response.data.examResultId,
            message: response.data.message,
          });
          
          return true;
        } else {
          // AI会话创建失败，但接口返回成功 - 这是关键修复
          console.warn('[AI会话] AI会话创建失败（接口成功但AI失败）:', response.data.warning || 'aiSessionId为空');
          
          // 保存examResultId，即使AI失败也要保留考试记录
          if (response.data.examResultId) {
            setExamResultId(response.data.examResultId);
          }
          
          // 显示失败处理对话框，让用户选择
          const errorMsg = getErrorMessage(response.data.warning || 'AI服务连接失败');
          const userChoice = await handleAISessionFailure(errorMsg);
          
          if (userChoice === 'continue') {
            message.info('已跳过AI分析功能，正常进行考试', 2);
            return false;
          } else if (userChoice === 'retry_success') {
            // 重试成功，AI会话已在模态框中创建
            return true;
          } else {
            // 取消考试或其他情况
            throw new Error('CANCELLED');
          }
        }
      } else {
        console.warn('[AI会话] AI会话创建失败:', response.error || response.data?.warning);
        
        // 显示失败处理对话框，让用户选择
        const errorMsg = getErrorMessage(response.error || response.data?.warning || '');
        const userChoice = await handleAISessionFailure(errorMsg);
        
        if (userChoice === 'continue') {
          message.info('已跳过AI分析功能，正常进行考试', 2);
          return false;
        } else if (userChoice === 'retry_success') {
          // 重试成功，AI会话已在模态框中创建
          return true;
        } else { // cancel
          throw new Error('CANCELLED'); // 抛出取消错误
        }
      }
    } catch (error: any) {
      // 如果是用户取消，直接重新抛出错误
      if (error.message === 'CANCELLED') {
        throw error;
      }
      
      console.error('[AI会话] 创建AI会话时发生错误:', error);
      
      // 显示失败处理对话框
      const errorMsg = getErrorMessage(error.message || error.toString());
      const userChoice = await handleAISessionFailure(errorMsg);
      
      if (userChoice === 'continue') {
        message.info('已跳过AI分析功能，正常进行考试', 2);
        return false;
      } else if (userChoice === 'retry_success') {
        // 重试成功，AI会话已在模态框中创建
        return true;
      } else { // cancel
        throw new Error('CANCELLED'); // 抛出取消错误
      }
    }
  };

  // 从描述页开始答题
  const handleStartExam = () => {
    setCurrentStep('exam');
    // 记录答题实际开始时间（精确到秒）
    setExamStartTime(new Date());
    
    // 记录进入答题界面事件
    timelineRecorder.recordEvent('custom', {
      type: 'exam_questions_start',
      actualStartTime: new Date().toISOString(),
      fromDescription: true,
    });
    
    console.log(`[答题开始] 学生 ${studentInfo?.student_name} 从描述页进入答题界面`);
  };

  // 实际提交到服务器
  const submitToServer = async () => {
    if (!studentInfo || !examUuid) return;

    try {
      // 结束时间线记录
      const timelineSession = timelineRecorder.endSession();
      
      // 记录考试结束事件
      const visibleQuestions = getVisibleQuestions();
      timelineRecorder.recordEvent('exam_end', {
        actualEndTime: new Date().toISOString(),
        totalQuestions: visibleQuestions.length,
        answeredQuestions: Object.keys(answers).length,
      });

      // 调用提交API，包含AI数据
      const response = await publicApi.submitExam(examUuid, {
        student_id: studentInfo.student_id,
        student_name: studentInfo.student_name,
        answers: answers,
        // 传递实际答题开始时间（精确到秒）
        started_at: examStartTime?.toISOString(),
        // AI功能数据（已简化，emotion_analysis_id由外部AI服务管理）
        timeline_data: {
          ...timelineSession,
          aiSessionId: aiSessionId, // 包含AI会话ID
          examResultId: examResultId, // 包含考试结果ID
        },
        voice_interactions: {
          enabled: false,
          // 已切换为音频文件播放模式
        },
        device_test_results: deviceTestResults,
      });

      if (response.success) {
        // 断开WebSocket连接（触发后端endSession）
        disconnectWebSocket();
        
        // 清除本地保存的答案
        localStorage.removeItem(`exam_${examUuid}_answers`);
        
        // AI报告生成已移至教师端，学生端不再触发报告生成
        
        message.success('提交成功！感谢您的参与');
        setCurrentStep('completed');
      } else {
        message.error(response.error || '提交失败，请重试');
      }
    } catch (error: any) {
      console.error('提交失败:', error);
      // 处理重复提交错误（409状态码）
      if (error.response?.status === 409) {
        message.warning(error.response?.data?.error || '您已经提交过本次考试，请勿重复提交');
        setCurrentStep('completed');
        localStorage.removeItem(`exam_${examUuid}_answers`);
      } else {
        message.error(error.response?.data?.error || '提交失败，请重试');
      }
    }
  };

  // WebSocket重试连接函数
  const connectWebSocketWithRetry = async (sessionId: string, retryCount: number = 0): Promise<boolean> => {
    if (retryCount >= maxWSRetries) {
      console.warn(`[WebSocket] 已达到最大重试次数 (${maxWSRetries})，放弃连接`);
      message.warning('WebSocket连接失败，视音频分析功能不可用，但不影响正常答题', 3);
      return false;
    }

    setWsConnecting(true);
    console.log(`[WebSocket] 尝试连接AI服务... (${retryCount + 1}/${maxWSRetries})`);

    try {
      const socket = io('http://192.168.9.84:5000', {
        transports: ['websocket'],
        timeout: 8000, // 8秒超时
        reconnection: false, // 禁用自动重连，我们手动控制
      });

      return new Promise((resolve) => {
        let resolved = false;

        const resolveOnce = (result: boolean) => {
          if (!resolved) {
            resolved = true;
            setWsConnecting(false);
            setWsRetryCount(retryCount);
            resolve(result);
          }
        };

        socket.on('connect', () => {
          console.log(`[WebSocket] 连接成功！会话ID: ${sessionId}`);
          socketRef.current = socket;
          
          // 连接成功后开始数据采集
          startMediaCapture(socket, sessionId);
          
          // 记录连接成功事件
          timelineRecorder.recordEvent('custom', {
            type: 'websocket_connected',
            sessionId: sessionId,
            retryCount: retryCount,
            timestamp: new Date().toISOString(),
          });
          
          resolveOnce(true);
        });

        socket.on('disconnect', (reason: string) => {
          console.log(`[WebSocket] 连接断开: ${reason}`);
          if (!resolved) {
            // 连接断开，尝试重连
            setTimeout(() => {
              connectWebSocketWithRetry(sessionId, retryCount + 1);
            }, Math.min(1000 * Math.pow(2, retryCount), 10000)); // 指数退避，最大10秒
          }
        });

        socket.on('connect_error', (error: any) => {
          console.error(`[WebSocket] 连接错误 (尝试 ${retryCount + 1}):`, error);
          socket.disconnect();
          
          if (retryCount < maxWSRetries - 1) {
            // 还有重试机会，使用指数退避策略
            const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
            console.log(`[WebSocket] ${delay}ms 后进行第 ${retryCount + 2} 次重试...`);
            
            setTimeout(() => {
              connectWebSocketWithRetry(sessionId, retryCount + 1).then(resolveOnce);
            }, delay);
          } else {
            // 所有重试都失败了
            resolveOnce(false);
          }
        });

        // 设置总体超时
        setTimeout(() => {
          if (!resolved) {
            console.warn('[WebSocket] 连接超时');
            socket.disconnect();
            
            if (retryCount < maxWSRetries - 1) {
              connectWebSocketWithRetry(sessionId, retryCount + 1).then(resolveOnce);
            } else {
              resolveOnce(false);
            }
          }
        }, 12000); // 12秒总超时
      });
    } catch (error) {
      console.error(`[WebSocket] 连接异常:`, error);
      setWsConnecting(false);
      
      if (retryCount < maxWSRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 8000);
        console.log(`[WebSocket] ${delay}ms 后重试...`);
        setTimeout(() => {
          connectWebSocketWithRetry(sessionId, retryCount + 1);
        }, delay);
        return false;
      }
      
      return false;
    }
  };

  // 保持原有的简单连接函数作为入口点
  const connectWebSocket = async (sessionId: string): Promise<boolean> => {
    setWsRetryCount(0); // 重置重试计数
    return await connectWebSocketWithRetry(sessionId, 0);
  };

  const startMediaCapture = async (socket: Socket, sessionId: string) => {
    try {
      // 获取摄像头和麦克风权限
      if (deviceTestResults?.cameraPermission || deviceTestResults?.microphonePermission) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: deviceTestResults?.cameraPermission,
          audio: deviceTestResults?.microphonePermission,
        });

        mediaStreamRef.current = stream;

        // 发送视频帧（如果有摄像头权限）
        if (deviceTestResults?.cameraPermission && stream.getVideoTracks().length > 0) {
          startVideoCapture(socket, sessionId, stream);
        }

        // 发送音频数据（如果有麦克风权限）
        if (deviceTestResults?.microphonePermission && stream.getAudioTracks().length > 0) {
          startAudioCapture(socket, sessionId, stream);
        }
      }
    } catch (error) {
      console.warn('[媒体采集] 无法获取媒体流:', error);
      // 即使媒体采集失败，也不影响考试进行
    }
  };

  const startVideoCapture = (socket: Socket, sessionId: string, stream: MediaStream) => {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.play();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const captureFrame = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx?.drawImage(video, 0, 0);
        
        const frameData = canvas.toDataURL('image/jpeg', 0.7);
        
        socket.emit('video_frame', {
          session_id: sessionId,
          frame_data: frameData
        });
      }
    };

    // 每200ms发送一帧（5fps）
    const frameInterval = setInterval(captureFrame, 200);
    
    // 保存interval引用以便清理
    (video as any).frameInterval = frameInterval;
    (video as any).sessionVideo = true;
  };

  const startAudioCapture = (socket: Socket, sessionId: string, stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        const audioData = event.inputBuffer.getChannelData(0);
        const audioArray = Array.from(audioData);
        
        // 转换为base64编码的WAV数据（简化版）
        // 将float32音频数据转换为int16数据
        const int16Array = audioArray.map(sample => Math.max(-32768, Math.min(32767, sample * 32767)));
        const audioBase64 = btoa(String.fromCharCode(...int16Array));
        
        socket.emit('audio_data', {
          session_id: sessionId,
          audio_data: `data:audio/wav;base64,${audioBase64}`
        });
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // 保存引用以便清理
      (stream as any).audioContext = audioContext;
      (stream as any).audioProcessor = processor;
    } catch (error) {
      console.warn('[音频采集] 音频处理失败:', error);
    }
  };

  const disconnectWebSocket = () => {
    console.log('[WebSocket] 断开连接和清理资源...');
    
    // 断开Socket连接
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    // 停止媒体流
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // 清理视频采集
    const videos = document.querySelectorAll('video[sessionVideo]');
    videos.forEach(video => {
      if ((video as any).frameInterval) {
        clearInterval((video as any).frameInterval);
      }
    });

    // setWebsocketConnected(false);
  };

  // 组件卸载时清理WebSocket连接
  useEffect(() => {
    return () => {
      disconnectWebSocket();
    };
  }, []);

  // AI报告生成已移至教师端，学生端只负责数据收集

  // 智能题目切换 - 自动停止音频播放
  const handleQuestionChange = useCallback((newIndex: number) => {
    // 停止当前播放的音频
    if (audioPlayerRef.current?.isPlaying) {
      audioPlayerRef.current.stop();
    }
    
    setQuestionTransition(true);
    setTimeout(() => {
      setCurrentQuestionIndex(newIndex);
      setQuestionTransition(false);
    }, 150);
  }, []);

  // 格式化时间显示
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 渲染题目组件 - 现代化设计
  const renderQuestion = (question: Question) => {
    const value = answers[question.id];

    const radioStyle = {
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px',
      marginBottom: '12px',
      borderRadius: '12px',
      border: '2px solid transparent',
      background: 'rgba(79, 70, 229, 0.04)',
      transition: 'all 0.3s ease',
    };

    const checkboxStyle = {
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px',
      marginBottom: '12px',
      borderRadius: '12px',
      border: '2px solid transparent',
      background: 'rgba(16, 185, 129, 0.04)',
      transition: 'all 0.3s ease',
    };

    switch (question.question_type) {
      case 'single_choice':
        return (
          <Radio.Group
            value={value}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={0}>
              {Object.entries(question.options).map(([key, text]) => (
                <div
                  key={key}
                  style={{
                    ...radioStyle,
                    background: value === key ? 'rgba(79, 70, 229, 0.1)' : 'rgba(79, 70, 229, 0.04)',
                    borderColor: value === key ? '#4F46E5' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (value !== key) {
                      e.currentTarget.style.background = 'rgba(79, 70, 229, 0.06)';
                      e.currentTarget.style.borderColor = 'rgba(79, 70, 229, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (value !== key) {
                      e.currentTarget.style.background = 'rgba(79, 70, 229, 0.04)';
                      e.currentTarget.style.borderColor = 'transparent';
                    }
                  }}
                >
                  <Radio value={key} style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <span style={{ marginLeft: 12, fontSize: '16px', lineHeight: '1.6' }}>{typeof text === 'string' ? text : text?.text || text?.label || ''}</span>
                  </Radio>
                </div>
              ))}
            </Space>
          </Radio.Group>
        );

      case 'multiple_choice':
        return (
          <Checkbox.Group
            value={value || []}
            onChange={(checkedValues) => handleAnswerChange(question.id, checkedValues)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={0}>
              {Object.entries(question.options).map(([key, text]) => (
                <div
                  key={key}
                  style={{
                    ...checkboxStyle,
                    background: value?.includes(key) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.04)',
                    borderColor: value?.includes(key) ? '#10B981' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!value?.includes(key)) {
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.06)';
                      e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!value?.includes(key)) {
                      e.currentTarget.style.background = 'rgba(16, 185, 129, 0.04)';
                      e.currentTarget.style.borderColor = 'transparent';
                    }
                  }}
                >
                  <Checkbox value={key} style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <span style={{ marginLeft: 12, fontSize: '16px', lineHeight: '1.6' }}>{typeof text === 'string' ? text : text?.text || text?.label || ''}</span>
                  </Checkbox>
                </div>
              ))}
            </Space>
          </Checkbox.Group>
        );

      case 'text':
        return (
          <TextArea
            value={value || ''}
            onChange={(e) => handleAnswerChange(question.id, e.target.value)}
            placeholder="请输入您的回答..."
            rows={6}
            maxLength={1000}
            showCount
            style={{
              borderRadius: '12px',
              fontSize: '16px',
              lineHeight: '1.6',
              padding: '16px',
              border: '2px solid #E5E7EB',
              background: 'rgba(255, 255, 255, 0.8)',
              transition: 'all 0.3s ease'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#F59E0B';
              e.target.style.boxShadow = '0 0 0 4px rgba(245, 158, 11, 0.1)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#E5E7EB';
              e.target.style.boxShadow = 'none';
            }}
          />
        );

      default:
        return <Text type="secondary">不支持的题目类型</Text>;
    }
  };

  // 计算真实答题进度 - 必须在所有条件返回之前定义Hook
  const getProgress = useCallback(() => {
    const visibleQuestions = getVisibleQuestions();
    if (visibleQuestions.length === 0) return 0;
    
    // 计算已回答题目的比例
    const answeredCount = visibleQuestions.filter(q => {
      const answer = answers[q.id];
      if (answer === undefined || answer === null) return false;
      if (typeof answer === 'string' && answer.trim() === '') return false;
      if (Array.isArray(answer) && answer.length === 0) return false;
      return true;
    }).length;
    
    return (answeredCount / visibleQuestions.length) * 100;
  }, [exam, answers]);

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: `
          linear-gradient(135deg, 
            rgba(79, 70, 229, 0.05) 0%, 
            rgba(16, 185, 129, 0.05) 50%, 
            rgba(245, 158, 11, 0.05) 100%
          )
        `
      }}>
        <div style={{ textAlign: 'center' }}>
          <Spin size="large" />
          <div style={{ marginTop: 24, fontSize: '18px', color: '#4B5563', fontWeight: '500' }}>
            正在加载考试内容...
          </div>
        </div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: `
          linear-gradient(135deg, 
            rgba(239, 68, 68, 0.08) 0%, 
            rgba(220, 38, 38, 0.06) 100%
          )
        `
      }}>
        <Card style={{ 
          width: 420, 
          borderRadius: '24px', 
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(20px)'
        }}>
          <Empty
            description="考试不存在或已结束"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button 
              type="primary" 
              onClick={() => navigate('/')}
              style={{
                borderRadius: '12px',
                height: '48px',
                fontSize: '16px',
                fontWeight: '600'
              }}
            >
              返回首页
            </Button>
          </Empty>
        </Card>
      </div>
    );
  }

  const allQuestions = getVisibleQuestions();
  const currentQuestion = allQuestions[currentQuestionIndex];
  const progress = getProgress();

  return (
    <div>
      {/* 重要：必须添加contextHolder才能显示Modal */}
      {contextHolder}
      
      {/* 密码验证步骤 - 现代化设计 */}
      {currentStep === 'password' && exam && (
        <div style={{
          minHeight: '100vh',
          background: `
            linear-gradient(135deg, 
              rgba(79, 70, 229, 0.08) 0%, 
              rgba(16, 185, 129, 0.06) 50%, 
              rgba(79, 70, 229, 0.08) 100%
            ),
            radial-gradient(circle at 20% 30%, rgba(79, 70, 229, 0.12) 0%, transparent 60%),
            radial-gradient(circle at 80% 70%, rgba(16, 185, 129, 0.12) 0%, transparent 60%)
          `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '420px',
            animation: 'fadeInUp 0.6s ease-out'
          }}>
            <Card 
              style={{ 
                boxShadow: `
                  0 20px 40px rgba(0, 0, 0, 0.08),
                  0 8px 16px rgba(0, 0, 0, 0.04),
                  inset 0 1px 0 rgba(255, 255, 255, 0.6)
                `,
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)'
              }}
              bodyStyle={{ padding: '40px' }}
            >
              {/* 图标区域 */}
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '80px',
                  height: '80px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, #4F46E5 0%, #10B981 100%)',
                  marginBottom: '24px',
                  boxShadow: '0 8px 20px rgba(79, 70, 229, 0.3)'
                }}>
                  <SecurityScanOutlined style={{ fontSize: '36px', color: 'white' }} />
                </div>
                <Title level={2} style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '700' }}>
                  {exam.title}
                </Title>
                <Text type="secondary" style={{ fontSize: '16px', lineHeight: '1.5' }}>
                  🔐 安全验证，请输入考试密码开始答题
                </Text>
              </div>

              <Form onFinish={handlePasswordSubmit} layout="vertical" size="large">
                <Form.Item
                  name="password"
                  rules={[{ required: true, message: '请输入考试密码' }]}
                >
                  <Input.Password 
                    placeholder="请输入考试密码" 
                    style={{ 
                      borderRadius: '12px',
                      height: '52px',
                      fontSize: '16px',
                      border: '2px solid #E5E7EB',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#4F46E5';
                      e.target.style.boxShadow = '0 0 0 4px rgba(79, 70, 229, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E5E7EB';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    block 
                    style={{ 
                      borderRadius: '12px',
                      height: '52px',
                      fontSize: '16px',
                      fontWeight: '600',
                      background: 'linear-gradient(135deg, #4F46E5 0%, #10B981 100%)',
                      border: 'none',
                      boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(79, 70, 229, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.3)';
                    }}
                  >
                    <Space>
                      <ThunderboltOutlined />
                      验证密码
                    </Space>
                  </Button>
                </Form.Item>
              </Form>
              
              {/* 底部提示 */}
              <div style={{ 
                textAlign: 'center', 
                marginTop: '24px', 
                padding: '16px',
                background: 'rgba(79, 70, 229, 0.05)',
                borderRadius: '12px',
                border: '1px solid rgba(79, 70, 229, 0.1)'
              }}>
                <Text type="secondary" style={{ fontSize: '13px' }}>
                  <BulbOutlined style={{ marginRight: '6px', color: '#4F46E5' }} />
                  请联系老师获取考试密码，密码区分大小写
                </Text>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 学生信息录入步骤 - 沉浸式设计 */}
      {currentStep === 'info' && exam && (
        <div style={{
          minHeight: '100vh',
          background: `
            linear-gradient(135deg, 
              rgba(16, 185, 129, 0.08) 0%, 
              rgba(245, 158, 11, 0.06) 50%, 
              rgba(16, 185, 129, 0.08) 100%
            ),
            radial-gradient(circle at 30% 20%, rgba(16, 185, 129, 0.12) 0%, transparent 60%),
            radial-gradient(circle at 70% 80%, rgba(245, 158, 11, 0.12) 0%, transparent 60%)
          `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '520px',
            animation: 'fadeInUp 0.6s ease-out 0.2s both'
          }}>
            <Card 
              style={{ 
                boxShadow: `
                  0 20px 40px rgba(0, 0, 0, 0.08),
                  0 8px 16px rgba(0, 0, 0, 0.04),
                  inset 0 1px 0 rgba(255, 255, 255, 0.6)
                `,
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)'
              }}
              bodyStyle={{ padding: '40px' }}
            >
              {/* 头部区域 */}
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '80px',
                  height: '80px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, #10B981 0%, #F59E0B 100%)',
                  marginBottom: '24px',
                  boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)'
                }}>
                  <RocketOutlined style={{ fontSize: '36px', color: 'white' }} />
                </div>
                <Title level={2} style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '700' }}>
                  {exam.title}
                </Title>
                <Text type="secondary" style={{ fontSize: '16px', lineHeight: '1.5' }}>
                  📝 准备开始心理测试，请先填写基本信息
                </Text>
              </div>

              {/* 考试信息卡片 */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(245, 158, 11, 0.05))',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '32px',
                border: '1px solid rgba(16, 185, 129, 0.15)'
              }}>
                <Row gutter={[16, 12]}>
                  <Col span={12}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981', marginBottom: '4px' }}>
                        {exam.questions?.length || 0}
                      </div>
                      <Text type="secondary" style={{ fontSize: '13px' }}>题目数量</Text>
                    </div>
                  </Col>
                  <Col span={12}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#F59E0B', marginBottom: '4px' }}>
                        {exam.duration_minutes}
                      </div>
                      <Text type="secondary" style={{ fontSize: '13px' }}>限时(分钟)</Text>
                    </div>
                  </Col>
                </Row>
                
                <Divider style={{ margin: '16px 0' }} />
                
                <div style={{ fontSize: '13px', lineHeight: '1.6', color: '#6B7280' }}>
                  <div style={{ marginBottom: '6px' }}>
                    <HeartOutlined style={{ color: '#10B981', marginRight: '6px' }} />
                    请如实填写个人信息和答题内容
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <StarOutlined style={{ color: '#F59E0B', marginRight: '6px' }} />
                    答案会自动保存，请安心作答
                  </div>
                  <div>
                    <BulbOutlined style={{ color: '#4F46E5', marginRight: '6px' }} />
                    提交后无法修改，请仔细检查
                  </div>
                </div>
              </div>

              <Form
                onFinish={handleStudentInfoSubmit}
                layout="vertical"
                size="large"
                initialValues={studentInfo || undefined}
              >
                <Form.Item
                  name="student_id"
                  label={<Text strong style={{ fontSize: '15px' }}>学号/ID</Text>}
                  rules={[{ required: true, message: '请输入您的学号或ID' }]}
                >
                  <Input 
                    placeholder="请输入您的学号或ID" 
                    style={{ 
                      borderRadius: '12px',
                      height: '52px',
                      fontSize: '16px',
                      border: '2px solid #E5E7EB',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#10B981';
                      e.target.style.boxShadow = '0 0 0 4px rgba(16, 185, 129, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E5E7EB';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </Form.Item>
                <Form.Item
                  name="student_name"
                  label={<Text strong style={{ fontSize: '15px' }}>姓名</Text>}
                  rules={[{ required: true, message: '请输入您的姓名' }]}
                >
                  <Input 
                    placeholder="请输入您的姓名" 
                    style={{ 
                      borderRadius: '12px',
                      height: '52px',
                      fontSize: '16px',
                      border: '2px solid #E5E7EB',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#10B981';
                      e.target.style.boxShadow = '0 0 0 4px rgba(16, 185, 129, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#E5E7EB';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </Form.Item>
                <Form.Item style={{ marginBottom: 0 }}>
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    block 
                    style={{ 
                      borderRadius: '12px',
                      height: '56px',
                      fontSize: '17px',
                      fontWeight: '600',
                      background: 'linear-gradient(135deg, #10B981 0%, #F59E0B 100%)',
                      border: 'none',
                      boxShadow: '0 6px 16px rgba(16, 185, 129, 0.3)',
                      transition: 'all 0.3s ease',
                      marginTop: '8px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.3)';
                    }}
                  >
                    <Space>
                      <FireOutlined />
                      开始答题之旅
                    </Space>
                  </Button>
                </Form.Item>
              </Form>
            </Card>
          </div>
        </div>
      )}

      {/* 设备测试步骤 */}
      {currentStep === 'device-test' && (
        <DeviceTest
          onTestComplete={handleDeviceTestComplete}
          onSkip={handleSkipDeviceTest}
        />
      )}

      {/* 描述确认步骤 - 沉浸式设计 */}
      {currentStep === 'description' && exam && (
        <div style={{
          minHeight: '100vh',
          background: `
            linear-gradient(135deg, 
              rgba(245, 158, 11, 0.08) 0%, 
              rgba(79, 70, 229, 0.06) 50%, 
              rgba(245, 158, 11, 0.08) 100%
            ),
            radial-gradient(circle at 40% 30%, rgba(245, 158, 11, 0.12) 0%, transparent 60%),
            radial-gradient(circle at 60% 70%, rgba(79, 70, 229, 0.12) 0%, transparent 60%)
          `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '720px',
            animation: 'fadeInUp 0.6s ease-out 0.3s both'
          }}>
            <Card 
              style={{ 
                boxShadow: `
                  0 20px 40px rgba(0, 0, 0, 0.08),
                  0 8px 16px rgba(0, 0, 0, 0.04),
                  inset 0 1px 0 rgba(255, 255, 255, 0.6)
                `,
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px)'
              }}
              bodyStyle={{ padding: '48px' }}
            >
              {/* 头部区域 */}
              <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '80px',
                  height: '80px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, #F59E0B 0%, #4F46E5 100%)',
                  marginBottom: '24px',
                  boxShadow: '0 8px 20px rgba(245, 158, 11, 0.3)'
                }}>
                  <BulbOutlined style={{ fontSize: '36px', color: 'white' }} />
                </div>
                <Title level={2} style={{ margin: '0 0 8px 0', fontSize: '24px', fontWeight: '700' }}>
                  {exam.title}
                </Title>
                <Text type="secondary" style={{ fontSize: '16px', lineHeight: '1.5' }}>
                  📋 请仔细阅读以下说明，了解测试要求后开始答题
                </Text>
              </div>

              {/* 考试描述内容 */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(79, 70, 229, 0.05))',
                borderRadius: '16px',
                padding: '32px',
                marginBottom: '32px',
                border: '1px solid rgba(245, 158, 11, 0.15)'
              }}>
                <div style={{
                  fontSize: '16px',
                  lineHeight: '1.8',
                  color: '#374151',
                  textAlign: 'left'
                }}>
                  {exam.description}
                </div>
              </div>

              {/* 测试提醒信息 */}
              <div style={{
                background: 'rgba(79, 70, 229, 0.05)',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '32px',
                border: '1px solid rgba(79, 70, 229, 0.1)'
              }}>
                <Row gutter={[16, 12]}>
                  <Col span={8}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4F46E5', marginBottom: '4px' }}>
                        {exam.questions?.length || 0}
                      </div>
                      <Text type="secondary" style={{ fontSize: '12px' }}>题目总数</Text>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#F59E0B', marginBottom: '4px' }}>
                        {exam.duration_minutes}
                      </div>
                      <Text type="secondary" style={{ fontSize: '12px' }}>限时(分钟)</Text>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#10B981', marginBottom: '4px' }}>
                        {studentInfo?.student_name}
                      </div>
                      <Text type="secondary" style={{ fontSize: '12px' }}>参试学生</Text>
                    </div>
                  </Col>
                </Row>
              </div>

              {/* 重要提示 */}
              <Alert
                message="重要提示"
                description={
                  <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
                    <div style={{ marginBottom: '8px' }}>
                      <CheckCircleOutlined style={{ color: '#10B981', marginRight: '6px' }} />
                      请确保您已仔细阅读上述说明内容
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <ClockCircleOutlined style={{ color: '#F59E0B', marginRight: '6px' }} />
                      测试开始后将自动计时，请合理安排答题时间
                    </div>
                    <div>
                      <HeartOutlined style={{ color: '#EF4444', marginRight: '6px' }} />
                      请诚实作答，测试结果仅用于心理健康评估
                    </div>
                  </div>
                }
                type="info"
                showIcon
                style={{ marginBottom: '32px' }}
              />

              {/* 操作按钮 */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                <Button 
                  size="large"
                  onClick={() => setCurrentStep('device-test')}
                  style={{
                    borderRadius: '12px',
                    height: '52px',
                    minWidth: '120px',
                    fontSize: '16px'
                  }}
                >
                  <ArrowLeftOutlined />
                  返回上一步
                </Button>
                <Button 
                  type="primary" 
                  size="large"
                  onClick={handleStartExam}
                  style={{ 
                    borderRadius: '12px',
                    height: '52px',
                    minWidth: '160px',
                    fontSize: '16px',
                    fontWeight: '600',
                    background: 'linear-gradient(135deg, #F59E0B 0%, #4F46E5 100%)',
                    border: 'none',
                    boxShadow: '0 6px 16px rgba(245, 158, 11, 0.3)',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(245, 158, 11, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(245, 158, 11, 0.3)';
                  }}
                >
                  <Space>
                    <RocketOutlined />
                    开始答题
                  </Space>
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* 考试答题步骤 - 沉浸式全屏体验 */}
      {currentStep === 'exam' && exam && exam.questions && currentQuestion && (
        <div style={{
          minHeight: '100vh',
          background: `
            linear-gradient(145deg, 
              rgba(79, 70, 229, 0.03) 0%, 
              rgba(16, 185, 129, 0.02) 30%, 
              rgba(245, 158, 11, 0.03) 60%, 
              rgba(79, 70, 229, 0.03) 100%
            )
          `,
          position: 'relative'
        }}>
          {/* 顶部状态栏 - 毛玻璃效果 */}
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
            zIndex: 1000,
            padding: '12px 24px'
          }}>
            <div style={{ 
              maxWidth: '1200px', 
              margin: '0 auto',
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Avatar 
                  style={{ 
                    background: 'linear-gradient(135deg, #4F46E5, #10B981)',
                    marginRight: '12px'
                  }}
                  icon={<EyeOutlined />}
                />
                <div>
                  <Text strong style={{ fontSize: '16px', display: 'block' }}>{exam.title}</Text>
                  <Text type="secondary" style={{ fontSize: '13px' }}>
                    {studentInfo?.student_name} · {studentInfo?.student_id}
                  </Text>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                {/* 进度指示器 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ minWidth: '120px' }}>
                    <Progress 
                      percent={progress} 
                      size="small"
                      showInfo={false}
                      strokeColor={{ 
                        '0%': '#4F46E5', 
                        '100%': '#10B981' 
                      }}
                      style={{ marginBottom: '4px' }}
                    />
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      题目 {currentQuestionIndex + 1} / {allQuestions.length}
                      {(() => {
                        const requiredCount = allQuestions.filter(q => q.is_required !== false).length;
                        const answeredRequiredCount = allQuestions.filter(q => {
                          const isRequired = q.is_required !== false;
                          if (!isRequired) return false;
                          const answer = answers[q.id];
                          if (answer === undefined || answer === null) return false;
                          if (typeof answer === 'string' && answer.trim() === '') return false;
                          if (Array.isArray(answer) && answer.length === 0) return false;
                          return true;
                        }).length;
                        return requiredCount > 0 ? ` · 必填 ${answeredRequiredCount}/${requiredCount}` : '';
                      })()}
                    </Text>
                  </div>
                </div>
                
                {/* 计时器 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: timeRemaining < 300 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(79, 70, 229, 0.1)',
                  padding: '8px 12px',
                  borderRadius: '12px',
                  border: `1px solid ${timeRemaining < 300 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(79, 70, 229, 0.2)'}`
                }}>
                  <ClockCircleOutlined style={{ 
                    color: timeRemaining < 300 ? '#EF4444' : '#4F46E5',
                    fontSize: '16px'
                  }} />
                  <Text strong style={{ 
                    color: timeRemaining < 300 ? '#EF4444' : '#4F46E5',
                    fontSize: '16px',
                    fontFamily: 'monospace'
                  }}>
                    {formatTime(timeRemaining)}
                  </Text>
                </div>
                
                {/* 提交按钮 */}
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={() => handleSubmitExam()}
                  loading={submitting}
                  style={{
                    borderRadius: '12px',
                    height: '44px',
                    background: 'linear-gradient(135deg, #EF4444, #DC2626)',
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                  }}
                >
                  提交考试
                </Button>
              </div>
            </div>
          </div>

          {/* 主内容区域 */}
          <div style={{ 
            paddingTop: '100px',
            paddingBottom: '40px',
            minHeight: '100vh'
          }}>
            <div style={{
              maxWidth: '900px',
              margin: '0 auto',
              padding: '0 24px'
            }}>
              {/* 题目卡片 */}
              <Card
                style={{
                  borderRadius: '24px',
                  boxShadow: `
                    0 20px 40px rgba(0, 0, 0, 0.08),
                    0 8px 16px rgba(0, 0, 0, 0.04)
                  `,
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(255, 255, 255, 0.98)',
                  backdropFilter: 'blur(20px)',
                  transition: 'all 0.3s ease',
                  animation: questionTransition ? 'questionSlide 0.3s ease-out' : 'none'
                }}
                bodyStyle={{ padding: '48px' }}
              >
                {/* 题目头部 */}
                <div style={{ marginBottom: '32px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Avatar 
                        size={48}
                        style={{
                          background: `linear-gradient(135deg, ${
                            currentQuestion.question_type === 'single_choice' ? '#4F46E5' : 
                            currentQuestion.question_type === 'multiple_choice' ? '#10B981' : '#F59E0B'
                          }, ${
                            currentQuestion.question_type === 'single_choice' ? '#7C3AED' : 
                            currentQuestion.question_type === 'multiple_choice' ? '#059669' : '#D97706'
                          })`,
                          fontSize: '20px',
                          fontWeight: 'bold'
                        }}
                      >
                        {currentQuestionIndex + 1}
                      </Avatar>
                      <div>
                        <Title level={3} style={{ margin: 0, fontSize: '20px' }}>
                          第 {currentQuestionIndex + 1} 题
                        </Title>
                        <Tag 
                          color={
                            currentQuestion.question_type === 'single_choice' ? 'blue' : 
                            currentQuestion.question_type === 'multiple_choice' ? 'green' : 'orange'
                          }
                          style={{ marginTop: '4px' }}
                        >
                          {currentQuestion.question_type === 'single_choice' ? '单选题' : 
                           currentQuestion.question_type === 'multiple_choice' ? '多选题' : '文本题'}
                        </Tag>
                      </div>
                    </div>
                    
                    {/* 题目标识组合 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* 必填题目标识 */}
                      {(currentQuestion.is_required !== false) && (
                        <Tooltip title="必填题目">
                          <Badge 
                            count="*" 
                            style={{ 
                              backgroundColor: '#ff4d4f',
                              fontSize: '14px',
                              fontWeight: 'bold',
                              boxShadow: '0 2px 8px rgba(255, 77, 79, 0.3)'
                            }}
                          />
                        </Tooltip>
                      )}
                      
                    </div>
                  </div>
                  
                  <div style={{
                    fontSize: '18px',
                    lineHeight: '1.8',
                    color: '#1F2937',
                    padding: '24px',
                    background: 'rgba(79, 70, 229, 0.05)',
                    borderRadius: '16px',
                    border: '1px solid rgba(79, 70, 229, 0.1)'
                  }}>
                    {/* 必填标识 */}
                    {(currentQuestion.is_required !== false) && (
                      <Text strong style={{ color: '#ff4d4f', fontSize: '20px', marginRight: '8px' }}>
                        *
                      </Text>
                    )}
                    {currentQuestion.title}
                  </div>
                </div>

                {/* 答案选项区域 */}
                <div style={{ marginBottom: '40px' }}>
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.8)',
                    borderRadius: '16px',
                    padding: '32px',
                    border: '1px solid rgba(0, 0, 0, 0.06)'
                  }}>
                    {renderQuestion(currentQuestion)}
                  </div>
                </div>

                {/* 导航区域 */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '24px',
                  borderTop: '1px solid rgba(0, 0, 0, 0.06)'
                }}>
                  <Button
                    disabled={currentQuestionIndex === 0}
                    onClick={() => handleQuestionChange(currentQuestionIndex - 1)}
                    style={{
                      borderRadius: '12px',
                      height: '44px',
                      minWidth: '120px'
                    }}
                    icon={<ArrowLeftOutlined />}
                  >
                    上一题
                  </Button>
                  
                  {/* 题目导航 */}
                  <Button
                    type="text"
                    onClick={() => setShowQuestionNav(!showQuestionNav)}
                    style={{
                      borderRadius: '12px',
                      height: '44px',
                      background: 'rgba(79, 70, 229, 0.1)',
                      border: '1px solid rgba(79, 70, 229, 0.2)'
                    }}
                    icon={<MenuOutlined />}
                  >
                    题目导航
                  </Button>

                  {currentQuestionIndex === allQuestions.length - 1 ? (
                    <Button
                      type="primary"
                      onClick={() => handleSubmitExam()}
                      loading={submitting}
                      style={{
                        borderRadius: '12px',
                        height: '44px',
                        minWidth: '120px',
                        background: 'linear-gradient(135deg, #10B981, #059669)',
                        border: 'none',
                        fontWeight: '600'
                      }}
                    >
                      <SendOutlined />
                      提交试卷
                    </Button>
                  ) : (
                    <Button
                      type="primary"
                      onClick={() => handleQuestionChange(currentQuestionIndex + 1)}
                      style={{
                        borderRadius: '12px',
                        height: '44px',
                        minWidth: '120px',
                        background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                        border: 'none'
                      }}
                    >
                      下一题
                      <ArrowRightOutlined />
                    </Button>
                  )}
                </div>
              </Card>

              {/* 题目导航面板 */}
              {showQuestionNav && (
                <Card
                  style={{
                    marginTop: '24px',
                    borderRadius: '16px',
                    background: 'rgba(255, 255, 255, 0.95)',
                    backdropFilter: 'blur(20px)',
                    animation: 'fadeInUp 0.3s ease-out'
                  }}
                  title="题目导航"
                  bodyStyle={{ padding: '24px' }}
                >
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))',
                    gap: '12px'
                  }}>
                    {allQuestions.map((q, index) => {
                      const isRequired = q.is_required !== false;
                      return (
                        <Button
                          key={index}
                          type={index === currentQuestionIndex ? 'primary' : 'default'}
                          onClick={() => {
                            handleQuestionChange(index);
                            setShowQuestionNav(false);
                          }}
                          style={{
                            height: '48px',
                            borderRadius: '12px',
                            position: 'relative',
                            background: answers[q.id] ? 
                              (index === currentQuestionIndex ? undefined : 'rgba(16, 185, 129, 0.1)') :
                              (isRequired ? 'rgba(239, 68, 68, 0.05)' : undefined),
                            borderColor: answers[q.id] ? '#10B981' : (isRequired ? '#EF4444' : undefined),
                            borderWidth: isRequired && !answers[q.id] ? '2px' : '1px'
                          }}
                        >
                          {index + 1}
                          {answers[q.id] && (
                            <CheckCircleOutlined 
                              style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-4px',
                                fontSize: '12px',
                                color: '#10B981',
                                background: 'white',
                                borderRadius: '50%'
                              }}
                            />
                          )}
                          {isRequired && !answers[q.id] && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '-4px',
                                left: '-4px',
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                background: '#EF4444',
                              }}
                            />
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          </div>

          {/* AI功能侧边栏 */}
          <div style={{
            position: 'fixed',
            top: '100px',
            right: '24px',
            width: '320px',
            maxHeight: 'calc(100vh - 140px)',
            overflowY: 'auto',
            zIndex: 999,
          }}>
            <Space direction="vertical" style={{ width: '100%' }} size="small">
              {/* 音频播放组件 */}
              {currentQuestion && (
                <AudioFilePlayer
                  ref={audioPlayerRef}
                  audioUrl={audioApi.getPreviewUrl(currentQuestion.id)}
                  audioStatus="ready"
                  autoPlay={true}
                  onPlayStart={() => {
                    timelineRecorder.recordEvent('custom', {
                      eventName: 'audio_play_start',
                      questionId: currentQuestion.id,
                    });
                  }}
                  onPlayComplete={() => {
                    timelineRecorder.recordEvent('custom', {
                      eventName: 'audio_play_complete',
                      questionId: currentQuestion.id,
                    });
                  }}
                  showControls={true}
                  size="large"
                />
              )}
              
              {/* 情绪分析已移至外部AI服务，通过WebSocket进行实时分析 */}
              {deviceTestResults?.cameraPermission && aiSessionId && (
                <div style={{ 
                  padding: '16px', 
                  background: '#f0f9ff', 
                  border: '1px dashed #1890ff',
                  borderRadius: '8px',
                  textAlign: 'center',
                  color: '#1890ff'
                }}>
                  <span>🤖 AI智能分析已启用</span>
                  <br />
                  <small>系统正在后台进行心理状态分析</small>
                </div>
              )}
            </Space>
          </div>

          {/* 悬浮快捷操作 */}
          <FloatButton.Group
            trigger="hover"
            type="primary"
            style={{ right: 24, bottom: 24 }}
            icon={<MenuOutlined />}
          >
            <FloatButton
              tooltip="题目导航"
              icon={<MenuOutlined />}
              onClick={() => setShowQuestionNav(!showQuestionNav)}
            />
            <FloatButton
              tooltip="提交考试"
              icon={<SendOutlined />}
              onClick={() => handleSubmitExam()}
              style={{ background: '#EF4444' }}
            />
          </FloatButton.Group>
        </div>
      )}

      {/* 完成步骤 - 庆祝动画 */}
      {currentStep === 'completed' && (
        <div style={{
          minHeight: '100vh',
          background: `
            linear-gradient(135deg, 
              rgba(16, 185, 129, 0.08) 0%, 
              rgba(52, 211, 153, 0.06) 50%, 
              rgba(16, 185, 129, 0.08) 100%
            ),
            radial-gradient(circle at 50% 20%, rgba(16, 185, 129, 0.15) 0%, transparent 60%),
            radial-gradient(circle at 20% 80%, rgba(52, 211, 153, 0.12) 0%, transparent 60%)
          `,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* 背景装饰 */}
          <div style={{
            position: 'absolute',
            top: '10%',
            left: '10%',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.1)',
            animation: 'float 3s ease-in-out infinite'
          }} />
          <div style={{
            position: 'absolute',
            top: '70%',
            right: '15%',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'rgba(52, 211, 153, 0.15)',
            animation: 'float 4s ease-in-out infinite 1s'
          }} />
          <div style={{
            position: 'absolute',
            bottom: '20%',
            left: '20%',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.12)',
            animation: 'float 5s ease-in-out infinite 2s'
          }} />
          
          <div style={{
            width: '100%',
            maxWidth: '520px',
            animation: 'successBounce 0.8s ease-out',
            zIndex: 10
          }}>
            <Card 
              style={{ 
                textAlign: 'center',
                boxShadow: `
                  0 25px 50px rgba(0, 0, 0, 0.08),
                  0 12px 24px rgba(0, 0, 0, 0.04),
                  inset 0 1px 0 rgba(255, 255, 255, 0.8)
                `,
                borderRadius: '32px',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                background: 'rgba(255, 255, 255, 0.98)',
                backdropFilter: 'blur(20px)',
                position: 'relative',
                overflow: 'hidden'
              }}
              bodyStyle={{ padding: '64px 48px' }}
            >
              {/* 成功图标 */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10B981, #34D399)',
                marginBottom: '32px',
                boxShadow: '0 12px 24px rgba(16, 185, 129, 0.3)',
                animation: 'successPulse 2s ease-in-out infinite'
              }}>
                <CheckCircleOutlined style={{ 
                  fontSize: '56px', 
                  color: 'white',
                  animation: 'iconBounce 0.6s ease-out 0.5s both'
                }} />
              </div>
              
              <Title level={1} style={{ 
                marginBottom: '16px',
                fontSize: '32px',
                fontWeight: '800',
                background: 'linear-gradient(135deg, #10B981, #059669)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                🎉 提交成功！
              </Title>
              
              <div style={{
                fontSize: '18px',
                lineHeight: '1.8',
                color: '#4B5563',
                marginBottom: '40px',
                background: 'rgba(16, 185, 129, 0.05)',
                padding: '24px',
                borderRadius: '16px',
                border: '1px solid rgba(16, 185, 129, 0.1)'
              }}>
                <div style={{ marginBottom: '16px', fontSize: '16px' }}>
                  <HeartOutlined style={{ color: '#10B981', marginRight: '8px' }} />
                  感谢您参与本次心理测试，您的答案已安全提交
                </div>
                <Divider style={{ margin: '16px 0', borderColor: 'rgba(16, 185, 129, 0.2)' }} />
                <div style={{ fontSize: '15px', color: '#6B7280' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <StarOutlined style={{ color: '#F59E0B', marginRight: '6px' }} />
                    测试结果将由专业人员进行分析
                  </div>
                  <div>
                    <BulbOutlined style={{ color: '#4F46E5', marginRight: '6px' }} />
                    如有需要会及时与您联系
                  </div>
                </div>
              </div>
              
              <Button 
                type="primary" 
                size="large" 
                onClick={() => navigate('/')}
                style={{ 
                  borderRadius: '16px',
                  height: '56px',
                  fontSize: '17px',
                  fontWeight: '600',
                  minWidth: '160px',
                  background: 'linear-gradient(135deg, #10B981, #34D399)',
                  border: 'none',
                  boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = '0 12px 30px rgba(16, 185, 129, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(16, 185, 129, 0.3)';
                }}
              >
                <Space>
                  <HeartOutlined />
                  返回首页
                </Space>
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* 异常状态处理 */}
      {!loading && exam && (
          <>
            {/* 数据异常：步骤和数据不匹配 */}
            {currentStep === 'info' && exam && (!exam.questions || exam.questions.length === 0) && (
              <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px'
              }}>
                <div style={{ width: '100%', maxWidth: '500px' }}>
                  <Card 
                    style={{ 
                      textAlign: 'center',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      borderRadius: '12px'
                    }}
                  >
                    <Alert
                      message="页面异常"
                      description="请刷新页面重新开始"
                      type="warning"
                      showIcon
                      action={
                        <Button 
                          type="primary" 
                          onClick={() => window.location.reload()}
                          style={{ borderRadius: '6px' }}
                        >
                          刷新页面
                        </Button>
                      }
                    />
                  </Card>
                </div>
              </div>
            )}
            
            {/* 考试步骤异常：应该有题目但没有题目 */}
            {currentStep === 'exam' && (!exam.questions || exam.questions.length === 0) && (
              <div style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px'
              }}>
                <div style={{ width: '100%', maxWidth: '500px' }}>
                  <Card 
                    style={{ 
                      textAlign: 'center',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      borderRadius: '12px'
                    }}
                  >
                    <Alert
                      message="考试数据异常"
                      description="未找到考试题目，请刷新页面重试"
                      type="error"
                      showIcon
                      action={
                        <Button 
                          type="primary" 
                          onClick={() => window.location.reload()}
                          style={{ borderRadius: '6px' }}
                        >
                          刷新页面
                        </Button>
                      }
                    />
                  </Card>
                </div>
              </div>
            )}
          </>
        )}

      {/* AI会话失败处理对话框 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: '20px' }} />
            <span>情绪分析连接失败</span>
          </div>
        }
        open={aiFailureModalVisible}
        footer={null}
        closable={false}
        centered
        width={480}
      >
        <div style={{ padding: '16px 0' }}>
          <div style={{ marginBottom: '16px', fontSize: '14px', lineHeight: '1.6', color: '#666' }}>
            {aiFailureError}
          </div>
          
          <div style={{ 
            background: '#f6f9fc', 
            padding: '12px', 
            borderRadius: '8px', 
            marginBottom: '24px',
            border: '1px solid #e8f2ff'
          }}>
            <div style={{ fontSize: '13px', color: '#4a5568' }}>
              <div style={{ marginBottom: '4px' }}>
                <InfoCircleOutlined style={{ color: '#3182ce', marginRight: '6px' }} />
                情绪分析功能可以记录您的答题过程，帮助生成心理分析报告
              </div>
              <div style={{ marginBottom: '4px' }}>
                • <strong>继续考试</strong>：跳过情绪分析，正常进行测试
              </div>
              <div style={{ marginBottom: '4px' }}>
                • <strong>重试连接</strong>：尝试重新连接分析服务（AI: {aiRetryCount}/{maxRetries}, WS: {wsRetryCount}/{maxWSRetries}）
              </div>
              <div>
                • <strong>取消考试</strong>：返回信息填写页面
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <Button 
              onClick={() => handleAIFailureOption('cancel')}
              style={{ minWidth: '80px' }}
            >
              取消考试
            </Button>
            <Button 
              onClick={() => handleAIFailureOption('continue')}
              type="default"
              style={{ minWidth: '80px' }}
            >
              继续考试
            </Button>
            <Button 
              onClick={() => handleAIFailureOption('retry')}
              type="primary"
              loading={aiRetryInProgress || wsConnecting}
              disabled={aiRetryCount >= maxRetries}
              style={{ minWidth: '80px' }}
            >
              {(aiRetryInProgress || wsConnecting) ? '连接中...' : '重试连接'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default StudentExam;