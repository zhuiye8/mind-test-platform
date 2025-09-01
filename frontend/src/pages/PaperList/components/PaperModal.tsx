import React from 'react';
import { Modal, Divider, Form, Input, Alert, Space, Button } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import type { Paper, CreatePaperForm } from '../../../types';

const { TextArea } = Input;

type Props = {
  open: boolean;
  editingPaper: Paper | null;
  onCancel: () => void;
  onSubmit: (values: CreatePaperForm) => Promise<void> | void;
};

// 创建/编辑试卷模态框（包含表单）
const PaperModal: React.FC<Props> = ({ open, editingPaper, onCancel, onSubmit }) => {
  const [form] = Form.useForm<CreatePaperForm>();

  // 打开时填充表单
  React.useEffect(() => {
    if (editingPaper) {
      form.setFieldsValue({ title: editingPaper.title, description: editingPaper.description || '' });
    } else {
      form.resetFields();
    }
  }, [open, editingPaper]);

  const handleFinish = async (values: CreatePaperForm) => {
    await onSubmit(values);
    form.resetFields();
  };

  return (
    <Modal
      title={
        <div className="flex items-center space-x-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg" style={{ background: 'var(--gradient-primary)' }}>
            <FileTextOutlined className="text-white text-lg" />
          </div>
          <div>
            <div className="text-lg font-semibold">{editingPaper ? '编辑试卷' : '创建试卷'}</div>
            <div className="text-sm text-neutral-500 font-normal">{editingPaper ? '修改试卷基本信息' : '创建新的心理测试试卷'}</div>
          </div>
        </div>
      }
      open={open}
      onCancel={onCancel}
      footer={null}
      width={680}
      className="modern-modal"
      destroyOnClose={true}
    >
      <Divider className="my-6" />
      <Form form={form} layout="vertical" onFinish={handleFinish} autoComplete="off">
        <Form.Item
          label="试卷名称"
          name="title"
          rules={[
            { required: true, message: '请输入试卷名称' },
            { min: 2, max: 100, message: '试卷名称长度应在2-100字符之间' },
          ]}
        >
          <Input placeholder="例如：大学生心理健康测评问卷" size="large" />
        </Form.Item>
        <Form.Item label="试卷描述" name="description" rules={[{ max: 500, message: '描述不能超过500字符' }]}>
          <TextArea rows={4} placeholder="请简要描述试卷的用途、测评目标等（可选）" />
        </Form.Item>
        <Alert
          message="温馨提示"
          description="创建试卷后，您可以进入题目管理页面添加具体的测评题目。建议先明确测评目标，再设计相应的题目内容。"
          type="info"
          showIcon
          className="mb-6"
        />
        <Form.Item className="mb-0 text-right">
          <Space size="middle">
            <Button size="large" onClick={onCancel}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" size="large" className="px-8">
              {editingPaper ? '保存修改' : '创建试卷'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default PaperModal;

