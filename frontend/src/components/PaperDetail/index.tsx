/**
 * PaperDetail - 试卷详情页面主组件（重构版）
 * 从733行拆分为模块化组件，提升可维护性
 */
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button, Space, message, Modal, Spin, Tabs } from 'antd';
import { PlusOutlined, SoundOutlined, ExperimentOutlined } from '@ant-design/icons';

// 拆分后的子组件
import PaperHeader from './PaperHeader';
import PaperStats from './PaperStats';
import QuestionList from './QuestionList';
import { usePaperDetail } from './usePaperDetail';

// 保持对原有组件的引用
import QuestionModal from '../QuestionModal';
import AudioManagementPanel from '../AudioManagementPanel';

// 使用 items API，避免 TabPane 弃用告警

const PaperDetail: React.FC = () => {
  const { paperId } = useParams<{ paperId: string }>();
  const navigate = useNavigate();

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
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <Space>
                      <Button type="primary" onClick={() => message.info('批量导入：选择文件上传后解析入库（开发中）')}>批量导入题目</Button>
                      <Button onClick={() => message.info('批量导出：导出当前试卷题目到CSV/JSON（开发中）')}>批量导出题目</Button>
                    </Space>
                    <div style={{ marginTop: 12, color: '#999' }}>功能规划中，当前按钮为占位行为</div>
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
      </Spin>
    </div>
  );
};

export default PaperDetail;
