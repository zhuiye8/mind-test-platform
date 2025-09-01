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

  // 获取试卷详情
  const refreshPaper = useCallback(async () => {
    if (!paperId) return;
    
    try {
      setLoading(true);
      const response = await paperApi.getPaper(paperId);
      
      if (response.success && response.data) {
        setPaper(response.data);
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

  // 获取题目列表
  const refreshQuestions = useCallback(async () => {
    if (!paperId) return;
    
    try {
      setLoading(true);
      const response = await questionApi.getQuestions(paperId);
      
      if (response.success && response.data) {
        setQuestions(response.data);
      } else {
        message.error('获取题目列表失败');
      }
    } catch (error) {
      console.error('获取题目列表失败:', error);
      message.error('获取题目列表失败');
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  // 初始化数据
  useEffect(() => {
    if (paperId) {
      refreshPaper();
      refreshQuestions();
    }
  }, [paperId, refreshPaper, refreshQuestions]);

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

  // 复制题目
  const handleDuplicateQuestion = useCallback(async (question: Question) => {
    try {
      const newQuestion: CreateQuestionForm = {
        title: `${question.title}（副本）`,
        question_type: question.question_type,
        options: question.options || {},
        question_order: questions.length + 1,
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
  }, [paperId, questions.length, refreshQuestions]);

  // 模态框提交
  const handleModalSubmit = useCallback(async (data: CreateQuestionForm) => {
    try {
      let response;
      
      if (editingQuestion) {
        // 编辑模式
        response = await questionApi.updateQuestion(editingQuestion.id, data);
      } else {
        // 新增模式
        response = await questionApi.createQuestion(paperId!, data);
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