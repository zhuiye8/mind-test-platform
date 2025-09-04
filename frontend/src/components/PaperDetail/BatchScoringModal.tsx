/**
 * BatchScoringModal - 批量设置计分模态框
 * 支持全部不计分和智能计分两种模式
 */
import React, { useState } from 'react';
import {
  Modal,
  Tabs,
  Button,
  Radio,
  InputNumber,
  Space,
  Card,
  Typography,
  Alert,
  message,
  Spin
} from 'antd';
import { CalculatorOutlined, StopOutlined } from '@ant-design/icons';
import { paperApi } from '../../services/api/paperApi';
const { Text, Paragraph } = Typography;

interface BatchScoringModalProps {
  visible: boolean;
  onCancel: () => void;
  paperId: string;
  paperTitle?: string;
  onSuccess: () => void;
}

// PreviewResult类型已移除，预览功能已简化

const BatchScoringModal: React.FC<BatchScoringModalProps> = ({
  visible,
  onCancel,
  paperId,
  paperTitle,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState('disable');
  const [loading, setLoading] = useState(false);
  // previewLoading状态已移除
  
  // 智能计分配置
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [initialScore, setInitialScore] = useState(1);
  const [step, setStep] = useState(1);
  
  // 预览功能已移除

  // 重置状态
  const resetModal = () => {
    setActiveTab('disable');
    setOrder('asc');
    setInitialScore(1);
    setStep(1);
  };

  // 处理取消
  const handleCancel = () => {
    resetModal();
    onCancel();
  };

  // 执行批量设置计分
  const handleExecute = async () => {
    setLoading(true);
    
    try {
      let requestData: {
        mode: 'disable_all' | 'auto_fill';
        config?: {
          order: 'asc' | 'desc';
          initialScore: number;
          step: number;
        };
      };
      
      if (activeTab === 'disable') {
        requestData = { mode: 'disable_all' };
      } else {
        requestData = {
          mode: 'auto_fill',
          config: {
            order,
            initialScore,
            step
          }
        };
      }

      const response = await paperApi.batchSetScoring(paperId, requestData);
      
      if (response.success) {
        console.log('🔍 Batch scoring response:', response);
        console.log('🔍 Response data:', response.data);
        const { updated_questions, total_questions } = response.data;
        console.log('🔍 updated_questions:', updated_questions, 'total_questions:', total_questions);
        message.success(`批量计分设置成功！已更新 ${updated_questions}/${total_questions} 道题目`);
        onSuccess();
        handleCancel();
      } else {
        message.error(response.error || '批量计分设置失败');
      }
    } catch (error) {
      console.error('批量计分设置失败:', error);
      message.error('批量计分设置失败');
    } finally {
      setLoading(false);
    }
  };

  // 预览功能已移除，简化界面

  const tabItems = [
    {
      key: 'disable',
      label: (
        <span>
          <StopOutlined />
          全部不计分
        </span>
      ),
      children: (
        <div style={{ padding: '16px 0' }}>
          <Alert
            message="全部不计分"
            description="将试卷中的所有题目设置为不计分状态。适用于问卷调查、信息收集等场景。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Paragraph>
            执行后，所有题目的计分状态将被设为"不计分"，选项分值将保持不变。
          </Paragraph>
        </div>
      ),
    },
    {
      key: 'auto',
      label: (
        <span>
          <CalculatorOutlined />
          智能计分
        </span>
      ),
      children: (
        <div style={{ padding: '16px 0' }}>
          <Alert
            message="智能计分配置"
            description="根据设置的规则，自动为每个选项分配分值。适用于量表、测验等需要计分的场景。"
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
          />
          
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div>
                <Text strong>排序方式:</Text>
                <Radio.Group 
                  value={order} 
                  onChange={(e) => setOrder(e.target.value)}
                  style={{ marginLeft: 8 }}
                >
                  <Radio value="asc">升序 (A选项分值最低)</Radio>
                  <Radio value="desc">降序 (A选项分值最高)</Radio>
                </Radio.Group>
              </div>
              
              <Space>
                <div>
                  <Text strong>初始分值:</Text>
                  <InputNumber
                    value={initialScore}
                    onChange={(value) => setInitialScore(value || 1)}
                    min={0}
                    max={100}
                    style={{ marginLeft: 8, width: 80 }}
                  />
                </div>
                
                <div>
                  <Text strong>分差:</Text>
                  <InputNumber
                    value={step}
                    onChange={(value) => setStep(value || 1)}
                    min={1}
                    max={10}
                    style={{ marginLeft: 8, width: 80 }}
                  />
                </div>
              </Space>
              
              <div style={{ backgroundColor: '#f6f6f6', padding: 12, borderRadius: 6 }}>
                <Text strong>示例 (3选项):</Text>
                <div style={{ marginTop: 4 }}>
                  {order === 'asc' ? (
                    <Text>A = {initialScore}, B = {initialScore + step}, C = {initialScore + step * 2}</Text>
                  ) : (
                    <Text>A = {initialScore + step * 2}, B = {initialScore + step}, C = {initialScore}</Text>
                  )}
                </div>
              </div>
            </Space>
          </Card>
        </div>
      ),
    },
  ];

  return (
    <Modal
      title={
        <div>
          <CalculatorOutlined style={{ marginRight: 8 }} />
          批量设置计分
          {paperTitle && <Text type="secondary" style={{ marginLeft: 8 }}>- {paperTitle}</Text>}
        </div>
      }
      open={visible}
      onCancel={handleCancel}
      width={800}
      footer={
        <Space>
          <Button onClick={handleCancel}>取消</Button>
          <Button 
            type="primary" 
            onClick={handleExecute}
            loading={loading}
          >
            {loading ? '执行中...' : '确定执行'}
          </Button>
        </Space>
      }
      destroyOnHidden
    >
      <Spin spinning={loading}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </Spin>
    </Modal>
  );
};

export default BatchScoringModal;