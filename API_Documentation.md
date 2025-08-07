# 心理测试平台 API 文档

## 概述

基础 URL: `http://localhost:3001/api`

所有响应格式：
```json
{
  "success": true|false,
  "data": {},
  "error": null|string
}
```

## 认证

使用 JWT Bearer Token 认证。在请求头中添加：
```
Authorization: Bearer <token>
```

---

## 1. 认证相关接口 `/auth`

### 1.1 教师登录
- **POST** `/auth/login`
- **描述**: 教师登录获取 JWT token
- **无需认证**
- **请求体**:
  ```json
  {
    "teacher_id": "string",  // 教师工号
    "password": "string"      // 密码
  }
  ```
- **响应**:
  ```json
  {
    "success": true,
    "data": {
      "token": "string",
      "teacher": {
        "id": "uuid",
        "name": "string",
        "teacher_id": "string"
      }
    }
  }
  ```

### 1.2 验证认证状态
- **GET** `/auth/verify`
- **描述**: 验证当前 token 有效性
- **需要认证**: ✅
- **响应**:
  ```json
  {
    "success": true,
    "data": {
      "teacher": {
        "id": "uuid",
        "name": "string",
        "teacher_id": "string",
        "created_at": "datetime",
        "updated_at": "datetime"
      }
    }
  }
  ```

---

## 2. 试卷管理接口 `/teacher/papers`

**🆕 新增批量操作功能**
- 题目批量创建、更新、删除
- 题目批量导入（支持多种格式）
- 题目批量排序调整
- 题目依赖关系图分析
- 条件逻辑验证

### 2.1 创建试卷
- **POST** `/teacher/papers`
- **需要认证**: ✅
- **请求体**:
  ```json
  {
    "title": "string",           // 试卷标题
    "description": "string|null"  // 试卷描述（可选）
  }
  ```

### 2.2 获取试卷列表
- **GET** `/teacher/papers`
- **需要认证**: ✅
- **响应**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "uuid",
        "title": "string",
        "description": "string|null",
        "question_count": "number",
        "exam_count": "number",
        "created_at": "datetime",
        "updated_at": "datetime"
      }
    ]
  }
  ```

### 2.3 获取试卷详情
- **GET** `/teacher/papers/:paperId`
- **需要认证**: ✅
- **响应**:
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "title": "string",
      "description": "string|null",
      "exam_count": "number",
      "questions": [
        {
          "id": "uuid",
          "question_order": "number",
          "title": "string",
          "options": {
            "A": "string",
            "B": "string",
            "C": "string",
            "D": "string"
          },
          "question_type": "single_choice|multiple_choice|text",
          "display_condition": {
            "question_id": "uuid",
            "selected_option": "string"
          } | null
        }
      ],
      "created_at": "datetime",
      "updated_at": "datetime"
    }
  }
  ```

### 2.4 更新试卷
- **PUT** `/teacher/papers/:paperId`
- **需要认证**: ✅
- **请求体**:
  ```json
  {
    "title": "string",
    "description": "string|null"
  }
  ```

### 2.5 删除试卷
- **DELETE** `/teacher/papers/:paperId`
- **需要认证**: ✅
- **备注**: 如果试卷已被用于考试，无法删除

---

## 3. 题目管理接口 `/teacher/papers/:paperId/questions`

### 3.1 创建题目
- **POST** `/teacher/papers/:paperId/questions`
- **需要认证**: ✅
- **请求体**:
  ```json
  {
    "question_order": "number",
    "title": "string",
    "options": {
      "A": "string",
      "B": "string",
      "C": "string",
      "D": "string"
    },
    "question_type": "single_choice|multiple_choice|text",
    "display_condition": {
      "question_id": "uuid",
      "selected_option": "string"
    } | null
  }
  ```

### 3.2 更新题目
- **PUT** `/teacher/questions/:questionId`
- **需要认证**: ✅
- **请求体**: 同创建题目

### 3.3 删除题目
- **DELETE** `/teacher/questions/:questionId`
- **需要认证**: ✅

### 3.4 批量创建题目
- **POST** `/teacher/papers/:paperId/questions/batch`
- **需要认证**: ✅
- **状态**: 🚧 待实现

