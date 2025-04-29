import { RobotOutlined, UserOutlined } from "@ant-design/icons";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./FloatingBall.module.less";
import "./keyframes.css";
import axios, { AxiosResponse } from "axios";
import { marked } from 'marked';
import {AIFloatBallConfig} from "../../lib";
import { positionI } from "../../lib/types";

// 消息接口定义
interface Message {
  user?: string; // 用户消息是可选的
  ai: string; // 客服消息是必需的
}

interface IMessage {
  role: "system" | "user" | "assistant";
  content: string;
}


// 默认配置
const defaultConfig = {
  position: {
    ball:{
      x: window.innerWidth - 80,
      y: window.innerHeight - 80,
    },
    dialog: {
      x: window.innerWidth - 448,
      y: window.innerHeight - 640,
    }
  },
  maxHistoryLength: 20
};

const FloatingBall: React.FC<AIFloatBallConfig> = (config) => {
  // 合并默认配置和用户配置
  const mergedConfig = { ...defaultConfig, ...config } as AIFloatBallConfig;

  const [position, setPosition] = useState<positionI>({x: mergedConfig.position!.ball.x, y: mergedConfig.position!.ball.y,});
  const [dialogPosition, setDialogPosition] = useState<positionI>({x: mergedConfig.position!.dialog.x, y: mergedConfig.position!.dialog.y,});
  const [isDragging, setIsDragging] = useState(false);
  const [isDialogDragging, setIsDialogDragging] = useState(false);
  const [wasDragged, setWasDragged] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemKnowledge, setSystemKnowledge] = useState<string>("");

  // 使用ref来引用对话框元素
  const dialogRef = useRef<HTMLDivElement>(null);

  // 加载使用文档
  useEffect(() => {
    const fetchDocumentation = async () => {
      try {
        const response = (await axios(mergedConfig.docPath)) as AxiosResponse<string>;
        setSystemKnowledge(response.data);
      } catch (error) {
        console.error("加载文档失败:", error);
        // 设置一个简单的备用知识
        setSystemKnowledge(
          "# "
        );
      }
    };

    fetchDocumentation();
  }, []);

  // 修改marked配置
  useEffect(() => {
    // 合并用户配置的marked选项
    marked.setOptions({
      ...mergedConfig.markedOptions
    });

    // 创建自定义的扩展，将markdown处理限制在需要的范围内
    marked.use({
      tokenizer: {
        // 覆盖默认的标记器方法，禁用一些不需要的功能
        lheading() {
          return false; // 禁用setext风格的标题
        },
        table() {
          return false; // 禁用表格
        },
        blockquote() {
          return false; // 禁用块引用
        },
        code() {
          return false; // 禁用代码块
        },
        def() {
          return false; // 禁用定义
        },
        hr() {
          return false; // 禁用水平线
        }
      }
    });
  }, [mergedConfig.markedOptions]);

  // 修改updateMessages函数来处理Markdown内容
  const updateMessages = (newContent: string) => {
    setMessages((prev) => {
      const lastIndex = prev.length - 1;
      if (lastIndex >= 0 && prev[lastIndex].ai) {
        const newPrev = [...prev];
        newPrev[lastIndex] = {
          ...newPrev[lastIndex],
          ai: newPrev[lastIndex].ai + newContent,
        };
        return newPrev;
      }
      return [...prev, { ai: newContent }];
    });
  };

  const fetchTiChat = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 限制历史消息数量
      const maxHistory = mergedConfig.maxHistoryLength || 20;
      const historyMessages = messages.slice(-maxHistory);

      const history: IMessage[] = [];
      historyMessages.slice(1).forEach((o) => {
        if (o.ai) history.push({ role: "assistant", content: o.ai });
        if (o.user) history.push({ role: "user", content: o.user });
      });

      // 构建请求头
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mergedConfig.apiKey}`,
        ...mergedConfig.headers
      };

      // 构建系统提示词
      const systemPromptContent = mergedConfig.systemPrompt;

      const response = await fetch(mergedConfig.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: mergedConfig.model,
          messages: [
            {
              role: "system",
              content: `${systemPromptContent} md格式的标题格式只允许用h3、h4、h5、h6，禁用h1、h2，大标题也不允许用h1！ 文档:${systemKnowledge}`,
            },
            ...history,
            {
              role: "user",
              content: inputValue,
            },
          ],
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error("网络请求失败");
      }

      if (!response.body) {
        throw new Error("响应体为空");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.trim() === "") continue;
          if (line.startsWith("data: ")) {
            const dataStr = line.substring(6).trim();
            if (dataStr !== "[DONE]") {
              try {
                const data = JSON.parse(dataStr);
                const newContent = data.choices[0].delta.content || "";
                const cleanedContent = newContent.replace(
                  /_content|<\/?think>/g,
                  ""
                );

                // 动态更新最后一个AI消息
                updateMessages(cleanedContent);
              } catch (error) {
                console.error("解析流式响应失败:", error);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("调用API接口失败:", error);
      setError("请求失败，请稍后再试。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = () => {
    if (inputValue.trim()) {
      const newMessage = { user: inputValue, ai: "" };
      setMessages((prev) => [...prev, newMessage]);
      setInputValue("");
      fetchTiChat();
    }
  };

  const handleCloseDialog = () => {
    // 使用ref直接操作DOM隐藏对话框
    if (dialogRef.current) {
      dialogRef.current.classList.add("dialog-closing");
      setTimeout(() => {
        dialogRef.current!.style.display = "none";
        dialogRef.current!.classList.remove("dialog-closing");
      }, 300);
    }
  };

  // 使用 useRef 来存储当前位置，避免频繁的状态更新
  const ballPositionRef = useRef(position);
  const dialogPositionRef = useRef(dialogPosition);

  const handleMouseMove = (event: MouseEvent) => {
    if (isDragging) {
      setWasDragged(true); // 标记发生了拖动

      const newX = event.clientX - 35; // 调整以使悬浮球中心与鼠标对齐
      const newY = event.clientY - 35;

      // 限制悬浮球在页面内移动
      const boundedX = Math.max(0, Math.min(newX, window.innerWidth - 70)); // 70 是悬浮球的宽度
      const boundedY = Math.max(0, Math.min(newY, window.innerHeight - 70)); // 70 是悬浮球的高度

      // 直接更新 DOM 元素位置，避免 React 重新渲染
      const ballElement = document.querySelector(
        ".floating-ball"
      ) as HTMLElement;
      if (ballElement) {
        // 使用 requestAnimationFrame 优化性能
        requestAnimationFrame(() => {
          ballElement.style.left = `${boundedX}px`;
          ballElement.style.top = `${boundedY}px`;
          ballElement.style.transition = "none"; // 拖动时禁用过渡效果
        });
      }

      // 更新 ref 中的位置
      ballPositionRef.current = {
        x: boundedX,
        y: boundedY,
      };
    }

    if (isDialogDragging) {
      const newX = event.clientX - 180;
      const newY = event.clientY - 30;

      // 限制对话框在页面内移动
      const boundedX = Math.max(0, Math.min(newX, window.innerWidth - 360));
      const boundedY = Math.max(0, Math.min(newY, window.innerHeight - 500));

      // 直接更新DOM元素位置，使用left/top而非transform
      const dialogElement = document.querySelector(".dialog") as HTMLElement;
      if (dialogElement) {
        requestAnimationFrame(() => {
          dialogElement.style.left = `${boundedX}px`;
          dialogElement.style.top = `${boundedY}px`;
          dialogElement.style.transition = "none";
        });
      }

      // 更新ref中的位置
      dialogPositionRef.current = {
        x: boundedX,
        y: boundedY,
      };
    }
  };

  const handleMouseUp = () => {
    // 拖动结束时，更新状态以保持位置
    if (isDragging) {
      setPosition(ballPositionRef.current);

      // 恢复过渡效果
      const ballElement = document.querySelector(
        ".floating-ball"
      ) as HTMLElement;
      if (ballElement) {
        ballElement.style.transition =
          "left 0.3s ease, top 0.3s ease, transform 0.3s ease";
      }
    }

    if (isDialogDragging) {
      setDialogPosition(dialogPositionRef.current);

      // 恢复过渡效果
      const dialogElement = document.querySelector(".dialog") as HTMLElement;
      if (dialogElement) {
        dialogElement.style.transition = "";
      }
    }

    setIsDragging(false);
    setIsDialogDragging(false);
  };

  // 添加一个 ref 来引用聊天窗口
  const chatWindowRef = useRef<HTMLDivElement>(null);

  // 在消息更新后滚动到底部
  useEffect(() => {
    if (chatWindowRef.current) {
      chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    // 添加窗口大小变化监听
    const handleResize = () => {
      // 确保悬浮球不会超出窗口范围
      setPosition((prev) => ({
        x: Math.min(prev.x, window.innerWidth - 70),
        y: Math.min(prev.y, window.innerHeight - 70),
      }));

      // 同样确保对话框不会超出窗口范围
      setDialogPosition((prev) => ({
        x: Math.min(prev.x, window.innerWidth - 360),
        y: Math.min(prev.y, window.innerHeight - 500),
      }));
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("resize", handleResize);
    };
  }, [isDragging, isDialogDragging]);

  // 直接打开聊天的函数
  const handleBallClick = () => {
    setMessages([
      {
        ai: mergedConfig.welcomeMessage || "我是您的智能AI助手，请问有什么可以帮到您？我可以回答关于系统功能和使用方法的问题。",
      },
    ]);

    // 直接显示对话框
    if (dialogRef.current) {
      dialogRef.current.style.display = "block";
    }
  };

  // 初始化 refs
  useEffect(() => {
    ballPositionRef.current = position;
    dialogPositionRef.current = dialogPosition;
  }, [position, dialogPosition]);

  // 获取用户图标
  const renderUserIcon = () => {
    if (mergedConfig.customIcons?.user) {
      return mergedConfig.customIcons.user;
    }
    return <UserOutlined />;
  };

  // 获取AI图标
  const renderAIIcon = () => {
    if (mergedConfig.customIcons?.ai) {
      return mergedConfig.customIcons.ai;
    }
    return <RobotOutlined />;
  };

  // 渲染浮动球内容
  const renderBallContent = () => {
    if (mergedConfig.customIcons?.ball) {
      return mergedConfig.customIcons.ball;
    }
    return (
      <div className="ball-content">
        <span className="ball-text">AI</span>
      </div>
    );
  };

  return (
    <>
      {createPortal(
        <div className={styles.ball}>
          <div
            className="floating-ball"
            style={{
              position: "fixed",
              left: `${position.x}px`,
              top: `${position.y}px`,
              cursor: "pointer",
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              setIsDragging(true);
              setWasDragged(false); // 重置拖动标记
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!wasDragged) { // 只有在没有拖动时才打开对话框
                handleBallClick();
              }
            }}
          >
            {renderBallContent()}
          </div>
          <div
            ref={dialogRef}
            className="dialog"
            style={{
              position: "fixed",
              left: `${dialogPosition.x}px`,
              top: `${dialogPosition.y}px`,
              bottom: "auto",
              right: "auto",
              display: "none",
            }}
          >
            <div className="dialog-content">
              <div
                className="dialog-header"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsDialogDragging(true);
                }}
              >
                <h3 className="dialog-title">{mergedConfig.title||"智能客服"}</h3>
                <div className="dialog-buttons">
                  <button
                    type="button"
                    className="close-button"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCloseDialog();
                    }}
                    title="关闭"
                  >
                    X
                  </button>
                </div>
              </div>
              <div className="dialog-body">
                <div className="chat-window" ref={chatWindowRef}>
                  {messages.map((msg, index) => (
                    <React.Fragment key={index}>
                      {msg.user && (
                        <div className="message">
                          <div className="user-message">{msg.user}</div>
                          <div className="message-icon user-icon">
                            {renderUserIcon()}
                          </div>
                        </div>
                      )}
                      {msg.ai && (
                        <div className="message">
                          <div className="message-icon ai-icon">
                            {renderAIIcon()}
                          </div>
                          <div
                            className="ai-message markdown"
                            style={{ opacity: isLoading ? 0.5 : 1 }}
                            dangerouslySetInnerHTML={{ __html: marked(msg.ai) }}
                          ></div>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                  {isLoading && (
                    <div className="loading">
                      <div className="dot-animation">正在处理中......</div>
                      <div className="spinner"></div>
                    </div>
                  )}
                  {error && <div className="error">{error}</div>}
                </div>
                <div className="input-container">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    placeholder="输入您的消息..."
                    disabled={isLoading}
                  />
                  <button
                    type={'button'}
                    className="send-message"
                    onClick={handleSendMessage}
                    disabled={isLoading}
                  >
                    发送
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default FloatingBall;
