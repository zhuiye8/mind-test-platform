import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyData(): Promise<void> {
  console.log('🔍 验证心理量表数据...\n');

  const papers = await prisma.paper.findMany({
    include: {
      scales: true,
      questions: true
    }
  });

  for (const paper of papers) {
    console.log(`📋 ${paper.title}`);
    console.log(`   类型: ${paper.scaleType}, 显示分数: ${paper.showScores}`);
    console.log(`   维度数: ${paper.scales.length}, 题目数: ${paper.questions.length}`);
    
    const scoredQuestions = paper.questions.filter(q => q.isScored).length;
    const fillerQuestions = paper.questions.filter(q => !q.isScored).length;
    console.log(`   计分题: ${scoredQuestions}, 填充题: ${fillerQuestions}`);
    
    if (paper.scales.length > 0) {
      console.log(`   维度: ${paper.scales.map(s => s.scaleName).join(', ')}`);
    }
    
    // 验证选项格式
    const sampleQuestion = paper.questions[0];
    if (sampleQuestion) {
      console.log(`   选项格式示例: ${JSON.stringify(sampleQuestion.options)}`);
    }
    console.log('');
  }
  
  // 统计总数
  const totalScales = await prisma.scale.count();
  const totalQuestions = await prisma.question.count();
  const totalExams = await prisma.exam.count();
  
  console.log('📊 数据统计总览:');
  console.log(`   试卷总数: ${papers.length}`);
  console.log(`   维度总数: ${totalScales}`);
  console.log(`   题目总数: ${totalQuestions}`);
  console.log(`   考试总数: ${totalExams}`);
}

verifyData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());