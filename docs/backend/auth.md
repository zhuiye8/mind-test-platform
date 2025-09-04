# 认证模块

## 涉及文件
- `/backend/src/controllers/authController.ts` - 认证控制器
- `/backend/src/middleware/auth.ts` - JWT认证中间件
- `/backend/src/utils/password.ts` - 密码加密工具
- `/backend/src/utils/jwt.ts` - JWT token工具

## 数据库
- **teachers表**: teacherId(工号), name(姓名), passwordHash(密码哈希), createdAt, updatedAt

## 主要接口
- `POST /api/auth/login` → `{token: string, teacher: {id, name, teacher_id}}`
- `GET /api/auth/verify` → `{teacher: TeacherInfo}` (需认证)

## 核心功能
- 教师工号密码登录验证
- JWT token生成和验证
- 密码bcrypt加密存储
- 中间件自动token验证
- 教师信息查询和权限检查

## 注意事项
- 密码不明文存储，使用bcrypt哈希
- JWT token包含teacherId和id字段
- 中间件扩展Express.Request接口注入teacher信息
- 登录失败统一返回"工号或密码错误"防止用户枚举