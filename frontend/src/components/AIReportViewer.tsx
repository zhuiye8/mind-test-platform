/**
 * AI报告展示组件
 * 提供专业的心理分析报告展示和下载功能
 */

import React, { useState } from 'react';
import { Modal, Button, Space, Typography, Divider, Spin, Card, Row, Col, Statistic, App } from 'antd';
import { 
  DownloadOutlined, 
  PrinterOutlined, 
  ShareAltOutlined,
  FileTextOutlined,
  RobotOutlined,
  CloseOutlined,
  ReloadOutlined,
  BarChartOutlined,
  HeartOutlined,
  EyeOutlined,
  SoundOutlined
} from '@ant-design/icons';
import { teacherAiApi } from '../services/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

const { Title, Text, Paragraph } = Typography;

export interface AIReportViewerProps {
  visible: boolean;
  onClose: () => void;
  report: string;
  participantName: string;
  examTitle?: string;
  reportFile?: string;
  examResultId?: string; // 添加考试结果ID用于新功能
  onReportUpdate?: (newReport: string) => void; // 报告更新回调
}

const AIReportViewer: React.FC<AIReportViewerProps> = ({
  visible,
  onClose,
  report,
  participantName,
  examTitle = '心理测试',
  reportFile,
  examResultId,
  onReportUpdate
}) => {
  const { message } = App.useApp();
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [emotionDataVisible, setEmotionDataVisible] = useState(false);
  const [emotionData, setEmotionData] = useState<any>(null);
  const [loadingEmotionData, setLoadingEmotionData] = useState(false);
  // 智能格式修复函数
  const fixReportFormat = (rawReport: string): string => {
    let formattedReport = rawReport;
    
    // 修复标题格式问题：如果开头缺少【，自动补全
    if (formattedReport.startsWith('1234567') || formattedReport.includes('同学心理分析报告】')) {
      formattedReport = formattedReport.replace(/^(.+?)同学心理分析报告】/, '# 【$1同学心理分析报告】');
    }
    
    // 确保主标题格式正确
    formattedReport = formattedReport.replace(/^【(.+?)】/, '# $1');
    
    // 转换章节标题：**一、** → ## 一、
    formattedReport = formattedReport.replace(/\*\*([一二三四五六七八九十]+、[^*]+?)\*\*/g, '## $1');
    
    // 转换子标题：**1. ** → ### 1. 
    formattedReport = formattedReport.replace(/\*\*(\d+\.\s*[^*]+?)\*\*/g, '### $1');
    
    // 保持其他粗体格式：**内容** 不变
    
    return formattedReport;
  };

  // 检测是否包含Markdown语法
  const hasMarkdownSyntax = (text: string): boolean => {
    const markdownPatterns = [
      /#{1,6}\s/, // 标题
      /\*\*[^*]+\*\*/, // 加粗
      /^\d+\.\s/m, // 数字列表
      /^-\s/m, // 无序列表
    ];
    return markdownPatterns.some(pattern => pattern.test(text));
  };

  // 处理后的报告内容
  const processedReport = fixReportFormat(report);
  const useMarkdown = hasMarkdownSyntax(processedReport);
  // 下载报告为TXT文件
  const downloadTXT = () => {
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${participantName}_AI心理分析报告.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 重新生成AI报告
  const handleRegenerate = () => {
    if (!examResultId) {
      message.error('缺少考试结果ID，无法重新生成');
      return;
    }

    Modal.confirm({
      title: '重新生成AI报告',
      content: '确定要重新生成AI分析报告吗？这将覆盖当前报告内容。',
      okText: '确定重新生成',
      cancelText: '取消',
      type: 'warning',
      onOk: async () => {
        try {
          setIsRegenerating(true);
          message.loading('正在重新生成AI分析报告...', 0);
          
            const response = await teacherAiApi.regenerateAIReport(examResultId);
          
          if (response.success && response.data) {
            message.destroy();
            message.success('AI分析报告重新生成成功！');
            onReportUpdate?.(response.data.report);
          } else {
            message.destroy();
            message.error('重新生成失败：' + (response.error || '未知错误'));
          }
        } catch (error: any) {
          message.destroy();
          message.error('重新生成失败：' + error.message);
        } finally {
          setIsRegenerating(false);
        }
      }
    });
  };

  // 获取情绪分析数据
  const handleShowEmotionData = async () => {
    if (!examResultId) {
      message.error('缺少考试结果ID，无法获取情绪数据');
      return;
    }

    try {
      setLoadingEmotionData(true);
      setEmotionDataVisible(true);
      
      const response = await teacherAiApi.getEmotionDataPreview(examResultId);
      
      if (response.success && response.data) {
        setEmotionData(response.data);
        message.success('情绪分析数据加载成功');
      } else {
        message.error('获取情绪数据失败：' + (response.error || '未知错误'));
        setEmotionDataVisible(false);
      }
    } catch (error: any) {
      message.error('获取情绪数据失败：' + error.message);
      setEmotionDataVisible(false);
    } finally {
      setLoadingEmotionData(false);
    }
  };

  // 打印报告
  const printReport = () => {
    const printWindow = window.open('', '', 'width=800,height=900');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${participantName} - AI心理分析报告</title>
            <style>
              body {
                font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                padding: 20px;
                max-width: 800px;
                margin: 0 auto;
              }
              h1 {
                color: #1890ff;
                border-bottom: 2px solid #1890ff;
                padding-bottom: 10px;
              }
              .meta {
                color: #666;
                font-size: 14px;
                margin-bottom: 20px;
              }
              .report-content {
                white-space: pre-wrap;
                line-height: 1.8;
                font-size: 14px;
              }
              @media print {
                body { padding: 0; }
              }
            </style>
          </head>
          <body>
            <h1>🤖 AI心理分析报告</h1>
            <div class="meta">
              <p><strong>学生：</strong>${participantName}</p>
              <p><strong>考试：</strong>${examTitle}</p>
              <p><strong>生成时间：</strong>${new Date().toLocaleString()}</p>
            </div>
            <div class="report-content">${report}</div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  };

  // 分享报告（复制到剪贴板）
  const shareReport = async () => {
    const shareText = `${participantName} - AI心理分析报告\n\n${report}\n\n生成时间：${new Date().toLocaleString()}`;
    
    try {
      await navigator.clipboard.writeText(shareText);
      // 这里可以添加成功提示
    } catch (err) {
      // 降级方案：选中文本
      const textArea = document.createElement('textarea');
      textArea.value = shareText;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  return (
    <>
    <Modal
      title={null}
      open={visible}
      onCancel={onClose}
      footer={null}
      width="90vw"
      style={{ maxWidth: '1000px' }}
      styles={{
        body: { padding: 0 },
        header: { display: 'none' }
      }}
      className="ai-report-viewer"
    >
      {/* 头部标题栏 */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '24px',
        borderRadius: '8px 8px 0 0'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <Title level={3} style={{ color: 'white', margin: 0, display: 'flex', alignItems: 'center' }}>
              <RobotOutlined style={{ marginRight: 12, fontSize: '24px' }} />
              AI心理分析报告
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.85)', marginTop: 8, display: 'block' }}>
              学生：{participantName} | 考试：{examTitle}
            </Text>
          </div>
          <Button 
            type="text" 
            icon={<CloseOutlined />} 
            onClick={onClose}
            style={{ color: 'white' }}
            size="large"
          />
        </div>
      </div>
      

      {/* 操作按钮栏 */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid #f0f0f0',
        background: '#fafafa'
      }}>
        <Space>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={downloadTXT}
          >
            下载报告
          </Button>
          <Button
            icon={<PrinterOutlined />}
            onClick={printReport}
          >
            打印报告
          </Button>
          <Button
            icon={<ShareAltOutlined />}
            onClick={shareReport}
          >
            复制分享
          </Button>
          {examResultId && (
            <>
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRegenerate}
                loading={isRegenerating}
                type="default"
              >
                重新生成
              </Button>
              <Button
                icon={<BarChartOutlined />}
                onClick={handleShowEmotionData}
                type="default"
                style={{ color: '#1890ff' }}
              >
                查看情绪分析数据
              </Button>
            </>
          )}
          {reportFile && (
            <Button
              icon={<FileTextOutlined />}
              type="dashed"
            >
              服务器文件: {reportFile.slice(0, 10)+'...'}
            </Button>
          )}
        </Space>
      </div>

      {/* 报告内容 */}
      <div style={{
        padding: '32px',
        maxHeight: '60vh',
        overflow: 'auto',
        background: '#ffffff'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #fff7e6 0%, #fff2e8 100%)',
          border: '1px solid #ffd591',
          borderRadius: '8px',
          padding: '24px',
          marginBottom: '24px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '16px'
          }}>
            <RobotOutlined style={{ 
              fontSize: '20px', 
              color: '#fa8c16', 
              marginRight: '8px' 
            }} />
            <Title level={4} style={{ margin: 0, color: '#d4651a' }}>
              专业AI分析报告
            </Title>
          </div>
          <Text style={{ color: '#ad6800' }}>
            本报告基于先进的人工智能技术，结合多模态情绪分析数据，为您提供专业的心理状态评估和个性化建议。
          </Text>
        </div>

        <div style={{
          background: '#fafafa',
          border: '1px solid #e8e8e8',
          borderRadius: '8px',
          padding: '24px'
        }}>
          {useMarkdown ? (
            <div style={{
              lineHeight: 1.8,
              fontSize: '15px',
              color: '#262626'
            }}>
              <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                // 自定义渲染组件
                h1: ({ children }) => (
                  <Title level={1} style={{
                    color: '#1890ff',
                    borderBottom: '3px solid #1890ff',
                    paddingBottom: '12px',
                    marginBottom: '24px',
                    fontSize: '28px'
                  }}>
                    {children}
                  </Title>
                ),
                h2: ({ children }) => (
                  <Title level={2} style={{
                    color: '#722ed1',
                    borderLeft: '4px solid #722ed1',
                    paddingLeft: '16px',
                    marginTop: '32px',
                    marginBottom: '16px',
                    fontSize: '20px',
                    lineHeight: 1.4
                  }}>
                    {children}
                  </Title>
                ),
                h3: ({ children }) => (
                  <Title level={3} style={{
                    color: '#fa541c',
                    marginTop: '24px',
                    marginBottom: '12px',
                    fontSize: '16px',
                    fontWeight: 600
                  }}>
                    {children}
                  </Title>
                ),
                p: ({ children }) => (
                  <Paragraph style={{
                    lineHeight: 1.8,
                    fontSize: '15px',
                    color: '#262626',
                    marginBottom: '16px'
                  }}>
                    {children}
                  </Paragraph>
                ),
                strong: ({ children }) => (
                  <Text strong style={{
                    color: '#1890ff',
                    fontWeight: 600
                  }}>
                    {children}
                  </Text>
                ),
                li: ({ children }) => (
                  <li style={{
                    marginBottom: '8px',
                    lineHeight: 1.6,
                    color: '#595959'
                  }}>
                    {children}
                  </li>
                ),
                ol: ({ children }) => (
                  <ol style={{
                    paddingLeft: '24px',
                    marginBottom: '16px'
                  }}>
                    {children}
                  </ol>
                ),
                ul: ({ children }) => (
                  <ul style={{
                    paddingLeft: '24px',
                    marginBottom: '16px'
                  }}>
                    {children}
                  </ul>
                )
              }}
            >
              {processedReport}
              </ReactMarkdown>
            </div>
          ) : (
            <Paragraph style={{
              whiteSpace: 'pre-wrap',
              lineHeight: 1.8,
              fontSize: '15px',
              color: '#262626',
              margin: 0
            }}>
              {report}
            </Paragraph>
          )}
        </div>

        <Divider />

        <div style={{ textAlign: 'center', color: '#999' }}>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            报告生成时间：{new Date().toLocaleString()} | 
            由AI智能分析系统生成 | 
            仅供参考，如需专业咨询请联系心理专家
          </Text>
        </div>
      </div>
    </Modal>

    {/* 情绪分析原始数据预览Modal */}
    <Modal
      title="情绪分析原始数据"
      open={emotionDataVisible}
      onCancel={() => setEmotionDataVisible(false)}
      footer={[
        <Button key="close" onClick={() => setEmotionDataVisible(false)}>
          关闭
        </Button>
      ]}
      width="80vw"
      style={{ maxWidth: '900px' }}
      styles={{ body: { padding: '24px' } }}
    >
      {loadingEmotionData ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
          <p style={{ marginTop: '16px', color: '#666' }}>正在加载情绪分析数据...</p>
        </div>
      ) : emotionData ? (
        <div>
          <div style={{ 
            background: '#f8f9fa', 
            border: '1px solid #e9ecef', 
            borderRadius: '8px', 
            padding: '16px',
            marginBottom: '16px'
          }}>
            <Text strong style={{ color: '#666' }}>
              数据标识：{emotionData.session_id} | 
              采集时间：{emotionData.start_time} ~ {emotionData.end_time}
            </Text>
          </div>
          
          <div style={{
            background: '#2d3748',
            borderRadius: '8px',
            padding: '20px',
            maxHeight: '500px',
            overflow: 'auto',
            border: '1px solid #e2e8f0'
          }}>
            <pre style={{
              color: '#e2e8f0',
              fontSize: '13px',
              lineHeight: '1.5',
              margin: 0,
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {JSON.stringify(emotionData, null, 2)}
            </pre>
          </div>
          
          <div style={{ 
            marginTop: '16px', 
            padding: '12px', 
            background: '#f0f9ff', 
            borderRadius: '6px',
            fontSize: '12px',
            color: '#666'
          }}>
            💡 以上数据为考试期间采集的多模态情绪分析原始数据，包含音频情绪、视频情绪和心率变化信息。
          </div>

        </div>
      ) : null}
    </Modal>
    </>
  );
};

export default AIReportViewer;