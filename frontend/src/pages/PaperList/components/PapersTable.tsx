import React from 'react';
import { Table, Badge, Button, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { FileTextOutlined, CalendarOutlined, EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Paper } from '../../../types';

type Props = {
  data: Paper[];
  loading: boolean;
  onOpenPaper: (paperId: string) => void;
  onEdit: (paper: Paper) => void;
  onDelete: (paper: Paper) => void;
  canDeletePaper: (paper: Paper) => boolean;
  getDeleteTooltip: (paper: Paper) => string;
};

// 试卷列表表格（列配置与渲染保持一致）
const PapersTable: React.FC<Props> = ({ data, loading, onOpenPaper, onEdit, onDelete, canDeletePaper, getDeleteTooltip }) => {
  const columns: ColumnsType<Paper> = [
    {
      title: '试卷信息',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: Paper) => (
        <div className="flex items-start space-x-3">
          <div>
            <FileTextOutlined style={{ color: 'var(--color-primary-600)', fontSize: 20 }} />
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="font-medium text-neutral-900 cursor-pointer hover:text-primary-600 transition-colors truncate"
              onClick={() => onOpenPaper(record.id)}
            >
              {text}
            </div>
            {record.description && (
              <div className="text-sm text-neutral-500 mt-1 line-clamp-2">{record.description}</div>
            )}
            <div className="flex items-center space-x-4 mt-2">
              <span className="text-xs text-neutral-400">
                <CalendarOutlined className="mr-1" />
                {new Date(record.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: '统计信息',
      key: 'stats',
      width: 160,
      render: (_, record: Paper) => (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">题目数量</span>
            <Badge count={record.question_count} style={{ background: record.question_count > 0 ? 'var(--color-primary-500)' : 'var(--color-neutral-300)' }} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-neutral-500">关联考试</span>
            <Badge count={record.exam_count} style={{ background: record.exam_count > 0 ? 'var(--color-secondary-500)' : 'var(--color-neutral-300)' }} />
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 240,
      render: (_, record: Paper) => {
        const isActive = record.question_count > 0;
        const hasExams = record.exam_count > 0;
        return (
          <div className="space-y-1">
            <span className={`ant-tag ${isActive ? 'ant-tag-success' : 'ant-tag-default'} border-0 font-medium`} style={{ borderRadius: 'var(--border-radius-full)' }}>
              {isActive ? '已完善' : '待完善'}
            </span>
            {hasExams && (
              <span className="ant-tag ant-tag-processing border-0 font-medium" style={{ borderRadius: 'var(--border-radius-full)' }}>
                使用中
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_, record: Paper) => (
        <div className="flex items-center space-x-1">
          <Tooltip title="题目管理">
            <Button type="text" size="small" icon={<EyeOutlined />} className="hover:bg-primary-50 hover:text-primary-600" onClick={() => onOpenPaper(record.id)} />
          </Tooltip>
          <Tooltip title="编辑试卷">
            <Button type="text" size="small" icon={<EditOutlined />} className="hover:bg-primary-50 hover:text-primary-600" onClick={() => onEdit(record)} />
          </Tooltip>
          <Tooltip title={getDeleteTooltip(record)}>
            <Button type="text" size="small" danger disabled={!canDeletePaper(record)} icon={<DeleteOutlined />} className="hover:bg-red-50" onClick={() => onDelete(record)} />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <Table
      columns={columns}
      dataSource={data}
      loading={loading}
      rowKey="id"
      scroll={{ x: 900, y: 'calc(100vh - 800px)' }}
      className="modern-table"
      pagination={{
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total, range) => `显示 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
        pageSizeOptions: ['10', '20', '50', '100'],
        defaultPageSize: 20,
        position: ['bottomCenter'],
      }}
      rowClassName="hover:bg-neutral-25 transition-colors"
    />
  );
};

export default PapersTable;

