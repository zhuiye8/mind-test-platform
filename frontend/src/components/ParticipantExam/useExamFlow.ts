import { useState, useCallback, useRef, useEffect } from 'react';
import type { Question } from '../../types';
import { useTimelineRecorder } from '../../utils/timelineRecorder';

// 参与者信息类型
interface ParticipantInfo {
  participantId: string;
  participantName: string;
}

// 考试流程管理 Hook
export const useExamFlow = (
  examUuid: string | undefined,
  visibleQuestions: Question[],
  timelineRecorder: ReturnType<typeof useTimelineRecorder>,
  onTimeUp: () => void,
  participantInfo: ParticipantInfo | null = null
) => {
  // 答案与题目索引
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  // 计时相关
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [examStartTime, setExamStartTime] = useState<Date | null>(null);
  // UI 状态
  const [showQuestionNav, setShowQuestionNav] = useState(false);
  const [questionTransition, setQuestionTransition] = useState(false);
  // 定时器引用
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 开始考试：启动计时并记录第一题显示
  const startExam = useCallback((durationMinutes: number) => {
    setExamStartTime(new Date());
    setTimeRemaining(durationMinutes * 60);
    if (visibleQuestions.length > 0) {
      timelineRecorder.recordQuestionDisplay(visibleQuestions[0].id);
    }
    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          onTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [visibleQuestions, timelineRecorder, onTimeUp]);

  // 生成localStorage键值（包含参与者ID避免答案污染）
  const getStorageKey = useCallback(() => {
    if (!examUuid || !participantInfo?.participantId) return null;
    return `exam_answers_${examUuid}_${participantInfo.participantId}`;
  }, [examUuid, participantInfo]);

  // 清理旧的污染缓存（仅基于examUuid的旧格式键值）
  const clearContaminatedCache = useCallback(() => {
    if (!examUuid) return;
    
    try {
      // 清理旧的不包含participantId的键值
      const oldKey = `exam_answers_${examUuid}`;
      if (localStorage.getItem(oldKey)) {
        console.log(`清理旧的污染缓存: ${oldKey}`);
        localStorage.removeItem(oldKey);
      }
    } catch (error) {
      console.warn('清理污染缓存失败:', error);
    }
  }, [examUuid]);

  // 答案变化
  const handleAnswerChange = useCallback((questionId: string, value: any) => {
    setAnswers(prev => {
      const previousAnswer = prev[questionId];
      const newAnswers = { ...prev, [questionId]: value };
      
      // 使用包含参与者ID的键值存储答案
      const storageKey = getStorageKey();
      if (storageKey) {
        localStorage.setItem(storageKey, JSON.stringify(newAnswers));
      }
      
      if (previousAnswer === undefined || previousAnswer === null || previousAnswer === '') {
        timelineRecorder.recordOptionSelect(questionId, String(value), 'click');
      } else {
        timelineRecorder.recordOptionChange(questionId, String(previousAnswer), String(value), 'click');
      }
      return newAnswers;
    });
  }, [getStorageKey, timelineRecorder]);

  // 题目切换
  const handleQuestionChange = useCallback((newIndex: number) => {
    const fromQuestion = visibleQuestions[currentQuestionIndex];
    const toQuestion = visibleQuestions[newIndex];
    setQuestionTransition(true);
    if (fromQuestion && toQuestion) {
      timelineRecorder.recordQuestionNavigation(fromQuestion.id, toQuestion.id);
    }
    setTimeout(() => {
      setCurrentQuestionIndex(newIndex);
      setQuestionTransition(false);
      if (toQuestion) {
        timelineRecorder.recordQuestionDisplay(toQuestion.id);
      }
    }, 150);
  }, [currentQuestionIndex, visibleQuestions, timelineRecorder]);

  // 恢复答案（使用参与者隔离的键值）
  useEffect(() => {
    const storageKey = getStorageKey();
    if (storageKey) {
      // 清理旧的污染缓存
      clearContaminatedCache();
      
      // 加载当前参与者的答案
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const parsedAnswers = JSON.parse(saved);
          console.log(`恢复参与者 ${participantInfo?.participantId} 的答案:`, Object.keys(parsedAnswers).length, '个');
          setAnswers(parsedAnswers);
        } catch (error) {
          console.warn('解析已保存答案失败:', error);
          // 清理损坏的缓存
          localStorage.removeItem(storageKey);
        }
      }
    }
  }, [getStorageKey, clearContaminatedCache, participantInfo]);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    answers,
    setCurrentQuestionIndex,
    currentQuestionIndex,
    timeRemaining,
    examStartTime,
    showQuestionNav,
    setShowQuestionNav,
    questionTransition,
    startExam,
    handleAnswerChange,
    handleQuestionChange,
    stopTimer,
  };
};

export type UseExamFlowReturn = ReturnType<typeof useExamFlow>;
