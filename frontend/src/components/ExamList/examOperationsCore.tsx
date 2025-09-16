/**
 * 考试操作核心逻辑
 * 处理考试的各种状态变更操作
 */

import React from 'react';
import { Modal, message, notification, Button, Space } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { examApi } from '../../services/api';
import type { Exam } from '../../types';
import { ExamStatus } from '../../constants/examStatus';
import type { ExamStatusType } from '../../constants/examStatus';

const { confirm } = Modal;

/**
 * 复制考试链接到剪贴板
 */
export const copyExamLink = async (exam: Exam): Promise<void> => {
  try {
    // 目标链接：优先使用后端的路径，但将 host 替换为当前前端 origin
    let url: string | undefined;
    if (exam.public_url) {
      try {
        const u = new URL(exam.public_url);
        url = `${window.location.origin}${u.pathname}${u.search}${u.hash}`;
      } catch {
        // public_url 不是有效URL时，直接拼接为当前站点下的路径
        url = `${window.location.origin}${exam.public_url.startsWith('/') ? '' : '/'}${exam.public_url}`;
      }
    } else {
      const uuid = (exam as any).public_uuid || exam.id;
      url = `${window.location.origin}/exam/${uuid}`;
    }

    if (!url || /undefined\/?$/.test(url)) {
      throw new Error('无效的考试链接');
    }
    await navigator.clipboard.writeText(url);

    // 通知（带操作按钮）
    notification.success({
      message: '链接已复制',
      description: url,
      placement: 'bottomRight',
      duration: 3,
      btn: (
        <Space>
          <Button type="primary" size="small" onClick={() => window.open(url!, '_blank')}>打开</Button>
          <Button size="small" onClick={async () => {
            try {
              await navigator.clipboard.writeText(url!);
              message.success('已再次复制');
            } catch {
              message.error('复制失败');
            }
          }}>复制</Button>
        </Space>
      )
    });
  } catch (error) {
    console.error('复制链接失败:', error);
    message.error('复制失败，请稍后重试');
  }
};

/**
 * 删除考试
 */
export const deleteExam = async (exam: Exam, onRefresh: () => void): Promise<void> => {
  const canDelete = [ExamStatus.DRAFT, ExamStatus.ARCHIVED].includes(exam.status);
  
  if (!canDelete) {
    message.warning('只能删除草稿状态或已归档的考试');
    return;
  }

  return new Promise((resolve) => {
    confirm({
      title: '确认删除考试',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>您即将删除考试：<strong>"{exam.title}"</strong></p>
          <p style={{ color: '#ff4d4f', margin: '8px 0' }}>
            ⚠️ 此操作不可恢复，请谨慎操作
          </p>
          {exam.participant_count > 0 && (
            <p style={{ color: '#fa8c16' }}>
              已有 {exam.participant_count} 人参与此考试
            </p>
          )}
        </div>
      ),
      okText: '确认删除',
      cancelText: '取消',
      okType: 'danger',
      async onOk() {
        try {
          await examApi.delete(exam.id);
          message.success('考试删除成功');
          onRefresh();
          resolve();
        } catch (error: any) {
          console.error('删除考试失败:', error);
          message.error(error?.response?.data?.message || '删除考试失败');
        }
      },
      onCancel() {
        resolve();
      }
    });
  });
};

/**
 * 发布考试
 */
export const publishExam = async (exam: Exam, onRefresh: () => void): Promise<void> => {
  
  if (exam.status !== ExamStatus.DRAFT) {
    message.warning('只能发布草稿状态的考试');
    return;
  }

  return new Promise((resolve) => {
    confirm({
      title: '确认发布考试',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>您即将发布考试：<strong>"{exam.title}"</strong></p>
          <p style={{ color: '#1890ff', margin: '8px 0' }}>
            📢 发布后学生可通过链接参加考试
          </p>
          <p style={{ color: '#8c8c8c' }}>
            发布后可随时停止考试
          </p>
        </div>
      ),
      okText: '确认发布',
      cancelText: '取消',
      async onOk() {
        try {
          await examApi.togglePublish(exam.id);
          message.success('考试发布成功');
          onRefresh();
          resolve();
        } catch (error: any) {
          console.error('发布考试失败:', error);
          message.error(error?.response?.data?.message || '发布考试失败');
        }
      },
      onCancel() {
        resolve();
      }
    });
  });
};

/**
 * 停止考试
 */
