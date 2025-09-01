import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Select,
  Switch,
  DatePicker,
  InputNumber,
  Button,
  Space,
  Typography,
  App,
  Divider,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { paperApi, examApi } from '../services/api';
import type { Paper, CreateExamForm, Exam } from '../types';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const ExamCreate: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { examId } = useParams<{ examId?: string }>();
  const [form] = Form.useForm();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [hasTimeLimit, setHasTimeLimit] = useState(false);
  const [, setCurrentExam] = useState<Exam | null>(null);

  // 判断是否为编辑模式
  const isEditMode = Boolean(examId);

  useEffect(() => {
    loadPapers();
    if (isEditMode && examId) {
      loadExamData(examId);
    }
  }, [examId, isEditMode]);

  // 加载试卷列表
  const loadPapers = async () => {
    try {
      const response = await paperApi.getList();
      if (response.success && response.data) {
        setPapers(response.data);
      }
    } catch (error) {
      console.error('加载试卷列表失败:', error);
      message.error('加载试卷列表失败');
    }
  };

  // 加载考试数据（编辑模式）
  const loadExamData = async (examId: string) => {
    try {
      setLoading(true);
      const response = await examApi.getDetail(examId);
      if (response.success && response.data) {
        const exam = response.data;
        setCurrentExam(exam);

        // 设置状态
        const hasPassword = Boolean((exam as any).has_password);
        const hasTimeLimit = Boolean((exam as any).start_time || (exam as any).end_time);
        setHasPassword(hasPassword);
        setHasTimeLimit(hasTimeLimit);

        // 预填充表单数据  
        const formData: any = {
          // 使用后端统一的 snake_case 字段
          paper_id: (exam as any).paper_id,
          title: exam.title,
          duration_minutes: (exam as any).duration_minutes,
          shuffle_questions: (exam as any).shuffle_questions,
          allow_multiple_submissions: (exam as any).allow_multiple_submissions || false,
        };

        // 为避免泄露与哈希回显，不回填密码，仅根据 has_password 控制是否显示密码输入框

        const startTime = (exam as any).start_time;
        const endTime = (exam as any).end_time;
        if (hasTimeLimit && (startTime || endTime)) {
          const timeRange = [];
          if (startTime) timeRange.push(dayjs(startTime));
          if (endTime) timeRange.push(dayjs(endTime));
          if (timeRange.length === 1) {
            // 如果只有开始时间或结束时间，补充另一端
            timeRange.push(timeRange[0]);
          }
          formData.time_range = timeRange;
        }

        form.setFieldsValue(formData);
      }
    } catch (error) {
      console.error('加载考试数据失败:', error);
      message.error('加载考试数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 表单提交处理
  const handleSubmit = async (values: any) => {
    try {
      setLoading(true);

      // 构建提交数据
      const submitData: CreateExamForm = {
        paper_id: values.paper_id,
        title: values.title.trim(),
        duration_minutes: values.duration_minutes,
        shuffle_questions: values.shuffle_questions || false,
        allow_multiple_submissions: values.allow_multiple_submissions || false,
        password: hasPassword ? values.password?.trim() : undefined,
        start_time: hasTimeLimit && values.time_range?.[0]
          ? values.time_range[0].toISOString()
          : undefined,
        end_time: hasTimeLimit && values.time_range?.[1]
          ? values.time_range[1].toISOString()
          : undefined,
      };

      let response;
      if (isEditMode && examId) {
        // 编辑模式：调用更新API
        response = await examApi.update(examId, submitData);
        if (response.success) {
          message.success('考试更新成功！');
          // 根据来源页面状态决定返回路径
          if (location.state?.from === 'exam-list') {
            navigate('/exams', {
              state: {
                returnToLane: location.state.returnToLane,
                returnToPage: location.state.returnToPage
              }
            });
          } else {
            navigate('/exams');
          }
        } else {
          message.error(response.error || '考试更新失败');
        }
      } else {
        // 创建模式：调用创建API
        response = await examApi.create(submitData);
        if (response.success) {
          message.success('考试创建成功！当前为草稿状态，请在考试列表中发布考试。');
          navigate('/exams');
        } else {
          message.error(response.error || '考试创建失败');
        }
      }
    } catch (error) {
      console.error(isEditMode ? '更新考试失败:' : '创建考试失败:', error);
      message.error(isEditMode ? '更新考试失败，请重试' : '创建考试失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* 页面标题 */}
      <div style={{ marginBottom: 24 }}>
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => {
              if (location.state?.from === 'exam-list') {
                navigate('/exams', {
                  state: {
                    returnToLane: location.state.returnToLane,
                    returnToPage: location.state.returnToPage
                  }
                });
              } else {
                navigate('/exams');
              }
            }}
          >
            返回
          </Button>
          <Title level={2} style={{ margin: 0 }}>
            {isEditMode ? '编辑考试' : '创建考试'}
          </Title>
        </Space>
      </div>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
          initialValues={{
            duration_minutes: 30,
            shuffle_questions: false,
            allow_multiple_submissions: false,
          }}
        >
          {/* 基本信息 */}
          <Divider orientation="left">基本信息</Divider>

          <Form.Item
            label="选择试卷"
            name="paper_id"
            rules={[{ required: true, message: '请选择试卷' }]}
          >
            <Select
              placeholder="选择要发布的试卷"
              showSearch
              optionFilterProp="children"
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {papers.map(paper => (
                <Select.Option key={paper.id} value={paper.id} label={paper.title}>
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      {paper.title}
                      <Text type="secondary" style={{ fontSize: 12 }}> | <span></span>
                      {paper.question_count} 道题 | {paper.description || '暂无描述'}
                    </Text></div>
                  </div>
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="考试标题"
            name="title"
            rules={[
              { required: true, message: '请输入考试标题' },
              { min: 2, max: 100, message: '考试标题应在2-100字符之间' }
            ]}
          >
            <Input
              placeholder="为这次考试起一个标题，例如：2025年春季心理健康普查"
              maxLength={100}
              showCount
            />
          </Form.Item>

          <Form.Item
            label="考试时长（分钟）"
            name="duration_minutes"
            rules={[
              { required: true, message: '请设置考试时长' },
              { type: 'number', min: 1, max: 480, message: '考试时长应在1-480分钟之间' }
            ]}
          >
            <InputNumber
              style={{ width: 200 }}
              placeholder="30"
              addonAfter="分钟"
              min={1}
              max={480}
            />
          </Form.Item>

          {/* 高级设置 */}
          <Divider orientation="left">高级设置</Divider>

          <Form.Item
            label="题目顺序"
            name="shuffle_questions"
            valuePropName="checked"
          >
            <Switch
              checkedChildren="随机打乱"
              unCheckedChildren="按序显示"
            />
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
              开启后，每个学生看到的题目顺序都不同
            </Text>
          </Form.Item>

          <Form.Item
            label="重复提交"
            name="allow_multiple_submissions"
            valuePropName="checked"
          >
            <Switch
              checkedChildren="允许多次"
              unCheckedChildren="仅限一次"
            />
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
              开启后，学生可以多次提交考试答案
            </Text>
          </Form.Item>

          {/* 密码保护 */}
          <Form.Item label="密码保护">
            <Switch
              checked={hasPassword}
              onChange={setHasPassword}
              checkedChildren="需要密码"
              unCheckedChildren="无需密码"
            />
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
              开启后，学生需要输入密码才能参加考试
            </Text>
          </Form.Item>

          {hasPassword && (
            <Form.Item
              label="考试密码"
              name="password"
              rules={[
                { required: true, message: '请设置考试密码' },
                { min: 4, max: 20, message: '密码长度应在4-20字符之间' }
              ]}
            >
              <Input.Password
                placeholder="设置考试密码"
                maxLength={20}
                style={{ width: 300 }}
              />
            </Form.Item>
          )}

          {/* 时间限制 */}
          <Form.Item label="时间限制">
            <Switch
              checked={hasTimeLimit}
              onChange={setHasTimeLimit}
              checkedChildren="限定时间"
              unCheckedChildren="不限时间"
            />
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
              开启后，只有在指定时间段内才能参加考试
            </Text>
          </Form.Item>

          {hasTimeLimit && (
            <Form.Item
              label="考试时间段"
              name="time_range"
              rules={[
                { required: true, message: '请选择考试时间段' },
              ]}
            >
              <RangePicker
                showTime
                format="YYYY-MM-DD HH:mm"
                placeholder={['开始时间', '结束时间']}
                style={{ width: 400 }}
                disabledDate={(current) => {
                  // 禁用过去的日期
                  return current && current < dayjs().startOf('day');
                }}
              />
            </Form.Item>
          )}

          {/* 提交按钮 */}
          <Form.Item style={{ marginTop: 32 }}>
            <Space>
              <Button onClick={() => {
                if (location.state?.from === 'exam-list') {
                  navigate('/exams', {
                    state: {
                      returnToLane: location.state.returnToLane,
                      returnToPage: location.state.returnToPage
                    }
                  });
                } else {
                  navigate('/exams');
                }
              }}>
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                icon={<SaveOutlined />}
              >
                {isEditMode ? '保存修改' : '创建考试'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default ExamCreate;
