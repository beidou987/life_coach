require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const port = process.env.PORT || 3000;

// 启用CORS和JSON解析中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 火山方舟API配置
const API_KEY = process.env.VOLCES_API_KEY;
const API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

// 处理聊天请求
app.post('/chat', async (req, res) => {
    try {
        const userMessage = req.body.message;

        // 准备请求体
        const requestBody = {
            model: 'deepseek-r1-250120',
            messages: [
                {
                    role: 'system',
                    content: '你是一位专业的生活教练，擅长倾听、分析和给出建议。你的目标是通过对话帮助用户发现问题、制定目标、突破困境，从而在个人成长道路上不断进步。请用温暖、专业、富有洞察力的方式与用户交流。'
                },
                {
                    role: 'user',
                    content: userMessage
                }
            ],
            temperature: 0.6,
            stream: true
        };

        // 设置请求头
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`
        };

        // 发送请求到火山方舟API
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            timeout: 60000 // 60秒超时
        });

        // 检查响应状态并获取详细错误信息
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API响应错误:', {
                status: response.status,
                statusText: response.statusText,
                errorDetails: errorText
            });
            throw new Error(`API请求失败: ${response.status} - ${errorText}`);
        }

        // 设置响应头以支持流式传输
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        try {
            // 使用 response.body 作为可读流
            response.body.on('data', chunk => {
                const text = chunk.toString();
                const lines = text.split('\n');
                
                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.trim() === 'data: [DONE]') {
                        res.write('data: [DONE]\n\n');
                        continue;
                    }
                    
                    try {
                        const parsed = JSON.parse(line.replace(/^data: /, ''));
                        if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                            const content = parsed.choices[0].delta.content;
                            res.write(`data: ${JSON.stringify({ content })}\n\n`);
                        }
                    } catch (e) {
                        console.error('解析响应数据出错:', e);
                        continue;
                    }
                }
            });

            response.body.on('end', () => {
                res.write('data: [DONE]\n\n');
                res.end();
            });

            response.body.on('error', error => {
                console.error('响应流错误:', error);
                res.end();
            });

        } catch (error) {
            console.error('处理响应流错误:', error);
            res.end();
        }

    } catch (error) {
        console.error('服务器错误:', error);
        res.status(500).json({ error: '服务器处理请求时发生错误' });
    }
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});