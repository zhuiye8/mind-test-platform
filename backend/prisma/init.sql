-- PostgreSQL数据库初始化脚本
-- 心理测试平台数据库初始化

-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 设置时区
SET timezone = 'Asia/Shanghai';

-- 创建索引优化
-- 这些索引将在Prisma migrate时自动创建，此处仅作为文档记录

-- 数据库初始化完成标志
SELECT 'PostgreSQL数据库初始化完成' as message;