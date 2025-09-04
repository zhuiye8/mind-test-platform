import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  Card,
  Typography,
  Divider,
  message,
  Checkbox,
  InputNumber,
  Switch,
  Row,
  Col,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Question, CreateQuestionForm, QuestionOption } from '../types';

const { TextArea } = Input;
const { Option } = Select;
const { Text } = Typography;

interface QuestionModalProps {
  visible: boolean;
  question: Question | null; // null表示创建新题目
  onCancel: () => void;
  onSubmit: (data: CreateQuestionForm) => Promise<void>;
}

const QuestionModal: React.FC<QuestionModalProps> = ({
  visible,
  question,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm();
  const [options, setOptions] = useState<{ key: string; text: string; score?: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [isScored, setIsScored] = useState(false); // 是否启用计分

  // 当模态框打开或题目变更时，初始化表单数据
  useEffect(() => {
    if (visible) {
      if (question) {
        // 编辑模式：填充现有题目数据
        // 修复计分字段映射：只有明确为true时才显示为计分
        const questionIsScored = question.is_scored === true;
        setIsScored(questionIsScored);
        
        form.setFieldsValue({
          title: question.title,
          question_type: question.question_type,
          is_required: question.is_required !== false, // 默认为true，除非明确设置为false
          is_scored: questionIsScored, // 只有明确为true时才显示为计分
        });
        
        // 转换选项格式 - 兼容多种格式
        const optionsList = Object.entries(question.options || {}).map(([key, value]) => {
          if (typeof value === 'string') {
            // 旧格式：纯字符串
            return { key, text: value };
          } else if (typeof value === 'object') {
            // 新格式或导入格式
            return {
              key,
              text: value.text || value.label || '',
              score: value.score !== undefined ? value.score : value.value,
            };
          }
          return { key, text: '' };
        });
        setOptions(optionsList);
      } else {
        // 创建模式：重置表单和选项
        form.resetFields();
        setOptions([{ key: 'A', text: '' }]);
        setIsScored(false);
      }
    }
  }, [visible, question, form]);

  // 添加新选项
  const handleAddOption = () => {
    const nextKey = String.fromCharCode(65 + options.length); // A, B, C, D...
    setOptions([...options, { key: nextKey, text: '', score: isScored ? 0 : undefined }]);
  };

  // 删除选项
  const handleRemoveOption = (index: number) => {
    if (options.length <= 1) {
      message.warning('至少需要保留一个选项');
      return;
    }
    setOptions(options.filter((_, i) => i !== index));
  };

  // 更新选项文本
  const handleOptionTextChange = (index: number, text: string) => {
    const newOptions = [...options];
    newOptions[index].text = text;
    setOptions(newOptions);
  };

  // 更新选项分数
  const handleOptionScoreChange = (index: number, score: number | null) => {
    const newOptions = [...options];
    newOptions[index].score = score || 0;
    setOptions(newOptions);
  };

  // 切换计分模式
  const handleScoringToggle = (checked: boolean) => {
    setIsScored(checked);
    if (checked) {
      // 启用计分时，为所有选项设置默认分数
      const newOptions = options.map(opt => ({
        ...opt,
        score: opt.score !== undefined ? opt.score : 0
      }));
      setOptions(newOptions);
    } else {
      // 禁用计分时，移除分数字段
      const newOptions = options.map(opt => ({
        key: opt.key,
        text: opt.text
      }));
      setOptions(newOptions);
    }
  };

  // 表单提交处理
  const handleSubmit = async () => {
    try {
      // 验证表单基本字段
      const values = await form.validateFields();
      
      // 验证选项
      const questionType = values.question_type;
      if (questionType !== 'text') {
        const validOptions = options.filter(opt => opt.text.trim());
        if (validOptions.length < 2) {
          message.error('选择题至少需要2个有效选项');
          return;
        }
        
        // 如果启用计分，验证分数设置
        if (isScored) {
          const hasInvalidScore = validOptions.some(opt => 
            opt.score === undefined || opt.score === null || isNaN(opt.score)
          );
          if (hasInvalidScore) {
            message.error('启用计分时，所有选项都必须设置有效分数');
            return;
          }
        }
      }

      setLoading(true);

      // 构建选项数据
      let optionsData: Record<string, string | QuestionOption> = {};
      if (questionType !== 'text') {
        console.log('🔍 Options before processing:', options);
        
        optionsData = Object.fromEntries(
          options
            .filter(opt => opt.text.trim())
            .map(opt => {
              console.log(`🔍 Processing option: key="${opt.key}", text="${opt.text}"`);
              if (isScored && opt.score !== undefined) {
                // 计分模式：使用对象格式
                return [opt.key, { text: opt.text.trim(), score: opt.score }];
              } else {
                // 非计分模式：使用字符串格式（向后兼容）
                return [opt.key, opt.text.trim()];
              }
            })
        );
        
        console.log('🔍 OptionsData built:', optionsData);
      }

      // 构建提交数据
      const submitData: CreateQuestionForm = {
        title: values.title.trim(),
        question_type: values.question_type,
        options: optionsData,
        // 编辑模式使用现有顺序，新增模式由usePaperDetail自动计算
        question_order: question?.question_order || 0, // 新增时为0，由hook重新计算
        // 添加必填字段
        is_required: values.is_required !== false, // 默认为true
        is_scored: isScored, // 是否计分
      };

      console.log('🔍 Final submitData:', submitData);
      console.log('🔍 Final submitData.options:', submitData.options);

      await onSubmit(submitData);
      message.success(question ? '题目更新成功' : '题目创建成功');
      onCancel(); // 关闭模态框
    } catch (error) {
      console.error('题目操作失败:', error);
      message.error('操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={question ? '编辑题目' : '创建新题目'}
      open={visible}
      onCancel={onCancel}
      width={700}
      destroyOnHidden={true}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button
          key="submit"
          type="primary"
          loading={loading}
          onClick={handleSubmit}
        >
          {question ? '更新' : '创建'}
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        autoComplete="off"
      >
        {/* 题目标题 */}
        <Form.Item
          label="题目内容"
          name="title"
          rules={[
            { required: true, message: '请输入题目内容' },
            { min: 5, max: 200, message: '题目内容应在5-200字符之间' },
          ]}
        >
          <TextArea
            rows={3}
            placeholder="请输入题目内容，例如：最近一个月，你感到压力大吗？"
            showCount
            maxLength={200}
          />
        </Form.Item>

        {/* 题目类型 */}
        <Form.Item
          label="题目类型"
          name="question_type"
          rules={[{ required: true, message: '请选择题目类型' }]}
          initialValue="single_choice"
        >
          <Select placeholder="选择题目类型">
            <Option value="single_choice">单选题</Option>
            <Option value="multiple_choice">多选题</Option>
            <Option value="text">文本题</Option>
          </Select>
        </Form.Item>

        {/* 必填设置 */}
        <Form.Item
          name="is_required"
          valuePropName="checked"
          initialValue={true}
        >
          <Checkbox>
            <Text strong style={{ color: '#ff4d4f' }}>* </Text>
            <Text>此题目为必填题目</Text>
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
              （学生必须回答此题目才能提交）
            </Text>
          </Checkbox>
        </Form.Item>

        {/* 选项设置（仅选择题显示） */}
        <Form.Item noStyle shouldUpdate={(prev, curr) => prev.question_type !== curr.question_type}>
          {({ getFieldValue }) => {
            const questionType = getFieldValue('question_type');
            if (questionType === 'text') return null;

            return (
              <div>
                <Divider orientation="left">
                  <Text strong>选项设置</Text>
                </Divider>
                
                {/* 计分设置 */}
                <Card size="small" style={{ marginBottom: 16, background: '#f8f9fa' }}>
                  <Row align="middle" gutter={16}>
                    <Col>
                      <Text strong>计分设置：</Text>
                    </Col>
                    <Col>
                      <Switch
                        checked={isScored}
                        onChange={handleScoringToggle}
                        checkedChildren="启用计分"
                        unCheckedChildren="不计分"
                      />
                    </Col>
                    <Col flex="auto">
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {isScored 
                          ? '✅ 启用后可为每个选项设置分数，用于量表评分计算'
                          : '⚪ 关闭后此题目不参与总分计算，适用于背景信息收集'
                        }
                      </Text>
                    </Col>
                  </Row>
                </Card>
                
                {/* 选项列表 */}
                <Card size="small" style={{ marginBottom: 16 }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {options.map((option, index) => (
                      <Row key={index} gutter={8} align="middle">
                        <Col flex="none">
                          <Text strong style={{ minWidth: 20 }}>
                            {option.key}:
                          </Text>
                        </Col>
                        <Col flex="auto">
                          <Input
                            placeholder={`请输入选项${option.key}的内容`}
                            value={option.text}
                            onChange={(e) => handleOptionTextChange(index, e.target.value)}
                            maxLength={100}
                          />
                        </Col>
                        {isScored && (
                          <Col flex="none">
                            <Space>
                              <Text type="secondary">分数:</Text>
                              <InputNumber
                                min={0}
                                max={100}
                                value={option.score}
                                onChange={(value) => handleOptionScoreChange(index, value)}
                                placeholder="分数"
                                style={{ width: 80 }}
                              />
                            </Space>
                          </Col>
                        )}
                        <Col flex="none">
                          {options.length > 1 && (
                            <Button
                              type="text"
                              danger
                              size="small"
                              icon={<DeleteOutlined />}
                              onClick={() => handleRemoveOption(index)}
                              title="删除此选项"
                            />
                          )}
                        </Col>
                      </Row>
                    ))}
                  </Space>
                  
                  {options.length < 10 && (
                    <Button
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={handleAddOption}
                      style={{ width: '100%', marginTop: 8 }}
                    >
                      添加选项
                    </Button>
                  )}
                </Card>

                <Text type="secondary" style={{ fontSize: 12 }}>
                  提示：{questionType === 'single_choice' ? '单选题' : '多选题'}
                  至少需要2个选项，最多10个选项
                </Text>
              </div>
            );
          }}
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default QuestionModal;