/**
 * 题目数据构造工具（供 AI 分析/报告生成使用）
 * 统一从 ExamResult 及其关联数据构建 AI 服务需要的 questions_data
 */

// 时间格式转换：ISO 毫秒 → .000000 结尾（与现有 AI 服务兼容）
export const formatTimeForAI = (date: Date): string => {
  const iso = date.toISOString();
  return iso.replace(/\.\d{3}Z$/, '.000000');
};

// 将响应值映射为选项文本（支持对象/字符串两种 options 结构）
export const mapResponseToText = (responseValue: string, options: any): string => {
  if (!options || typeof options !== 'object') return responseValue;
  const v = options[responseValue];
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && v.text) return v.text;
  return responseValue;
};

// 拼接展示文本：题目 + 答案（多选以逗号分隔）
export const formatQuestionContent = (
  questionTitle: string,
  userResponse: string,
  options: any,
  questionType: string
): string => {
  let answerText = userResponse;
  try {
    if (options && typeof options === 'object') {
      if (questionType === 'multiple_choice') {
        const selected = userResponse.split(',').map((s) => s.trim());
        const mapped = selected.map((opt) => {
          const d = options[opt];
          return typeof d === 'string' ? d : d?.text || opt;
        });
        answerText = mapped.join(', ');
      } else {
        const d = options[userResponse];
        if (d) answerText = typeof d === 'string' ? d : d?.text || userResponse;
      }
    }
  } catch (_) {
    // 回退到原始值
    answerText = userResponse;
  }
  return `题目：${questionTitle}答案：${answerText}`;
};

// 从 ExamResult 构造 questions_data：优先 questionResponses，退回 answers
export type QuestionData = {
  question_id: string;
  questionTitle?: string;
  questionOptions?: any;
  userResponse?: string;
  userResponseText?: string;
  content: string;
  start_time: string;
  end_time: string;
};

export const buildQuestionsDataFromExamResult = (examResult: any): QuestionData[] => {
  try {
    if (examResult.questionResponses && examResult.questionResponses.length > 0) {
      return examResult.questionResponses.map((response: any) => {
        const startTime = response.questionDisplayedAt
          ? formatTimeForAI(response.questionDisplayedAt)
          : formatTimeForAI(examResult.startedAt || new Date());
        const endTime = formatTimeForAI(response.responseSubmittedAt);
        const userResponseText = mapResponseToText(response.responseValue, response.question.options);
        return {
          question_id: response.questionId,
          questionTitle: response.question.title,
          questionOptions: response.question.options,
          userResponse: response.responseValue,
          userResponseText,
          content: formatQuestionContent(
            response.question.title,
            response.responseValue,
            response.question.options,
            response.question.questionType
          ),
          start_time: startTime,
          end_time: endTime,
        };
      });
    }

    if (examResult.answers && examResult.exam?.paper?.questions) {
      const answers = examResult.answers as Record<string, string>;
      return examResult.exam.paper.questions.map((q: any) => {
        const userResponse = answers[q.id] || '';
        const userResponseText = mapResponseToText(userResponse, q.options);
        return {
          question_id: q.id,
          questionTitle: q.title,
          questionOptions: q.options,
          userResponse,
          userResponseText,
          content: formatQuestionContent(q.title, userResponse, q.options, q.questionType),
          start_time: formatTimeForAI(examResult.startedAt || new Date()),
          end_time: formatTimeForAI(examResult.submittedAt || new Date()),
        };
      });
    }

    return [];
  } catch (err) {
    console.error('[questionDataBuilder] 构造题目数据失败:', err);
    return [];
  }
};
