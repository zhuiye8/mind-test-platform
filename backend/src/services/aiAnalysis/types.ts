/**

 * AI分析服务类型定义
 */

// AI服务配置
export interface AIServiceConfig {
  baseUrl: string;
  timeout: number;
}

// API接口定义
export interface CreateSessionRequest {
  participant_id?: string;
  exam_id?: string;
  // 额外上下文（用于统一流名与AI监控）
  exam_public_uuid?: string;
  stream_name?: string;
}

export interface CreateSessionResponse {
  success: boolean;
  session_id?: string;
  message: string;
}

export interface EndSessionRequest {
  session_id: string;
  // 可选：在停止会话时附带考试结果ID，便于AI端后续回传
  exam_result_id?: string;
  // 兼容扩展：可选携带上下文（目前未使用）
  participant_id?: string;
  exam_id?: string;
}

export interface EndSessionResponse {
  success: boolean;
  session_id: string;
  message: string;
}

export interface QuestionData {
  question_id: string;
  questionTitle?: string;     // 纯题目文本
  questionOptions?: any;      // 选项对象 {"0": "完全不符合", "1": "有点符合"}
  userResponse?: string;      // 原始选择值 "0", "1", "2"
  userResponseText?: string;  // 映射后的文本 "完全不符合或几乎不符合"
  content: string;            // 完整格式化内容（题目+答案）
  start_time: string;         // ISO 8601格式: "2025-08-15T10:00:00.000000"
  end_time: string;
}

export interface AnalyzeQuestionsRequest {
  session_id: string;
  questions_data: QuestionData[];
}

export interface AnalyzeQuestionsResponse {
  success: boolean;
  session_id: string;
  report?: string;
  report_file?: string;
  message: string;
}

// 服务响应类型
export interface ServiceHealthResponse {
  available: boolean;
  error?: string;
}

export interface SessionResponse {
  success: boolean;
  sessionId?: string;
  error?: string;
}

export interface ReportResponse {
  success: boolean;
  report?: string | undefined;
  reportFile?: string | undefined;
  error?: string | undefined;
  cached?: boolean;
  aiDataAvailable?: boolean;
  warnings?: string[];
}

export interface WebSocketHealthResponse {
  available: boolean;
  websocketUrl: string;
  error?: string;
  diagnostics?: {
    httpReachable: boolean;
    configValid: boolean;
    responseTime: number;
    serviceInfo?: any;
    networkPath?: string;
    urlComponents?: {
      protocol: string;
      hostname: string;
      port: string;
      path: string;
    };
    troubleshooting?: string[];
  };
}

export interface NetworkDiagnosticsResponse {
  available: boolean;
  httpUrl: string;
  websocketUrl: string;
  configurationValid: boolean;
  connectivity: {
    http: boolean;
    websocket: boolean;
    ping: boolean;
  };
  error?: string;
  diagnostics: {
    httpStatus?: number | undefined;
    httpResponseTime?: number | undefined;
    websocketError?: string | undefined;
    networkInfo: {
      configuredUrl: string;
      resolvedHost?: string | undefined;
      actualPort?: string | undefined;
      protocol: string;
    };
    troubleshooting: string[];
  };
}

// 情感数据类型
export interface EmotionDataResponse {
  success: boolean;
  data?: any;
  error?: string;
}
