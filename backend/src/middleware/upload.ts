import multer from 'multer';
import { Request } from 'express';

// 配置 multer 用于文件上传
const storage = multer.memoryStorage(); // 使用内存存储

// 文件过滤器
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // 检查文件类型
  const allowedMimes = ['application/json', 'text/csv', 'application/csv'];
  const isValidType = allowedMimes.includes(file.mimetype) || 
                     file.originalname.endsWith('.json') || 
                     file.originalname.endsWith('.csv');
  
  if (isValidType) {
    cb(null, true);
  } else {
    cb(new Error('只支持 JSON 和 CSV 格式文件'));
  }
};

// 创建 multer 实例
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB 限制
    files: 1, // 只允许一个文件
  },
});

// 导出单文件上传中间件
export const uploadSingle = upload.single('file');