/**
 * PaperDetail - 试卷详情页面主组件（重构版）
 * 从733行拆分为模块化组件，提升可维护性
 */
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Space, message, Modal, Spin, Tabs } from 'antd';
import { PlusOutlined, SoundOutlined, ExperimentOutlined, CalculatorOutlined, DownloadOutlined } from '@ant-design/icons';

// 拆分后的子组件
import PaperHeader from './PaperHeader';
import PaperStats from './PaperStats';
import QuestionList from './QuestionList';
import { usePaperDetail } from './usePaperDetail';

// 保持对原有组件的引用
import QuestionModal from '../QuestionModal';
import AudioManagementPanel from '../AudioManagementPanel';
import BatchScoringModal from './BatchScoringModal';
import BatchImportModal from './BatchImportModal';
import ExportConfigModal from './ExportConfigModal';

// 使用 items API，避免 TabPane 弃用告警

const PaperDetail: React.FC = () => {
  const { paperId } = useParams<{ paperId: string }>();
  const navigate = useNavigate();
  
  // 批量计分模态框状态
  const [batchScoringVisible, setBatchScoringVisible] = useState(false);
  
  // 批量导入导出模态框状态
  const [batchImportVisible, setBatchImportVisible] = useState(false);
  const [exportConfigVisible, setExportConfigVisible] = useState(false);

  // 使用自定义Hook管理状态和逻辑
  const {
    paper,
    questions,
    loading,
    modalVisible,
    editingQuestion,
    refreshPaper,
    refreshQuestions,
    handleAddQuestion,
    handleEditQuestion,
    handleDeleteQuestion,
    handleDuplicateQuestion,
    handleModalSubmit,
    handleModalCancel,
  } = usePaperDetail(paperId!);

  // 返回试卷列表
  const handleBack = () => {
    navigate('/papers');
  };

  // 编辑试卷信息（暂时用Modal提示）
  const handleUpdatePaper = () => {
    message.info('试卷编辑功能开发中...');
  };

  // 音频生成处理
  const handleAudioGenerate = (questionId: string) => {
    // 这里可以触发音频生成逻辑
    message.info(`为题目 ${questionId} 生成语音...`);
  };

  // 批量计分处理
  const handleBatchScoring = () => {
    setBatchScoringVisible(true);
  };

  // 批量计分完成回调
  const handleBatchScoringSuccess = () => {
    refreshQuestions(); // 刷新题目列表
  };

  // 批量导入处理
  const handleBatchImport = () => {
    setBatchImportVisible(true);
  };

  // 批量导出处理
  const handleBatchExport = () => {
    if (questions.length === 0) {
      message.warning('当前试卷没有题目，无法导出');
      return;
    }
    setExportConfigVisible(true);
  };

  // 批量导入成功回调
  const handleImportSuccess = () => {
    refreshQuestions(); // 刷新题目列表
    message.success('导入完成，题目列表已更新');
  };

  if (!paperId) {
    return <div>参数错误</div>;
  }

  return (
    <div style={{ padding: '24px' }}>
      <Spin spinning={loading}>
        {/* 页面头部 */}
        <PaperHeader
          paper={paper}
          onUpdate={handleUpdatePaper}
          onBack={handleBack}
        />

        {/* 统计信息 */}
        <PaperStats
          questions={questions}
          paper={paper}
        />

        {/* 主要内容区域 */}
        <Card>
          <Tabs
            defaultActiveKey="questions"
            type="card"
            items={[
              {
                key: 'questions',
                label: '题目管理',
                children: (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <Space>
                        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddQuestion}>
                          添加题目
                        </Button>
                        <Button icon={<CalculatorOutlined />} onClick={handleBatchScoring}>
                          批量设置计分
                        </Button>
                        <Button icon={<SoundOutlined />} onClick={() => message.info('批量音频生成功能开发中...')}>
                          批量生成语音
                        </Button>
                        <Button icon={<ExperimentOutlined />} onClick={() => message.info('条件逻辑配置功能开发中...')}>
                          条件逻辑
                        </Button>
                      </Space>
                    </div>
                    <QuestionList
                      questions={questions}
                      onEdit={handleEditQuestion}
                      onDelete={handleDeleteQuestion}
                      onDuplicate={handleDuplicateQuestion}
                      onAudioGenerate={handleAudioGenerate}
                      loading={loading}
                    />
                  </>
                ),
              },
              {
                key: 'audio',
                label: '音频管理',
                children: <AudioManagementPanel paperId={paperId} questions={questions} />,
              },
              {
                key: 'batch',
                label: '批量操作',
                children: (
                  <div style={{ padding: '20px 0' }}>
                    <Card title="题目批量操作" style={{ marginBottom: 20 }}>
                      <Space direction="vertical" style={{ width: '100%' }}>
                        <div>
                          <Space>
                            <Button 
                              type="primary" 
                              icon={<PlusOutlined />}
                              onClick={handleBatchImport}
                            >
                              批量导入题目
                            </Button>
                            <Button 
                              icon={<DownloadOutlined />}
                              onClick={handleBatchExport}
                              disabled={questions.length === 0}
                            >
                              批量导出题目
                            </Button>
                          </Space>
                        </div>
                        <div style={{ color: '#666', fontSize: '12px' }}>
                          支持 JSON/CSV 格式的题目文件导入导出，支持追加、替换、合并等多种导入模式
                        </div>
                      </Space>
                    </Card>

                    <Card title="操作说明" size="small">
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        <li>批量导入支持 JSON 和 CSV 格式文件</li>
                        <li>提供追加、替换、合并三种导入模式</li>
                        <li>替换模式不会影响已发布的考试（快照机制保护）</li>
                        <li>导出文件可用于备份、迁移或批量编辑</li>
                        <li>支持按题目类型过滤导出内容</li>
                      </ul>
                    </Card>
                  </div>
                ),
              },
            ]}
          />
        </Card>

        {/* 题目编辑模态框 */}
        <QuestionModal
          visible={modalVisible}
          question={editingQuestion}
          onCancel={handleModalCancel}
          onSubmit={handleModalSubmit}
        />

        {/* 批量计分模态框 */}
        <BatchScoringModal
          visible={batchScoringVisible}
          onCancel={() => setBatchScoringVisible(false)}
          paperId={paperId}
          paperTitle={paper?.title}
          onSuccess={handleBatchScoringSuccess}
        />

        {/* 批量导入模态框 */}
        <BatchImportModal
          visible={batchImportVisible}
          onClose={() => setBatchImportVisible(false)}
          paperId={paperId}
          onSuccess={handleImportSuccess}
        />

        {/* 导出配置模态框 */}
        <ExportConfigModal
          visible={exportConfigVisible}
          onClose={() => setExportConfigVisible(false)}
          paperId={paperId}
          paperTitle={paper?.title || ''}
          questions={questions}
        />
      </Spin>
    </div>
  );
};

export default PaperDetail;
