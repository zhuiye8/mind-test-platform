import React from 'react';
import { Tag, Tooltip, Typography, Dropdown, Button, type MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  ReloadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import AudioFilePlayer from './AudioFilePlayer';
import { AudioStatusUtils } from '../services/audioOperations';
import { audioApi } from '../services/audioApi';
import type { Question } from '../types';

/**
 * 音频管理表格配置模块
 * 提供表格列定义、状态标签渲染、操作菜单配置等
 */

const { Text } = Typography;

// 扩展Question类型以包含音频相关字段
export interface QuestionWithAudio extends Question {
  audioAccessible?: boolean;
  audio_status?: string;
  audio_url?: string;
  audio_duration?: number;
  audio_needs_update?: boolean;
}

/**
 * 音频状态标签渲染函数
 * @param question 题目对象
 * @returns 状态标签React元素
 */
export const renderAudioStatusTag = (question: QuestionWithAudio) => {
  const status = question.audio_status || 'none';
  const needsUpdate = question.audio_needs_update;
  
  // 如果需要更新，优先显示更新标签
  if (needsUpdate) {
    return (
      <Tag color="orange" icon={<ExclamationCircleOutlined />}>
        需要更新
      </Tag>
    );
  }
  
  // 根据状态返回对应标签
  switch (status) {
    case 'ready':
      return (
        <Tag color="green" icon={<CheckCircleOutlined />}>
          已完成
        </Tag>
      );
    case 'generating':
      return (
        <Tag color="blue" icon={<LoadingOutlined />}>
          生成中
        </Tag>
      );
    case 'pending':
      return (
        <Tag color="gold">
          等待中
        </Tag>
      );
    case 'error':
      return (
        <Tag color="red" icon={<ExclamationCircleOutlined />}>
          生成失败
        </Tag>
      );
    default:
      return (
        <Tag>
          无语音
        </Tag>
      );
  }
};

/**
 * 音频播放器渲染函数
 * @param question 题目对象
 * @returns 音频播放器React元素
 */
export const renderAudioPlayer = (question: QuestionWithAudio) => {
  // 构建正确的音频URL
  const audioUrl = AudioStatusUtils.isAudioAccessible(question) 
    ? audioApi.getPreviewUrl(question.id)
    : null;
    
  return (
    <AudioFilePlayer
      audioUrl={audioUrl}
      audioStatus={question.audio_status}
      size="small"
      showProgress={false}
      showControls={true}
    />
  );
};

/**
 * 创建操作菜单项
 * @param question 题目对象
 * @param handlers 操作处理函数集合
 * @returns 菜单项配置数组
 */
export const createActionMenuItems = (
  question: QuestionWithAudio,
  handlers: {
    onRegenerate: (questionId: string) => void;
    onDownload: (questionId: string, title: string) => void;
    onDelete: (questionId: string, title: string) => void;
  }
): MenuProps['items'] => [
  {
    key: 'regenerate',
    icon: <ReloadOutlined />,
    label: '重新生成',
    onClick: () => handlers.onRegenerate(question.id),
  },
  {
    key: 'download',
    icon: <DownloadOutlined />,
    label: '下载文件',
    disabled: !question.audioAccessible,
    onClick: () => handlers.onDownload(question.id, question.title),
  },
  {
    type: 'divider',
  },
  {
    key: 'delete',
    icon: <DeleteOutlined />,
    label: '删除语音',
    danger: true,
    disabled: question.audio_status === 'none',
    onClick: () => handlers.onDelete(question.id, question.title),
  },
];

/**
 * 操作按钮渲染函数
 * @param question 题目对象
 * @param handlers 操作处理函数集合
 * @returns 操作按钮React元素
 */
export const renderActionButton = (
  question: QuestionWithAudio,
  handlers: {
    onRegenerate: (questionId: string) => void;
    onDownload: (questionId: string, title: string) => void;
    onDelete: (questionId: string, title: string) => void;
  }
) => {
  const menuItems = createActionMenuItems(question, handlers);

  return (
    <Dropdown 
      menu={{ items: menuItems }} 
      trigger={['click']}
      placement="bottomRight"
    >
      <Button 
        type="text" 
        icon={<MoreOutlined />} 
        size="small"
        style={{ 
          color: '#666',
          borderRadius: '4px'
        }}
      />
    </Dropdown>
  );
};

/**
 * 创建表格列配置
 * @param handlers 操作处理函数集合
 * @returns 表格列配置数组
 */
export const createTableColumns = (
  handlers: {
    onRegenerate: (questionId: string) => void;
    onDownload: (questionId: string, title: string) => void;
    onDelete: (questionId: string, title: string) => void;
  }
): ColumnsType<QuestionWithAudio> => [
  {
    title: '题目序号',
    dataIndex: 'question_order',
    key: 'question_order',
    width: 80,
    sorter: (a, b) => a.question_order - b.question_order,
    showSorterTooltip: false,
  },
  {
    title: '题目内容',
    dataIndex: 'title',
    key: 'title',
    ellipsis: { showTitle: false },
    render: (title: string) => (
      <Tooltip title={title} placement="topLeft">
        <Text 
          ellipsis 
          style={{ 
            maxWidth: 200,
            display: 'block'
          }}
        >
          {title}
        </Text>
      </Tooltip>
    ),
  },
  {
    title: '语音状态',
    key: 'audio_status',
    width: 120,
    render: (_, question) => renderAudioStatusTag(question),
    filters: [
      { text: '已完成', value: 'ready' },
      { text: '生成中', value: 'generating' },
      { text: '等待中', value: 'pending' },
      { text: '生成失败', value: 'error' },
      { text: '无语音', value: 'none' },
      { text: '需要更新', value: 'needUpdate' }
    ],
    onFilter: (value, record) => {
      if (value === 'needUpdate') {
        return Boolean(record.audio_needs_update);
      }
      return (record.audio_status || 'none') === value;
    },
  },
  {
    title: '时长',
    dataIndex: 'audio_duration',
    key: 'audio_duration',
    width: 80,
    render: (duration: number | null) => 
      AudioStatusUtils.formatDuration(duration),
    sorter: (a, b) => (a.audio_duration || 0) - (b.audio_duration || 0),
    showSorterTooltip: false,
  },
  {
    title: '播放',
    key: 'play',
    width: 200,
    render: (_, question) => renderAudioPlayer(question),
  },
  {
    title: '操作',
    key: 'actions',
    width: 120,
    render: (_, question) => renderActionButton(question, handlers),
  },
];

/**
 * 表格默认配置
 */
export const DEFAULT_TABLE_CONFIG = {
  size: 'small' as const,
  pagination: {
    pageSize: 10,
    showSizeChanger: true,
    showQuickJumper: true,
    showTotal: (total: number) => `共 ${total} 道题目`,
    pageSizeOptions: ['10', '20', '50', '100'],
  },
  scroll: {
    x: 800, // 最小宽度，支持横向滚动
  },
  rowKey: 'id',
} as const;

/**
 * 表格行选择配置生成器
 * @param selectedRowKeys 已选中的行键数组
 * @param onChange 选择变化回调函数
 * @returns 行选择配置对象
 */
export const createRowSelectionConfig = (
  selectedRowKeys: string[],
  onChange: (selectedRowKeys: string[]) => void
) => ({
  selectedRowKeys,
  onChange: (keys: React.Key[]) => onChange(keys as string[]),
  getCheckboxProps: (record: QuestionWithAudio) => ({
    disabled: record.audio_status === 'generating', // 生成中的题目不能选择
  }),
});
