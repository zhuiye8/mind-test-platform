/**
 * 简单的表单验证工具函数
 */

import type { Question } from '../types';

/**
 * 检查答案是否为空
 * @param answer 答案值
 * @returns 如果答案为空返回 true，否则返回 false
 */
export function isAnswerEmpty(answer: any): boolean {
  // 检查各种空值情况
  if (answer === undefined || answer === null) return true;
  
  // 字符串类型答案
  if (typeof answer === 'string' && answer.trim() === '') return true;
  
  // 数组类型答案（多选题）
  if (Array.isArray(answer) && answer.length === 0) return true;
  
  return false;
}

/**
 * 验证必填题目
 * @param questions 题目列表
 * @param answers 用户答案
 * @returns 验证结果对象
 */
export function validateRequiredQuestions(
  questions: Question[], 
  answers: Record<string, any>
): {
  isValid: boolean;
  unansweredRequired: Question[];
  totalRequired: number;
  answeredRequired: number;
} {
  // 获取必填题目（默认所有题目都是必填的，除非明确设置为false）
  const requiredQuestions = questions.filter(q => q.is_required !== false);
  
  // 检查未回答的必填题目
  const unansweredRequired = requiredQuestions.filter(q => {
    const answer = answers[q.id];
    return isAnswerEmpty(answer);
  });
  
  const totalRequired = requiredQuestions.length;
  const answeredRequired = totalRequired - unansweredRequired.length;
  
  return {
    isValid: unansweredRequired.length === 0,
    unansweredRequired,
    totalRequired,
    answeredRequired
  };
}

/**
 * 计算答题进度
 * @param questions 题目列表
 * @param answers 用户答案
 * @returns 进度百分比 (0-100)
 */
export function calculateProgress(questions: Question[], answers: Record<string, any>): number {
  if (questions.length === 0) return 0;
  
  // 计算已回答题目的数量
  const answeredCount = questions.filter(q => {
    const answer = answers[q.id];
    return !isAnswerEmpty(answer);
  }).length;
  
  return (answeredCount / questions.length) * 100;
}