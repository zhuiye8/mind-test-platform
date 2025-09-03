import { useState, useCallback, useRef, useEffect } from 'react';
import type { Question } from '../../types';
import { useTimelineRecorder } from '../../utils/timelineRecorder';

// 考试流程管理 Hook
export const useExamFlow = (
  examUuid: string | undefined,
  visibleQuestions: Question[],
  timelineRecorder: ReturnType<typeof useTimelineRecorder>,
  onTimeUp: () => void
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

  // 答案变化
  const handleAnswerChange = useCallback((questionId: string, value: any) => {
    setAnswers(prev => {
      const previousAnswer = prev[questionId];
      const newAnswers = { ...prev, [questionId]: value };
      if (examUuid) {
        localStorage.setItem(`exam_answers_${examUuid}`, JSON.stringify(newAnswers));
      }
      if (previousAnswer === undefined || previousAnswer === null || previousAnswer === '') {
        timelineRecorder.recordOptionSelect(questionId, String(value), 'click');
      } else {
        timelineRecorder.recordOptionChange(questionId, String(previousAnswer), String(value), 'click');
      }
      return newAnswers;
    });
  }, [examUuid, timelineRecorder]);

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

  // 恢复答案
  useEffect(() => {
    if (examUuid) {
      const saved = localStorage.getItem(`exam_answers_${examUuid}`);
      if (saved) {
        try {
          setAnswers(JSON.parse(saved));
        } catch {
          // 忽略解析错误
        }
      }
    }
  }, [examUuid]);

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
