# 布局框架模块

## 涉及文件
- `/frontend/src/components/Layout.tsx` - 全局布局组件
- `/frontend/src/components/FullScreenLoading.tsx` - 全屏加载组件
- `/frontend/src/styles/layout.css` - 布局样式
- `/frontend/src/assets/brain.svg` - 品牌logo

## 布局结构
- **Sider**: Logo + 主导航菜单(支持折叠)
- **Header**: 折叠按钮 + 面包屑 + 用户信息
- **Content**: Outlet渲染子页面

## 导航菜单
- /dashboard - 仪表板  
- /papers - 试卷管理
- /exams - 考试管理
- /analytics - 数据分析

## 核心功能
- 响应式侧边栏(支持折叠动画)
- 自动面包屑生成
- 用户信息管理(从localStorage)
- 退出登录功能
- 品牌Logo展示

## 注意事项
- 固定定位布局，高度100vh
- 支持折叠动画和阴影效果
- 现代化视觉设计
- 无障碍访问支持