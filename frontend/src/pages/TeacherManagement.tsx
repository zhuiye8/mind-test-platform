import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Input,
  Select,
  Space,
  Modal,
  Form,
  message,
  Popconfirm,
  Tag,
  Statistic,
  Row,
  Col,
  Avatar,
  Tooltip,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  KeyOutlined,
  UserOutlined,
  ReloadOutlined,
  CrownOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  StopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type {
  Teacher,
  TeacherStats,
  CreateTeacherRequest,
  UpdateTeacherRequest,
  ResetPasswordRequest,
} from '../services/api/teacherManagement';
import {
  getTeacherStats,
  getTeacherList,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  resetTeacherPassword,
} from '../services/api/teacherManagement';

const { Search } = Input;
const { Option } = Select;
const { Title } = Typography;

const TeacherManagement: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [stats, setStats] = useState<TeacherStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
    total: 0,
  });
  
  // 搜索和筛选状态
  const [searchValue, setSearchValue] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // 模态框状态
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [resetPasswordModalVisible, setResetPasswordModalVisible] = useState(false);
  const [currentTeacher, setCurrentTeacher] = useState<Teacher | null>(null);
  
  // 表单实例
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [resetPasswordForm] = Form.useForm();

  // 加载教师列表
  const loadTeachers = async (page = 1, pageSize = 10) => {
    setLoading(true);
    try {
      const response = await getTeacherList({
        page,
        limit: pageSize,
        search: searchValue,
        role: roleFilter,
        status: statusFilter,
      });
      
      setTeachers(response.data);
      setPagination({
        current: page,
        pageSize,
        total: response.pagination.total,
      });
    } catch (error) {
      console.error('加载教师列表失败:', error);
      message.error('加载教师列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载统计信息
  const loadStats = async () => {
    try {
      const statsData = await getTeacherStats();
      setStats(statsData);
    } catch (error) {
      console.error('加载统计信息失败:', error);
    }
  };

  // 初始化数据
  useEffect(() => {
    loadTeachers();
    loadStats();
  }, [searchValue, roleFilter, statusFilter]);

  // 创建教师
  const handleCreateTeacher = async (values: CreateTeacherRequest) => {
    try {
      await createTeacher(values);
      message.success('创建教师账户成功');
      setCreateModalVisible(false);
      createForm.resetFields();
      loadTeachers(pagination.current, pagination.pageSize);
      loadStats();
    } catch (error: any) {
      console.error('创建教师失败:', error);
      message.error(error.response?.data?.error || '创建教师账户失败');
    }
  };

  // 更新教师
  const handleUpdateTeacher = async (values: UpdateTeacherRequest) => {
    if (!currentTeacher) return;
    
    try {
      await updateTeacher(currentTeacher.id, values);
      message.success('更新教师信息成功');
      setEditModalVisible(false);
      editForm.resetFields();
      setCurrentTeacher(null);
      loadTeachers(pagination.current, pagination.pageSize);
      loadStats();
    } catch (error: any) {
      console.error('更新教师失败:', error);
      message.error(error.response?.data?.error || '更新教师信息失败');
    }
  };

  // 删除教师
  const handleDeleteTeacher = async (teacher: Teacher) => {
    try {
      await deleteTeacher(teacher.id);
      message.success('删除教师账户成功');
      loadTeachers(pagination.current, pagination.pageSize);
      loadStats();
    } catch (error: any) {
      console.error('删除教师失败:', error);
      message.error(error.response?.data?.error || '删除教师账户失败');
    }
  };

  // 重置密码
  const handleResetPassword = async (values: ResetPasswordRequest) => {
    if (!currentTeacher) return;
    
    try {
      await resetTeacherPassword(currentTeacher.id, values);
      message.success('重置密码成功');
      setResetPasswordModalVisible(false);
      resetPasswordForm.resetFields();
      setCurrentTeacher(null);
    } catch (error: any) {
      console.error('重置密码失败:', error);
      message.error(error.response?.data?.error || '重置密码失败');
    }
  };

  // 打开编辑模态框
  const handleEditClick = (teacher: Teacher) => {
    setCurrentTeacher(teacher);
    editForm.setFieldsValue({
      name: teacher.name,
      role: teacher.role,
      is_active: teacher.isActive,
    });
    setEditModalVisible(true);
  };

  // 打开重置密码模态框
  const handleResetPasswordClick = (teacher: Teacher) => {
    setCurrentTeacher(teacher);
    setResetPasswordModalVisible(true);
  };

  // 表格列定义
  const columns: ColumnsType<Teacher> = [
    {
      title: '教师信息',
      key: 'teacher',
      render: (_, record) => (
        <Space>
          <Avatar 
            icon={<UserOutlined />} 
            style={{ 
              backgroundColor: record.role === 'ADMIN' ? '#faad14' : '#1890ff' 
            }}
          />
          <div>
            <div style={{ fontWeight: 500 }}>{record.name}</div>
            <div style={{ color: '#666', fontSize: '12px' }}>ID: {record.teacherId}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag 
          icon={role === 'ADMIN' ? <CrownOutlined /> : <TeamOutlined />}
          color={role === 'ADMIN' ? 'gold' : 'blue'}
        >
          {role === 'ADMIN' ? '管理员' : '教师'}
        </Tag>
      ),
      filters: [
        { text: '管理员', value: 'ADMIN' },
        { text: '教师', value: 'TEACHER' },
      ],
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (
        <Tag 
          icon={isActive ? <CheckCircleOutlined /> : <StopOutlined />}
          color={isActive ? 'success' : 'error'}
        >
          {isActive ? '启用' : '禁用'}
        </Tag>
      ),
      filters: [
        { text: '启用', value: true },
        { text: '禁用', value: false },
      ],
    },
    {
      title: '数据统计',
      key: 'stats',
      render: (_, record) => (
        <div style={{ fontSize: '12px', color: '#666' }}>
          <div>试卷: {record._count?.papers || 0}</div>
          <div>考试: {record._count?.exams || 0}</div>
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleDateString(),
      sorter: true,
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Tooltip title="编辑">
            <Button 
              type="text" 
              icon={<EditOutlined />}
              onClick={() => handleEditClick(record)}
            />
          </Tooltip>
          <Tooltip title="重置密码">
            <Button 
              type="text" 
              icon={<KeyOutlined />}
              onClick={() => handleResetPasswordClick(record)}
            />
          </Tooltip>
          {record.role !== 'ADMIN' && (
            <Tooltip title="删除">
              <Popconfirm
                title="确定删除这个教师账户吗？"
                description="删除后无法恢复，请谨慎操作。"
                onConfirm={() => handleDeleteTeacher(record)}
                okText="确定"
                cancelText="取消"
              >
                <Button 
                  type="text" 
                  danger 
                  icon={<DeleteOutlined />}
                />
              </Popconfirm>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={2}>教师管理</Title>
      
      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic 
                title="总教师数" 
                value={stats.total_teachers} 
                prefix={<TeamOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="启用账户" 
                value={stats.active_teachers} 
                prefix={<CheckCircleOutlined />}
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="管理员" 
                value={stats.admin_count} 
                prefix={<CrownOutlined />}
                valueStyle={{ color: '#faad14' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="近7天新增" 
                value={stats.recently_created} 
                prefix={<PlusOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 操作栏 */}
      <Card style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle">
          <Col span={18}>
            <Space size="middle">
              <Search
                placeholder="搜索教师姓名或工号"
                style={{ width: 250 }}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onSearch={() => loadTeachers(1, pagination.pageSize)}
                enterButton={<SearchOutlined />}
              />
              <Select
                value={roleFilter}
                style={{ width: 120 }}
                onChange={setRoleFilter}
              >
                <Option value="all">全部角色</Option>
                <Option value="admin">管理员</Option>
                <Option value="teacher">教师</Option>
              </Select>
              <Select
                value={statusFilter}
                style={{ width: 120 }}
                onChange={setStatusFilter}
              >
                <Option value="all">全部状态</Option>
                <Option value="active">启用</Option>
                <Option value="inactive">禁用</Option>
              </Select>
              <Button 
                icon={<ReloadOutlined />}
                onClick={() => loadTeachers(pagination.current, pagination.pageSize)}
              >
                刷新
              </Button>
            </Space>
          </Col>
          <Col>
            <Button 
              type="primary" 
              icon={<PlusOutlined />}
              onClick={() => setCreateModalVisible(true)}
            >
              添加教师
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 教师列表表格 */}
      <Card>
        <Table
          columns={columns}
          dataSource={teachers}
          rowKey="id"
          loading={loading}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
            onChange: (page, pageSize) => {
              setPagination({ ...pagination, current: page, pageSize: pageSize || 10 });
              loadTeachers(page, pageSize || 10);
            },
          }}
        />
      </Card>

      {/* 创建教师模态框 */}
      <Modal
        title="添加教师"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          createForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateTeacher}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="teacher_id"
                label="教师工号"
                rules={[
                  { required: true, message: '请输入教师工号' },
                  { pattern: /^[A-Z0-9]+$/, message: '工号只能包含大写字母和数字' },
                ]}
              >
                <Input placeholder="如: T2025002" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="name"
                label="教师姓名"
                rules={[{ required: true, message: '请输入教师姓名' }]}
              >
                <Input placeholder="请输入教师姓名" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="password"
                label="初始密码"
                rules={[
                  { required: true, message: '请输入初始密码' },
                  { min: 6, message: '密码长度至少6位' },
                ]}
              >
                <Input.Password placeholder="请输入初始密码" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="role"
                label="角色"
                initialValue="TEACHER"
              >
                <Select>
                  <Option value="TEACHER">教师</Option>
                  <Option value="ADMIN">管理员</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setCreateModalVisible(false);
                createForm.resetFields();
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                创建
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* 编辑教师模态框 */}
      <Modal
        title="编辑教师信息"
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          editForm.resetFields();
          setCurrentTeacher(null);
        }}
        footer={null}
        width={600}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdateTeacher}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="教师姓名"
                rules={[{ required: true, message: '请输入教师姓名' }]}
              >
                <Input placeholder="请输入教师姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="role"
                label="角色"
                rules={[{ required: true, message: '请选择角色' }]}
              >
                <Select>
                  <Option value="TEACHER">教师</Option>
                  <Option value="ADMIN">管理员</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="password"
                label="新密码（选填）"
                rules={[
                  { min: 6, message: '密码长度至少6位' },
                ]}
              >
                <Input.Password placeholder="留空则不修改密码" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="is_active"
                label="账户状态"
                valuePropName="checked"
              >
                <Select>
                  <Option value={true}>启用</Option>
                  <Option value={false}>禁用</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setEditModalVisible(false);
                editForm.resetFields();
                setCurrentTeacher(null);
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* 重置密码模态框 */}
      <Modal
        title="重置密码"
        open={resetPasswordModalVisible}
        onCancel={() => {
          setResetPasswordModalVisible(false);
          resetPasswordForm.resetFields();
          setCurrentTeacher(null);
        }}
        footer={null}
        width={400}
      >
        <Form
          form={resetPasswordForm}
          layout="vertical"
          onFinish={handleResetPassword}
        >
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码长度至少6位' },
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setResetPasswordModalVisible(false);
                resetPasswordForm.resetFields();
                setCurrentTeacher(null);
              }}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                重置
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default TeacherManagement;