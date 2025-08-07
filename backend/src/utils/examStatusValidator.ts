import { ExamStatus, EXAM_STATUS_TRANSITIONS, ExamLifecycleLog, AppError } from '../types';

/**
 * 考试状态转换验证工具类
 * 负责验证状态转换的合法性和业务逻辑检查
 */
export class ExamStatusValidator {
  /**
   * 验证状态转换是否有效
   * @param fromStatus 当前状态
   * @param toStatus 目标状态
   * @returns 是否为有效转换
   */
  static isValidTransition(fromStatus: ExamStatus, toStatus: ExamStatus): boolean {
    const allowedTransitions = EXAM_STATUS_TRANSITIONS[fromStatus];
    return allowedTransitions?.includes(toStatus) || false;
  }

  /**
   * 验证状态转换并抛出错误（如果无效）
   * @param fromStatus 当前状态
   * @param toStatus 目标状态
   * @throws {AppError} 状态转换无效时抛出错误
   */
  static validateTransition(fromStatus: ExamStatus, toStatus: ExamStatus): void {
    if (!this.isValidTransition(fromStatus, toStatus)) {
      throw new AppError(
        `无效的状态转换：不能从 ${this.getStatusDisplayName(fromStatus)} 转换到 ${this.getStatusDisplayName(toStatus)}`,
        400
      );
    }
  }

  /**
   * 获取状态的显示名称（中文）
   * @param status 状态枚举值
   * @returns 中文显示名称
   */
  static getStatusDisplayName(status: ExamStatus): string {
    const displayNames: Record<ExamStatus, string> = {
      [ExamStatus.DRAFT]: '草稿',
      [ExamStatus.PUBLISHED]: '进行中',
      [ExamStatus.EXPIRED]: '已停止',
      [ExamStatus.SUCCESS]: '已结束',
      [ExamStatus.ARCHIVED]: '已归档',
    };
    return displayNames[status] || status;
  }

  /**
   * 获取状态的操作动词（用于日志记录）
   * @param toStatus 目标状态
   * @returns 操作动词
   */
  static getActionVerb(toStatus: ExamStatus): string {
    const actionVerbs: Record<ExamStatus, string> = {
      [ExamStatus.DRAFT]: '保存为草稿',
      [ExamStatus.PUBLISHED]: '发布',
      [ExamStatus.EXPIRED]: '停止',
      [ExamStatus.SUCCESS]: '结束',
      [ExamStatus.ARCHIVED]: '归档',
    };
    return actionVerbs[toStatus] || '更新状态';
  }

  /**
   * 检查考试是否可以被删除
   * @param status 考试状态
   * @param submissionCount 提交数量
   * @returns 是否可以删除
   */
  static canDelete(status: ExamStatus, submissionCount: number): boolean {
    // 草稿状态的考试总是可以删除
    if (status === ExamStatus.DRAFT) {
      return true;
    }
    
    // 已归档的考试可以永久删除（无论是否有提交）
    if (status === ExamStatus.ARCHIVED) {
      return true;
    }

    // 其他状态的考试如果有提交则不能删除
    return submissionCount === 0;
  }

  /**
   * 检查考试是否可以被归档
   * @param status 考试状态
   * @returns 是否可以归档
   */
  static canArchive(status: ExamStatus): boolean {
    return status === ExamStatus.SUCCESS;
  }

  /**
   * 检查考试是否可以被恢复
   * @param status 考试状态
   * @returns 是否可以恢复
   */
  static canRestore(status: ExamStatus): boolean {
    return status === ExamStatus.ARCHIVED;
  }

  /**
   * 检查考试是否可以被结束
   * @param status 考试状态
   * @returns 是否可以结束
   */
  static canFinish(status: ExamStatus): boolean {
    return status === ExamStatus.PUBLISHED;
  }

  /**
   * 检查考试是否可以被停止
   * @param status 考试状态
   * @returns 是否可以停止
   */
  static canExpire(status: ExamStatus): boolean {
    return status === ExamStatus.PUBLISHED;
  }

