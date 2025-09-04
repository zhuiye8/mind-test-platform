# 认证页面模块

## 涉及文件
- `/frontend/src/pages/Login.tsx` - 教师登录页面
- `/frontend/src/utils/auth.ts` - 认证工具函数

## 数据流
- localStorage存储: auth_token, teacher_info
- API调用: `POST /api/auth/login` → `{token, teacher}`

## 主要功能
- 教师工号密码登录表单
- CapsLock检测和提示
- 表单验证（工号3位+密码6位）
- Token和用户信息本地存储
- 品牌展示和几何图案装饰

## 认证工具函数
- `setAuthToken/getAuthToken` - Token管理
- `setTeacherInfo/getTeacherInfo` - 用户信息管理  
- `isAuthenticated` - 登录状态检查
- `removeAuthToken` - 退出登录清理

## 注意事项
- 响应式设计适配移动端
- 无障碍访问支持(aria-live)
- 自定义CSS样式login.css
- 登录成功跳转到/dashboard