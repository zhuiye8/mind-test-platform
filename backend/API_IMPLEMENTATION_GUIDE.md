# 考试生命周期管理 - 后端API实现指南

## 概述

本文档描述了考试生命周期管理系统所需的新API端点实现。这些API支持考试的5状态生命周期管理：草稿 → 发布 → 结束/停止 → 归档。

## 数据库架构变更

### 1. 更新 exams 表结构

```sql
-- 更新 status 字段，支持新的状态值
ALTER TABLE exams 
MODIFY COLUMN status ENUM('draft', 'published', 'expired', 'success', 'archived') 
DEFAULT 'draft' 
COMMENT '考试状态：draft=草稿，published=进行中，expired=已停止，success=已结束，archived=已归档';

-- 添加索引优化查询性能
CREATE INDEX idx_exams_status ON exams(status);
CREATE INDEX idx_exams_archived ON exams(status, updated_at) WHERE status = 'archived';
```

### 2. 状态转换规则

```typescript
// 允许的状态转换路径
const ALLOWED_TRANSITIONS = {
  'draft': ['published'],           // 草稿 → 发布
  'published': ['expired', 'success'], // 进行中 → 停止/结束
  'expired': ['draft'],             // 停止 → 重新编辑
  'success': ['archived'],          // 结束 → 归档
  'archived': ['success'],          // 归档 → 恢复
};
```

## 新增API端点实现

### 1. 结束考试 API

**端点**: `PUT /api/teacher/exams/:id/finish`

**功能**: 将进行中的考试正常结束（published → success）

```typescript
/**
 * 结束考试
 * 将考试状态从 published 改为 success
 */
export const finishExam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const teacherId = req.teacher.id; // 从JWT中获取

    // 验证考试存在且属于当前教师
    const exam = await prisma.exam.findFirst({
      where: {
        id,
        paper: {
          teacher_id: teacherId
        }
      }
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        error: '考试不存在或无权限访问'
      });
    }

    // 验证状态转换有效性
    if (exam.status !== 'published') {
      return res.status(400).json({
        success: false,
        error: `无法结束，当前状态为: ${exam.status}，只有进行中的考试可以结束`
      });
    }

    // 更新考试状态
    const updatedExam = await prisma.exam.update({
      where: { id },
      data: {
        status: 'success',
        updated_at: new Date()
      },
      include: {
        paper: true,
        _count: {
          select: {
            exam_results: true
          }
        }
      }
    });

    // 记录操作日志
    console.log(`考试 ${id} 已被教师 ${teacherId} 正常结束`);

    res.json({
      success: true,
      data: updatedExam
    });

  } catch (error) {
    console.error('结束考试失败:', error);
    res.status(500).json({
      success: false,
      error: '结束考试失败'
    });
  }
};
```

### 2. 归档考试 API

**端点**: `PUT /api/teacher/exams/:id/archive`

**功能**: 将已结束的考试归档（success → archived）

```typescript
/**
 * 归档考试
 * 将考试状态从 success 改为 archived（软删除到回收站）
 */
export const archiveExam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const teacherId = req.teacher.id;

    const exam = await prisma.exam.findFirst({
      where: {
        id,
        paper: {
          teacher_id: teacherId
        }
      }
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        error: '考试不存在或无权限访问'
      });
    }

    if (exam.status !== 'success') {
      return res.status(400).json({
        success: false,
        error: `无法归档，当前状态为: ${exam.status}，只有已结束的考试可以归档`
      });
    }

    const updatedExam = await prisma.exam.update({
      where: { id },
      data: {
        status: 'archived',
        updated_at: new Date()
      },
      include: {
        paper: true,
        _count: {
          select: {
            exam_results: true
          }
        }
      }
    });

    console.log(`考试 ${id} 已被教师 ${teacherId} 归档到回收站`);

    res.json({
      success: true,
      data: updatedExam
    });

  } catch (error) {
    console.error('归档考试失败:', error);
    res.status(500).json({
      success: false,
      error: '归档考试失败'
    });
  }
};
```

### 3. 恢复考试 API

**端点**: `PUT /api/teacher/exams/:id/restore`

**功能**: 从回收站恢复考试（archived → success）

```typescript
/**
 * 恢复考试
 * 将考试状态从 archived 改为 success（从回收站恢复）
 */
export const restoreExam = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const teacherId = req.teacher.id;

    const exam = await prisma.exam.findFirst({
      where: {
        id,
        paper: {
          teacher_id: teacherId
        }
      }
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        error: '考试不存在或无权限访问'
      });
    }

    if (exam.status !== 'archived') {
      return res.status(400).json({
        success: false,
        error: `无法恢复，当前状态为: ${exam.status}，只有归档的考试可以恢复`
      });
    }

    const updatedExam = await prisma.exam.update({
      where: { id },
      data: {
        status: 'success',
        updated_at: new Date()
      },
      include: {
        paper: true,
        _count: {
          select: {
            exam_results: true
          }
        }
      }
    });

    console.log(`考试 ${id} 已被教师 ${teacherId} 从回收站恢复`);

    res.json({
      success: true,
      data: updatedExam
    });

  } catch (error) {
    console.error('恢复考试失败:', error);
    res.status(500).json({
      success: false,
      error: '恢复考试失败'
    });
  }
};
```