export const stopExam = async (exam: Exam, onRefresh: () => void): Promise<void> => {
  
  if (exam.status !== ExamStatus.PUBLISHED) {
    message.warning('只能停止进行中的考试');
    return;
  }

  return new Promise((resolve) => {
    confirm({
      title: '确认停止考试',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>您即将停止考试：<strong>"{exam.title}"</strong></p>
          <p style={{ color: '#fa8c16', margin: '8px 0' }}>
            ⏹️ 停止后学生无法继续参加考试
          </p>
          {exam.participant_count > 0 && (
            <p style={{ color: '#52c41a' }}>
              当前已有 {exam.participant_count} 人参与此考试
            </p>
          )}
          <p style={{ color: '#8c8c8c' }}>
            停止后可在"已结束"中查看考试结果
          </p>
        </div>
      ),
      okText: '确认停止',
      cancelText: '取消',
      okType: 'danger',
      async onOk() {
        try {
          await examApi.finishExam(exam.id);
          message.success('考试已停止');
          onRefresh();
          resolve();
        } catch (error: any) {
          console.error('停止考试失败:', error);
          message.error(error?.response?.data?.message || '停止考试失败');
        }
      },
      onCancel() {
        resolve();
      }
    });
  });
};

/**
 * 归档考试
 */
export const archiveExam = async (exam: Exam, onRefresh: () => void): Promise<void> => {
  
  if (exam.status !== ExamStatus.SUCCESS) {
    message.warning('只能归档已结束的考试');
    return;
  }

  return new Promise((resolve) => {
    confirm({
      title: '确认归档考试',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>您即将归档考试：<strong>"{exam.title}"</strong></p>
          <p style={{ color: '#1890ff', margin: '8px 0' }}>
            📁 归档后考试数据将被保存，可随时恢复
          </p>
          {exam.participant_count > 0 && (
            <p style={{ color: '#52c41a' }}>
              共有 {exam.participant_count} 人参与了此考试
            </p>
          )}
          <p style={{ color: '#8c8c8c' }}>
            归档后可在"已归档"中查看和恢复
          </p>
        </div>
      ),
      okText: '确认归档',
      cancelText: '取消',
      async onOk() {
        try {
          await examApi.archiveExam(exam.id);
          message.success('考试已归档');
          onRefresh();
          resolve();
        } catch (error: any) {
          console.error('归档考试失败:', error);
          message.error(error?.response?.data?.message || '归档考试失败');
        }
      },
      onCancel() {
        resolve();
      }
    });
  });
};

/**
 * 恢复考试
 */
export const restoreExam = async (exam: Exam, onRefresh: () => void): Promise<void> => {
  
  if (exam.status !== ExamStatus.ARCHIVED) {
    message.warning('只能恢复已归档的考试');
    return;
  }

  return new Promise((resolve) => {
    confirm({
      title: '确认恢复考试',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>您即将恢复考试：<strong>"{exam.title}"</strong></p>
          <p style={{ color: '#52c41a', margin: '8px 0' }}>
            ↩️ 恢复后考试将重新出现在"已结束"列表中
          </p>
          {exam.participant_count > 0 && (
            <p style={{ color: '#1890ff' }}>
              此考试共有 {exam.participant_count} 人参与的记录
            </p>
          )}
          <p style={{ color: '#8c8c8c' }}>
            恢复后可再次查看考试结果和统计数据
          </p>
        </div>
      ),
      okText: '确认恢复',
      cancelText: '取消',
      async onOk() {
        try {
          await examApi.restoreExam(exam.id);
          message.success('考试已恢复');
          onRefresh();
          resolve();
        } catch (error: any) {
          console.error('恢复考试失败:', error);
          message.error(error?.response?.data?.message || '恢复考试失败');
        }
      },
      onCancel() {
        resolve();
      }
    });
  });
};

/**
 * 暂停考试（PUBLISHED → EXPIRED）
 */
export const expireExam = async (exam: Exam, onRefresh: () => void): Promise<void> => {
  
  if (exam.status !== ExamStatus.PUBLISHED) {
    message.warning('只能暂停进行中的考试');
    return;
  }

  return new Promise((resolve) => {
    confirm({
      title: '确认暂停考试',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>您即将暂停考试：<strong>"{exam.title}"</strong></p>
          <p style={{ color: '#fa8c16', margin: '8px 0' }}>
            ⏸️ 停止后学生将无法继续参加考试，系统会把考试移回草稿状态
          </p>
          {exam.participant_count > 0 && (
            <p style={{ color: '#52c41a' }}>
              当前已有 {exam.participant_count} 人参与此考试
            </p>
          )}
          <p style={{ color: '#8c8c8c' }}>
            停止后可在“草稿”泳道中重新编辑并再次发布考试
          </p>
        </div>
      ),
      okText: '确认暂停',
      cancelText: '取消',
      okType: 'danger',
      async onOk() {
        try {
          const response = await examApi.togglePublish(exam.id);
          if (response.success) {
            message.success('考试已停止并回到草稿状态');
            onRefresh();
            resolve();
          } else {
            message.error(response.error || '暂停考试失败');
          }
        } catch (error: any) {
          console.error('暂停考试失败:', error);
          message.error(error?.response?.data?.message || '暂停考试失败');
        }
      },
      onCancel() {
        resolve();
      }
    });
  });
};

/**
 * 重新编辑考试（EXPIRED → DRAFT）
 */
export const reEditExam = async (exam: Exam, onRefresh: () => void): Promise<void> => {
  
  if (exam.status !== ExamStatus.EXPIRED) {
    message.warning('只能重新编辑已停止的考试');
    return;
  }

  return new Promise((resolve) => {
    confirm({
      title: '确认重新编辑考试',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>您即将重新编辑考试：<strong>"{exam.title}"</strong></p>
          <p style={{ color: '#1890ff', margin: '8px 0' }}>
            ✏️ 重新编辑后考试将回到草稿状态，可修改后重新发布
          </p>
          {exam.participant_count > 0 && (
            <p style={{ color: '#fa8c16' }}>
              注意：已有 {exam.participant_count} 人参与了此考试
            </p>
          )}
          <p style={{ color: '#8c8c8c' }}>
            编辑后可在"草稿"中修改考试设置
          </p>
        </div>
      ),
      okText: '确认编辑',
      cancelText: '取消',
      async onOk() {
        try {
          await examApi.updateStatus(exam.id, ExamStatus.DRAFT, {
            fromStatus: exam.status
          });
          message.success('考试已转为草稿状态');
          onRefresh();
          resolve();
        } catch (error: any) {
          console.error('重新编辑考试失败:', error);
          message.error(error?.response?.data?.message || '重新编辑考试失败');
        }
      },
      onCancel() {
        resolve();
      }
    });
  });
};

/**
 * 终止考试（EXPIRED → SUCCESS）
 */
export const terminateExam = async (exam: Exam, onRefresh: () => void): Promise<void> => {
  
  if (exam.status !== ExamStatus.EXPIRED) {
    message.warning('只能终止已停止的考试');
    return;
  }

  return new Promise((resolve) => {
    confirm({
      title: '确认终止考试',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>您即将终止考试：<strong>"{exam.title}"</strong></p>
          <p style={{ color: '#52c41a', margin: '8px 0' }}>
            ✅ 终止后考试将结束，无法再次编辑
          </p>
          {exam.participant_count > 0 && (
            <p style={{ color: '#1890ff' }}>
              共有 {exam.participant_count} 人参与了此考试
            </p>
          )}
          <p style={{ color: '#8c8c8c' }}>
            终止后可在"已结束"中查看考试结果
          </p>
        </div>
      ),
      okText: '确认终止',
      cancelText: '取消',
      async onOk() {
        try {
          await examApi.updateStatus(exam.id, ExamStatus.SUCCESS, {
            fromStatus: exam.status
          });
          message.success('考试已终止');
          onRefresh();
          resolve();
        } catch (error: any) {
          console.error('终止考试失败:', error);
          message.error(error?.response?.data?.message || '终止考试失败');
        }
      },
      onCancel() {
        resolve();
      }
    });
  });
};

/**
 * 统一的状态变更方法
 */
export const changeExamStatus = async (
  exam: Exam, 
  newStatus: ExamStatusType, 
  onRefresh: () => void
): Promise<void> => {
  switch (newStatus) {
    case ExamStatus.PUBLISHED:
      return publishExam(exam, onRefresh);
    case ExamStatus.SUCCESS:
      if (exam.status === ExamStatus.EXPIRED) {
        return terminateExam(exam, onRefresh);
      }
      return stopExam(exam, onRefresh);
    case ExamStatus.EXPIRED:
      return expireExam(exam, onRefresh);
    case ExamStatus.ARCHIVED:
      return archiveExam(exam, onRefresh);
    case ExamStatus.DRAFT:
      if (exam.status === ExamStatus.EXPIRED) {
        return reEditExam(exam, onRefresh);
      }
      break;
    default:
      if (exam.status === ExamStatus.ARCHIVED && newStatus === ExamStatus.SUCCESS) {
        return restoreExam(exam, onRefresh);
      }
      break;
  }
  message.warning('不支持的状态变更操作');
};