  /**
   * 获取可以执行的操作列表
   * @param status 当前状态
   * @param submissionCount 提交数量
   * @returns 可执行操作列表
   */
  static getAvailableActions(
    status: ExamStatus, 
    submissionCount: number = 0
  ): Array<{
    action: string;
    target_status: ExamStatus;
    display_name: string;
    description: string;
  }> {
    const actions: Array<{
      action: string;
      target_status: ExamStatus;
      display_name: string;
      description: string;
    }> = [];

    const allowedTransitions = EXAM_STATUS_TRANSITIONS[status] || [];

    allowedTransitions.forEach(targetStatus => {
      switch (targetStatus) {
        case ExamStatus.PUBLISHED:
          actions.push({
            action: 'publish',
            target_status: targetStatus,
            display_name: '发布考试',
            description: '将考试发布，学生可以开始参与'
          });
          break;
        case ExamStatus.EXPIRED:
          actions.push({
            action: 'expire',
            target_status: targetStatus,
            display_name: '停止考试',
            description: '强制停止考试，学生无法继续参与'
          });
          break;
        case ExamStatus.SUCCESS:
          if (status === ExamStatus.PUBLISHED) {
            actions.push({
              action: 'finish',
              target_status: targetStatus,
              display_name: '结束考试',
              description: '正常结束考试，可查看完整结果'
            });
          } else if (status === ExamStatus.ARCHIVED) {
            actions.push({
              action: 'restore',
              target_status: targetStatus,
              display_name: '恢复考试',
              description: '从回收站恢复考试'
            });
          }
          break;
        case ExamStatus.ARCHIVED:
          actions.push({
            action: 'archive',
            target_status: targetStatus,
            display_name: '归档考试',
            description: '将考试移至回收站'
          });
          break;
        case ExamStatus.DRAFT:
          actions.push({
            action: 'draft',
            target_status: targetStatus,
            display_name: '重新编辑',
            description: '将考试转为草稿状态，可重新编辑'
          });
          break;
      }
    });

    // 添加删除操作（如果允许）
    if (this.canDelete(status, submissionCount)) {
      actions.push({
        action: 'delete',
        target_status: status, // 删除操作不改变状态
        display_name: status === ExamStatus.ARCHIVED ? '永久删除' : '删除考试',
        description: status === ExamStatus.ARCHIVED 
          ? '永久删除考试，无法恢复' 
          : submissionCount > 0 
            ? `删除考试及${submissionCount}条提交记录`
            : '删除考试'
      });
    }

    return actions;
  }

  /**
   * 创建操作日志记录
   * @param examId 考试ID
   * @param teacherId 教师ID
   * @param action 操作类型
   * @param fromStatus 原状态
   * @param toStatus 目标状态
   * @param reason 操作原因
   * @param metadata 额外元数据
   * @returns 日志记录对象
   */
  static createOperationLog(
    examId: string,
    teacherId: string,
    action: string,
    fromStatus?: ExamStatus,
    toStatus?: ExamStatus,
    reason?: string,
    metadata?: Record<string, any>
  ): ExamLifecycleLog {
    return {
      exam_id: examId,
      teacher_id: teacherId,
      action: action as any,
      ...(fromStatus && { from_status: fromStatus }),
      ...(toStatus && { to_status: toStatus }),
      ...(reason && { reason }),
      timestamp: new Date().toISOString(),
      ...(metadata && { metadata })
    };
  }

  /**
   * 验证操作权限
   * @param status 当前状态
   * @param action 要执行的操作
   * @param submissionCount 提交数量
   * @throws {AppError} 操作不被允许时抛出错误
   */
  static validateAction(
    status: ExamStatus, 
    action: string, 
    submissionCount: number = 0
  ): void {
    const availableActions = this.getAvailableActions(status, submissionCount);
    const isActionAllowed = availableActions.some(a => a.action === action);

    if (!isActionAllowed) {
      throw new AppError(
        `当前状态"${this.getStatusDisplayName(status)}"不支持操作"${action}"`,
        400
      );
    }
  }
}

/**
 * 考试状态工具函数（快捷方式）
 */

// 检查是否为活跃状态（学生可以参与）
export const isActiveExam = (status: ExamStatus): boolean => {
  return status === ExamStatus.PUBLISHED;
};

// 检查是否为已完成状态（有最终结果）
export const isCompletedExam = (status: ExamStatus): boolean => {
  return [ExamStatus.SUCCESS, ExamStatus.EXPIRED].includes(status);
};

// 检查是否为可编辑状态
export const isEditableExam = (status: ExamStatus): boolean => {
  return status === ExamStatus.DRAFT;
};

// 检查是否为归档状态
export const isArchivedExam = (status: ExamStatus): boolean => {
  return status === ExamStatus.ARCHIVED;
};

// 获取状态颜色（用于前端显示）
export const getStatusColor = (status: ExamStatus): string => {
  const colors: Record<ExamStatus, string> = {
    [ExamStatus.DRAFT]: '#faad14',      // 橙色 - 草稿
    [ExamStatus.PUBLISHED]: '#52c41a',  // 绿色 - 进行中
    [ExamStatus.EXPIRED]: '#ff4d4f',    // 红色 - 已停止
    [ExamStatus.SUCCESS]: '#1890ff',    // 蓝色 - 已结束
    [ExamStatus.ARCHIVED]: '#8c8c8c',   // 灰色 - 已归档
  };
  return colors[status] || '#666666';
};