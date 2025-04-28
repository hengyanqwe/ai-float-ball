import { MarkedOptions } from "marked";

// 配置接口
export interface AIFloatBallConfig {
  // 基础配置
  apiUrl: string;                 // API接口地址
  apiKey: string;                 // API密钥
  model: string;                  // 模型名称
  headers?: Record<string, string>; // 自定义请求头

  // 位置配置
  position?: {                    // 初始位置
    ball:positionI,
    dialog:positionI
  };

  // 对话框标题
  title?:string;

  // 初始问候语
  welcomeMessage?: string;        // AI的第一句问候语

  /* 示例
  * `你是一个有用的AI智能客服。请基于以下系统文档知识库来回答用户的问题。如果有人问你你的功能是什么，你的功能是回答用户的问题
回答时要简洁明了，如果用户的问题与系统功能相关，请根据知识库内容回答。
输出格式需要是简化的md格式，只允许使用**加粗**和换行，不要使用标题(#)、列表、缩进等其他markdown语法。
如果问题不在知识库范围内，就用你自己的知识回答，并注明这是你的建议而非系统官方信息。如果用户无法满足需求或要反馈，输出<a href="/desk/feedback" target="_blank" style="color:#65c6cb">点击这里进行在线反馈</a>。
如果有相关图片的话尽量要带，但一定要进行格式转换，注意千万不要输出这种![]()的md的图片格式，要用img标签的方式输出图片，例如![操作手册](操作手册.assets\\{文件名}.jpg)就是<img src="/docs/操作手册.assets/{文件名}.jpg" style="width:100%"/> 文件名一定要保持一致！。`
  * */
  systemPrompt: string;          // 系统提示词

  // 使用文档url
  docPath:string;

  // Markdown渲染配置
  markedOptions?: MarkedOptions;  // 使用marked库的原生类型

  // 自定义组件
  customIcons?: {                 // 自定义图标
    ball?: React.ReactNode;       // 浮动球图标
    user?: React.ReactNode;       // 用户头像
    ai?: React.ReactNode;         // AI头像
  };

  // 高级选项
  maxHistoryLength?: number;      // 最大历史消息数量
}

export interface positionI {
  x: number;
  y: number;
}
