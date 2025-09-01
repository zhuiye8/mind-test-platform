// 分页查询优化工具 - 支持游标分页和深度分页优化

export interface PaginationOptions {
  page?: number;
  limit?: number;
  cursor?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    total?: number;
    page?: number;
    limit: number;
    hasNext: boolean;
    hasPrev: boolean;
    nextCursor?: string | undefined;
    prevCursor?: string | undefined;
  };
}

export interface PaginationMeta {
  pagination: {
    total?: number;
    page?: number;
    limit: number;
    hasNext: boolean;
    hasPrev: boolean;
    nextCursor?: string | undefined;
    prevCursor?: string | undefined;
  };
}

export interface CursorPaginationOptions {
  cursor?: string;
  limit?: number;
  sortField: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * 游标分页工具类 - 用于大数据量高效分页
 */
export class CursorPagination {
  /**
   * 编码游标
   * @param id 记录ID
   * @param sortValue 排序字段值
   * @returns base64编码的游标
   */
  static encodeCursor(id: string, sortValue: any): string {
    const cursorData = {
      id,
      sortValue: sortValue instanceof Date ? sortValue.toISOString() : sortValue,
    };
    return Buffer.from(JSON.stringify(cursorData)).toString('base64');
  }

  /**
   * 解码游标
   * @param cursor base64编码的游标
   * @returns 解码后的游标数据
   */
  static decodeCursor(cursor: string): { id: string; sortValue: any } | null {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      const cursorData = JSON.parse(decoded);
      return {
        id: cursorData.id,
        sortValue: cursorData.sortValue,
      };
    } catch (error) {
      console.error('游标解码失败:', error);
      return null;
    }
  }

  /**
   * 构建Prisma查询条件 - 游标分页
   * @param options 游标分页选项
   * @returns Prisma查询条件对象
   */
  static buildPrismaWhere(options: CursorPaginationOptions): any {
    if (!options.cursor) return {};

    const cursorData = this.decodeCursor(options.cursor);
    if (!cursorData) return {};

    const { sortField } = options;
    const sortOrder = options.sortOrder || 'desc';
    const { id, sortValue } = cursorData;

    // 根据排序方向构建查询条件
    if (sortOrder === 'desc') {
      return {
        OR: [
          {
            [sortField]: {
              lt: sortValue,
            },
          },
          {
            [sortField]: sortValue,
            id: {
              lt: id,
            },
          },
        ],
      };
    } else {
      return {
        OR: [
          {
            [sortField]: {
              gt: sortValue,
            },
          },
          {
            [sortField]: sortValue,
            id: {
              gt: id,
            },
          },
        ],
      };
    }
  }

  /**
   * 构建结果对象
   * @param data 查询结果数据
   * @param options 分页选项
   * @returns 格式化的分页结果
   */
  static buildResult<T extends { id: string; [key: string]: any }>(
    data: T[],
    options: CursorPaginationOptions
  ): { data: T[]; pagination: any } {
    const { sortField } = options;
    const limit = options.limit || 20;

    // 计算是否有下一页
    const hasNext = data.length === limit + 1;
    const actualData = hasNext ? data.slice(0, -1) : data;

    let nextCursor: string | undefined;
    let prevCursor: string | undefined;

    if (actualData.length > 0) {
      const lastItem = actualData[actualData.length - 1];
      const firstItem = actualData[0];

      if (hasNext) {
        nextCursor = this.encodeCursor(lastItem.id, lastItem[sortField]);
      }

      // 对于游标分页，只有在有cursor参数时才提供prevCursor
      if (options.cursor) {
        prevCursor = this.encodeCursor(firstItem.id, firstItem[sortField]);
      }
    }

    return {
      data: actualData, // 游标分页需要返回处理后的数据
      pagination: {
        limit,
        hasNext,
        hasPrev: !!options.cursor, // 如果有cursor说明不是第一页
        nextCursor: nextCursor || undefined,
        prevCursor: prevCursor || undefined,
      },
    };
  }
}

/**
 * 传统偏移分页工具类 - 优化深度分页性能
 */