### 4. 获取归档考试列表 API

**端点**: `GET /api/teacher/exams/archived`

**功能**: 获取回收站中的归档考试列表

```typescript
/**
 * 获取归档考试列表（回收站）
 */
export const getArchivedExams = async (req: Request, res: Response) => {
  try {
    const teacherId = req.teacher.id;
    const { page = 1, limit = 10, search } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // 构建查询条件
    const whereClause: any = {
      paper: {
        teacher_id: teacherId
      },
      status: 'archived'
    };

    // 添加搜索条件
    if (search) {
      whereClause.OR = [
        { title: { contains: String(search), mode: 'insensitive' } },
        { paper: { title: { contains: String(search), mode: 'insensitive' } } }
      ];
    }

    // 查询归档考试列表
    const [exams, totalCount] = await Promise.all([
      prisma.exam.findMany({
        where: whereClause,
        include: {
          paper: {
            select: {
              id: true,
              title: true,
              teacher: {
                select: {
                  name: true
                }
              }
            }
          },
          _count: {
            select: {
              exam_results: true
            }
          }
        },
        orderBy: {
          updated_at: 'desc' // 按归档时间倒序
        },
        skip: offset,
        take: Number(limit)
      }),
      prisma.exam.count({
        where: whereClause
      })
    ]);

    res.json({
      success: true,
      data: {
        data: exams,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / Number(limit))
        },
        meta: {
          totalCount
        }
      }
    });

  } catch (error) {
    console.error('获取归档考试列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取归档考试列表失败'
    });
  }
};
```

### 5. 获取考试提交学生列表 API

**端点**: `GET /api/teacher/exams/:id/submissions`

**功能**: 获取指定考试的学生提交详情列表

```typescript
/**
 * 获取考试提交学生列表
 * 用于删除前显示受影响的学生
 */
export const getExamSubmissions = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, search } = req.query;
    const teacherId = req.teacher.id;
    const offset = (Number(page) - 1) * Number(limit);

    // 验证考试权限
    const exam = await prisma.exam.findFirst({
      where: {
        id,
        paper: {
          teacher_id: teacherId
        }
      }
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        error: '考试不存在或无权限访问'
      });
    }

    // 构建查询条件
    const whereClause: any = {
      exam_id: id
    };

    // 添加搜索条件（按学号或姓名搜索）
    if (search) {
      whereClause.OR = [
        { student_id: { contains: String(search) } },
        { student_name: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    // 查询提交列表
    const [submissions, totalCount] = await Promise.all([
      prisma.examResult.findMany({
        where: whereClause,
        select: {
          id: true,
          student_id: true,
          student_name: true,
          answers: true,
          ip_address: true,
          submitted_at: true
        },
        orderBy: {
          submitted_at: 'desc'
        },
        skip: offset,
        take: Number(limit)
      }),
      prisma.examResult.count({
        where: whereClause
      })
    ]);

    // 统计完成答题的学生数量
    const completedCount = submissions.filter(s => 
      s.answers && Object.keys(s.answers as object).length > 0
    ).length;

    // 统计独立IP数量
    const uniqueIPs = new Set(submissions.map(s => s.ip_address)).size;

    res.json({
      success: true,
      data: {
        data: submissions,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / Number(limit))
        },
        meta: {
          totalCount,
          completedCount,
          uniqueIPs
        }
      }
    });

  } catch (error) {
    console.error('获取考试提交列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取考试提交列表失败'
    });
  }
};
```

### 6. 更新现有考试列表 API

**端点**: `GET /api/teacher/exams` (现有API增强)

**更新功能**: 支持按状态筛选，排除归档考试

```typescript
/**
 * 获取考试列表（增强版）
 * 支持状态筛选，默认排除归档考试
 */
export const getExams = async (req: Request, res: Response) => {
  try {
    const teacherId = req.teacher.id;
    const { 
      page = 1, 
      limit = 10, 
      status, 
      includeArchived = false,
      search 
    } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // 构建查询条件
    const whereClause: any = {
      paper: {
        teacher_id: teacherId
      }
    };

    // 状态筛选
    if (status && status !== 'all') {
      whereClause.status = status;
    } else if (!includeArchived) {
      // 默认排除归档考试
      whereClause.status = {
        not: 'archived'
      };
    }

    // 搜索条件
    if (search) {
      whereClause.OR = [
        { title: { contains: String(search), mode: 'insensitive' } },
        { paper: { title: { contains: String(search), mode: 'insensitive' } } }
      ];
    }

    const [exams, totalCount] = await Promise.all([
      prisma.exam.findMany({
        where: whereClause,
        include: {
          paper: {
            select: {
              id: true,
              title: true,
              teacher: {
                select: {
                  name: true
                }
              }
            }
          },
          _count: {
            select: {
              exam_results: true
            }
          }
        },
        orderBy: [
          { status: 'asc' }, // 按状态排序
          { updated_at: 'desc' } // 按更新时间倒序
        ],
        skip: offset,
        take: Number(limit)
      }),
      prisma.exam.count({
        where: whereClause
      })
    ]);

    res.json({
      success: true,
      data: {
        data: exams,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / Number(limit))
        },
        meta: {
          totalCount,
          // 各状态统计
          statusCounts: await getStatusCounts(teacherId)
        }
      }
    });

  } catch (error) {
    console.error('获取考试列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取考试列表失败'
    });
  }
};

/**
 * 获取各状态考试数量统计
 */
const getStatusCounts = async (teacherId: string) => {
  const counts = await prisma.exam.groupBy({
    by: ['status'],
    where: {
      paper: {
        teacher_id: teacherId
      }
    },
    _count: {
      id: true
    }
  });

  return counts.reduce((acc, item) => {
    acc[item.status] = item._count.id;
    return acc;
  }, {} as Record<string, number>);
};
```

## 路由注册

### 更新路由文件 `routes/teacher/exams.ts`

```typescript
import { Router } from 'express';
import { 
  getExams,
  getArchivedExams,
  finishExam,
  archiveExam,
  restoreExam,
  getExamSubmissions,
  // ... 其他现有方法
} from '../../controllers/teacher/examController';

const router = Router();

// 现有路由
router.get('/', getExams);                    // 考试列表
router.get('/archived', getArchivedExams);    // 归档列表 - 新增
router.get('/:id', getExamDetail);           // 考试详情
router.post('/', createExam);                // 创建考试
router.put('/:id', updateExam);              // 更新考试
router.delete('/:id', deleteExam);           // 删除考试
router.post('/:id/toggle-publish', togglePublish); // 切换发布

// 新增生命周期管理路由
router.put('/:id/finish', finishExam);       // 结束考试 - 新增
router.put('/:id/archive', archiveExam);     // 归档考试 - 新增
router.put('/:id/restore', restoreExam);     // 恢复考试 - 新增
router.get('/:id/submissions', getExamSubmissions); // 提交列表 - 新增

export default router;
```

## 数据验证和错误处理

### 1. 状态转换验证中间件

```typescript
/**
 * 验证状态转换的中间件
 */
export const validateStatusTransition = (targetStatus: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const teacherId = req.teacher.id;

      const exam = await prisma.exam.findFirst({
        where: {
          id,
          paper: {
            teacher_id: teacherId
          }
        }
      });

      if (!exam) {
        return res.status(404).json({
          success: false,
          error: '考试不存在或无权限访问'
        });
      }

      const allowedTransitions = ALLOWED_TRANSITIONS[exam.status];
      if (!allowedTransitions?.includes(targetStatus)) {
        return res.status(400).json({
          success: false,
          error: `无法从 ${exam.status} 状态转换到 ${targetStatus} 状态`
        });
      }

      req.exam = exam; // 将考试信息传递给下一个中间件
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: '状态验证失败'
      });
    }
  };
};
```

### 2. 权限验证增强

```typescript
/**
 * 增强的考试权限验证
 */
export const validateExamOwnership = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const teacherId = req.teacher.id;

    const exam = await prisma.exam.findFirst({
      where: {
        id,
        paper: {
          teacher_id: teacherId
        }
      },
      include: {
        paper: true,
        _count: {
          select: {
            exam_results: true
          }
        }
      }
    });

    if (!exam) {
      return res.status(404).json({
        success: false,
        error: '考试不存在或无权限访问'
      });
    }

    req.exam = exam;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '权限验证失败'
    });
  }
};
```

## 实施步骤

### 第一步：数据库更新
1. 执行SQL脚本更新 `exams` 表的 `status` 字段
2. 添加必要的索引

### 第二步：控制器实现
1. 创建新的控制器方法
2. 更新现有的 `getExams` 方法

### 第三步：路由配置
1. 添加新的路由端点
2. 配置中间件验证

### 第四步：测试验证
1. 单元测试各个API端点
2. 集成测试状态转换流程
3. 前端联调测试

### 第五步：文档更新
1. 更新API文档
2. 更新数据库文档

## 注意事项

1. **数据一致性**：所有状态转换需要在事务中执行
2. **权限控制**：确保教师只能操作自己的考试
3. **日志记录**：重要操作需要记录操作日志
4. **缓存处理**：状态变更后需要清除相关缓存
5. **并发控制**：防止同时进行的状态变更操作

## 前后端数据契约

### 考试对象结构
```typescript
interface Exam {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'expired' | 'success' | 'archived';
  // ... 其他字段
  _count: {
    exam_results: number; // 提交人数
  };
}
```

### API响应格式
```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

这个实现方案完全支持前端已实现的考试生命周期管理功能，确保系统的完整性和一致性。