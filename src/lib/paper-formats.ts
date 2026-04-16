// 国标 GB/T 7714 论文格式配置

export interface ChapterTemplate {
  title: string;
  required: boolean;
  level: number; // 1=一级标题, 2=二级标题, 3=三级标题
  minWords?: number;
  desc?: string;
}

export interface PaperFormat {
  id: string;
  label: string;
  desc: string;
  chapters: ChapterTemplate[];
  // Word 排版参数
  wordFormat: {
    pageSize: { width: number; height: number }; // 单位: twips (1/20 pt)
    margins: { top: number; right: number; bottom: number; left: number };
    fontName: string;
    fontSize: number; // 单位: 半磅 (1/1440 inch)
    fontSizeCN: string;
    lineSpacing: number;
    titleFontSize: number;
  };
}

export const PAPER_FORMATS: Record<string, PaperFormat> = {
  bachelor: {
    id: 'bachelor',
    label: '本科毕业论文',
    desc: '适用于本科毕业生论文，要求结构完整、内容充实',
    chapters: [
      { title: '摘要', required: true, level: 1, minWords: 200, desc: '中英文摘要' },
      { title: '关键词', required: true, level: 1, desc: '3-5个关键词' },
      { title: '目录', required: true, level: 1 },
      { title: '第一章 绪论', required: true, level: 1, minWords: 1500, desc: '研究背景与意义' },
      { title: '第二章 理论基础/文献综述', required: true, level: 1, minWords: 2000, desc: '相关理论与研究现状' },
      { title: '第三章 研究方法/系统设计', required: true, level: 1, minWords: 1500, desc: '研究方案与技术路线' },
      { title: '第四章 实证分析/系统实现', required: true, level: 1, minWords: 2000, desc: '数据收集、模型构建、结果分析' },
      { title: '第五章 结论与展望', required: true, level: 1, minWords: 800, desc: '研究总结、局限性、未来方向' },
      { title: '参考文献', required: true, level: 1 },
      { title: '致谢', required: true, level: 1 },
      { title: '附录', required: false, level: 1 },
    ],
    wordFormat: {
      pageSize: { width: 11906, height: 16838 }, // A4
      margins: { top: 1418, right: 1418, bottom: 1418, left: 1418 }, // 约2.5cm
      fontName: 'Times New Roman',
      fontSize: 24, // 12pt = 24 half-points
      fontSizeCN: '宋体',
      lineSpacing: 360, // 1.5倍行距
      titleFontSize: 36, // 18pt = 36 half-points
    },
  },
  master: {
    id: 'master',
    label: '硕士学位论文',
    desc: '适用于硕士学术学位论文，要求理论深度和研究创新',
    chapters: [
      { title: '摘要', required: true, level: 1, minWords: 500, desc: '中英文摘要' },
      { title: '关键词', required: true, level: 1, desc: '3-5个关键词' },
      { title: '目录', required: true, level: 1 },
      { title: '第一章 绪论', required: true, level: 1, minWords: 3000, desc: '研究背景、意义、国内外研究现状' },
      { title: '第二章 理论基础', required: true, level: 1, minWords: 3000, desc: '核心概念与理论基础' },
      { title: '第三章 研究假设与研究设计', required: true, level: 1, minWords: 2000, desc: '研究框架、假设、方法论' },
      { title: '第四章 实证分析', required: true, level: 1, minWords: 4000, desc: '数据收集、模型检验、结果分析' },
      { title: '第五章 讨论', required: true, level: 1, minWords: 2000, desc: '结果解释、理论贡献、实践意义' },
      { title: '第六章 结论与展望', required: true, level: 1, minWords: 1000, desc: '主要结论、创新点、局限与未来方向' },
      { title: '参考文献', required: true, level: 1 },
      { title: '攻读学位期间的研究成果', required: true, level: 1 },
      { title: '致谢', required: true, level: 1 },
      { title: '附录', required: false, level: 1 },
    ],
    wordFormat: {
      pageSize: { width: 11906, height: 16838 },
      margins: { top: 1134, right: 1418, bottom: 1134, left: 1418 }, // 上左2cm, 下右2.5cm
      fontName: 'Times New Roman',
      fontSize: 24,
      fontSizeCN: '宋体',
      lineSpacing: 360,
      titleFontSize: 36,
    },
  },
  doctoral: {
    id: 'doctoral',
    label: '博士学位论文',
    desc: '适用于博士学术学位论文，要求系统性创新和理论贡献',
    chapters: [
      { title: '摘要', required: true, level: 1, minWords: 800, desc: '中英文摘要' },
      { title: '关键词', required: true, level: 1, desc: '3-5个关键词' },
      { title: '目录', required: true, level: 1 },
      { title: '第一章 绪论', required: true, level: 1, minWords: 5000, desc: '研究背景、问题提出、系统性文献综述' },
      { title: '第二章 理论基础与文献述评', required: true, level: 1, minWords: 5000, desc: '理论框架构建、核心概念界定' },
      { title: '第三章 研究设计/理论建构', required: true, level: 1, minWords: 4000, desc: '研究方法、创新点、理论假设' },
      { title: '第四章 研究方法', required: true, level: 1, minWords: 3000, desc: '数据来源、研究设计、方法论证' },
      { title: '第五章 实证分析', required: true, level: 1, minWords: 6000, desc: '深度数据分析、模型验证' },
      { title: '第六章 理论讨论', required: true, level: 1, minWords: 4000, desc: '理论贡献、实践价值、政策建议' },
      { title: '第七章 结论与展望', required: true, level: 1, minWords: 2000, desc: '核心发现、创新点、局限、未来研究方向' },
      { title: '参考文献', required: true, level: 1 },
      { title: '附录', required: false, level: 1 },
      { title: '攻读学位期间的研究成果', required: true, level: 1 },
      { title: '致谢', required: true, level: 1 },
    ],
    wordFormat: {
      pageSize: { width: 11906, height: 16838 },
      margins: { top: 1134, right: 1418, bottom: 1134, left: 1418 },
      fontName: 'Times New Roman',
      fontSize: 24,
      fontSizeCN: '宋体',
      lineSpacing: 360,
      titleFontSize: 36,
    },
  },
};

export function getFormat(id: string): PaperFormat {
  return PAPER_FORMATS[id] || PAPER_FORMATS.bachelor;
}

export function getDefaultOutline(formatId: string): { title: string; desc: string }[] {
  const format = getFormat(formatId);
  return format.chapters
    .filter(c => c.required)
    .map(c => ({ title: c.title, desc: c.desc || '' }));
}
