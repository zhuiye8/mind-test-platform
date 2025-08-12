import type { ThemeConfig } from 'antd';

// 设计token定义
export const designTokens = {
  // 色彩系统
  colors: {
    // 主色调 - 温和专业蓝（信任感）
    primary: {
      50: '#EEF2FF',
      100: '#E0E7FF', 
      200: '#C7D2FE',
      300: '#A5B4FC',
      400: '#818CF8',
      500: '#4F46E5', // 主色
      600: '#4338CA',
      700: '#3730A3',
      800: '#312E81',
      900: '#1E1B4B',
    },
    
    // 辅助色 - 宁静绿（平静感）
    secondary: {
      50: '#ECFDF5',
      100: '#D1FAE5',
      200: '#A7F3D0',
      300: '#6EE7B7',
      400: '#34D399',
      500: '#10B981', // 辅助色
      600: '#059669',
      700: '#047857',
      800: '#065F46',
      900: '#064E3B',
    },
    
    // 强调色 - 温暖橙（活力感）
    accent: {
      50: '#FFF7ED',
      100: '#FFEDD5',
      200: '#FED7AA',
      300: '#FDBA74',
      400: '#FB923C',
      500: '#F97316', // 强调色
      600: '#EA580C',
      700: '#C2410C',
      800: '#9A3412',
      900: '#7C2D12',
    },
    
    // 中性色系 - 层次感
    neutral: {
      50: '#F9FAFB',
      100: '#F3F4F6',
      200: '#E5E7EB', 
      300: '#D1D5DB',
      400: '#9CA3AF',
      500: '#6B7280',
      600: '#4B5563',
      700: '#374151',
      800: '#1F2937',
      900: '#111827',
    },
    
    // 功能色 - 柔和状态色彩
    success: '#10B981',
    warning: '#F59E0B', 
    error: '#EF4444',
    info: '#3B82F6',
    
    // 背景色
    background: {
      primary: '#FFFFFF',
      secondary: '#F9FAFB', 
      tertiary: '#F3F4F6',
      paper: '#FFFFFF',
    },
  },
  
  // 字体系统
  typography: {
    fontFamily: {
      sans: [
        '"Inter"',
        '"Noto Sans SC"', 
        'system-ui',
        '-apple-system',
        'BlinkMacSystemFont',
        'sans-serif'
      ].join(', '),
      mono: [
        '"JetBrains Mono"',
        '"Fira Code"',
        'Monaco', 
        'Consolas',
        'monospace'
      ].join(', '),
    },
    fontSize: {
      xs: '12px',
      sm: '14px', 
      base: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '30px',
      '4xl': '36px',
      '5xl': '48px',
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600', 
      bold: '700',
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75',
    },
  },
  
  // 间距系统 - 8px网格
  spacing: {
    0: '0px',
    1: '4px',
    2: '8px',
    3: '12px', 
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
    16: '64px',
    20: '80px',
    24: '96px',
    32: '128px',
  },
  
  // 圆角系统
  borderRadius: {
    none: '0px',
    sm: '4px',
    base: '6px', 
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '24px',
    full: '9999px',
  },
  
  // 阴影系统
  boxShadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    base: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  },
  
  // 动画系统
  animation: {
    duration: {
      fast: '150ms',
      normal: '300ms',
      slow: '500ms',
    },
    easing: {
      linear: 'linear',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
      easeOut: 'cubic-bezier(0, 0, 0.2, 1)',  
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },
  
  // 断点系统
  breakpoints: {
    sm: '576px',
    md: '768px', 
    lg: '992px',
    xl: '1200px',
    xxl: '1600px',
  },
};

