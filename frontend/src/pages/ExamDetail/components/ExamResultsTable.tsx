import React from 'react';
import { Card, Space, Button, Tooltip, Table, Empty, Typography, Tag } from 'antd';
import { ReloadOutlined, DownloadOutlined, EyeOutlined, RobotOutlined, LoadingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { ExamResult } from '../../../types';

const { Text } = Typography;

type Props = {
  examId: string;
  results: ExamResult[];
  loading: boolean;
  onReload: () => void;
  onExport: () => void;
  onViewDetail: (result: ExamResult) => void;
  onGenerateAIReport: (result: ExamResult) => void;
  aiGeneratingMap: Record<string, boolean>;
};

// 考试结果表格（列定义与交互保持不变）
const ExamResultsTable: React.FC<Props> = ({
  examId,
  results,
  loading,
  onReload,
  onExport,
  onViewDetail,
  onGenerateAIReport,
  aiGeneratingMap,
}) => {
  const columns: ColumnsType<ExamResult> = [
    { title: '学生ID', dataIndex: 'participant_id', key: 'participant_id', width: 120 },
    { title: '学生姓名', dataIndex: 'participant_name', key: 'participant_name', ellipsis: true },
    { title: 'IP地址', dataIndex: 'ip_address', key: 'ip_address', width: 140 },
    {
      title: '开始时间',
      dataIndex: 'started_at',
      key: 'started_at',
      width: 160,
      render: (date: string | null) =>
        date
          ? new Date(date).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '未知',
    },
    {
      title: '提交时间',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      width: 160,
      render: (date: string | null) =>
        date
          ? new Date(date).toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '未提交',
    },
    {
      title: '作答用时',
      key: 'duration',
      width: 140,
      render: (_, record: ExamResult) => {
        const fallbackSeconds =
          record.started_at && record.submitted_at
            ? Math.max(
                0,
                Math.floor(
                  (new Date(record.submitted_at).getTime() -
                    new Date(record.started_at).getTime()) /
                    1000
                )
              )
            : 0;
        const durationSeconds =
          record.total_time_seconds !== undefined && record.total_time_seconds !== null
            ? record.total_time_seconds
            : fallbackSeconds;
        if (durationSeconds < 60) {
          const color = durationSeconds <= 10 ? '#ff4d4f' : '#52c41a';
          return <Text style={{ color }}>{durationSeconds}秒</Text>;
        } else if (durationSeconds < 3600) {
          const minutes = Math.floor(durationSeconds / 60);
          const seconds = durationSeconds % 60;
          const color = minutes < 30 ? '#52c41a' : minutes < 60 ? '#faad14' : '#ff4d4f';
          return (
            <Text style={{ color }}>
              {minutes}分{seconds}秒
            </Text>
          );
        } else {
          const hours = Math.floor(durationSeconds / 3600);
          const minutes = Math.floor((durationSeconds % 3600) / 60);
          return (
            <Text style={{ color: '#ff4d4f' }}>
              {hours}小时{minutes}分
            </Text>
          );
        }
      },
    },
    {
      title: '答题数量',
      key: 'answer_count',
      width: 100,
      render: (_, record: ExamResult) => {
        const count = Object.keys(record.answers || {}).length;
        return <Tag color={count > 0 ? 'blue' : 'default'}>{count} 题</Tag>;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record: ExamResult) => (
        <Space size={4}>
          <Tooltip title="查看详细答案">
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => onViewDetail(record)}
            >
              查看
            </Button>
          </Tooltip>
          <Tooltip title="生成AI心理分析报告">
            <Button
              type="link"
              size="small"
              icon={aiGeneratingMap[record.id] ? <LoadingOutlined /> : <RobotOutlined />}
              loading={aiGeneratingMap[record.id]}
              onClick={() => onGenerateAIReport(record)}
              style={{ color: '#1890ff' }}
            >
              AI分析
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <span>考试结果</span>
          <Text type="secondary">({results.length} 人参与)</Text>
        </Space>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={onReload} loading={loading}>
            刷新
          </Button>
          {results.length > 0 && (
            <Button icon={<DownloadOutlined />} onClick={onExport}>
              导出结果
            </Button>
          )}
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={results}
        loading={loading}
        rowKey="id"
        scroll={{ x: 1200 }}
        pagination={{
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 条记录`,
        }}
        locale={{
          emptyText: (
            <Empty description="暂无参与记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ),
        }}
      />
    </Card>
  );
};

export default ExamResultsTable;