### 3.5 批量更新题目顺序
- **PUT** `/teacher/papers/:paperId/questions/reorder`
- **需要认证**: ✅
- **状态**: 🚧 待实现

---

## 4. 考试管理接口 `/teacher/exams`

### 4.1 创建考试
- **POST** `/teacher/exams`
- **需要认证**: ✅
- **请求体**:
  ```json
  {
    "paper_id": "uuid",
    "title": "string",
    "duration_minutes": "number",
    "start_time": "datetime|null",
    "end_time": "datetime|null",
    "password": "string|null",
    "shuffle_questions": "boolean"
  }
  ```
- **响应**:
  ```json
  {
    "success": true,
    "data": {
      "id": "uuid",
      "public_uuid": "uuid",
      "title": "string",
      "paper_title": "string",
      "duration_minutes": "number",
      "question_count": "number",
      "start_time": "datetime|null",
      "end_time": "datetime|null",
      "has_password": "boolean",
      "shuffle_questions": "boolean",
      "status": "draft|published|expired",
      "public_url": "string",
      "created_at": "datetime",
      "updated_at": "datetime"
    }
  }
  ```

### 4.2 获取考试列表（支持分页）
- **GET** `/teacher/exams`
- **需要认证**: ✅
- **查询参数**:
  - `page`: 页码（默认 1）
  - `limit`: 每页数量（默认 20，最大 100）
  - `cursor`: 游标（用于游标分页）
  - `sortField`: 排序字段（默认 updatedAt）
  - `sortOrder`: 排序顺序（asc|desc，默认 desc）
- **响应**:
  ```json
  {
    "success": true,
    "data": {
      "data": [...],
      "pagination": {
        "strategy": "cursor|offset",
        "limit": "number",
        "hasNext": "boolean",
        "hasPrev": "boolean",
        "nextCursor": "string|undefined",
        "totalPages": "number|undefined",
        "currentPage": "number|undefined"
      },
      "meta": {
        "totalCount": "number|undefined",
        "strategy": "cursor|offset"
      }
    }
  }
  ```

### 4.3 获取考试详情
- **GET** `/teacher/exams/:examId`
- **需要认证**: ✅

### 4.4 更新考试
- **PUT** `/teacher/exams/:examId`
- **需要认证**: ✅
- **请求体**: 同创建考试（所有字段可选）

### 4.5 删除考试
- **DELETE** `/teacher/exams/:examId`
- **需要认证**: ✅
- **备注**: 如果有提交结果，无法删除

### 4.6 切换考试发布状态
- **POST** `/teacher/exams/:examId/toggle-publish`
- **需要认证**: ✅

### 4.7 获取考试结果（支持分页）
- **GET** `/teacher/exams/:examId/results`
- **需要认证**: ✅
- **查询参数**: 同考试列表

### 4.8 获取单个考试结果详情
- **GET** `/teacher/exams/:examId/results/:resultId`
- **需要认证**: ✅

### 4.9 导出考试结果（CSV）
- **GET** `/teacher/exams/:examId/export`
- **需要认证**: ✅
- **响应**: CSV 文件

### 4.10 批量导出考试结果
- **POST** `/teacher/exams/batch-export`
- **需要认证**: ✅
- **请求体**:
  ```json
  {
    "exam_ids": ["uuid", "uuid"]
  }
  ```
- **响应**: CSV 文件

---

## 5. 公开接口（学生端） `/public`

### 5.1 获取考试信息和题目
- **GET** `/public/exams/:publicUuid`
- **无需认证**
- **查询参数**:
  - `password`: 考试密码（如需要）
- **响应**:
  ```json
  {
    "success": true,
    "data": {
      "title": "string",
      "description": "string|null",
      "duration_minutes": "number",
      "password_required": "boolean",
      "questions": [
        {
          "id": "uuid",
          "question_order": "number",
          "title": "string",
          "options": {},
          "question_type": "string",
          "display_condition": {} | null
        }
      ]
    }
  }
  ```

### 5.2 验证考试密码
- **POST** `/public/exams/:publicUuid/verify`
- **无需认证**
- **请求体**:
  ```json
  {
    "password": "string"
  }
  ```