// Ant Design主题配置
export const antdTheme: ThemeConfig = {
  token: {
    // 基础色彩
    colorPrimary: designTokens.colors.primary[500],
    colorSuccess: designTokens.colors.success,
    colorWarning: designTokens.colors.warning,
    colorError: designTokens.colors.error,
    colorInfo: designTokens.colors.info,
    
    // 中性色彩
    colorText: designTokens.colors.neutral[800],
    colorTextSecondary: designTokens.colors.neutral[600],
    colorTextTertiary: designTokens.colors.neutral[400],
    colorTextQuaternary: designTokens.colors.neutral[300],
    
    // 背景色彩
    colorBgLayout: designTokens.colors.background.secondary,
    colorBgContainer: designTokens.colors.background.primary,
    colorBgElevated: designTokens.colors.background.paper,
    
    // 边框色彩
    colorBorder: designTokens.colors.neutral[200],
    colorBorderSecondary: designTokens.colors.neutral[100],
    
    // 字体
    fontFamily: designTokens.typography.fontFamily.sans,
    fontSize: 16,
    fontSizeHeading1: 32,
    fontSizeHeading2: 28,
    fontSizeHeading3: 24,
    fontSizeHeading4: 20,
    fontSizeHeading5: 16,
    
    // 圆角
    borderRadius: parseInt(designTokens.borderRadius.base),
    borderRadiusLG: parseInt(designTokens.borderRadius.lg),
    borderRadiusSM: parseInt(designTokens.borderRadius.sm),
    borderRadiusXS: parseInt(designTokens.borderRadius.sm),
    
    // 间距
    padding: parseInt(designTokens.spacing[4]),
    paddingLG: parseInt(designTokens.spacing[6]),
    paddingSM: parseInt(designTokens.spacing[3]),
    paddingXS: parseInt(designTokens.spacing[2]),
    paddingXXS: parseInt(designTokens.spacing[1]),
    
    margin: parseInt(designTokens.spacing[4]),
    marginLG: parseInt(designTokens.spacing[6]),
    marginSM: parseInt(designTokens.spacing[3]),
    marginXS: parseInt(designTokens.spacing[2]),
    marginXXS: parseInt(designTokens.spacing[1]),
    
    // 控件尺寸
    controlHeight: 40,
    controlHeightLG: 48,
    controlHeightSM: 32,
    controlHeightXS: 24,
    
    // 线宽
    lineWidth: 1,
    lineWidthBold: 2,
    
    // 阴影
    boxShadow: designTokens.boxShadow.base,
    boxShadowSecondary: designTokens.boxShadow.sm,
    boxShadowTertiary: designTokens.boxShadow.sm,
    
    // 动画
    motionDurationFast: designTokens.animation.duration.fast,
    motionDurationMid: designTokens.animation.duration.normal,
    motionDurationSlow: designTokens.animation.duration.slow,
    motionEaseInOut: designTokens.animation.easing.easeInOut,
    motionEaseOut: designTokens.animation.easing.easeOut,
    // motionEaseIn: designTokens.animation.easing.easeIn, // 不支持的属性
  },
  
  components: {
    // Layout组件
    Layout: {
      bodyBg: designTokens.colors.background.secondary,
      headerBg: designTokens.colors.background.primary,
      siderBg: designTokens.colors.background.primary,
      footerBg: designTokens.colors.background.primary,
      headerHeight: 64,
      // siderWidth: 256, // 不支持的属性
      // collapsedWidth: 80, // 不支持的属性
    },
    
    // Card组件
    Card: {
      boxShadow: designTokens.boxShadow.sm,
      // boxShadowHover: designTokens.boxShadow.md, // 不支持的属性
      borderRadius: parseInt(designTokens.borderRadius.lg),
      padding: parseInt(designTokens.spacing[6]),
      paddingSM: parseInt(designTokens.spacing[4]),
    },
    
    // Button组件
    Button: {
      borderRadius: parseInt(designTokens.borderRadius.base),
      controlHeight: 40,
      controlHeightLG: 48,
      controlHeightSM: 32,
      paddingContentHorizontal: parseInt(designTokens.spacing[4]),
      paddingContentHorizontalLG: parseInt(designTokens.spacing[6]),
      paddingContentHorizontalSM: parseInt(designTokens.spacing[3]),
      fontWeight: parseInt(designTokens.typography.fontWeight.medium),
    },
    
    // Input组件
    Input: {
      borderRadius: parseInt(designTokens.borderRadius.base),
      controlHeight: 40,
      controlHeightLG: 48,
      controlHeightSM: 32,
      paddingBlock: parseInt(designTokens.spacing[2]),
      paddingInline: parseInt(designTokens.spacing[3]),
    },
    
    // Table组件
    Table: {
      borderRadius: parseInt(designTokens.borderRadius.lg),
      cellPaddingBlock: parseInt(designTokens.spacing[3]),
      cellPaddingInline: parseInt(designTokens.spacing[4]),
      headerBg: designTokens.colors.background.secondary,
      headerSortActiveBg: designTokens.colors.background.tertiary,
      rowHoverBg: designTokens.colors.neutral[50],
    },
    
    // Form组件
    Form: {
      itemMarginBottom: parseInt(designTokens.spacing[5]),
      labelFontSize: parseInt(designTokens.typography.fontSize.sm),
      labelColor: designTokens.colors.neutral[700],
      labelRequiredMarkColor: designTokens.colors.error,
    },
    
    // Modal组件
    Modal: {
      borderRadius: parseInt(designTokens.borderRadius.xl),
      contentBg: designTokens.colors.background.primary,
      headerBg: designTokens.colors.background.primary,
      footerBg: designTokens.colors.background.primary,
      boxShadow: designTokens.boxShadow['2xl'],
    },
    
    // Menu组件
    Menu: {
      borderRadius: parseInt(designTokens.borderRadius.base),
      itemBorderRadius: parseInt(designTokens.borderRadius.sm),
      itemHeight: 40,
      itemPaddingInline: parseInt(designTokens.spacing[4]),
      subMenuItemBg: 'transparent',
      itemSelectedBg: `${designTokens.colors.primary[500]}15`,
      itemSelectedColor: designTokens.colors.primary[600],
      itemHoverBg: designTokens.colors.neutral[50],
    },
    
    // Tag组件
    Tag: {
      borderRadiusSM: parseInt(designTokens.borderRadius.full),
      // paddingInline: parseInt(designTokens.spacing[2]), // 不支持的属性
      // paddingBlock: parseInt(designTokens.spacing[1]), // 不支持的属性
      fontSize: parseInt(designTokens.typography.fontSize.xs),
      // fontWeight: parseInt(designTokens.typography.fontWeight.medium), // 不支持的属性
    },
    
    // Statistic组件
    Statistic: {
      titleFontSize: parseInt(designTokens.typography.fontSize.sm),
      contentFontSize: parseInt(designTokens.typography.fontSize['3xl']),
      fontFamily: designTokens.typography.fontFamily.sans,
    },
    
    // Progress组件
    Progress: {
      defaultColor: designTokens.colors.primary[500],
      remainingColor: designTokens.colors.neutral[200],
      borderRadius: parseInt(designTokens.borderRadius.full),
      lineBorderRadius: parseInt(designTokens.borderRadius.full),
    },
    
    // Notification组件
    Notification: {
      borderRadius: parseInt(designTokens.borderRadius.lg),
      boxShadow: designTokens.boxShadow.lg,
    },
    
    // Message组件  
    Message: {
      borderRadius: parseInt(designTokens.borderRadius.lg),
      boxShadow: designTokens.boxShadow.md,
    },
  },
};

// 导出主题相关工具函数
export const themeUtils = {
  // 获取色彩值
  getColor: (path: string) => {
    const keys = path.split('.');
    let value: any = designTokens.colors;
    for (const key of keys) {
      value = value[key];
    }
    return value;
  },
  
  // 获取间距值
  getSpacing: (key: keyof typeof designTokens.spacing) => {
    return designTokens.spacing[key];
  },
  
  // 获取圆角值
  getBorderRadius: (key: keyof typeof designTokens.borderRadius) => {
    return designTokens.borderRadius[key];
  },
  
  // 获取阴影值
  getBoxShadow: (key: keyof typeof designTokens.boxShadow) => {
    return designTokens.boxShadow[key];
  },
  
  // 创建渐变
  createGradient: (from: string, to: string, direction = '135deg') => {
    return `linear-gradient(${direction}, ${from}, ${to})`;
  },
  
  // 创建rgba色彩
  createRgba: (color: string, alpha: number) => {
    // 简单的hex转rgba实现
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },
};

export default antdTheme;