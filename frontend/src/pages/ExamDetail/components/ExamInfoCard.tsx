import React from 'react';
import { Card, Space, Tooltip, Button, Descriptions, Typography } from 'antd';
import {
  ReloadOutlined,
  LinkOutlined,
  PlayCircleOutlined,
  StopOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import type { Exam } from '../../../types';
import { ExamStatus } from '../../../constants/examStatus';

const { Paragraph } = Typography;

type Props = {
  exam: Exam;
  loading: boolean;
  resultsLoading: boolean;
  toggleLoading: boolean;
  onRefreshAll: () => void;
  onCopyPublicUrl: () => void;
  onTogglePublish: () => void;
  onFinishExam: () => void;
  onDelete?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
};

// 考试信息卡片（包含操作区与 Descriptions 明细）
const ExamInfoCard: React.FC<Props> = ({
  exam,
  loading,
  resultsLoading,
  toggleLoading,
  onRefreshAll,
  onCopyPublicUrl,
  onTogglePublish,
  onFinishExam,
  onDelete,
  onArchive,
  onRestore,
}) => {
  return (
    <Card
      title="考试信息"
      style={{ marginBottom: 24 }}
      extra={
        <Space>
          <Tooltip title="刷新考试详情和结果列表">
            <Button icon={<ReloadOutlined />} onClick={onRefreshAll} loading={loading || resultsLoading}>
              刷新全部
            </Button>
          </Tooltip>
          {exam.status === ExamStatus.PUBLISHED && (
            <Button icon={<LinkOutlined />} onClick={onCopyPublicUrl}>
              复制链接
            </Button>
          )}
          {exam.status === ExamStatus.DRAFT && (
            <Space>
              <Button type="primary" loading={toggleLoading} icon={<PlayCircleOutlined />} onClick={onTogglePublish}>
                发布考试
              </Button>
              {onDelete && (
                <Button danger icon={<DeleteOutlined />} onClick={onDelete}>
                  删除考试
                </Button>
              )}
            </Space>
          )}
          {exam.status === ExamStatus.PUBLISHED && (
            <Space>
              <Button loading={toggleLoading} icon={<CheckCircleOutlined />} onClick={onFinishExam}>
                结束考试
              </Button>
              <Button danger loading={toggleLoading} icon={<StopOutlined />} onClick={onTogglePublish}>
                停止考试
              </Button>
            </Space>
          )}
          {exam.status === ExamStatus.EXPIRED && onDelete && (
            <Button danger icon={<DeleteOutlined />} onClick={onDelete}>
              删除考试
            </Button>
          )}
          {exam.status === ExamStatus.SUCCESS && (
            <Space>
              {onArchive && (
                <Button icon={<InboxOutlined />} onClick={onArchive}>
                  归档考试
                </Button>
              )}
            </Space>
          )}
          {exam.status === ExamStatus.ARCHIVED && (
            <Space>
              {onRestore && (
                <Button icon={<CheckCircleOutlined />} onClick={onRestore}>
                  恢复考试
                </Button>
              )}
              {onDelete && (
                <Button danger icon={<DeleteOutlined />} onClick={onDelete}>
                  删除考试
                </Button>
              )}
            </Space>
          )}
        </Space>
      }
    >
      <Descriptions column={2}>
        <Descriptions.Item label="考试标题">{exam.title}</Descriptions.Item>
        <Descriptions.Item label="基础试卷">{exam.paper_title || '未知试卷'}</Descriptions.Item>
        <Descriptions.Item label="考试时长">{exam.duration_minutes || 0} 分钟</Descriptions.Item>
        <Descriptions.Item label="题目顺序">{exam.shuffle_questions ? '随机打乱' : '按序显示'}</Descriptions.Item>
        <Descriptions.Item label="密码保护">{exam.has_password ? '需要密码' : '无需密码'}</Descriptions.Item>
        <Descriptions.Item label="创建时间">{new Date(exam.created_at).toLocaleString()}</Descriptions.Item>
        {exam.start_time && (
          <Descriptions.Item label="开始时间">{new Date(exam.start_time).toLocaleString()}</Descriptions.Item>
        )}
        {exam.end_time && (
          <Descriptions.Item label="结束时间">{new Date(exam.end_time).toLocaleString()}</Descriptions.Item>
        )}
        {exam.status === ExamStatus.PUBLISHED && (
          <Descriptions.Item label="公开链接" span={2}>
            {(() => {
              const makeUrl = () => {
                if (!exam.public_url) return '';
                try {
                  const u = new URL(exam.public_url);
                  return `${window.location.origin}${u.pathname}${u.search}${u.hash}`;
                } catch {
                  return `${window.location.origin}${exam.public_url.startsWith('/') ? '' : '/'}${exam.public_url}`;
                }
              };
              const url = makeUrl();
              return <Paragraph copyable={{ text: url }}>{url}</Paragraph>;
            })()}
          </Descriptions.Item>
        )}
      </Descriptions>
    </Card>
  );
};

export default ExamInfoCard;
