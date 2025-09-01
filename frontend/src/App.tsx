import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

// 导入主题系统
import { antdTheme } from './styles/theme';
import './styles/global.css';
import './styles/antd-overrides.css';
import './styles/animations.css';

// 页面组件
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PaperList from './pages/PaperList';
import PaperDetail from './pages/PaperDetail';
import ExamList from './pages/ExamList';
import ExamDetail from './pages/ExamDetail';
import ExamCreate from './pages/ExamCreate';
import ExamArchive from './pages/ExamArchive';
import Analytics from './pages/Analytics';
import ParticipantExam from './pages/ParticipantExam';
import Layout from './components/Layout';

// 工具函数
import { isAuthenticated } from './utils/auth';

// 设置dayjs中文语言
dayjs.locale('zh-cn');

// message配置现在通过App组件的messageConfig prop设置

// 私有路由组件
const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return isAuthenticated() ? <>{children}</> : <Navigate to="/login" replace />;
};

const App: React.FC = () => {
  return (
    <ConfigProvider 
      locale={zhCN}
      theme={antdTheme}
    >
      <AntApp 
        message={{
          top: 80,
          duration: 3,
          maxCount: 3
        }}
      >
        <Router>
          <Routes>
            {/* 公开路由 */}
            <Route path="/login" element={<Login />} />
            <Route path="/exam/:examUuid" element={<ParticipantExam />} />
            
            {/* 私有路由 */}
            <Route path="/" element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="papers" element={<PaperList />} />
              <Route path="papers/:paperId" element={<PaperDetail />} />
              <Route path="exams" element={<ExamList />} />
              <Route path="exams/create" element={<ExamCreate />} />
              <Route path="exams/archive" element={<ExamArchive />} />
              <Route path="exams/:examId" element={<ExamDetail />} />
              <Route path="exams/:examId/edit" element={<ExamCreate />} />
              <Route path="analytics" element={<Analytics />} />
            </Route>

            {/* 404重定向 */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Router>
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
