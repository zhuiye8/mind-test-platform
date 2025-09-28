import React, { useState } from 'react';
import {
  Modal,
  Radio,
  Checkbox,
  Button,
  Space,
  Typography,
  Card,
  Row,
  Col,
  Alert,
  Divider,
  Progress,
  message,
  Tag,
} from 'antd';
import {
  DownloadOutlined,
  FileTextOutlined,
  TableOutlined,
  ExportOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { paperApi } from '../../services/api';
import type { Question } from '../../types';

const { Text, Title, Paragraph } = Typography;

// 导出格式定义
type ExportFormat = 'json' | 'csv';

// 导出配置接口
interface ExportConfig {
  format: ExportFormat;
  includeMetadata: boolean;
  includeStats: boolean;
  includeConditions: boolean;
  includeScoring: boolean;
  filterByType: string[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  paperId: string;
  paperTitle: string;
  questions: Question[];
}

const ExportConfigModal: React.FC<Props> = ({ 
  visible, 
  onClose, 
  paperId, 
  paperTitle, 
  questions 
}) => {
  const [config, setConfig] = useState<ExportConfig>({
    format: 'json',
    includeMetadata: true,
    includeStats: true,
    includeConditions: true,
    includeScoring: true,
    filterByType: [],
  });
  const [loading, setLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // 重置配置
  const resetConfig = () => {
    setConfig({
      format: 'json',
      includeMetadata: true,
      includeStats: true,
      includeConditions: true,
      includeScoring: true,
      filterByType: [],
    });
    setDownloadProgress(0);
  };

  // 处理模态框关闭
  const handleClose = () => {
    resetConfig();
    onClose();
  };

  // 更新配置
  const updateConfig = (key: keyof ExportConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  // 获取过滤后的题目数量
  const getFilteredQuestionCount = () => {
    if (config.filterByType.length === 0) {
      return questions.length;
    }
    return questions.filter(q => config.filterByType.includes(q.question_type)).length;
  };

  // 执行导出
  const handleExport = async () => {
    setLoading(true);
    setDownloadProgress(0);
    
    try {
      // 构建查询参数
      const params = new URLSearchParams({
        format: config.format,
        include_metadata: config.includeMetadata.toString(),
        include_stats: config.includeStats.toString(),
        include_conditions: config.includeConditions.toString(),
        include_scoring: config.includeScoring.toString(),
      });

      if (config.filterByType.length > 0) {
        params.append('filter_types', config.filterByType.join(','));
      }

      // 模拟下载进度
      const progressInterval = setInterval(() => {
        setDownloadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 15;
        });
      }, 200);

      const response = await paperApi.exportQuestions(paperId, params.toString());
      
      clearInterval(progressInterval);
      setDownloadProgress(100);

      if (response.success) {
        // 创建下载链接
        const contentType = config.format === 'json' 
          ? 'application/json' 
          : 'text/csv';
        
        const blob = new Blob([response.data], { type: `${contentType};charset=utf-8;` });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', 
          `${paperTitle}_题目导出_${new Date().toLocaleDateString()}.${config.format}`
        );
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        message.success('导出成功');
        
        setTimeout(() => {
          handleClose();
        }, 1000);
      } else {
        throw new Error(response.error || '导出失败');
      }
    } catch (error) {
      console.error('导出失败:', error);
      message.error('导出失败，请重试');
      setDownloadProgress(0);
    } finally {
      setLoading(false);
    }
  };

  // 题目类型统计
  const getQuestionTypeStats = () => {
    const stats: Record<string, number> = {};
    questions.forEach(q => {
      stats[q.question_type] = (stats[q.question_type] || 0) + 1;
    });
    return stats;
  };

  const typeStats = getQuestionTypeStats();
  const typeLabels: Record<string, string> = {
    single_choice: '单选题',
    multiple_choice: '多选题',
    text_input: '文本题',
  };

  return (
    <Modal
      title={
        <Space>
          <ExportOutlined />
          导出题目配置
        </Space>
      }
      open={visible}
      onCancel={handleClose}
      width={700}
      footer={[
        <Button key="cancel" onClick={handleClose} disabled={loading}>
          取消
        </Button>,
        <Button
          key="export"
          type="primary"
          loading={loading}
          disabled={getFilteredQuestionCount() === 0}
          onClick={handleExport}
          icon={<DownloadOutlined />}
        >
          导出 {getFilteredQuestionCount()} 个题目
        </Button>
      ]}
      maskClosable={false}
    >
      <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        {/* 导出格式选择 */}
        <Card title="导出格式" size="small" style={{ marginBottom: 16 }}>
          <Radio.Group
            value={config.format}
            onChange={(e) => updateConfig('format', e.target.value)}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              <Radio value="json">
                <Space>
                  <FileTextOutlined />
                  <Text strong>JSON 格式</Text>
                  <Text type="secondary">- 适合程序处理，保留完整数据结构</Text>
                </Space>
              </Radio>
              <Radio value="csv">
                <Space>
                  <TableOutlined />
                  <Text strong>CSV 格式</Text>
                  <Text type="secondary">- 适合 Excel 打开，便于人工查看</Text>
                </Space>
              </Radio>
            </Space>
          </Radio.Group>
        </Card>

        {/* 导出内容选择 */}
        <Card title="导出内容" size="small" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Checkbox
              checked={config.includeMetadata}
              onChange={(e) => updateConfig('includeMetadata', e.target.checked)}
            >
              <Text strong>基本信息</Text>
              <Text type="secondary"> - 题目标题、选项、类型等核心内容</Text>
            </Checkbox>
            
            <Checkbox
              checked={config.includeStats}
              onChange={(e) => updateConfig('includeStats', e.target.checked)}
            >
              <Text strong>统计信息</Text>
              <Text type="secondary"> - 创建时间、更新时间、版本等</Text>
            </Checkbox>
            
            <Checkbox
              checked={config.includeConditions}
              onChange={(e) => updateConfig('includeConditions', e.target.checked)}
            >
              <Text strong>条件逻辑</Text>
              <Text type="secondary"> - 题目显示条件、依赖关系</Text>
            </Checkbox>
            
            <Checkbox
              checked={config.includeScoring}
              onChange={(e) => updateConfig('includeScoring', e.target.checked)}
            >
              <Text strong>计分设置</Text>
              <Text type="secondary"> - 是否计分、分值设置</Text>
            </Checkbox>
          </Space>
        </Card>

        {/* 题目类型过滤 */}
        <Card title="题目类型过滤" size="small" style={{ marginBottom: 16 }}>
          <Paragraph style={{ marginBottom: 12 }}>
            <Text type="secondary">选择要导出的题目类型（不选择表示导出所有类型）：</Text>
          </Paragraph>
          
          <Row gutter={[8, 8]}>
            {Object.entries(typeStats).map(([type, count]) => (
              <Col key={type}>
                <Checkbox
                  checked={config.filterByType.includes(type)}
                  onChange={(e) => {
                    const newTypes = e.target.checked
                      ? [...config.filterByType, type]
                      : config.filterByType.filter(t => t !== type);
                    updateConfig('filterByType', newTypes);
                  }}
                >
                  <Space>
                    <Tag color={type === 'single_choice' ? 'blue' : type === 'multiple_choice' ? 'green' : 'orange'}>
                      {typeLabels[type] || type}
                    </Tag>
                    <Text type="secondary">({count}个)</Text>
                  </Space>
                </Checkbox>
              </Col>
            ))}
          </Row>
        </Card>

        {/* 导出预览 */}
        <Card title="导出预览" size="small">
          <Row gutter={16}>
            <Col span={8}>
              <Text strong>总题目数:</Text> {questions.length}
            </Col>
            <Col span={8}>
              <Text strong>导出数量:</Text> 
              <Text type={getFilteredQuestionCount() === 0 ? 'danger' : 'success'}>
                {getFilteredQuestionCount()}
              </Text>
            </Col>
            <Col span={8}>
              <Text strong>文件格式:</Text> {config.format.toUpperCase()}
            </Col>
          </Row>
          
          {getFilteredQuestionCount() === 0 && (
            <Alert
              message="没有符合条件的题目"
              description="请调整过滤条件或检查试卷是否包含题目"
              type="warning"
              style={{ marginTop: 12 }}
              showIcon
            />
          )}
        </Card>

        {/* 下载进度 */}
        {loading && downloadProgress > 0 && (
          <>
            <Divider />
            <Card size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text strong>正在导出...</Text>
                <Progress 
                  percent={Math.round(downloadProgress)} 
                  status={downloadProgress === 100 ? 'success' : 'active'}
                />
              </Space>
            </Card>
          </>
        )}

        {/* 帮助信息 */}
        <Divider />
        <Alert
          message="导出说明"
          description={
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text>• JSON 格式保留完整数据结构，适合重新导入</Text>
              <Text>• CSV 格式便于 Excel 查看，但可能丢失复杂数据结构</Text>
              <Text>• 导出的文件可用于备份、迁移或批量编辑</Text>
            </Space>
          }
          type="info"
          icon={<InfoCircleOutlined />}
          style={{ fontSize: 12 }}
        />
      </div>
    </Modal>
  );
};

export default ExportConfigModal;