import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 开始播种数据...');

  // 创建测试教师账号
  const hashedPassword = await bcrypt.hash('123456', 12);

  const teacher = await prisma.teacher.upsert({
    where: { teacherId: 'T2025001' },
    update: {},
    create: {
      teacherId: 'T2025001',
      name: '张老师',
      passwordHash: hashedPassword,
    },
  });

  console.log('✅ 创建教师账号:', teacher);

  // 创建示例试卷
  const paper = await prisma.paper.create({
    data: {
      title: '大学生心理健康状况评估问卷',
      description: '用于评估大学生心理健康水平的标准化问卷',
      teacherId: teacher.id,
    },
  });

  console.log('✅ 创建试卷:', paper);

  // 创建示例题目（包含条件逻辑）
  const questions = [
    {
      questionOrder: 1,
      title: '最近一个月，你感到压力大吗？',
      options: JSON.stringify({
        A: '完全没有',
        B: '偶尔',
        C: '经常',
        D: '总是',
      }),
      questionType: 'single_choice',
      displayCondition: Prisma.DbNull,
    },
    {
      questionOrder: 2,
      title: '你的压力主要来源是什么？',
      options: JSON.stringify({
        A: '学业压力',
        B: '人际关系',
        C: '经济问题',
        D: '家庭问题',
      }),
      questionType: 'single_choice',
      displayCondition: JSON.stringify({
        question_id: '', // 稍后更新
        selected_option: 'C',
      }),
    },
    {
      questionOrder: 3,
      title: '你通常如何缓解压力？',
      options: JSON.stringify({
        A: '运动锻炼',
        B: '听音乐',
        C: '与朋友聊天',
        D: '独自思考',
      }),
      questionType: 'single_choice',
      displayCondition: JSON.stringify({
        question_id: '', // 稍后更新
        selected_option: 'D',
      }),
    },
  ];

  // 创建第一个题目
  const question1 = await prisma.question.create({
    data: {
      ...questions[0],
      paperId: paper.id,
    },
  });

  // 更新条件逻辑中的question_id
  const question2 = await prisma.question.create({
    data: {
      ...questions[1],
      paperId: paper.id,
      displayCondition: JSON.stringify({
        question_id: question1.id,
        selected_option: 'C',
      }),
    },
  });

  const question3 = await prisma.question.create({
    data: {
      ...questions[2],
      paperId: paper.id,
      displayCondition: JSON.stringify({
        question_id: question1.id,
        selected_option: 'D',
      }),
    },
  });

  console.log('✅ 创建题目:', [question1, question2, question3]);

  // 创建示例考试
  const exam = await prisma.exam.create({
    data: {
      title: '2025年春季心理健康普查',
      paperId: paper.id,
      teacherId: teacher.id,
      durationMinutes: 30,
      questionIdsSnapshot: JSON.stringify([question1.id, question2.id, question3.id]),
      status: 'PUBLISHED',
    },
  });

  console.log('✅ 创建考试:', exam);

  console.log('🎉 数据播种完成！');
  console.log(`📚 教师账号: T2025001 / 123456`);
  console.log(`🔗 考试链接: http://localhost:3000/exam/${exam.publicUuid}`);
}

main()
  .catch((e) => {
    console.error('❌ 播种数据失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });