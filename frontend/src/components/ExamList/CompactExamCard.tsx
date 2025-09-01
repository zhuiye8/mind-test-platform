/**
 * 紧凑版考试卡片组件
 * 用于Kanban看板布局的考试卡片展示
 */

import React, { useCallback } from 'react';
import { Card, Tag, Space, Tooltip, Button } from 'antd';
import { 
  ClockCircleOutlined, 
  LinkOutlined, 
  LockOutlined, 
  SwapOutlined,
  CalendarOutlined,
  EditOutlined,
  PlayCircleOutlined,
  StopOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  InboxOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { getStatusColor, getStatusName } from '../../constants/examStatus';
import type { Exam } from '../../types';
import type { ExamStatusType } from '../../constants/examStatus';
import { ExamStatus } from '../../constants/examStatus';

interface CompactExamCardProps {
  exam: Exam;
  onClick?: (exam: Exam) => void;
  onEdit?: (exam: Exam) => void;
  onDelete?: (exam: Exam) => void;
  onViewParticipants?: (exam: Exam) => void;
  onStatusChange?: (exam: Exam, newStatus: ExamStatusType) => void;
  onCopyLink?: (exam: Exam) => void;
}

export const CompactExamCard: React.FC<CompactExamCardProps> = ({ 
  exam, 
  onClick,
  onEdit,
  onDelete,
  onViewParticipants,
  onStatusChange,
  onCopyLink
}) => {
  // 考试信息计算
  const getExamInfo = useCallback((exam: Exam) => {
    const now = new Date();
    const endTime = exam.end_time ? new Date(exam.end_time) : null;
    const startTime = exam.start_time ? new Date(exam.start_time) : null;
    
    // 紧急判断：距离结束时间不足1小时或已过期
    const isUrgent = endTime && (
      (endTime.getTime() - now.getTime()) < 60 * 60 * 1000 && // 1小时内结束
      exam.status === 'PUBLISHED'
    );
    
    // 活跃判断：正在进行中的考试
    const isActive = exam.status === 'PUBLISHED' && 
      (!startTime || startTime <= now) && 
      (!endTime || endTime > now);
    
    return { isUrgent, isActive };
  }, []);

  const getCardBackground = useCallback((exam: Exam) => {
    const { isUrgent, isActive } = getExamInfo(exam);
    
    if (exam.status === 'DRAFT') {
      // 草稿：温暖的淡黄色渐变
      return 'linear-gradient(135deg, #fffaf0 0%, #fff8e1 50%, #ffffff 100%)';
    }
    
    if (isUrgent) {
      // 紧急：暖红色渐变
      return 'linear-gradient(135deg, #fff2f0 0%, #fef1f0 50%, #ffffff 100%)';
    }
    
    if (isActive) {
      // 活跃：清新绿色渐变
      return 'linear-gradient(135deg, #f0faf0 0%, #f6ffed 50%, #ffffff 100%)';
    }
    
    if (exam.status === 'SUCCESS') {
      // 已完成：淡蓝紫渐变
      return 'linear-gradient(135deg, #f0f5ff 0%, #e6f7ff 50%, #ffffff 100%)';
    }
    
    // 默认：纯净白色
    return 'linear-gradient(135deg, #ffffff 0%, #fafafa 50%, #ffffff 100%)';
  }, [getExamInfo]);

  const { isUrgent, isActive } = getExamInfo(exam);

  return (
    <Card
      size="small"
      className="kanban-card"
      style={{ 
        cursor: 'pointer',
        border: `2px solid ${isActive ? '#52c41a' : '#f0f0f0'}`,
        height: '240px',
        background: getCardBackground(exam),
        position: 'relative',
        overflow: 'hidden'
      }}
      styles={{ body: { padding: '14px', height: '100%', position: 'relative' } }}
      hoverable
      onClick={() => onClick?.(exam)}
    >
      {/* 状态指示器 */}
      {isUrgent && (
        <div style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 0,
          height: 0,
          borderLeft: '20px solid transparent',
          borderTop: '20px solid #ff4d4f'
        }}>
          <div style={{
            position: 'absolute',
            top: '-18px',
            right: '-2px',
            color: 'white',
            fontSize: '10px',
            fontWeight: 'bold'
          }}>!</div>
        </div>
      )}

      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%',
        justifyContent: 'space-between'
      }}>
        {/* 标题和标签区域 */}
        <div>
          <div style={{ 
            fontWeight: 700, 
            fontSize: '18px', 
            color: isActive ? '#52c41a' : '#262626',
            marginBottom: 10,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.3
          }}>
            {exam.title}
          </div>
          
          {/* 标签行 - 增强信息 */}
          <div style={{ marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <Tag 
              color={getStatusColor(exam.status)} 
              style={{ fontSize: '12px', margin: 0, borderRadius: '10px' }}
            >
              {getStatusName(exam.status)}
            </Tag>
            
            {/* 题目数量标签 */}
            {exam.question_count && (
              <Tag color="blue" style={{ fontSize: '12px', margin: 0, borderRadius: '10px' }}>
                📝 {exam.question_count}题
              </Tag>
            )}
            
            {isUrgent && (
              <Tag color="red" style={{ fontSize: '12px', margin: 0, borderRadius: '10px' }}>
                🔥 急
              </Tag>
            )}
            
            {exam.participant_count > 0 && (
              <Tag color="green" style={{ fontSize: '12px', margin: 0, borderRadius: '10px' }}>
                👥 {exam.participant_count}人
              </Tag>
            )}
          </div>
          
          {/* 试卷信息 */}
          <div style={{ 
            fontSize: '13px', 
            color: '#8c8c8c',
            marginBottom: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            📋 {exam.paper_title}
          </div>
        </div>

        {/* 底部信息区域 */}
        <div>
          {/* 时间和设置信息 */}
          <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: 10 }}>
            <Space size={8} style={{ flexWrap: 'wrap' }}>
              {exam.duration_minutes && (
                <span><ClockCircleOutlined style={{ fontSize: 14 }} /> {exam.duration_minutes}分钟</span>
              )}
              
              {exam.start_time && (
                <span>
                  <CalendarOutlined style={{ fontSize: 14 }} /> 
                  {new Date(exam.start_time).toLocaleDateString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              )}
            </Space>
          </div>
          
          {/* 高级设置标签 */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {exam.has_password && (
              <Tooltip title="需要密码">
                <Tag 
                  icon={<LockOutlined />} 
                  color="orange" 
                  style={{ fontSize: '11px', cursor: 'pointer', margin: 0, borderRadius: '8px' }}
                >
                  密码
                </Tag>
              </Tooltip>
            )}
            
            {exam.shuffle_questions && (
              <Tooltip title="题目随机打乱">
                <Tag 
                  icon={<SwapOutlined />} 
                  color="purple" 
                  style={{ fontSize: '11px', cursor: 'pointer', margin: 0, borderRadius: '8px' }}
                >
                  打乱
                </Tag>
              </Tooltip>
            )}
            
            {exam.status === ExamStatus.PUBLISHED && exam.public_url && (
              <Tooltip title="查看公开链接">
                <Tag 
                  icon={<LinkOutlined style={{ fontSize: 12 }} />} 
                  color="cyan" 
                  style={{ fontSize: '11px', cursor: 'pointer', margin: 0, borderRadius: '8px' }}
                >
                  链接
                </Tag>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* 操作按钮条（右下） */}
      <div style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
        {/* 已发布：复制链接、参与者、结束 */}
        {exam.status === ExamStatus.PUBLISHED && (
          <>
            {exam.public_url && (
              <Tooltip title="复制链接">
                <Button
                  type="text"
                  size="small"
                  icon={<LinkOutlined style={{ fontSize: 16 }} />}
                  onClick={() => onCopyLink?.(exam)}
                  style={{ color: '#52c41a', border: '1px solid #52c41a30', height: 30 }}
                />
              </Tooltip>
            )}
            <Tooltip title="参与者">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined style={{ fontSize: 16 }} />}
                onClick={() => onViewParticipants?.(exam)}
                style={{ color: '#595959', border: '1px solid #d9d9d980', height: 30 }}
              />
            </Tooltip>
            <Tooltip title="结束考试">
              <Button
                type="text"
                size="small"
                icon={<CheckCircleOutlined style={{ fontSize: 16 }} />}
                onClick={() => onStatusChange?.(exam, ExamStatus.SUCCESS)}
                style={{ color: '#1890ff', border: '1px solid #1890ff30', height: 30 }}
              />
            </Tooltip>
          </>
        )}

        {/* 草稿：编辑、发布 */}
        {exam.status === ExamStatus.DRAFT && (
          <>
            <Tooltip title="编辑">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined style={{ fontSize: 16 }} />}
                onClick={() => onEdit?.(exam)}
                style={{ color: '#faad14', border: '1px solid #faad1430', height: 30 }}
              />
            </Tooltip>
            <Tooltip title="发布">
              <Button
                type="text"
                size="small"
                icon={<PlayCircleOutlined style={{ fontSize: 16 }} />}
                onClick={() => onStatusChange?.(exam, ExamStatus.PUBLISHED)}
                style={{ color: '#52c41a', border: '1px solid #52c41a30', height: 30 }}
              />
            </Tooltip>
          </>
        )}

        {/* 已结束：参与者、归档 */}
        {exam.status === ExamStatus.SUCCESS && (
          <>
            <Tooltip title="参与者">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined style={{ fontSize: 16 }} />}
                onClick={() => onViewParticipants?.(exam)}
                style={{ color: '#595959', border: '1px solid #d9d9d980', height: 30 }}
              />
            </Tooltip>
            <Tooltip title="归档">
              <Button
                type="text"
                size="small"
                icon={<InboxOutlined style={{ fontSize: 16 }} />}
                onClick={() => onStatusChange?.(exam, ExamStatus.ARCHIVED)}
                style={{ color: '#8c8c8c', border: '1px solid #d9d9d980', height: 30 }}
              />
            </Tooltip>
          </>
        )}

        {/* 已归档：恢复、删除 */}
        {exam.status === ExamStatus.ARCHIVED && (
          <>
            <Tooltip title="恢复">
              <Button
                type="text"
                size="small"
                icon={<CheckCircleOutlined style={{ fontSize: 16 }} />}
                onClick={() => onStatusChange?.(exam, ExamStatus.SUCCESS)}
                style={{ color: '#1890ff', border: '1px solid #1890ff30', height: 30 }}
              />
            </Tooltip>
            <Tooltip title="删除">
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined style={{ fontSize: 16 }} />}
                onClick={() => onDelete?.(exam)}
                style={{ color: '#ff4d4f', border: '1px solid #ff4d4f30', height: 30 }}
              />
            </Tooltip>
          </>
        )}
      </div>
    </Card>
  );
};
