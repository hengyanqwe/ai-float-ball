import {RobotOutlined, UserOutlined} from "@ant-design/icons";
import React, {useEffect, useRef, useState, useCallback} from "react";
import {createPortal} from "react-dom";
import styles from "./FloatingBall.module.less";
import "./keyframes.css";
import axios, {AxiosResponse} from "axios";
import {marked} from 'marked';
import {AIFloatBallConfig} from "../../lib";
import {positionI} from "../../lib/types";
import Color from "color";

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
        ball: {
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
    const mergedConfig = {...defaultConfig, ...config} as AIFloatBallConfig;
    const defaultBallPosition: positionI = {
        x: mergedConfig.position!.ball.x,
        y: mergedConfig.position!.ball.y,
    };
    const defaultDialogPosition: positionI = {
        x: mergedConfig.position!.dialog.x,
        y: mergedConfig.position!.dialog.y,
    };

    // 使用ref来引用容器
    const containerRef = useRef<HTMLDivElement>(null);

    // 使用ref来引用对话框元素
    const dialogRef = useRef<HTMLDivElement>(null);

    // 点击悬浮球切换对话框显示
    const handleBallClick = () => {
        if (dialogRef.current) {
            if (dialogRef.current.style.display === "block")
                handleCloseDialog();
            else
                dialogRef.current.style.display = "block";
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

    useEffect(() => {
        // 这里从容器div获取css变量值，如果没有值赋默认值
        if (containerRef.current) {
            const computedStyle = getComputedStyle(containerRef.current);
            const colorPrimary = computedStyle.getPropertyValue('--antTokenVars-colorPrimary').trim() || '#044627';
            containerRef.current.style.setProperty('--antTokenVars-colorPrimary', colorPrimary);

            // 找到 dialog-header 并设置 80% 透明度背景
            const dialogHeader = containerRef.current.querySelector('.dialog-header') as HTMLElement;
            if (dialogHeader) {
                const colorPrimaryRgba80 = Color(colorPrimary).alpha(0.8).string();
                dialogHeader.style.background = colorPrimaryRgba80;
            }
        }
    }, []);

    return (
        <>
            {createPortal(
                <div className={styles.ball} ref={containerRef}>
                    <Ball handleBallClick={handleBallClick} Icon={mergedConfig.customIcons?.ball} defaultPosition={defaultBallPosition}/>
                    <Dialog
                        dialogRef={dialogRef}
                        defaultPosition={defaultDialogPosition}
                        apiUrl={mergedConfig.apiUrl}
                        apiKey={mergedConfig.apiKey}
                        model={mergedConfig.model}
                        headers={mergedConfig.headers}
                        systemPrompt={mergedConfig.systemPrompt}
                        maxHistoryLength={mergedConfig.maxHistoryLength}
                        title={mergedConfig.title}
                        welcomeMessage={mergedConfig.welcomeMessage}
                        markedOptions={mergedConfig.markedOptions}
                        customIcons={mergedConfig.customIcons}
                        docPath={mergedConfig.docPath}
                        handleCloseDialog={handleCloseDialog}
                    />
                </div>,
                document.body
            )}
        </>
    );
};

const Dialog = ({ 
    dialogRef, 
    defaultPosition,
    apiUrl,
    apiKey,
    model,
    headers,
    systemPrompt,
    maxHistoryLength,
    title,
    welcomeMessage,
    markedOptions,
    customIcons,
    docPath,
    handleCloseDialog
}) => {
    // Dialog 内部状态
    const [dialogPosition, setDialogPosition] = useState<positionI>(defaultPosition);
    const [messages, setMessages] = useState<Message[]>([
        {
            ai: welcomeMessage || "我是您的智能AI助手，请问有什么可以帮到您？我可以回答关于系统功能和使用方法的问题。",
        },
    ]);
    const [inputValue, setInputValue] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    
    // 聊天窗口引用
    const chatWindowRef = useRef<HTMLDivElement>(null);
    
    // 对话框拖拽相关状态
    const dialogOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const dialogDraggingRef = useRef(false);
    const dialogMovedRef = useRef(false);
    const DIALOG_MOVE_THRESHOLD = 4; // px，小于该值视为点击
    const dialogSize = { width: 418, height: 600 }; // 对话框尺寸

    // 加载使用文档
    const [systemKnowledge, setSystemKnowledge] = useState<string>("");

    useEffect(() => {
        const fetchDocumentation = async () => {
            if (!docPath) return;
            try {
                const response = (await axios(docPath)) as AxiosResponse<string>;
                setSystemKnowledge(response.data);
            } catch (error) {
                console.error("加载文档失败:", error);
                // 设置一个简单的备用知识
                setSystemKnowledge("# ");
            }
        };

        fetchDocumentation();
    }, [docPath]);

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
            return [...prev, {ai: newContent}];
        });
    };

    const fetchTiChat = async () => {
        setIsLoading(true);
        setError(null);
        try {
            // 限制历史消息数量
            const maxHistory = maxHistoryLength || 20;
            const historyMessages = messages.slice(-maxHistory);

            const history: IMessage[] = [];
            historyMessages.slice(1).forEach((o) => {
                if (o.ai) history.push({role: "assistant", content: o.ai});
                if (o.user) history.push({role: "user", content: o.user});
            });

            // 构建请求头
            const requestHeaders = {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
                ...headers
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify({
                    model: model,
                    messages: [
                        {
                            role: "system",
                            content: `${systemPrompt} md格式的标题格式只允许用h3、h4、h5、h6，禁用h1、h2，大标题也不允许用h1！ 文档:${systemKnowledge}`,
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
                const {done, value} = await reader.read();
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
            const newMessage = {user: inputValue, ai: ""};
            setMessages((prev) => [...prev, newMessage]);
            setInputValue("");
            fetchTiChat();
        }
    };


    // 获取用户图标
    const renderUserIcon = () => {
        if (customIcons?.user) {
            return customIcons.user;
        }
        return <UserOutlined/>;
    };

    // 获取AI图标
    const renderAIIcon = () => {
        if (customIcons?.ai) {
            return customIcons.ai;
        }
        return <RobotOutlined/>;
    };

    // 初始化marked配置
    useEffect(() => {
        // 合并用户配置的marked选项
        marked.setOptions({
            ...markedOptions
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
    }, [markedOptions]);

    // 在消息更新后滚动到底部
    useEffect(() => {
        if (chatWindowRef.current) {
            chatWindowRef.current.scrollTop = chatWindowRef.current.scrollHeight;
        }
    }, [messages]);

    // 监听窗口尺寸变化，防止对话框被拖出可视区
    useEffect(() => {
        const handleResize = () => {
            setDialogPosition((prev) => ({
                x: Math.min(prev.x, window.innerWidth - dialogSize.width),
                y: Math.min(prev.y, window.innerHeight - dialogSize.height),
            }));
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // 对话框指针按下
    const handleDialogPointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.button !== 0) return; // 只处理左键
            dialogOffsetRef.current = {
                x: e.clientX - dialogPosition.x,
                y: e.clientY - dialogPosition.y,
            };
            dialogDraggingRef.current = true;
            dialogMovedRef.current = false;
            // 捕获指针
            e.currentTarget.setPointerCapture(e.pointerId);
            e.stopPropagation();
        },
        [dialogPosition],
    );

    // 对话框指针移动
    const handleDialogPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!dialogDraggingRef.current) return;

        let newX = e.clientX - dialogOffsetRef.current.x;
        let newY = e.clientY - dialogOffsetRef.current.y;

        // 记录是否移动，加入阈值过滤抖动
        if (!dialogMovedRef.current) {
            const diff = Math.abs(newX - dialogPosition.x) + Math.abs(newY - dialogPosition.y);
            if (diff > DIALOG_MOVE_THRESHOLD) dialogMovedRef.current = true;
        }

        // 边界限制
        newX = Math.max(0, Math.min(newX, window.innerWidth - dialogSize.width));
        newY = Math.max(0, Math.min(newY, window.innerHeight - dialogSize.height));

        setDialogPosition({ x: newX, y: newY });
    }, [dialogPosition]);

    // 对话框指针松开
    const handleDialogPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!dialogDraggingRef.current) return;
        dialogDraggingRef.current = false;
        dialogMovedRef.current = false; // 重置移动标记，避免下一次点击被吞掉
        e.currentTarget.releasePointerCapture(e.pointerId);
    }, []);

    return (
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
                    onPointerDown={handleDialogPointerDown}
                    onPointerMove={handleDialogPointerMove}
                    onPointerUp={handleDialogPointerUp}
                    style={{
                        cursor: dialogDraggingRef.current ? "grabbing" : "move",
                    }}
                >
                    <h3 className="dialog-title">{title || "智能客服"}</h3>
                    <div className="dialog-buttons">
                        <button
                            type="button"
                            className="close-button"
                            onPointerDown={(e) => {
                                e.stopPropagation();
                            }}
                            onClick={(e) => {
                                // 如果发生过移动则视为拖拽，不执行点击逻辑
                                if (dialogMovedRef.current) {
                                    dialogMovedRef.current = false; // 重置
                                    return;
                                }
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
                                            style={{opacity: isLoading ? 0.5 : 1}}
                                            dangerouslySetInnerHTML={{__html: marked(msg.ai)}}
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
    );
};

const Ball = ({ handleBallClick, Icon, defaultPosition }) => {
    // 悬浮球当前位置
    const [pos, setPos] = useState<{ x: number; y: number }>(defaultPosition);

    // 指针按下时，相对于悬浮球左上角的偏移量
    const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    // 是否正在拖拽
    const draggingRef = useRef(false);
    // 本次指针交互中是否发生过移动
    const movedRef = useRef(false);
    const MOVE_THRESHOLD = 4; // px，小于该值视为点击

    const ballSize = 70; // 与样式中的宽高保持一致

    // 监听窗口尺寸变化，防止悬浮球被拖出可视区
    useEffect(() => {
        const handleResize = () => {
            setPos((prev) => ({
                x: Math.min(prev.x, window.innerWidth - ballSize),
                y: Math.min(prev.y, window.innerHeight - ballSize),
            }));
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    // 指针按下
    const handlePointerDown = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            if (e.button !== 0) return; // 只处理左键
            offsetRef.current = {
                x: e.clientX - pos.x,
                y: e.clientY - pos.y,
            };
            draggingRef.current = true;
            movedRef.current = false;
            // 捕获指针，离开元素后仍能收到事件
            e.currentTarget.setPointerCapture(e.pointerId);
        },
        [pos],
    );

    // 指针移动
    const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!draggingRef.current) return;

        let newX = e.clientX - offsetRef.current.x;
        let newY = e.clientY - offsetRef.current.y;

        // 记录是否移动，加入阈值过滤抖动
        if (!movedRef.current) {
            const diff = Math.abs(newX - pos.x) + Math.abs(newY - pos.y);
            if (diff > MOVE_THRESHOLD) movedRef.current = true;
        }

        // 边界限制
        newX = Math.max(0, Math.min(newX, window.innerWidth - ballSize));
        newY = Math.max(0, Math.min(newY, window.innerHeight - ballSize));

        setPos({ x: newX, y: newY });
    }, []);

    // 指针松开
    const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
    }, []);

    // 渲染内容
    const renderBallContent = () => {
        if (Icon) return Icon;
        return (
            <div className="ball-content">
                <span className="ball-text">AI</span>
            </div>
        );
    };

    return (
        <div
            className="floating-ball"
            style={{
                position: "fixed",
                left: pos.x,
                top: pos.y,
                cursor: draggingRef.current ? "grabbing" : "grab",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onClick={(e) => {
                // 如果发生过移动则视为拖拽，不执行点击逻辑
                if (movedRef.current) {
                    movedRef.current = false; // 重置
                    return;
                }
                e.stopPropagation();
                handleBallClick();
            }}
        >
            {renderBallContent()}
        </div>
    );
};

export default FloatingBall;
