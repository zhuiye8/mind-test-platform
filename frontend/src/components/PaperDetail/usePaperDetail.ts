/**
 * PaperDetail业务逻辑Hook
 * 集中管理数据获取、状态更新等逻辑
 */
import { useState, useEffect, useCallback } from 'react';
import { message } from 'antd';
import { paperApi, questionApi } from '../../services/api';
import type { Paper, Question, CreateQuestionForm } from '../../types';
import type { UsePaperDetailReturn } from './types';

export const usePaperDetail = (paperId: string): UsePaperDetailReturn => {
  const [paper, setPaper] = useState<Paper | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // 获取试卷详情和题目列表（合并为一个请求）
  const refreshPaperAndQuestions = useCallback(async () => {
    if (!paperId) return;
    
    try {
      setLoading(true);
      const response = await paperApi.getPaper(paperId);
      
      if (response.success && response.data) {
        const paperData = response.data;
        setPaper(paperData);
        // getPaper已经包含了questions数据，避免重复请求
        if (paperData.questions) {
          setQuestions(paperData.questions);
        }
      } else {
        message.error('获取试卷详情失败');
      }
    } catch (error) {
      console.error('获取试卷详情失败:', error);
      message.error('获取试卷详情失败');
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  // 单独获取题目列表（用于更新操作后刷新）
  const refreshQuestions = useCallback(async () => {
    if (!paperId) return;
    
    try {
      const response = await questionApi.getQuestions(paperId);
      
      if (response.success && response.data) {
        setQuestions(response.data);
      } else {
        message.error('获取题目列表失败');
      }
    } catch (error) {
      console.error('获取题目列表失败:', error);
      message.error('获取题目列表失败');
    }
  }, [paperId]);

  // 保持向后兼容的refreshPaper方法
  const refreshPaper = useCallback(async () => {
    await refreshPaperAndQuestions();
  }, [refreshPaperAndQuestions]);

  // 初始化数据
  useEffect(() => {
    if (paperId) {
      refreshPaperAndQuestions();
    }
  }, [paperId, refreshPaperAndQuestions]);

  // 新增题目
  const handleAddQuestion = useCallback(() => {
    setEditingQuestion(null);
    setModalVisible(true);
  }, []);

  // 编辑题目
  const handleEditQuestion = useCallback((question: Question) => {
    setEditingQuestion(question);
    setModalVisible(true);
  }, []);

  // 删除题目
  const handleDeleteQuestion = useCallback(async (questionId: string) => {
    try {
      const response = await questionApi.deleteQuestion(questionId);
      
      if (response.success) {
        message.success('题目删除成功');
        await refreshQuestions();
      } else {
        message.error(response.error || '题目删除失败');
      }
    } catch (error) {
      console.error('题目删除失败:', error);
      message.error('题目删除失败');
    }
  }, [refreshQuestions]);

  // 计算下一个可用的题目顺序
  const getNextQuestionOrder = useCallback((): number => {
    if (questions.length === 0) return 1;
    const maxOrder = Math.max(...questions.map(q => q.question_order || 0));
    return maxOrder + 1;
  }, [questions]);

  // 复制题目
  const handleDuplicateQuestion = useCallback(async (question: Question) => {
    try {
      const newQuestion: CreateQuestionForm = {
        title: `${question.title}（副本）`,
        question_type: question.question_type,
        options: question.options || {},
        question_order: getNextQuestionOrder(),
        is_required: question.is_required,
        is_scored: question.is_scored,
      };

      const response = await questionApi.createQuestion(paperId!, newQuestion);
      
      if (response.success) {
        message.success('题目复制成功');
        await refreshQuestions();
      } else {
        message.error(response.error || '题目复制失败');
      }
    } catch (error) {
      console.error('题目复制失败:', error);
      message.error('题目复制失败');
    }
  }, [paperId, getNextQuestionOrder, refreshQuestions]);

  // 模态框提交
  const handleModalSubmit = useCallback(async (data: CreateQuestionForm) => {
    try {
      let response;
      
      if (editingQuestion) {
        // 编辑模式
        response = await questionApi.updateQuestion(editingQuestion.id, data);
      } else {
        // 新增模式：先获取最新题目列表，再计算顺序号
        console.log('🔍 Getting fresh questions for order calculation...');
        try {
          const questionsResponse = await questionApi.getQuestions(paperId!);
          let currentQuestions = questions; // 默认使用当前状态
          
          if (questionsResponse.success && questionsResponse.data) {
            currentQuestions = questionsResponse.data;
            console.log('🔍 Fresh questions loaded:', currentQuestions.length);
          }
          
          const nextOrder = currentQuestions.length === 0 ? 1 : 
            Math.max(...currentQuestions.map(q => q.question_order || 0)) + 1;
            
          const newData = {
            ...data,
            question_order: nextOrder
          };
          console.log('🔍 Creating question with calculated order:', nextOrder);
          console.log('🔍 Based on questions count:', currentQuestions.length);
          console.log('🔍 Existing orders:', currentQuestions.map(q => q.question_order).sort((a, b) => a - b));
          
          response = await questionApi.createQuestion(paperId!, newData);
        } catch (orderError) {
          console.error('🔍 Failed to get fresh questions, using fallback:', orderError);
          // 失败时使用当前状态计算
          const nextOrder = getNextQuestionOrder();
          const newData = {
            ...data,
            question_order: nextOrder
          };
          response = await questionApi.createQuestion(paperId!, newData);
        }
      }
      
      if (response.success) {
        await refreshQuestions();
        setModalVisible(false);
        setEditingQuestion(null);
      } else {
        throw new Error(response.error || '操作失败');
      }
    } catch (error) {
      console.error('题目操作失败:', error);
      throw error; // 重新抛出错误给组件处理
    }
  }, [editingQuestion, paperId, refreshQuestions]);

  // 取消模态框
  const handleModalCancel = useCallback(() => {
    setModalVisible(false);
    setEditingQuestion(null);
  }, []);

  return {
    paper,
    questions,
    loading,
    modalVisible,
    editingQuestion,
    refreshPaper,
    refreshQuestions,
    handleAddQuestion,
    handleEditQuestion,
    handleDeleteQuestion,
    handleDuplicateQuestion,
    handleModalSubmit,
    handleModalCancel,
  };
};