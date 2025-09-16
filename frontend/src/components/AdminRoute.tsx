import React from 'react';
import { Navigate } from 'react-router-dom';
import { Result, Button } from 'antd';
import { isAdmin } from '../utils/auth';

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const userIsAdmin = isAdmin();

  if (!userIsAdmin) {
    return (
      <Result
        status="403"
        title="403"
        subTitle="抱歉，您没有权限访问这个页面。只有管理员才能使用此功能。"
        extra={
          <Button type="primary" onClick={() => window.history.back()}>
            返回
          </Button>
        }
      />
    );
  }

  return <>{children}</>;
};

export default AdminRoute;