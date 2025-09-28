import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 开始播种心理量表数据...');

  // 创建测试教师账号
  const hashedPassword = await bcrypt.hash('123456', 12);

  const teacher = await prisma.teacher.upsert({
    where: { teacherId: 'T2025001' },
    update: {
      role: 'ADMIN', // 更新现有账户为管理员
    },
    create: {
      teacherId: 'T2025001',
      name: '系统管理员',
      passwordHash: hashedPassword,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('✅ 创建教师账号:', teacher);

  // 1. 创建ASQ青少年压力量表 (10维度, 56题)
  const asqPaper = await prisma.paper.create({
    data: {
      title: 'ASQ青少年压力量表',
      description: 'Adolescent Stress Questionnaire (ASQ) scales，用于评估青少年压力水平。量表选项：完全不压力／与我无关（1）、稍微有点压力（2）、中等压力（3）、比较大压力（4）、非常大压力（5）。',
      scaleType: 'grouped',
      showScores: true,
      scaleConfig: {
        totalQuestions: 56,
        scoringType: 'sum',
        scoreRange: { min: 56, max: 280 },
        description: 'ASQ量表包含10个维度，逐题计1–5分，总压力负荷为56题得分求和，理论范围56–280分。≥常模85百分位需关注，达95百分位以上建议进一步评估。'
      },
      teacherId: teacher.id,
    },
  });

  // 创建ASQ的10个维度
  const asqScales = [
    { name: '家庭生活', order: 1, questionCount: 12 },
    { name: '学业表现', order: 2, questionCount: 7 },
    { name: '上学出勤', order: 3, questionCount: 3 },
    { name: '恋爱关系', order: 4, questionCount: 5 },
    { name: '同伴压力', order: 5, questionCount: 7 },
    { name: '与教师的互动', order: 6, questionCount: 7 },
    { name: '对未来的不确定感', order: 7, questionCount: 3 },
    { name: '学校与休闲冲突', order: 8, questionCount: 5 },
    { name: '财务压力', order: 9, questionCount: 4 },
    { name: '新晋成年责任', order: 10, questionCount: 3 },
  ];

  const createdAsqScales: any[] = [];
  for (const scale of asqScales) {
    const createdScale = await prisma.scale.create({
      data: {
        paperId: asqPaper.id,
        scaleName: scale.name,
        scaleOrder: scale.order,
      },
    });
    createdAsqScales.push(createdScale);
  }

  // ASQ题目数据 - 家庭生活维度 (12题)
  const asqFamilyQuestions = [
    "与父亲的意见不合", "父母不把你当回事", "对自己生活缺乏或毫无掌控", "在家遵守琐碎规矩",
    "父母之间的争执", "家庭争吵", "与母亲的意见不合", "成年人缺乏对你的信任",
    "父母对你期望过高", "父母因你的外表而不断唠叨", "与父母同住", "父母缺乏对你的理解"
  ];

  // 学业表现维度 (7题)
  const asqAcademicQuestions = [
    "需要学习你不理解的内容", "老师对你期望过高", "跟上学业进度", "某些学科的学习困难",
    "上课时间需要长时间集中注意力", "需要学习你不感兴趣的内容", "学习压力"
  ];

  // 上学出勤维度 (3题)
  const asqAttendanceQuestions = [
    "早起去上学", "强制性上学规定", "去学校"
  ];

  // 恋爱关系维度 (5题)
  const asqRomanticQuestions = [
    "被心仪对象忽视或拒绝", "维系与男/女朋友的关系", "没有足够时间陪伴男/女朋友",
    "与男/女朋友相处", "与男/女朋友分手"
  ];

  // 同伴压力维度 (7题)
  const asqPeerQuestions = [
    "因不合群而被同伴刁难", "被朋友评头论足", "随着成长，外貌变化", "为融入同龄群体而承受的压力",
    "对自己外表的满意度", "同伴因你的外表而刁难你", "与同龄人的意见不合"
  ];

  // 与教师的互动维度 (7题)
  const asqTeacherQuestions = [
    "与老师的意见不合", "对学业反馈不够及时", "老师因你的外表而唠叨", "在校遵守琐碎规矩",
    "老师不听你说话", "老师缺乏对你的尊重", "与老师相处"
  ];

  // 对未来的不确定感维度 (3题)
  const asqFutureQuestions = [
    "对未来的担忧", "为实现未来目标对自己施压", "必须决定未来工作或教育"
  ];

  // 学校与休闲冲突维度 (5题)
  const asqLeisureQuestions = [
    "没有足够的娱乐时间", "没有足够的休闲时光", "家庭作业太多", "课外活动时间不足", "缺乏自由"
  ];

  // 财务压力维度 (4题)
  const asqFinancialQuestions = [
    "赚更多钱的压力", "没钱买想要的东西", "随着成长不得不承担新责任", "没钱买所需物品"
  ];

  // 新晋成年责任维度 (3题)
  const asqAdultQuestions = [
    "雇主对你期望过高", "随着成长不得不承担新责任", "工作干扰了学习和社交活动"
  ];

  const allAsqQuestions = [
    ...asqFamilyQuestions.map((q, i) => ({ text: q, scaleId: createdAsqScales[0].id, order: i + 1 })),
    ...asqAcademicQuestions.map((q, i) => ({ text: q, scaleId: createdAsqScales[1].id, order: i + 13 })),
    ...asqAttendanceQuestions.map((q, i) => ({ text: q, scaleId: createdAsqScales[2].id, order: i + 20 })),
    ...asqRomanticQuestions.map((q, i) => ({ text: q, scaleId: createdAsqScales[3].id, order: i + 23 })),
    ...asqPeerQuestions.map((q, i) => ({ text: q, scaleId: createdAsqScales[4].id, order: i + 28 })),
    ...asqTeacherQuestions.map((q, i) => ({ text: q, scaleId: createdAsqScales[5].id, order: i + 35 })),
    ...asqFutureQuestions.map((q, i) => ({ text: q, scaleId: createdAsqScales[6].id, order: i + 42 })),
    ...asqLeisureQuestions.map((q, i) => ({ text: q, scaleId: createdAsqScales[7].id, order: i + 45 })),
    ...asqFinancialQuestions.map((q, i) => ({ text: q, scaleId: createdAsqScales[8].id, order: i + 50 })),
    ...asqAdultQuestions.map((q, i) => ({ text: q, scaleId: createdAsqScales[9].id, order: i + 54 })),
  ];

  const asqOptions = {
    "A": { text: "完全不压力／与我无关", score: 1 },
    "B": { text: "稍微有点压力", score: 2 },
    "C": { text: "中等压力", score: 3 },
    "D": { text: "比较大压力", score: 4 },
    "E": { text: "非常大压力", score: 5 }
  };

  const asqQuestionIds = [];
  for (const questionData of allAsqQuestions) {
    const question = await prisma.question.create({
      data: {
        paperId: asqPaper.id,
        scaleId: questionData.scaleId,
        questionOrder: questionData.order,
        title: questionData.text,
        options: asqOptions,
        questionType: 'single_choice',
        scoreValue: null, // ASQ题目分数由选项值决定
        isRequired: true, // ASQ量表题目全部必填
        isScored: true, // ASQ是计分量表
        displayCondition: Prisma.DbNull,
      },
    });
    asqQuestionIds.push(question.id);
  }

  console.log(`✅ 创建ASQ量表: ${createdAsqScales.length}个维度, ${asqQuestionIds.length}道题目`);

  // 2. 创建SCARED儿童焦虑相关障碍筛查表 (扁平结构, 41题)
  const scaredPaper = await prisma.paper.create({
    data: {
      title: '儿童焦虑相关障碍筛查表 (SCARED)',
      description: 'Screen for Child Anxiety Related Emotional Disorders (SCARED)，儿童版，用于筛查儿童焦虑相关障碍。量表选项：完全不符合或几乎不符合（0）、有点符合或有时符合（1）、非常符合或经常符合（2）。针对过去3个月的情况。',
      scaleType: 'flat',
      showScores: false,
      scaleConfig: {
        totalQuestions: 41,
        scoringType: 'sum',
        scoreRange: { min: 0, max: 82 },
        description: '总分≥25分可能表明存在焦虑障碍。分数高于30分则更具特异性。对于8至11岁的儿童，建议由临床医生解释所有问题。'
      },
      teacherId: teacher.id,
    },
  });

  const scaredQuestions = [
    "当我感到害怕时，会呼吸困难。", "我在学校时会头痛。", "我不喜欢和不熟的人待在一起。",
    "如果我不在家睡觉，我会感到害怕。", "我担心别人是否喜欢我。", "当我感到害怕时，我感觉快要昏倒了。",
    "我很紧张。", "我走到哪里都跟着我的妈妈或爸爸。", "别人说我看起来很紧张。",
    "和不熟的人在一起时，我会感到紧张。", "我在学校会肚子痛。", "当我感到害怕时，我感觉自己快要疯了。",
    "我担心一个人睡觉。", "我担心自己是否能和其他孩子一样好。", "当我感到害怕时，我感觉事情不真实。",
    "我会做噩梦，梦到父母发生不好的事。", "我担心去上学。", "当我感到害怕时，我的心跳会很快。",
    "我会发抖。", "我会做噩梦，梦到自己发生不好的事。", "我担心事情能否顺利解决。",
    "当我感到害怕时，我会出很多汗。", "我是一个爱操心的人。", "我会无缘无故地感到非常害怕。",
    "我害怕一个人在家。", "和不熟的人交谈对我来说很困难。", "当我感到害怕时，我感觉像要窒息。",
    "别人说我想得太多了。", "我不喜欢离开我的家人。", "我害怕自己会出现焦虑（或惊恐）发作。",
    "我担心会有不好的事情发生在我父母身上。", "和不熟的人在一起时，我会感到害羞。", "我担心未来会发生什么。",
    "当我感到害怕时，我感觉想吐。", "我担心自己事情做得好不好。", "我害怕去上学。",
    "我担心已经发生过的事情。", "当我感到害怕时，我感到头晕。",
    "当我和其他孩子或大人在一起，并且必须在他们注视下做某件事（例如：朗读、说话、玩游戏、做运动）时，我会感到紧张。",
    "当我要去参加派对、舞会或任何有不熟的人在场的地方时，我会感到紧张。", "我很害羞。"
  ];

  const scaredOptions = {
    "A": { text: "完全不符合或几乎不符合", score: 0 },
    "B": { text: "有点符合或有时符合", score: 1 },
    "C": { text: "非常符合或经常符合", score: 2 }
  };

  const scaredQuestionIds = [];
  for (let i = 0; i < scaredQuestions.length; i++) {
    const question = await prisma.question.create({
      data: {
        paperId: scaredPaper.id,
        scaleId: null, // 扁平结构，无维度分组
        questionOrder: i + 1,
        title: scaredQuestions[i],
        options: scaredOptions,
        questionType: 'single_choice',
        scoreValue: null, // 分数由选项值决定
        isRequired: true, // SCARED量表题目全部必填
        isScored: true, // SCARED是计分量表
        displayCondition: Prisma.DbNull,
      },
    });
    scaredQuestionIds.push(question.id);
  }

  console.log(`✅ 创建SCARED量表: 扁平结构, ${scaredQuestionIds.length}道题目`);

  // 3. 创建SCAS斯宾思儿童焦虑量表 (6维度 + 填充项)
  const scasPaper = await prisma.paper.create({
    data: {
      title: '斯宾思儿童焦虑量表 (SCAS)',
      description: 'Spence Children\'s Anxiety Scale (SCAS)，儿童版，用于评估儿童焦虑水平。量表选项：从不（0）、有时（1）、经常（2）、总是（3）。共38个焦虑项计分，7个填充项不计分。',
      scaleType: 'grouped',
      showScores: true,
      scaleConfig: {
        totalQuestions: 45,
        scoredQuestions: 38,
        fillerQuestions: 7,
        scoringType: 'sum',
        scoreRange: { min: 0, max: 114 },
        description: '逐题计分：从不=0，有时=1，经常=2，总是=3。总分为38个焦虑项求和，最大114分。填充项不计分。使用T分数表解释：T<60正常，T≥60升高焦虑，T=65前6%，T=70前2%。'
      },
      teacherId: teacher.id,
    },
  });

  // 创建SCAS的6个维度
  const scasScales = [
    { name: '分离焦虑 (Separation Anxiety)', order: 1 },
    { name: '社交恐惧 (Social Phobia)', order: 2 },
    { name: '强迫症 (Obsessive-Compulsive Disorder)', order: 3 },
    { name: '惊恐发作和广场恐惧 (Panic Attack and Agoraphobia)', order: 4 },
    { name: '身体伤害恐惧 (Physical Injury Fears)', order: 5 },
    { name: '广泛性焦虑障碍 (Generalized Anxiety Disorder)', order: 6 },
  ];

  const createdScasScales: any[] = [];
  for (const scale of scasScales) {
    const createdScale = await prisma.scale.create({
      data: {
        paperId: scasPaper.id,
        scaleName: scale.name,
        scaleOrder: scale.order,
      },
    });
    createdScasScales.push(createdScale);
  }

  // SCAS题目数据 (按ID顺序，1-45)
  const scasAllQuestions = [
    { id: 1, text: "我担心各种事情", scaleIndex: 5, isScored: true }, // 广泛性焦虑
    { id: 2, text: "我怕黑", scaleIndex: 4, isScored: true }, // 身体伤害恐惧
    { id: 3, text: "一遇到问题，我的胃部就有不舒服的感觉", scaleIndex: 5, isScored: true }, // 广泛性焦虑
    { id: 4, text: "我感到害怕", scaleIndex: 5, isScored: true }, // 广泛性焦虑
    { id: 5, text: "要我自己一个人呆在家里，我会害怕的", scaleIndex: 0, isScored: true }, // 分离焦虑
    { id: 6, text: "要考试时我会感到恐慌", scaleIndex: 1, isScored: true }, // 社交恐惧
    { id: 7, text: "我害怕用公共厕所或公共浴室", scaleIndex: 1, isScored: true }, // 社交恐惧
    { id: 8, text: "我担心离开父母", scaleIndex: 0, isScored: true }, // 分离焦虑
    { id: 9, text: "我怕我会在别人面前出丑", scaleIndex: 1, isScored: true }, // 社交恐惧
    { id: 10, text: "我担心我的学校功课会做得很差", scaleIndex: 1, isScored: true }, // 社交恐惧
    { id: 11, text: "在同龄孩子中我很受欢迎", scaleIndex: -1, isScored: false }, // 填充项
    { id: 12, text: "我担心家里有人会出事", scaleIndex: 0, isScored: true }, // 分离焦虑
    { id: 13, text: "我无缘无故地突然觉得自己好像透不过气来", scaleIndex: 3, isScored: true }, // 惊恐发作
    { id: 14, text: "我必须不断检查自己有没有把事情做好（比如开关关好了没有，门锁好了没有）", scaleIndex: 2, isScored: true }, // 强迫症
    { id: 15, text: "如果叫我自己一个人睡觉我就觉得恐慌", scaleIndex: 0, isScored: true }, // 分离焦虑
    { id: 16, text: "早晨上学去对我来说是很苦恼的，因为我感到紧张或害怕", scaleIndex: 0, isScored: true }, // 分离焦虑
    { id: 17, text: "我擅长于体育运动", scaleIndex: -1, isScored: false }, // 填充项
    { id: 18, text: "我怕狗", scaleIndex: 4, isScored: true }, // 身体伤害恐惧
    { id: 19, text: "我似乎不能摆脱头脑里一些不好的或愚蠢的想法", scaleIndex: 2, isScored: true }, // 强迫症
    { id: 20, text: "我遇到问题时，心跳得很快", scaleIndex: 5, isScored: true }, // 广泛性焦虑
    { id: 21, text: "我无缘无故地突然开始颤抖或发抖", scaleIndex: 3, isScored: true }, // 惊恐发作
    { id: 22, text: "我担心什么不好的事情会在自己身上发生", scaleIndex: 5, isScored: true }, // 广泛性焦虑
    { id: 23, text: "去看医生或牙医我很恐慌", scaleIndex: 4, isScored: true }, // 身体伤害恐惧
    { id: 24, text: "当我遇到问题时，我感到紧张发抖", scaleIndex: 5, isScored: true }, // 广泛性焦虑
    { id: 25, text: "在高处或电梯里我会很恐慌", scaleIndex: 4, isScored: true }, // 身体伤害恐惧
    { id: 26, text: "我是个好人", scaleIndex: -1, isScored: false }, // 填充项
    { id: 27, text: "我必须去想一些特殊的想法（比如数字或词语）以阻止坏事的发生", scaleIndex: 2, isScored: true }, // 强迫症
    { id: 28, text: "如果我必需乘车（汽车或火车）旅行，我就感到恐慌", scaleIndex: 3, isScored: true }, // 惊恐发作
    { id: 29, text: "我担心别人对我怎么想", scaleIndex: 1, isScored: true }, // 社交恐惧
    { id: 30, text: "我害怕呆在拥挤的地方（如购物中心、电影院、公共汽车、热闹的游乐场）", scaleIndex: 3, isScored: true }, // 惊恐发作
    { id: 31, text: "我感到开心", scaleIndex: -1, isScored: false }, // 填充项
    { id: 32, text: "根本没有什么原因，突然间我觉得非常恐慌", scaleIndex: 3, isScored: true }, // 惊恐发作
    { id: 33, text: "我怕小虫子或蜘蛛", scaleIndex: 4, isScored: true }, // 身体伤害恐惧
    { id: 34, text: "无缘无故地，我突然头晕目眩好像要昏倒了", scaleIndex: 3, isScored: true }, // 惊恐发作
    { id: 35, text: "如果我必需在全班同学面前讲话我就感到害怕", scaleIndex: 1, isScored: true }, // 社交恐惧
    { id: 36, text: "没有什么原因我的心突然跳得太快了", scaleIndex: 3, isScored: true }, // 惊恐发作
    { id: 37, text: "我担心即使在没有什么东西可害怕时自己会突然产生恐慌的感觉", scaleIndex: 3, isScored: true }, // 惊恐发作
    { id: 38, text: "我喜欢我自己", scaleIndex: -1, isScored: false }, // 填充项
    { id: 39, text: "我害怕呆在狭小封闭的地方，比如隧道或小房间", scaleIndex: 3, isScored: true }, // 惊恐发作
    { id: 40, text: "有些事情我必须一遍遍地反复做（比如洗手，打扫卫生，或把东西按照固定的次序放好）", scaleIndex: 2, isScored: true }, // 强迫症
    { id: 41, text: "我脑子里不好或愚蠢的想法或形象令我困惑不安", scaleIndex: 2, isScored: true }, // 强迫症
    { id: 42, text: "我必须以特定的恰当方式去做某些事情以阻止坏事的发生", scaleIndex: 2, isScored: true }, // 强迫症
    { id: 43, text: "我对自己的学校功课引以为豪", scaleIndex: -1, isScored: false }, // 填充项
    { id: 44, text: "如果要我离家在外过夜我会觉得很恐慌", scaleIndex: 0, isScored: true }, // 分离焦虑
    { id: 45, text: "还有其它什么你真的很害怕？（有/没有，如果有，写下来并评分）", scaleIndex: -1, isScored: false }, // 开放式，不计分
  ];

  const scasOptions = {
    "A": { text: "从不", score: 0 },
    "B": { text: "有时", score: 1 },
    "C": { text: "经常", score: 2 },
    "D": { text: "总是", score: 3 }
  };

  const scasQuestionIds = [];
  for (const questionData of scasAllQuestions) {
    const question = await prisma.question.create({
      data: {
        paperId: scasPaper.id,
        scaleId: questionData.scaleIndex >= 0 ? createdScasScales[questionData.scaleIndex].id : null,
        questionOrder: questionData.id,
        title: questionData.text,
        options: scasOptions,
        questionType: 'single_choice',
        scoreValue: null, // 分数由选项值决定
        isRequired: questionData.isScored, // SCAS填充题设为选填，计分题必填
        isScored: questionData.isScored,
        displayCondition: Prisma.DbNull,
      },
    });
    scasQuestionIds.push(question.id);
  }

  const scasScored = scasAllQuestions.filter(q => q.isScored).length;
  const scasFiller = scasAllQuestions.filter(q => !q.isScored).length;
  console.log(`✅ 创建SCAS量表: ${createdScasScales.length}个维度, ${scasQuestionIds.length}道题目 (${scasScored}计分 + ${scasFiller}填充)`);

  // 创建考试实例 - 使用轻量级快照
  const asqQuestionSnapshot = {
    version: 2,
    created_at: new Date(),
    questions: asqQuestionIds.map((id, index) => {
      const questionData = allAsqQuestions[index];
      return {
        id,
        version: 1,
        order: index + 1,
        title: questionData.text.substring(0, 100),
        type: 'single_choice',
        required: true
      };
    }),
    total_count: asqQuestionIds.length
  };
  
  const asqExam = await prisma.exam.create({
    data: {
      title: '2025年ASQ青少年压力评估测试',
      paperId: asqPaper.id,
      teacherId: teacher.id,
      durationMinutes: 45,
      questionSnapshot: asqQuestionSnapshot,
      status: 'PUBLISHED',
    },
  });

  const scaredQuestionSnapshot = {
    version: 2,
    created_at: new Date(),
    questions: scaredQuestionIds.map((id, index) => ({
      id,
      version: 1,
      order: index + 1,
      title: scaredQuestions[index].substring(0, 100),
      type: 'single_choice',
      required: true
    })),
    total_count: scaredQuestionIds.length
  };
  
  const scaredExam = await prisma.exam.create({
    data: {
      title: '2025年SCARED儿童焦虑筛查测试',
      paperId: scaredPaper.id,
      teacherId: teacher.id,
      durationMinutes: 30,
      questionSnapshot: scaredQuestionSnapshot,
      status: 'PUBLISHED',
    },
  });

  const scasQuestionSnapshot = {
    version: 2,
    created_at: new Date(),
    questions: scasQuestionIds.map((id, index) => {
      const questionData = scasAllQuestions[index];
      return {
        id,
        version: 1,
        order: index + 1,
        title: questionData.text.substring(0, 100),
        type: 'single_choice',
        required: true
      };
    }),
    total_count: scasQuestionIds.length
  };
  
  const scasExam = await prisma.exam.create({
    data: {
      title: '2025年SCAS斯宾思儿童焦虑量表测试',
      paperId: scasPaper.id,
      teacherId: teacher.id,
      durationMinutes: 35,
      questionSnapshot: scasQuestionSnapshot,
      status: 'PUBLISHED',
    },
  });

  // 创建示例学生考试结果（含时间线数据）
  const testExamResult = await prisma.examResult.create({
    data: {
      examId: asqExam.id,
      participantId: 'STUDENT001',
      participantName: '张同学',
      answers: {
        [asqQuestionIds[0]]: '3',
        [asqQuestionIds[1]]: '2', 
        [asqQuestionIds[2]]: '4',
        // 模拟部分答题
      },
      score: 45,
      totalQuestions: asqQuestionIds.length,
      answeredQuestions: 3,
      totalTimeSeconds: 180,
      scaleScores: {
        '家庭生活': 15,
        '学业表现': 12,
        '上学出勤': 8
      },
      startedAt: new Date(Date.now() - 300000), // 5分钟前开始
      submittedAt: new Date()
    }
  });

  // 创建AI会话测试数据
  const testAiSession = await prisma.aiSession.create({
    data: {
      examResultId: testExamResult.id,
      examId: asqExam.id,
      started_at: new Date(Date.now() - 300000),
      ended_at: new Date(),
      status: 'ENDED',
      ai_version: 'ai-service@2.0.0+models-2025-01-01',
      retention_ttl_sec: 86400
    }
  });

  // 创建AI聚合数据
  await prisma.aiAggregate.createMany({
    data: [
      {
        aiSessionId: testAiSession.id,
        model: 'ATTENTION',
        key: 'avg',
        value_json: { value: 0.81, unit: 'score' }
      },
      {
        aiSessionId: testAiSession.id,
        model: 'ATTENTION',
        key: 'low_ratio',
        value_json: { value: 0.12, unit: 'percentage' }
      },
      {
        aiSessionId: testAiSession.id,
        model: 'FACE',
        key: 'occlusion_ratio',
        value_json: { value: 0.06, unit: 'percentage' }
      },
      {
        aiSessionId: testAiSession.id,
        model: 'PPG',
        key: 'hr_avg',
        value_json: { value: 76, unit: 'bpm' }
      }
    ]
  });

  // 创建AI异常记录
  await prisma.aiAnomaly.create({
    data: {
      aiSessionId: testAiSession.id,
      code: 'LOOK_AWAY',
      severity: 'MEDIUM',
      from_ts: new Date(Date.now() - 120000),
      to_ts: new Date(Date.now() - 110000),
      evidence_json: {
        frames: ['thumb_001.jpg', 'thumb_002.jpg'],
        confidence: 0.85,
        duration_ms: 10000
      }
    }
  });

  // 创建AI检查点数据（时间序列）
  await prisma.aiCheckpoint.createMany({
    data: [
      {
        aiSessionId: testAiSession.id,
        timestamp: new Date(Date.now() - 180000),
        snapshot_json: {
          attention: 0.79,
          ppg_hr: 75,
          audio_dominant: 'neutral',
          face_detected: true
        }
      },
      {
        aiSessionId: testAiSession.id,
        timestamp: new Date(Date.now() - 120000),
        snapshot_json: {
          attention: 0.65,
          ppg_hr: 82,
          audio_dominant: 'stressed',
          face_detected: false
        }
      },
      {
        aiSessionId: testAiSession.id,
        timestamp: new Date(Date.now() - 60000),
        snapshot_json: {
          attention: 0.88,
          ppg_hr: 71,
          audio_dominant: 'calm',
          face_detected: true
        }
      }
    ]
  });

  // 创建学生作答时间线事件
  await prisma.questionActionEvent.createMany({
    data: [
      {
        examResultId: testExamResult.id,
        questionId: asqQuestionIds[0],
        event_type: 'DISPLAY',
        payload_json: {},
        occurred_at: new Date(Date.now() - 290000)
      },
      {
        examResultId: testExamResult.id,
        questionId: asqQuestionIds[0],
        event_type: 'SELECT',
        payload_json: {
          option_after: '3',
          source: 'click'
        },
        occurred_at: new Date(Date.now() - 280000)
      },
      {
        examResultId: testExamResult.id,
        questionId: asqQuestionIds[0],
        event_type: 'CHANGE',
        payload_json: {
          option_before: '3',
          option_after: '2',
          source: 'click'
        },
        occurred_at: new Date(Date.now() - 270000)
      },
      {
        examResultId: testExamResult.id,
        questionId: asqQuestionIds[1],
        event_type: 'DISPLAY',
        payload_json: {},
        occurred_at: new Date(Date.now() - 240000)
      },
      {
        examResultId: testExamResult.id,
        questionId: asqQuestionIds[1],
        event_type: 'SELECT',
        payload_json: {
          option_after: '2',
          source: 'voice'
        },
        occurred_at: new Date(Date.now() - 220000)
      }
    ]
  });

  // 创建交互数据记录
  await prisma.examInteractionData.create({
    data: {
      examResultId: testExamResult.id,
      timelineData: [
        {
          type: 'DISPLAY',
          question_id: asqQuestionIds[0],
          timestamp: new Date(Date.now() - 290000).toISOString()
        },
        {
          type: 'SELECT',
          question_id: asqQuestionIds[0],
          timestamp: new Date(Date.now() - 280000).toISOString(),
          payload: { option: '3', source: 'click' }
        }
      ],
      voiceInteractions: {
        total_voice_commands: 3,
        successful_recognitions: 2,
        voice_quality_avg: 0.82
      },
      deviceTestResults: {
        camera: { status: 'passed', resolution: '720p' },
        microphone: { status: 'passed', level: 0.75 },
        network: { status: 'passed', latency_ms: 45 }
      }
    }
  });

  console.log('✅ 创建测试数据完成');
  console.log(`   - 学生答卷: ${testExamResult.participantName}`);
  console.log(`   - AI会话: ${testAiSession.id}`);
  console.log(`   - 时间线事件: 5个行为事件`);
  console.log(`   - AI数据: 聚合指标 + 异常记录 + 检查点`);

  // 4. 创建临时测试题库 (12题，快速测试用)
  const testPaper = await prisma.paper.create({
    data: {
      title: '临时测试题库',
      description: '包含12道测试题目，涵盖单选、多选、文本题型，用于功能测试和开发调试。',
      scaleType: 'flat',
      showScores: true,
      scaleConfig: {
        totalQuestions: 12,
        scoringType: 'sum',
        scoreRange: { min: 0, max: 36 },
        description: '快速测试题库，包含3种题型和条件逻辑示例'
      },
      teacherId: teacher.id,
    },
  });

  // 测试题目数据
  const testQuestions = [
    // 单选题 (4题，必填)
    {
      title: "您的性别是？",
      type: 'single_choice',
      options: { "A": { text: "男", score: 1 }, "B": { text: "女", score: 2 }, "C": { text: "其他", score: 3 } },
      required: true,
      scored: true,
      order: 1
    },
    {
      title: "您的年龄段？",
      type: 'single_choice', 
      options: { "A": { text: "18岁以下", score: 1 }, "B": { text: "18-25岁", score: 2 }, "C": { text: "26-35岁", score: 3 }, "D": { text: "36岁以上", score: 4 } },
      required: true,
      scored: true,
      order: 2
    },
    {
      title: "您对心理测试的了解程度？",
      type: 'single_choice',
      options: { "A": { text: "完全不了解", score: 1 }, "B": { text: "了解一点", score: 2 }, "C": { text: "比较了解", score: 3 }, "D": { text: "非常了解", score: 4 } },
      required: true,
      scored: true,
      order: 3
    },
    {
      title: "您参与本次测试的目的？",
      type: 'single_choice',
      options: { "A": { text: "学术研究", score: 1 }, "B": { text: "自我了解", score: 2 }, "C": { text: "课程要求", score: 3 }, "D": { text: "其他", score: 4 } },
      required: true,
      scored: true,
      order: 4
    },
    
    // 多选题 (3题，必填)
    {
      title: "您常用的学习方式有哪些？（可多选）",
      type: 'multiple_choice',
      options: { "A": { text: "看书阅读", score: 1 }, "B": { text: "视频学习", score: 1 }, "C": { text: "实践操作", score: 1 }, "D": { text: "讨论交流", score: 1 }, "E": { text: "记忆背诵", score: 1 } },
      required: true,
      scored: true,
      order: 5
    },
    {
      title: "您希望从心理测试中获得什么？（可多选）",
      type: 'multiple_choice',
      options: { "A": { text: "了解性格", score: 1 }, "B": { text: "发现优势", score: 1 }, "C": { text: "改进不足", score: 1 }, "D": { text: "职业指导", score: 1 }, "E": { text: "学习建议", score: 1 } },
      required: true,
      scored: true,
      order: 6
    },
    {
      title: "您在以下哪些情况下会感到压力？（可多选）",
      type: 'multiple_choice',
      options: { "A": { text: "考试前", score: 1 }, "B": { text: "人际交往", score: 1 }, "C": { text: "工作任务", score: 1 }, "D": { text: "时间紧迫", score: 1 }, "E": { text: "决策选择", score: 1 } },
      required: true,
      scored: true,
      order: 7
    },
    
    // 文本题 (2题，选填)
    {
      title: "请简单描述您对心理健康的看法",
      type: 'text',
      options: {},
      required: false,
      scored: false,
      order: 8
    },
    {
      title: "如果可以改善一个个人特质，您会选择什么？为什么？",
      type: 'text', 
      options: {},
      required: false,
      scored: false,
      order: 9
    },
    
    // 条件逻辑题 (3题)
    {
      title: "您是否愿意接受进一步的心理咨询？",
      type: 'single_choice',
      options: { "A": { text: "非常愿意", score: 4 }, "B": { text: "比较愿意", score: 3 }, "C": { text: "不太愿意", score: 2 }, "D": { text: "完全不愿意", score: 1 } },
      required: true,
      scored: true,
      order: 10,
      condition: null // 无条件，总是显示
    },
    {
      title: "您希望通过什么方式进行心理咨询？",
      type: 'single_choice',
      options: { "A": { text: "面对面咨询", score: 1 }, "B": { text: "在线视频", score: 2 }, "C": { text: "电话咨询", score: 3 }, "D": { text: "文字聊天", score: 4 } },
      required: true,
      scored: true,
      order: 11,
      condition: { question_order: 10, selected_options: ["A", "B"] } // 只有选择愿意的才显示
    },
    {
      title: "请说明您希望改善的具体问题",
      type: 'text',
      options: {},
      required: false,
      scored: false,
      order: 12,
      condition: { question_order: 10, selected_options: ["A", "B"] } // 只有选择愿意的才显示
    }
  ];

  // 创建测试题目并处理条件逻辑
  const testQuestionIds = [];
  const createdTestQuestions = [];
  
  for (const questionData of testQuestions) {
    const question = await prisma.question.create({
      data: {
        paperId: testPaper.id,
        questionOrder: questionData.order,
        title: questionData.title,
        options: questionData.options,
        questionType: questionData.type,
        isRequired: questionData.required,
        isScored: questionData.scored,
        displayCondition: Prisma.DbNull, // 暂时设为null，后面处理条件
      }
    });
    testQuestionIds.push(question.id);
    createdTestQuestions.push({ ...questionData, id: question.id });
  }
  
  // 处理条件逻辑
  for (const questionData of createdTestQuestions) {
    if (questionData.condition) {
      const dependentQuestion = createdTestQuestions.find(q => q.order === questionData.condition.question_order);
      if (dependentQuestion) {
        await prisma.question.update({
          where: { id: questionData.id },
          data: {
            displayCondition: {
              question_id: dependentQuestion.id,
              selected_option: questionData.condition.selected_options[0] // 简化为单个选项
            }
          }
        });
      }
    }
  }

  // 创建测试考试
  const testQuestionSnapshot = {
    version: 2,
    created_at: new Date(),
    questions: testQuestionIds.map((id, index) => {
      const questionData = testQuestions[index];
      return {
        id,
        version: 1,
        order: index + 1,
        title: questionData.title.substring(0, 100),
        type: questionData.type,
        required: questionData.required
      };
    }),
    total_count: testQuestionIds.length
  };
  
  const testExam = await prisma.exam.create({
    data: {
      title: '临时功能测试',
      paperId: testPaper.id,
      teacherId: teacher.id,
      durationMinutes: 15,
      questionSnapshot: testQuestionSnapshot,
      status: 'PUBLISHED',
    },
  });

  console.log(`✅ 创建临时测试题库: ${testQuestionIds.length}道题目`);

  console.log('🎉 心理量表数据播种完成！');
  console.log(`📚 教师账号: T2025001 / 123456`);
  console.log(`🔗 ASQ压力测评: http://localhost:3000/exam/${asqExam.publicUuid}`);
  console.log(`🔗 SCARED焦虑筛查: http://localhost:3000/exam/${scaredExam.publicUuid}`);
  console.log(`🔗 SCAS焦虑量表: http://localhost:3000/exam/${scasExam.publicUuid}`);
  console.log(`🔗 临时功能测试: http://localhost:3000/exam/${testExam.publicUuid}`);
  console.log(`📊 数据统计:`);
  console.log(`   - ASQ: 10维度, 56题 (1-5分制, 总分56-280)`);
  console.log(`   - SCARED: 扁平结构, 41题 (0-2分制, 总分0-82)`);
  console.log(`   - SCAS: 6维度, 45题 (0-3分制, 38计分题最大114分)`);
  console.log(`   - 临时测试: 扁平结构, 12题 (混合题型, 快速测试用)`);
}

main()
  .catch((e) => {
    console.error('❌ 播种数据失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });