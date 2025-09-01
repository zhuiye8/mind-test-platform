import React from 'react';
import { Alert, Progress, Tag, Space, Typography, Button } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import type { ProgressState } from '../services/audioPollingService';

/**
 * 音频批量生成进度显示组件
 * 显示批量生成任务的实时进度和详细状态
 */

interface AudioProgressDisplayProps {
  /** 是否正在批量生成 */
  isGenerating: boolean;
  /** 进度状态数据 */
  progressState: ProgressState;
  /** 取消生成回调函数 */
  onCancel?: () => void;
  /** 是否允许取消任务 */
  allowCancel?: boolean;
}

/**
 * 获取进度状态对应的图标
 * @param status 题目生成状态
 * @returns 状态图标
 */
const getStatusIcon = (status: string): string => {
  switch (status) {
    case 'completed': return '✅';
    case 'error': return '❌';
    case 'progress': return '⏳';
    case 'start': return '🎯';
    default: return '⏸️';
  }
};

/**
 * 获取进度状态对应的颜色
 * @param status 题目生成状态
 * @returns 颜色值
 */
const getStatusColor = (status: string): string => {
  switch (status) {
    case 'completed': return 'green';
    case 'error': return 'red';
    case 'progress': return 'blue';
    case 'start': return 'orange';
    default: return 'default';
  }
};

/**
 * 格式化进度百分比显示
 * @param percent 百分比
 * @param current 当前完成数量
 * @param total 总数量
 * @returns 格式化后的字符串
 */
const formatProgressPercent = (percent: number, current: number, total: number): string => {
  return `${percent}% (${current}/${total})`;
};

const AudioProgressDisplay: React.FC<AudioProgressDisplayProps> = ({
  isGenerating,
  progressState,
  onCancel,
  allowCancel = true
}) => {
  // 如果没有在生成中，不显示进度
  if (!isGenerating) {
    return null;
  }

  const { overall, questions } = progressState;
  const questionEntries = Object.entries(questions);
  const hasQuestionProgress = questionEntries.length > 0;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* 整体进度显示 */}
      <Alert
        message={
          <div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              marginBottom: 8 
            }}>
              <span style={{ fontWeight: 'bold' }}>
                正在批量生成语音文件...
              </span>
              
              <Space>
                {/* 轮询模式标识 */}
                <Tag color="blue">轮询模式</Tag>
                
                {/* 进度统计 */}
                <Tag 
                  color={overall.status === 'error' ? 'red' : 'blue'}
                  style={{ fontWeight: 'bold' }}
                >
                  {overall.current}/{overall.total}
                </Tag>
                
                {/* 取消按钮 */}
                {allowCancel && onCancel && (
                  <Button 
                    size="small" 
                    type="text" 
                    danger
                    icon={<StopOutlined />}
                    onClick={onCancel}
                    style={{ fontSize: '12px' }}
                  >
                    取消
                  </Button>
                )}
              </Space>
            </div>
            
            {/* 进度条 */}
            {overall.total > 0 && (
              <Progress
                percent={overall.progress}
                status={overall.status === 'error' ? 'exception' : 'active'}
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068'
                }}
                trailColor="#f0f0f0"
                strokeWidth={6}
                format={(percent) => formatProgressPercent(
                  percent || 0, 
                  overall.current, 
                  overall.total
                )}
              />
            )}
          </div>
        }
        type={overall.status === 'error' ? 'error' : 'info'}
        showIcon
        style={{
          border: overall.status === 'error' 
            ? '1px solid #ff4d4f' 
            : '1px solid #1890ff'
        }}
      />
      
      {/* 题目详细进度 */}
      {hasQuestionProgress && (
        <div style={{
          marginTop: 12,
          padding: '12px',
          background: '#fafafa',
          borderRadius: '6px',
          border: '1px solid #f0f0f0',
          maxHeight: '200px',
          overflowY: 'auto'
        }}>
          <Typography.Text 
            strong 
            style={{ 
              fontSize: '12px', 
              marginBottom: '8px', 
              display: 'block',
              color: '#666'
            }}
          >
            题目进度详情 ({questionEntries.length}个):
          </Typography.Text>
          
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {questionEntries
              .sort(([, a], [, b]) => {
                // 正在处理的题目排在前面
                const statusPriority = {
                  'progress': 1,
                  'start': 2,
                  'error': 3,
                  'completed': 4,
                  'pending': 5
                };
                
                const aPriority = statusPriority[a.status as keyof typeof statusPriority] || 6;
                const bPriority = statusPriority[b.status as keyof typeof statusPriority] || 6;
                
                return aPriority - bPriority;
              })
              .slice(0, 10) // 只显示前10个
              .map(([questionId, questionProgress]) => (
                <div 
                  key={questionId} 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    padding: '4px 8px',
                    background: questionProgress.status === 'progress' 
                      ? '#e6f7ff' 
                      : questionProgress.status === 'error'
                      ? '#fff2f0'
                      : 'transparent',
                    borderRadius: '4px',
                    border: questionProgress.status === 'progress'
                      ? '1px solid #91d5ff'
                      : questionProgress.status === 'error'
                      ? '1px solid #ffccc7'
                      : '1px solid transparent'
                  }}
                >
                  {/* 题目标题 */}
                  <span style={{ 
                    flex: 1, 
                    marginRight: '8px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: questionProgress.status === 'progress' ? 'bold' : 'normal'
                  }}>
                    {questionProgress.title || `题目 ${questionId}`}
                  </span>
                  
                  {/* 状态和进度 */}
                  <Space size="small">
                    <Tag 
                      color={getStatusColor(questionProgress.status)}
                      style={{ 
                        margin: 0,
                        fontSize: '11px',
                        minWidth: '24px',
                        textAlign: 'center'
                      }}
                    >
                      {getStatusIcon(questionProgress.status)}
                    </Tag>
                    
                    {/* 显示具体进度百分比 */}
                    {questionProgress.status === 'progress' && (
                      <span style={{ 
                        minWidth: '30px',
                        fontSize: '11px',
                        color: '#1890ff',
                        fontWeight: 'bold'
                      }}>
                        {questionProgress.progress}%
                      </span>
                    )}
                    
                    {/* 显示错误信息 */}
                    {questionProgress.status === 'error' && questionProgress.error && (
                      <span style={{ 
                        fontSize: '10px',
                        color: '#f5222d',
                        maxWidth: '80px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }} title={questionProgress.error}>
                        {questionProgress.error}
                      </span>
                    )}
                  </Space>
                </div>
              ))}
              
            {/* 显示更多项目提示 */}
            {questionEntries.length > 10 && (
              <div style={{ 
                textAlign: 'center', 
                fontSize: '11px', 
                color: '#999',
                padding: '4px 8px',
                fontStyle: 'italic'
              }}>
                还有 {questionEntries.length - 10} 个题目...
              </div>
            )}
          </Space>
          
          {/* 进度统计说明 */}
          <div style={{ 
            marginTop: 8, 
            fontSize: '10px', 
            color: '#999',
            borderTop: '1px solid #f0f0f0',
            paddingTop: '6px'
          }}>
            💡 进度通过轮询机制实时更新 • 正在处理的题目会优先显示
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioProgressDisplay;