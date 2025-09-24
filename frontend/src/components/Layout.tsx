import React, { useState } from 'react';
import { Layout as AntLayout, Menu, Button, Avatar, Dropdown, Space, Typography, Breadcrumb } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined,
  FileTextOutlined,
  ExperimentOutlined,
  BarChartOutlined,
  MonitorOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BugOutlined,
  ExperimentOutlined as TestOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { removeAuthToken, getTeacherInfo, isAdmin } from '../utils/auth';
import '../styles/layout.css';
import brain from '../assets/brain.svg';

const { Header, Sider, Content } = AntLayout;
const { Text } = Typography;

const Layout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const teacherInfo = getTeacherInfo();
  const [userRole, setUserRole] = useState<string | null>(null);
  
  // 监听用户信息变化
  React.useEffect(() => {
    const currentTeacher = getTeacherInfo();
    setUserRole(currentTeacher?.role || null);
  }, [location.pathname]); // 路径变化时重新检查用户信息

  // 根据当前路径生成面包屑（仅展示，不改变任何路由逻辑）
  const getBreadcrumbItems = (pathname: string) => {
    // 将 /exams/123/edit => ['exams','123','edit']
    const segments = pathname.split('/').filter(Boolean);
    const items: { title: React.ReactNode }[] = [];

    const first = segments[0] || 'dashboard';
    const firstMap: Record<string, string> = {
      dashboard: '仪表板',
      papers: '试卷管理',
      exams: '考试管理',
      'teacher-management': '教师管理',
      // analytics: '数据分析',
      monitor: '流媒体监测',
      'monitor-v2': '流媒体监测V2',
      'stream-test': '连接测试',
    };
    const firstTitle = firstMap[first] || '仪表板';
    items.push({ title: firstTitle });

    // 第二、第三级：仅作语义展示
    if (segments[1]) {
      const second = segments[1];
      if (first === 'exams') {
        if (second === 'create') {
          items.push({ title: '创建' });
        } else if (second === 'archive') {
          items.push({ title: '归档' });
        } else {
          items.push({ title: '考试详情' });
          if (segments[2] === 'edit') {
            items.push({ title: '编辑' });
          }
        }
      } else if (first === 'papers') {
        items.push({ title: '试卷详情' });
      }
    }

    return items;
  };

  // 菜单项配置
  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表板',
    },
    {
      key: '/papers',
      icon: <FileTextOutlined />,
      label: '试卷管理',
    },
    {
      key: '/exams',
      icon: <ExperimentOutlined />,
      label: '考试管理',
    },
    // 只有管理员才能看到教师管理菜单
    // ...(userRole === 'ADMIN' ? [{
    //   key: '/teacher-management',
    //   icon: <TeamOutlined />,
    //   label: '教师管理',
    // }] : []),
    // {
    //   key: '/analytics',
    //   icon: <BarChartOutlined />,
    //   label: '数据分析',
    // },
    // {
    //   key: '/monitor',
    //   icon: <MonitorOutlined />,
    //   label: '流媒体监测',
    // },
    // {
    //   key: '/monitor-v2',
    //   icon: <MonitorOutlined />,
    //   label: '流媒体监测V2',
    // },
    // {
    //   key: '/stream-test',
    //   icon: <BugOutlined />,
    //   label: '连接测试',
    // },
  ];


  // 用户下拉菜单
  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => {
        removeAuthToken();
        navigate('/login');
      },
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };


  return (
    <AntLayout style={{ height: '100vh', overflow: 'hidden' }}>
      {/* 侧边栏 */}
      <Sider
        className="app-sider"
        trigger={null}
        collapsible
        collapsed={collapsed}
        style={{
          background: '#fff',
          boxShadow: '2px 0 6px rgba(0, 21, 41, 0.08)',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          height: '100vh',
          zIndex: 100,
        }}
      >
        {/* Logo区域 */}
        <div className={`app-logo ${collapsed ? 'is-collapsed' : ''}`}>
          <img className="app-logo-icon" src={brain} alt="心理学" />
          {!collapsed && (
            <Text strong className="app-logo-text">心理测试平台</Text>
          )}
        </div>

        {/* 导航菜单 */}
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ border: 'none' }}
        />
      </Sider>

      <AntLayout className="app-layout-main" style={{ marginLeft: collapsed ? 80 : 200, height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* 顶部栏 */}
        <Header className="app-header" style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
          position: 'fixed',
          top: 0,
          right: 0,
          left: collapsed ? 80 : 200,
          zIndex: 99,
          transition: 'left 0.2s ease',
        }}>
          <div className="app-header-left">
            {/* 折叠按钮 */}
            <Button
              className="app-collapse-btn"
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16 }}
            />
            {/* 面包屑 */}
            <Breadcrumb className="app-breadcrumb" items={getBreadcrumbItems(location.pathname)} />
          </div>

          {/* 用户信息 */}
          <Space>
            <Text>欢迎，{teacherInfo?.name || '教师'}</Text>
            <Dropdown
              menu={{ items: userMenuItems }}
              placement="bottomRight"
            >
              <Avatar
                className="app-avatar"
                icon={<UserOutlined />}
                style={{
                  backgroundColor: '#1890ff',
                  cursor: 'pointer'
                }}
              />
            </Dropdown>
          </Space>
        </Header>

        {/* 主内容区 */}
        <Content className="app-content" style={{
          flex: 1,
          marginTop: 64,
          padding: 24,
          background: '#f5f5f5',
          overflow: 'hidden',
          height: 'calc(100vh - 64px)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div className="app-content-inner modern-page-enter" style={{
            background: '#fff',
            borderRadius: 8,
            padding: 24,
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <Outlet />
          </div>
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;