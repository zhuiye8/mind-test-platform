import React, { useState } from 'react';
import {
  Modal,
  Upload,
  Button,
  Radio,
  Alert,
  Steps,
  Typography,
  Space,
  Table,
  Tag,
  Progress,
  Divider,
  message,
  Row,
  Col,
  Card,
} from 'antd';
import {
  UploadOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd/es/upload';
import type { ColumnsType } from 'antd/es/table';
import { paperApi } from '../../services/api';

const { Text, Title, Paragraph } = Typography;
const { Step } = Steps;

// 导入模式定义
type ImportMode = 'append' | 'replace' | 'merge';

interface ImportQuestion {
  question_order?: number;
  title: string;
  options: Record<string, unknown> | unknown[];
  question_type: string;
  display_condition?: any;
  is_required?: boolean;
  is_scored?: boolean;
  score_value?: number;
}

interface ImportResult {
  success: boolean;
  message: string;
  imported_count: number;
  created_count?: number;
  updated_count?: number;
  skipped_count: number;
  error_count: number;
  errors: string[];
  preview_data?: ImportQuestion[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  paperId: string;
  onSuccess: () => void;
}

const BatchImportModal: React.FC<Props> = ({ visible, onClose, paperId, onSuccess }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [previewData, setPreviewData] = useState<ImportQuestion[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);

  // 重置状态
  const resetState = () => {
    setCurrentStep(0);
    setImportMode('append');
    setFileList([]);
    setPreviewData([]);
    setImportResult(null);
    setLoading(false);
  };

  // 处理模态框关闭
  const handleClose = () => {
    resetState();
    onClose();
  };

  // 文件上传配置
  const uploadProps: UploadProps = {
    accept: '.json,.csv',
    maxCount: 1,
    fileList,
    beforeUpload: (file) => {
      const isValidType = file.type === 'application/json' || file.name.endsWith('.csv');
      if (!isValidType) {
        message.error('只支持 JSON 和 CSV 格式文件');
        return false;
      }
      
      const isLt10M = file.size! / 1024 / 1024 < 10;
      if (!isLt10M) {
        message.error('文件大小不能超过 10MB');
        return false;
      }

      return false; // 阻止自动上传
    },
    onChange: (info) => {
      setFileList(info.fileList);
      if (info.fileList.length === 0) {
        setPreviewData([]);
        setCurrentStep(0);
      }
    },
  };

  // 预览文件内容
  const handlePreview = async () => {
    if (fileList.length === 0) {
      message.error('请先选择文件');
      return;
    }

    setLoading(true);
    try {
      const file = fileList[0].originFileObj!;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', importMode);
      formData.append('preview_only', 'true');

      const response = await paperApi.batchImportQuestions(paperId, formData);
      if (response.success) {
        setPreviewData(response.data.preview_data || []);
        setCurrentStep(1);
      } else {
        message.error(response.error || '预览失败');
      }
    } catch (error) {
      console.error('预览失败:', error);
      message.error('预览失败，请检查文件格式');
    } finally {
      setLoading(false);
    }
  };

  // 执行导入
  const handleImport = async () => {
    if (fileList.length === 0) {
      message.error('请先选择文件');
      return;
    }

    setLoading(true);
    try {
      const file = fileList[0].originFileObj!;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mode', importMode);

      const response = await paperApi.batchImportQuestions(paperId, formData);
      setImportResult(response.data);
      setCurrentStep(2);

      if (response.success && response.data.success) {
        message.success(`成功导入 ${response.data.imported_count} 个题目`);
        onSuccess();
      }
    } catch (error) {
      console.error('导入失败:', error);
      message.error('导入失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 下载模板文件
  const downloadTemplate = () => {
    const template = [
      {
        question_order: 1,
        title: "这是一个单选题示例",
        options: [
          { label: "选项A", value: "A" },
          { label: "选项B", value: "B" },
          { label: "选项C", value: "C" },
          { label: "选项D", value: "D" }
        ],
        question_type: "single_choice",
        is_required: true,
        is_scored: false,
        score_value: 1
      },
      {
        question_order: 2,
        title: "这是一个多选题示例",
        options: [
          { label: "选项A", value: "A" },
          { label: "选项B", value: "B" },
          { label: "选项C", value: "C" },
          { label: "选项D", value: "D" }
        ],
        question_type: "multiple_choice",
        is_required: true,
        is_scored: false
      }
    ];

    const dataStr = JSON.stringify(template, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `题目导入模板_${new Date().toLocaleDateString()}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  // 预览表格列定义
  const previewColumns: ColumnsType<ImportQuestion> = [
    {
      title: '顺序',
      dataIndex: 'question_order',
      key: 'question_order',
      width: 60,
      render: (order: number, _, index: number) => order || index + 1,
    },
    {
      title: '题目内容',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string) => (
        <Text style={{ maxWidth: 200 }} ellipsis={{ tooltip: title }}>
          {title}
        </Text>
      ),
    },
    {
      title: '题目类型',
      dataIndex: 'question_type',
      key: 'question_type',
      width: 100,
      render: (type: string) => (
        <Tag color={type === 'single_choice' ? 'blue' : type === 'multiple_choice' ? 'green' : 'orange'}>
          {type === 'single_choice' ? '单选' : type === 'multiple_choice' ? '多选' : '文本'}
        </Tag>
      ),
    },
    {
      title: '选项数量',
      key: 'options_count',
      width: 80,
      render: (_, record) => {
        const opts = record.options;
        if (!opts) return 0;
        if (Array.isArray(opts)) return opts.length;
        return Object.keys(opts).length;
      },
    },
    {
      title: '必答',
      dataIndex: 'is_required',
      key: 'is_required',
      width: 60,
      render: (required: boolean) => required ? '是' : '否',
    },
  ];

  // 步骤内容渲染
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div style={{ padding: '20px 0' }}>
            {/* 导入模式选择 */}
            <Card title="选择导入模式" style={{ marginBottom: 20 }}>
              <Radio.Group 
                value={importMode} 
                onChange={(e) => setImportMode(e.target.value)}
                style={{ width: '100%' }}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Radio value="append">
                    <Space>
                      <Text strong>追加模式</Text>
                      <Text type="secondary">在现有题目后面添加新题目</Text>
                    </Space>
                  </Radio>
                  <Radio value="replace">
                    <Space>
                      <Text strong>替换模式</Text>
                      <Text type="secondary">清空现有题目，导入新题目（受快照机制保护）</Text>
                    </Space>
                  </Radio>
                  <Radio value="merge">
                    <Space>
                      <Text strong>合并模式</Text>
                      <Text type="secondary">智能去重，合并相同题目</Text>
                    </Space>
                  </Radio>
                </Space>
              </Radio.Group>
            </Card>

            {/* 文件上传 */}
            <Card title="选择导入文件">
              <Upload.Dragger {...uploadProps} style={{ padding: '20px' }}>
                <p className="ant-upload-drag-icon">
                  <FileTextOutlined style={{ fontSize: 48, color: '#1890ff' }} />
                </p>
                <p className="ant-upload-text">
                  <Text strong>点击或拖拽文件到此区域上传</Text>
                </p>
                <p className="ant-upload-hint">
                  支持 JSON 和 CSV 格式文件，大小不超过 10MB
                </p>
              </Upload.Dragger>

              <Row gutter={16} style={{ marginTop: 16 }}>
                <Col span={12}>
                  <Button 
                    icon={<DownloadOutlined />} 
                    block 
                    onClick={downloadTemplate}
                  >
                    下载 JSON 模板
                  </Button>
                </Col>
                <Col span={12}>
                  <Button 
                    type="primary" 
                    icon={<CheckCircleOutlined />}
                    block 
                    disabled={fileList.length === 0}
                    loading={loading}
                    onClick={handlePreview}
                  >
                    预览导入内容
                  </Button>
                </Col>
              </Row>
            </Card>
          </div>
        );

      case 1:
        return (
          <div style={{ padding: '20px 0' }}>
            <Alert
              message={`预览成功，将要${importMode === 'append' ? '追加' : importMode === 'replace' ? '替换' : '合并'}导入 ${previewData.length} 个题目`}
              type="info"
              style={{ marginBottom: 20 }}
            />
            
            <Table
              columns={previewColumns}
              dataSource={previewData}
              rowKey={(_, index) => index!}
              pagination={{ pageSize: 10 }}
              scroll={{ y: 400 }}
              size="small"
            />

            <Row gutter={16} style={{ marginTop: 20 }}>
              <Col span={12}>
                <Button block onClick={() => setCurrentStep(0)}>
                  返回修改
                </Button>
              </Col>
              <Col span={12}>
                <Button 
                  type="primary" 
                  block 
                  loading={loading}
                  onClick={handleImport}
                >
                  确认导入
                </Button>
              </Col>
            </Row>
          </div>
        );

      case 2:
        return (
          <div style={{ padding: '20px 0' }}>
            {importResult && (
              <>
                {importResult.success ? (
                  <Alert
                    message="导入完成"
                    description={
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <Text>成功导入 {importResult.imported_count} 个题目</Text>
                        {typeof importResult.created_count === 'number' && (
                          <Text>新增 {importResult.created_count} 个题目</Text>
                        )}
                        {typeof importResult.updated_count === 'number' && importResult.updated_count > 0 && (
                          <Text>更新 {importResult.updated_count} 个题目</Text>
                        )}
                        {importResult.skipped_count > 0 && (
                          <Text type="warning">跳过 {importResult.skipped_count} 个重复题目</Text>
                        )}
                        {importResult.error_count > 0 && (
                          <Text type="danger">失败 {importResult.error_count} 个题目</Text>
                        )}
                      </Space>
                    }
                    type="success"
                    style={{ marginBottom: 20 }}
                  />
                ) : (
                  <Alert
                    message="导入失败"
                    description={importResult.message}
                    type="error"
                    style={{ marginBottom: 20 }}
                  />
                )}

                {importResult.errors && importResult.errors.length > 0 && (
                  <Card title="错误详情" size="small">
                    {importResult.errors.map((error, index) => (
                      <Text key={index} type="danger" style={{ display: 'block' }}>
                        {index + 1}. {error}
                      </Text>
                    ))}
                  </Card>
                )}

                <div style={{ textAlign: 'center', marginTop: 20 }}>
                  <Button type="primary" onClick={handleClose}>
                    完成
                  </Button>
                </div>
              </>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Modal
      title="批量导入题目"
      open={visible}
      onCancel={handleClose}
      width={800}
      footer={null}
      maskClosable={false}
    >
      <Steps current={currentStep} style={{ marginBottom: 30 }}>
        <Step 
          title="上传文件" 
          description="选择导入模式和文件"
          icon={<UploadOutlined />}
        />
        <Step 
          title="预览内容" 
          description="确认导入的题目"
          icon={<InfoCircleOutlined />}
        />
        <Step 
          title="导入完成" 
          description="查看导入结果"
          icon={<CheckCircleOutlined />}
        />
      </Steps>

      {renderStepContent()}

      {/* 帮助信息 */}
      <Divider />
      <Card size="small" title="导入说明">
        <Paragraph style={{ margin: 0, fontSize: 12 }}>
          <Text strong>文件格式要求：</Text><br />
          1. JSON 格式：符合模板结构的 JSON 数组<br />
          2. CSV 格式：包含标题行的 CSV 文件<br />
          <Text strong>注意事项：</Text><br />
          • 替换模式不会影响已发布的考试（受快照机制保护）<br />
          • 合并模式根据题目内容智能去重<br />
          • question_order 为空时会自动分配顺序
        </Paragraph>
      </Card>
    </Modal>
  );
};

export default BatchImportModal;