### 5.3 提交考试答案
- **POST** `/public/exams/:publicUuid/submit`
- **无需认证**
- **请求体**:
  ```json
  {
    "student_id": "string",     // 学号
    "student_name": "string",   // 姓名
    "answers": {
      "question_id": "answer",
      "question_id": "answer"
    }
  }
  ```
- **响应**:
  ```json
  {
    "success": true,
    "data": {
      "result_id": "uuid",
      "score": "number",
      "message": "string",
      "submitted_at": "datetime"
    }
  }
  ```

---

## 6. 分析数据接口 `/teacher/analytics`

### 6.1 获取教师分析数据
- **GET** `/teacher/analytics`
- **需要认证**: ✅
- **查询参数**:
  - `timeRange`: 时间范围（7d|30d|90d|1y，默认 30d）
- **响应**:
  ```json
  {
    "success": true,
    "data": {
      "overall_stats": {
        "total_exams": "number",
        "total_participants": "number",
        "total_papers": "number",
        "avg_completion_rate": "number",
        "most_popular_exam": {
          "title": "string",
          "participant_count": "number"
        } | null
      },
      "monthly_trends": [
        {
          "month": "YYYY-MM",
          "exams_created": "number",
          "participants": "number",
          "completion_rate": "number"
        }
      ],
      "exam_performance": [
        {
          "exam_id": "uuid",
          "exam_title": "string",
          "paper_title": "string",
          "participant_count": "number",
          "completion_rate": "number",
          "avg_score": "number",
          "avg_duration": "number",
          "created_at": "datetime"
        }
      ]
    }
  }
  ```

---

## 待开发功能

### 高优先级
1. ⚠️ **批量题目管理**
   - 批量创建题目
   - 批量更新题目顺序
   - 批量删除题目
   - 题目导入/导出（Excel/CSV）

2. ⚠️ **复杂条件逻辑**
   - AND/OR 组合条件
   - 循环依赖检测
   - 条件预览

3. ⚠️ **实时进度追踪**
   - WebSocket 实时更新
   - 考试进度监控
   - 在线人数统计

### 中优先级
4. 📊 **高级分析功能**
   - 题目难度分析
   - 答题分布统计
   - 学生群体分析
   - 自定义报表

5. 🔒 **权限管理**
   - 多级教师权限
   - 部门管理
   - 审核流程

6. 📱 **通知系统**
   - 考试提醒
   - 结果通知
   - 邮件/短信集成

### 低优先级
7. 🎨 **模板市场**
   - 共享试卷模板
   - 标准心理量表
   - 模板评分系统

8. 🔄 **版本控制**
   - 试卷版本历史
   - 变更追踪
   - 回滚功能

9. 🌐 **多语言支持**
   - 国际化接口
   - 多语言试卷
   - 自动翻译

---

## 注意事项

1. **缓存已移除**: 所有缓存操作已被移除，数据直接从数据库查询，确保实时性
2. **分页策略**: 系统会根据数据量自动选择游标分页或偏移分页
3. **并发限制**: 建议使用连接池管理数据库连接
4. **安全考虑**: 
   - 所有教师端接口需要 JWT 认证
   - 学生提交有防重复机制
   - IP 地址记录用于审计

---

## 🆕 7. 增强条件逻辑接口 `/teacher/papers` (第二阶段)

### 7.1 获取条件逻辑模板
- **GET** `/teacher/papers/condition-templates`
- **需要认证**: ✅
- **描述**: 获取常用条件逻辑模板和心理测试预设
- **响应**:
  ```json
  {
    "success": true,
    "data": {
      "templates": {
        "common_patterns": [...],
        "psychological_patterns": [...]
      }
    }
  }
  ```

### 7.2 条件逻辑预览
- **POST** `/teacher/papers/:paperId/condition-preview`
- **需要认证**: ✅
- **描述**: 模拟不同答案组合下的题目显示情况
- **请求体**:
  ```json
  {
    "simulation_answers": {
      "question_id_1": "A",
      "question_id_2": "B"
    }
  }
  ```

