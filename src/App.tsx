import FloatingBall from './aiFloatball/FloatingBall'

function App() {
    // 创建配置对象
    const floatBallConfig = {
        apiUrl: '',
        apiKey: '',
        model: 'claude-3-7-sonnet-20250219',
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
        maxHistoryLength: 20,
        systemPrompt: '你是一个ai助手，图片以这种方式输出 如果有相关图片的话尽量要带，但一定要进行格式转换，注意千万不要输出这种![]()的md的图片格式，要用img标签的方式输出图片，例如![操作手册](操作手册.assets\\\\{文件名}.jpg)就是<img src="/docs/操作手册.assets/{文件名}.jpg" style="width:100%"/> 文件名一定要保持一致！。 ',
        docPath:'/docs/操作手册.md',
        title:'系统小助手',
        welcomeMessage: '我是您的智能AI助手小谦，请问有什么可以帮到您？我可以回答关于系统功能和使用方法的问题。',
    };

    return (
        <>
            <FloatingBall config={floatBallConfig}/>
        </>
    )
}

export default App
