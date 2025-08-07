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
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Question, CreateQuestionForm } from '../types';

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
  const [options, setOptions] = useState<{ key: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // 当模态框打开或题目变更时，初始化表单数据
  useEffect(() => {
    if (visible) {
      if (question) {
        // 编辑模式：填充现有题目数据
        form.setFieldsValue({
          title: question.title,
          question_type: question.question_type,
        });
        
        // 转换选项格式
        const optionsList = Object.entries(question.options || {}).map(([key, value]) => ({
          key,
          value,
        }));
        setOptions(optionsList);
      } else {
        // 创建模式：重置表单和选项
        form.resetFields();
        setOptions([{ key: 'A', value: '' }]);
      }
    }
  }, [visible, question, form]);

  // 添加新选项
  const handleAddOption = () => {
    const nextKey = String.fromCharCode(65 + options.length); // A, B, C, D...
    setOptions([...options, { key: nextKey, value: '' }]);
  };

  // 删除选项
  const handleRemoveOption = (index: number) => {
    if (options.length <= 1) {
      message.warning('至少需要保留一个选项');
      return;
    }
    setOptions(options.filter((_, i) => i !== index));
  };

  // 更新选项值
  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index].value = value;
    setOptions(newOptions);
  };

  // 表单提交处理
  const handleSubmit = async () => {
    try {
      // 验证表单基本字段
      const values = await form.validateFields();
      
      // 验证选项
      const questionType = values.question_type;
      if (questionType !== 'text') {
        const validOptions = options.filter(opt => opt.value.trim());
        if (validOptions.length < 2) {
          message.error('选择题至少需要2个有效选项');
          return;
        }
      }

      setLoading(true);

      // 构建提交数据
      const submitData: CreateQuestionForm = {
        title: values.title.trim(),
        question_type: values.question_type,
        options: questionType === 'text' ? {} : Object.fromEntries(
          options
            .filter(opt => opt.value.trim())
            .map(opt => [opt.key, opt.value.trim()])
        ),
        // 如果是编辑模式，使用现有顺序；如果是新建，使用默认顺序
        question_order: question?.question_order || 1,
      };

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
                
                <Card size="small" style={{ marginBottom: 16 }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    {options.map((option, index) => (
                      <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text strong style={{ minWidth: 20 }}>
                          {option.key}:
                        </Text>
                        <Input
                          placeholder={`请输入选项${option.key}的内容`}
                          value={option.value}
                          onChange={(e) => handleOptionChange(index, e.target.value)}
                          style={{ flex: 1 }}
                          maxLength={100}
                        />
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
                      </div>
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