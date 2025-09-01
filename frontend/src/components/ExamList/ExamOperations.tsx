/**
 * 考试操作组件
 * 重构后的简化版本，使用核心逻辑模块
 */

import React, { useCallback } from 'react';
import { App } from 'antd';
import type { Exam } from '../../types';
import type { ExamStatusType } from '../../constants/examStatus';
import * as ExamOps from './examOperationsCore';

interface ExamOperationsProps {
  onRefresh: () => void;
}

/**
 * useExamOperations Hook
 * 提供考试操作的统一接口
 */
export const useExamOperations = (onRefresh: () => void) => {
  // 复制考试链接
  const copyExamLink = useCallback(async (exam: Exam) => {
    return ExamOps.copyExamLink(exam);
  }, []);

  // 删除考试
  const deleteExam = useCallback(async (exam: Exam) => {
    return ExamOps.deleteExam(exam, onRefresh);
  }, [onRefresh]);

  // 发布考试
  const publishExam = useCallback(async (exam: Exam) => {
    return ExamOps.publishExam(exam, onRefresh);
  }, [onRefresh]);

  // 停止考试
  const stopExam = useCallback(async (exam: Exam) => {
    return ExamOps.stopExam(exam, onRefresh);
  }, [onRefresh]);

  // 归档考试
  const archiveExam = useCallback(async (exam: Exam) => {
    return ExamOps.archiveExam(exam, onRefresh);
  }, [onRefresh]);

  // 恢复考试
  const restoreExam = useCallback(async (exam: Exam) => {
    return ExamOps.restoreExam(exam, onRefresh);
  }, [onRefresh]);

  // 统一的状态变更方法
  const changeExamStatus = useCallback(async (exam: Exam, newStatus: ExamStatusType) => {
    return ExamOps.changeExamStatus(exam, newStatus, onRefresh);
  }, [onRefresh]);

  return {
    copyExamLink,
    deleteExam,
    publishExam,
    stopExam,
    archiveExam,
    restoreExam,
    changeExamStatus
  };
};

/**
 * ExamOperations Class（向后兼容）
 */
export class ExamOperations {
  private onRefresh: () => void;

  constructor(onRefresh: () => void) {
    this.onRefresh = onRefresh;
  }

  copyExamLink = (exam: Exam) => ExamOps.copyExamLink(exam);
  deleteExam = (exam: Exam) => ExamOps.deleteExam(exam, this.onRefresh);
  publishExam = (exam: Exam) => ExamOps.publishExam(exam, this.onRefresh);
  stopExam = (exam: Exam) => ExamOps.stopExam(exam, this.onRefresh);
  archiveExam = (exam: Exam) => ExamOps.archiveExam(exam, this.onRefresh);
  restoreExam = (exam: Exam) => ExamOps.restoreExam(exam, this.onRefresh);
  changeExamStatus = (exam: Exam, newStatus: ExamStatusType) => 
    ExamOps.changeExamStatus(exam, newStatus, this.onRefresh);
}

/**
 * React组件版本（如果需要）
 */
const ExamOperationsComponent: React.FC<ExamOperationsProps> = ({ onRefresh }) => {
  const operations = useExamOperations(onRefresh);
  
  // 这个组件主要是提供操作方法，不渲染UI
  return null;
};

export default ExamOperationsComponent;