import React from 'react';
import { Row, Col, Statistic, Tag, Space } from 'antd';
import { 
  CheckCircleOutlined, 
  SoundOutlined, 
  FileTextOutlined 
} from '@ant-design/icons';
import type { PaperAudioStatus } from '../types';

/**
 * 音频状态概览组件
 * 显示试卷音频生成的整体统计信息和状态分布
 */

interface AudioStatusOverviewProps {
  /** 音频状态数据 */
  audioStatus: PaperAudioStatus | null;
  /** 是否显示加载状态 */
  loading?: boolean;
}

/**
 * 格式化音频时长显示
 * @param duration 时长（秒）
 * @returns 格式化后的时长字符串
 */
const formatDuration = (duration: number): string => {
  if (duration < 60) {
    return `${Math.round(duration)}`;
  } else if (duration < 3600) {
    const minutes = Math.floor(duration / 60);
    const seconds = Math.round(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  } else {
    const hours = Math.floor(duration / 3600);
    const minutes = Math.floor((duration % 3600) / 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  }
};

/**
 * 获取完成率的显示颜色
 * @param completionRate 完成率百分比
 * @returns 颜色值
 */
const getCompletionRateColor = (completionRate: number): string => {
  if (completionRate >= 90) return '#52c41a'; // 绿色
  if (completionRate >= 70) return '#faad14'; // 橙色
  if (completionRate >= 50) return '#1890ff'; // 蓝色
  return '#f5222d'; // 红色
};

/**
 * 状态标签配置
 */
const STATUS_TAG_CONFIG = {
  ready: { color: 'green', label: '已完成' },
  generating: { color: 'blue', label: '生成中' },
  needUpdate: { color: 'orange', label: '需更新' },
  error: { color: 'red', label: '失败' },
  none: { color: 'default', label: '无语音' }
} as const;

const AudioStatusOverview: React.FC<AudioStatusOverviewProps> = ({
  audioStatus,
  loading = false
}) => {
  // 如果没有音频状态数据，则不显示
  if (!audioStatus) {
    return null;
  }

  const { 
    completionRate, 
    totalDuration, 
    averageDuration, 
    totalQuestions, 
    statusCount 
  } = audioStatus;

  return (
    <div style={{ 
      marginBottom: 16,
      padding: '16px',
      background: '#fafafa',
      borderRadius: '6px',
      border: '1px solid #f0f0f0'
    }}>
      {/* 主要统计信息 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Statistic
            title="完成率"
            value={completionRate}
            suffix="%"
            loading={loading}
            valueStyle={{ 
              color: getCompletionRateColor(completionRate),
              fontSize: '20px',
              fontWeight: 'bold'
            }}
            prefix={
              <CheckCircleOutlined 
                style={{ 
                  color: getCompletionRateColor(completionRate),
                  fontSize: '16px'
                }} 
              />
            }
          />
        </Col>
        
        <Col span={6}>
          <Statistic
            title="总时长"
            value={totalDuration}
            suffix="秒"
            loading={loading}
            valueStyle={{ fontSize: '20px' }}
            prefix={
              <SoundOutlined 
                style={{ 
                  color: '#1890ff',
                  fontSize: '16px'
                }} 
              />
            }
            formatter={(value) => formatDuration(Number(value))}
          />
        </Col>
        
        <Col span={6}>
          <Statistic
            title="平均时长"
            value={averageDuration}
            suffix="秒"
            precision={1}
            loading={loading}
            valueStyle={{ fontSize: '20px' }}
            formatter={(value) => {
              const num = Number(value);
              return num > 0 ? formatDuration(num) : '0';
            }}
          />
        </Col>
        
        <Col span={6}>
          <Statistic
            title="总题数"
            value={totalQuestions}
            loading={loading}
            valueStyle={{ fontSize: '20px' }}
            prefix={
              <FileTextOutlined 
                style={{ 
                  color: '#722ed1',
                  fontSize: '16px'
                }} 
              />
            }
          />
        </Col>
      </Row>
      
      {/* 状态分布标签 */}
      <div>
        <div style={{ 
          marginBottom: 8, 
          fontSize: '12px', 
          color: '#666',
          fontWeight: 'bold'
        }}>
          状态分布：
        </div>
        <Space wrap>
          {Object.entries(STATUS_TAG_CONFIG).map(([status, config]) => {
            const count = statusCount[status as keyof typeof statusCount] || 0;
            
            // 只显示有数量的状态标签
            if (count === 0 && status !== 'ready') {
              return null;
            }
            
            return (
              <Tag 
                key={status}
                color={config.color}
                style={{ 
                  minWidth: '70px', 
                  textAlign: 'center',
                  fontWeight: count > 0 ? 'bold' : 'normal',
                  opacity: count > 0 ? 1 : 0.6
                }}
              >
                {config.label}: {count}
              </Tag>
            );
          })}
        </Space>
        
        {/* 状态说明 */}
        {(statusCount.generating > 0 || statusCount.needUpdate > 0 || statusCount.error > 0) && (
          <div style={{ 
            marginTop: 8, 
            fontSize: '11px', 
            color: '#999',
            lineHeight: '14px'
          }}>
            💡 {statusCount.generating > 0 && '有题目正在生成中，请稍等'}
            {statusCount.needUpdate > 0 && '有题目需要更新语音文件'}
            {statusCount.error > 0 && '有题目生成失败，可尝试重新生成'}
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioStatusOverview;