import React, { useCallback, useMemo, useState } from 'react';
import { Card, Radio, Checkbox, Input, Typography, Space, Badge, Tag, Divider, Avatar } from 'antd';
import { 
  StarOutlined, 
  ExclamationCircleOutlined,
  CheckCircleOutlined 
} from '@ant-design/icons';
import type { Question } from '../../types';
import type { TimelineRecorder } from '../../utils/timelineRecorder';
import VoiceInteraction from '../VoiceInteraction';
import AudioFilePlayer from '../AudioFilePlayer';
import { questionTypeColors, createOptionStyle, cardStyles } from './ParticipantExam.styles';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface QuestionRendererProps {
  question: Question;
  questionIndex: number;
  totalQuestions: number;
  answer: any;
  onAnswerChange: (questionId: string, value: any) => void;
  showAudioPlayer?: boolean;
  showVoiceInteraction?: boolean;
  disabled?: boolean;
  className?: string;
  timelineRecorder?: TimelineRecorder;
}

const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  questionIndex,
  totalQuestions,
  answer,
  onAnswerChange,
  showAudioPlayer = true,
  showVoiceInteraction = true,
  disabled = false,
  className = '',
  timelineRecorder
}) => {
  // 处理答案变化
  const handleAnswerChange = useCallback((value: any) => {
    onAnswerChange(question.id, value);
  }, [question.id, onAnswerChange]);

  // 获取选项数组
  const optionEntries = useMemo(() => {
    return Object.entries(question.options || {});
  }, [question.options]);

  // 是否必填（默认必填）
  const isRequired = useMemo(() => question.is_required !== false, [question.is_required]);

  // 悬停状态管理
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);

  // 渲染单选题
  const renderSingleChoice = useCallback(() => {
    return (
      <Radio.Group
        value={answer}
        onChange={(e) => handleAnswerChange(e.target.value)}
        disabled={disabled}
        style={{ width: '100%' }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={0}>
          {optionEntries.map(([key, value]) => (
            <div
              key={key}
              style={createOptionStyle(
                'single_choice',
                answer === key,
                hoveredOption === key
              )}
              onMouseEnter={() => setHoveredOption(key)}
              onMouseLeave={() => setHoveredOption(null)}
            >
              <Radio 
                value={key} 
                disabled={disabled}
                style={{ display: 'flex', alignItems: 'flex-start' }}
              >
                <span style={{ marginLeft: 12, fontSize: '16px', lineHeight: '1.6' }}>
                  {typeof value === 'string' ? value : (value as any)?.text || (value as any)?.label || ''}
                </span>
              </Radio>
            </div>
          ))}
        </Space>
      </Radio.Group>
    );
  }, [optionEntries, answer, handleAnswerChange, disabled, hoveredOption]);

  // 渲染多选题
  const renderMultipleChoice = useCallback(() => {
    const selectedValues = Array.isArray(answer) ? answer : [];

    const handleCheckboxChange = (checkedValues: string[]) => {
      handleAnswerChange(checkedValues);
    };

    return (
      <Checkbox.Group
        value={selectedValues}
        onChange={handleCheckboxChange}
        disabled={disabled}
        style={{ width: '100%' }}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={0}>
          {optionEntries.map(([key, value]) => (
            <div
              key={key}
              style={createOptionStyle(
                'multiple_choice',
                selectedValues.includes(key),
                hoveredOption === key
              )}
              onMouseEnter={() => setHoveredOption(key)}
              onMouseLeave={() => setHoveredOption(null)}
            >
              <Checkbox 
                value={key} 
                disabled={disabled}
                style={{ display: 'flex', alignItems: 'flex-start' }}
              >
                <span style={{ marginLeft: 12, fontSize: '16px', lineHeight: '1.6' }}>
                  {typeof value === 'string' ? value : (value as any)?.text || (value as any)?.label || ''}
                </span>
              </Checkbox>
            </div>
          ))}
        </Space>
      </Checkbox.Group>
    );
  }, [optionEntries, answer, handleAnswerChange, disabled, hoveredOption]);

  // 渲染文本输入
  const renderTextInput = useCallback(() => {
    return (
      <div style={{ width: '100%' }}>
        <TextArea
          value={answer || ''}
          onChange={(e) => handleAnswerChange(e.target.value)}
          onFocus={(e) => {
            timelineRecorder?.recordInputFocus(question.id);
            e.target.style.borderColor = '#F59E0B';
            e.target.style.boxShadow = '0 0 0 4px rgba(245, 158, 11, 0.1)';
          }}
          onBlur={(e) => {
            timelineRecorder?.recordInputBlur(question.id);
            e.target.style.borderColor = '#E5E7EB';
            e.target.style.boxShadow = 'none';
          }}
          placeholder="请在此输入您的答案..."
          rows={6}
          maxLength={1000}
          showCount
          disabled={disabled}
          style={{
            borderRadius: 12,
            fontSize: 16,
            lineHeight: 1.6,
            padding: 16,
            border: '2px solid #E5E7EB',
            background: 'rgba(255, 255, 255, 0.8)',
            transition: 'all 0.3s ease'
          }}
        />
      </div>
    );
  }, [answer, handleAnswerChange, disabled, timelineRecorder, question.id]);

  // 根据题目类型渲染答题区域
  const renderQuestionInput = useCallback(() => {
    switch (question.question_type) {
      case 'single_choice':
        return renderSingleChoice();
      case 'multiple_choice':
        return renderMultipleChoice();
      case 'text':
        return renderTextInput();
      default:
        return <Text type="secondary">不支持的题目类型</Text>;
    }
  }, [question.question_type, renderSingleChoice, renderMultipleChoice, renderTextInput]);

  // 获取题目类型标签
  const getQuestionTypeTag = useCallback(() => {
    const typeMap = {
      'single_choice': { text: '单选题', color: 'blue' },
      'multiple_choice': { text: '多选题', color: 'green' },
      'text': { text: '简答题', color: 'orange' }
    };
    
    const type = typeMap[question.question_type] || { text: '未知', color: 'default' };
    return <Tag color={type.color}>{type.text}</Tag>;
  }, [question.question_type]);

  // 检查是否已回答
  const isAnswered = useMemo(() => {
    if (question.question_type === 'text') {
      return answer && answer.trim().length > 0;
    } else if (question.question_type === 'multiple_choice') {
      return Array.isArray(answer) && answer.length > 0;
    } else {
      return answer !== undefined && answer !== null && answer !== '';
    }
  }, [answer, question.question_type]);

  return (
    <Card 
      className={className}
      style={{
        ...cardStyles.question,
        minHeight: 520,
        animation: 'fadeInUp 0.6s ease-out'
      }}
      styles={{ body: { padding: 48 } }}
    >
      {/* 题目头部 */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar
              size={48}
              style={{
                background: questionTypeColors[question.question_type]?.gradient || questionTypeColors.single_choice.gradient,
                fontSize: 20,
                fontWeight: 'bold'
              }}
            >
              {questionIndex + 1}
            </Avatar>
            <div>
              <Title level={3} style={{ margin: 0, fontSize: 20 }}>
                第 {questionIndex + 1} 题
              </Title>
              {getQuestionTypeTag()}
            </div>
          </div>
          
          {/* 题目标识组合 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isRequired && (
              <Badge 
                count="*" 
                style={{ 
                  backgroundColor: '#ff4d4f',
                  fontSize: 14,
                  fontWeight: 'bold',
                  boxShadow: '0 2px 8px rgba(255, 77, 79, 0.3)'
                }}
              />
            )}
            {isAnswered && (
              <CheckCircleOutlined 
                style={{
                  fontSize: 20,
                  color: '#10B981',
                  background: 'white',
                  borderRadius: '50%'
                }}
              />
            )}
          </div>
        </div>
        
        {/* 题目标题 */}
        <div style={{
          fontSize: 18,
          lineHeight: 1.8,
          color: '#1F2937',
          padding: 24,
          background: questionTypeColors[question.question_type]?.ultraLight || 'rgba(79, 70, 229, 0.05)',
          borderRadius: 16,
          border: `1px solid ${questionTypeColors[question.question_type]?.border || 'rgba(79, 70, 229, 0.1)'}`
        }}>
          {/* 必填标识 */}
          {isRequired && (
            <Text strong style={{ color: '#ff4d4f', fontSize: 20, marginRight: 8 }}>
              *
            </Text>
          )}
          {question.title}
        </div>

        {/* 题目描述 */}
        {question.description && (
          <div className="mb-4">
            <Paragraph className="text-gray-600 text-base">
              {question.description}
            </Paragraph>
          </div>
        )}
      </div>

      <Divider />

      {/* 答题区域 */}
      <div style={{ marginBottom: 40 }}>
        <div style={{
          background: 'rgba(255, 255, 255, 0.8)',
          borderRadius: 16,
          padding: 32,
          border: '1px solid rgba(0, 0, 0, 0.06)'
        }}>
          {renderQuestionInput()}
        </div>
      </div>

      {/* 音频播放和语音交互 */}
      {(showAudioPlayer || showVoiceInteraction) && (
        <>
          <Divider />
          <div className="bg-gray-50 p-4 rounded-lg">
            <Text strong className="block mb-3">智能辅助功能</Text>
            <Space direction="vertical" size="middle" className="w-full">
              {/* 音频播放器 */}
              {showAudioPlayer && (
                <div>
                  <Text type="secondary" className="block mb-2">题目语音播报</Text>
                  <AudioFilePlayer
                    questionText={question.title}
                    options={question.options}
                    questionType={question.question_type}
                  />
                </div>
              )}

              {/* 语音交互 */}
              {showVoiceInteraction && question.question_type !== 'text' && (
                <div>
                  <Text type="secondary" className="block mb-2">语音答题</Text>
                  <VoiceInteraction
                    questionText={question.title}
                    questionOptions={question.options}
                    onVoiceAnswer={(voiceAnswer) => {
                      // 语音答题，使用voice来源标记
                      const previousAnswer = answer;
                      if (previousAnswer === undefined || previousAnswer === null || previousAnswer === '') {
                        timelineRecorder?.recordOptionSelect(question.id, voiceAnswer, 'voice');
                      } else {
                        timelineRecorder?.recordOptionChange(question.id, String(previousAnswer), voiceAnswer, 'voice');
                      }
                      handleAnswerChange(voiceAnswer);
                    }}
                    disabled={disabled}
                  />
                </div>
              )}
            </Space>
          </div>
        </>
      )}

      {/* 题目提示 */}
      {question.hint && (
        <>
          <Divider />
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
            <div className="flex items-start">
              <ExclamationCircleOutlined className="text-blue-400 mt-1 mr-2" />
              <div>
                <Text strong className="text-blue-800">提示</Text>
                <Paragraph className="text-blue-700 mb-0 mt-1">
                  {question.hint}
                </Paragraph>
              </div>
            </div>
          </div>
        </>
      )}
    </Card>
  );
};

export default QuestionRenderer;