### 7.3 批量设置条件逻辑
- **PUT** `/teacher/papers/conditions/batch-set`
- **需要认证**: ✅
- **描述**: 批量为多个题目设置条件逻辑
- **请求体**:
  ```json
  {
    "condition_settings": [
      {
        "question_id": "uuid",
        "display_condition": {
          "operator": "AND",
          "conditions": [
            {"question_id": "q1", "selected_option": "A"},
            {
              "operator": "OR",
              "conditions": [
                {"question_id": "q2", "selected_option": "B"},
                {"question_id": "q3", "selected_option": "C"}
              ]
            }
          ]
        }
      }
    ]
  }
  ```

### 7.4 导出条件逻辑配置
- **GET** `/teacher/papers/:paperId/conditions/export`
- **需要认证**: ✅
- **描述**: 导出试卷的条件逻辑配置为JSON格式

### 7.5 导入条件逻辑配置
- **POST** `/teacher/papers/:paperId/conditions/import`
- **需要认证**: ✅
- **描述**: 从配置文件导入条件逻辑设置

---

## 🆕 8. 题目批量操作接口 `/teacher/papers`

### 8.1 批量创建题目
- **POST** `/teacher/papers/:paperId/questions/batch-create`
- **需要认证**: ✅
- **描述**: 一次创建多个题目，支持事务处理
- **请求体**:
  ```json
  {
    "questions": [
      {
        "title": "您感到紧张或焦虑吗？",
        "question_type": "single_choice",
        "options": {
          "A": "从不",
          "B": "偶尔", 
          "C": "经常",
          "D": "总是"
        },
        "display_condition": {
          "question_id": "uuid",
          "selected_option": "A"
        }
      }
    ]
  }
  ```
- **限制**: 单次最多创建50道题目
- **响应**:
  ```json
  {
    "success": true,
    "data": {
      "message": "成功创建5道题目",
      "created_count": 5,
      "questions": [...]
    }
  }
  ```

### 8.2 批量更新题目
- **PUT** `/teacher/papers/questions/batch-update`
- **需要认证**: ✅
- **描述**: 一次更新多个题目
- **请求体**:
  ```json
  {
    "updates": [
      {
        "id": "question-uuid",
        "title": "更新后的题目标题",
        "question_type": "multiple_choice",
        "question_order": 5
      }
    ]
  }
  ```
- **限制**: 单次最多更新100道题目

### 8.3 批量删除题目
- **DELETE** `/teacher/papers/questions/batch-delete`
- **需要认证**: ✅
- **描述**: 一次删除多个题目，自动检测依赖关系
- **请求体**:
  ```json
  {
    "question_ids": ["uuid1", "uuid2", "uuid3"]
  }
  ```
- **限制**: 单次最多删除100道题目
- **注意**: 如果题目被其他题目依赖，则无法删除

### 8.4 批量导入题目
- **POST** `/teacher/papers/:paperId/questions/batch-import`
- **需要认证**: ✅
- **描述**: 从JSON数据批量导入题目，支持多种格式
- **请求体**:
  ```json
  {
    "import_mode": "append",
    "questions": [
      {
        "title": "题目标题",
        "options": ["选项1", "选项2"],
        "question_type": "single_choice"
      }
    ]
  }
  ```
- **限制**: 单次最多导入200道题目

### 8.5 批量调整排序
- **PUT** `/teacher/papers/:paperId/questions/batch-reorder`
- **需要认证**: ✅
- **描述**: 批量调整题目排序，自动处理冲突
- **请求体**:
  ```json
  {
    "question_orders": [
      {"id": "uuid1", "question_order": 1},
      {"id": "uuid2", "question_order": 3}
    ]
  }
  ```

---

## 🔗 9. 题目依赖关系接口

### 9.1 获取依赖关系图
- **GET** `/teacher/papers/:paperId/questions/dependencies`
- **需要认证**: ✅
- **描述**: 获取试卷题目的依赖关系图，支持循环依赖检测

### 9.2 验证条件逻辑
- **POST** `/teacher/papers/questions/:questionId/validate-conditions`
- **需要认证**: ✅
- **描述**: 验证题目条件逻辑的有效性和循环依赖

---

## 错误码

- `400`: 请求参数错误
- `401`: 未认证或认证失败  
- `403`: 无权限访问
- `404`: 资源不存在
- `409`: 冲突（如重复提交）
- `500`: 服务器内部错误