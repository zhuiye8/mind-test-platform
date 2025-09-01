// ParticipantExam 样式系统 - 统一管理样式常量和主题
import type { CSSProperties } from 'react';

// 渐变主题系统
export const gradientThemes = {
  // 密码验证页面 - 蓝紫色渐变
  password: `
    linear-gradient(135deg, 
      rgba(79, 70, 229, 0.08) 0%, 
      rgba(16, 185, 129, 0.06) 50%, 
      rgba(79, 70, 229, 0.08) 100%
    ),
    radial-gradient(circle at 20% 30%, rgba(79, 70, 229, 0.12) 0%, transparent 60%),
    radial-gradient(circle at 80% 70%, rgba(16, 185, 129, 0.12) 0%, transparent 60%)
  `,
  
  // 信息录入页面 - 绿橙色渐变
  info: `
    linear-gradient(135deg, 
      rgba(16, 185, 129, 0.08) 0%, 
      rgba(245, 158, 11, 0.06) 50%, 
      rgba(16, 185, 129, 0.08) 100%
    ),
    radial-gradient(circle at 30% 20%, rgba(16, 185, 129, 0.12) 0%, transparent 60%),
    radial-gradient(circle at 70% 80%, rgba(245, 158, 11, 0.12) 0%, transparent 60%)
  `,
  
  // 考试进行页面 - 轻微渐变
  exam: `
    linear-gradient(145deg, 
      rgba(79, 70, 229, 0.03) 0%, 
      rgba(16, 185, 129, 0.02) 30%, 
      rgba(245, 158, 11, 0.03) 60%, 
      rgba(79, 70, 229, 0.03) 100%
    )
  `,
  
  // 完成页面 - 成功绿色渐变
  completed: `
    linear-gradient(135deg, 
      rgba(16, 185, 129, 0.08) 0%, 
      rgba(34, 197, 94, 0.06) 100%
    ),
    radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.15) 0%, transparent 70%)
  `
};

// 现代卡片样式系统
export const cardStyles = {
  // 主要卡片样式 - 毛玻璃效果
  modern: {
    borderRadius: 24,
    boxShadow: `
      0 20px 40px rgba(0, 0, 0, 0.08),
      0 8px 16px rgba(0, 0, 0, 0.04),
      inset 0 1px 0 rgba(255, 255, 255, 0.6)
    `,
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(20px)'
  } as CSSProperties,
  
  // 题目卡片样式
  question: {
    borderRadius: 24,
    boxShadow: '0 20px 40px rgba(0,0,0,0.08), 0 8px 16px rgba(0,0,0,0.04)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'rgba(255, 255, 255, 0.98)',
    backdropFilter: 'blur(20px)',
    transition: 'all 0.3s ease'
  } as CSSProperties,
  
  // 侧边栏卡片
  sidebar: {
    borderRadius: 16,
    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(0,0,0,0.06)',
    boxShadow: '0 8px 16px rgba(0,0,0,0.04)'
  } as CSSProperties
};

// 题目类型颜色映射
export const questionTypeColors = {
  single_choice: {
    primary: '#4F46E5',    // 蓝色
    secondary: '#7C3AED',
    light: 'rgba(79, 70, 229, 0.1)',
    ultraLight: 'rgba(79, 70, 229, 0.04)',
    border: 'rgba(79, 70, 229, 0.2)',
    gradient: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)'
  },
  multiple_choice: {
    primary: '#10B981',    // 绿色
    secondary: '#059669',
    light: 'rgba(16, 185, 129, 0.1)',
    ultraLight: 'rgba(16, 185, 129, 0.04)',
    border: 'rgba(16, 185, 129, 0.2)',
    gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
  },
  text: {
    primary: '#F59E0B',    // 橙色
    secondary: '#D97706',
    light: 'rgba(245, 158, 11, 0.1)',
    ultraLight: 'rgba(245, 158, 11, 0.04)',
    border: 'rgba(245, 158, 11, 0.2)',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
  }
};

// 按钮样式系统
export const buttonStyles = {
  // 主要操作按钮
  primary: {
    borderRadius: 12,
    height: 52,
    fontSize: 16,
    fontWeight: 600,
    transition: 'all 0.3s ease',
    border: 'none'
  } as CSSProperties,
  
  // 导航按钮
  navigation: {
    borderRadius: 12,
    height: 44,
    minWidth: 120,
    transition: 'all 0.3s ease'
  } as CSSProperties,
  
  // 题目导航按钮
  questionNav: {
    height: 48,
    borderRadius: 12,
    transition: 'all 0.3s ease'
  } as CSSProperties
};

// 输入框样式系统
export const inputStyles = {
  // 标准输入框
  standard: {
    borderRadius: 12,
    height: 52,
    fontSize: 16,
    border: '2px solid #E5E7EB',
    transition: 'all 0.3s ease'
  } as CSSProperties,
  
  // 文本域
  textarea: {
    borderRadius: 12,
    fontSize: 16,
    lineHeight: 1.6,
    padding: 16,
    border: '2px solid #E5E7EB',
    background: 'rgba(255, 255, 255, 0.8)',
    transition: 'all 0.3s ease'
  } as CSSProperties
};

// 选项样式生成器
export const createOptionStyle = (
  questionType: 'single_choice' | 'multiple_choice' | 'text',
  isSelected: boolean = false,
  isHovered: boolean = false
): CSSProperties => {
  const colors = questionTypeColors[questionType];
  
  return {
    display: 'flex',
    alignItems: 'flex-start',
    padding: 16,
    marginBottom: 12,
    borderRadius: 12,
    border: `2px solid ${isSelected ? colors.primary : 'transparent'}`,
    background: isSelected ? colors.light : 
                isHovered ? colors.ultraLight : colors.ultraLight,
    transition: 'all 0.3s ease',
    cursor: 'pointer'
  };
};

// 顶部状态栏样式
export const statusBarStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  background: 'rgba(255, 255, 255, 0.95)',
  backdropFilter: 'blur(20px)',
  borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
  zIndex: 1000,
  padding: '12px 24px'
};

// 计时器样式生成器
export const createTimerStyle = (timeRemaining: number): CSSProperties => {
  const isWarning = timeRemaining < 300; // 5分钟警告
  
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: isWarning ? 'rgba(239, 68, 68, 0.1)' : 'rgba(79, 70, 229, 0.1)',
    border: `1px solid ${isWarning ? 'rgba(239, 68, 68, 0.2)' : 'rgba(79, 70, 229, 0.2)'}`,
    padding: '8px 12px',
    borderRadius: 12,
    animation: isWarning ? 'pulse 2s infinite' : 'none'
  };
};

// 图标容器样式生成器
export const createIconContainerStyle = (
  primaryColor: string,
  secondaryColor: string
): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 80,
  height: 80,
  borderRadius: 20,
  background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
  marginBottom: 24,
  boxShadow: `0 8px 20px ${primaryColor}33`
});

// CSS 动画关键帧 (需要在全局CSS中定义)
export const cssAnimations = `
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes questionSlide {
  from {
    opacity: 0.5;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

@keyframes glowPulse {
  0%, 100% {
    box-shadow: 0 0 5px rgba(79, 70, 229, 0.3);
  }
  50% {
    box-shadow: 0 0 20px rgba(79, 70, 229, 0.6);
  }
}
`;

// 响应式断点
export const breakpoints = {
  mobile: 768,
  tablet: 1024,
  desktop: 1200
};

// 间距系统
export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48
};