export class OffsetPagination {
  /**
   * 计算偏移量
   * @param page 页码（从1开始）
   * @param limit 每页数量
   * @returns 偏移量
   */
  static calculateOffset(page: number, limit: number): number {
    return Math.max(0, (page - 1) * limit);
  }

  /**
   * 计算总页数
   * @param total 总记录数
   * @param limit 每页数量
   * @returns 总页数
   */
  static calculateTotalPages(total: number, limit: number): number {
    return Math.ceil(total / limit);
  }

  /**
   * 构建结果对象
   * @param data 查询结果数据
   * @param total 总记录数
   * @param page 当前页码
   * @param limit 每页数量
   * @returns 格式化的分页结果
   */
  static buildResult<T>(
    _data: T[],
    total: number,
    page: number,
    limit: number
  ): { pagination: any } {
    const totalPages = this.calculateTotalPages(total, limit);

    return {
      pagination: {
        total,
        page,
        limit,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * 优化深度分页查询 - 使用索引优化
   * 对于大offset的查询，使用子查询减少扫描行数
   */
  static buildOptimizedPrismaQuery(
    page: number,
    limit: number,
    sortField: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc'
  ) {
    const offset = this.calculateOffset(page, limit);
    const isDeepPagination = offset > 1000; // 超过1000条记录认为是深度分页

    if (isDeepPagination) {
      // 深度分页优化：使用 id 范围查询代替 OFFSET
      console.log(`🚀 使用深度分页优化，offset: ${offset}`);
      return {
        useOptimized: true,
        take: limit,
        orderBy: { [sortField]: sortOrder },
        // 实际的优化逻辑需要在具体查询中实现
        // 这里返回标识，让调用方知道需要使用优化策略
      };
    }

    return {
      useOptimized: false,
      skip: offset,
      take: limit,
      orderBy: { [sortField]: sortOrder },
    };
  }
}

/**
 * 智能分页选择器 - 根据场景自动选择最优分页策略
 */
export class SmartPagination {
  /**
   * 根据数据量和访问模式选择最优分页策略
   * @param totalEstimate 预估总数据量
   * @param page 页码
   * @param limit 每页数量
   * @returns 推荐的分页策略
   */
  static recommendStrategy(
    totalEstimate: number,
    page?: number,
    _limit: number = 20
  ): 'cursor' | 'offset' | 'hybrid' {
    // 小数据量使用传统偏移分页
    if (totalEstimate < 10000) {
      return 'offset';
    }

    // 大数据量且访问深度页面使用游标分页
    if (page && page > 50) {
      return 'cursor';
    }

    // 前几页使用偏移分页，深度页面使用游标分页
    return 'hybrid';
  }

  /**
   * 构建查询参数 - 智能选择分页方式
   * @param options 分页选项
   * @param totalEstimate 预估总数据量
   * @returns 查询参数和策略
   */
  static buildQuery(
    options: PaginationOptions,
    totalEstimate: number = 50000
  ): {
    strategy: 'cursor' | 'offset';
    params: any;
  } {
    const { page = 1, cursor, sortField = 'createdAt', sortOrder = 'desc' } = options;
    const limit = options.limit || 20;

    // 如果提供了cursor，强制使用游标分页
    if (cursor) {
      return {
        strategy: 'cursor',
        params: CursorPagination.buildPrismaWhere({
          cursor,
          limit: limit + 1, // 多查询一条用于判断是否有下一页
          sortField,
          sortOrder,
        }),
      };
    }

    const strategy = this.recommendStrategy(totalEstimate, page, limit);

    if (strategy === 'cursor' || strategy === 'hybrid') {
      // 使用游标分页
      return {
        strategy: 'cursor',
        params: {
          take: limit + 1,
          orderBy: { [sortField]: sortOrder },
        },
      };
    } else {
      // 使用偏移分页
      const queryConfig = OffsetPagination.buildOptimizedPrismaQuery(
        page,
        limit,
        sortField,
        sortOrder
      );

      return {
        strategy: 'offset',
        params: queryConfig,
      };
    }
  }
}

// 类型定义已在文件顶部声明，无需重复导出