// index.js (GPT-4o Chat with Memory + Typing Effect + Word-by-Word Streaming)
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import express from 'express'; // For Render port binding

dotenv.config();

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

const openai = createOpenAI({
  apiKey: process.env.GITHUB_TOKEN,
  baseURL: 'https://models.inference.ai.azure.com/',
});

// Memory per user
const userMemory = {};

// GPT Chat handler with memory and streaming
async function chatWithGPTStream(chatId, prompt, sendChunk) {
  const history = userMemory[chatId] || [];

  // Ensure English system message is always first
  const systemMessage = {
    role: 'system',
    content: 'You are a helpful assistant. Always reply in English, even if the user types in another language.',
  };

  const conversation = [systemMessage, ...history, { role: 'user', content: prompt }];

  const result = await streamText({
    model: openai.chat('gpt-4o'),
    messages: conversation,
  });

  let reply = '';
  for await (const chunk of result.textStream) {
    reply += chunk;
    await sendChunk(chunk);
  }

  history.push({ role: 'user', content: prompt });
  history.push({ role: 'assistant', content: reply });
  userMemory[chatId] = history.slice(-20); // store only recent messages
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
<b>Welcome to GPT-4o Telegram Bot</b>
🧠 Just type to chat with GPT-4o
`, { parse_mode: 'HTML' });
});

bot.onText(/\/clear/, (msg) => {
  const chatId = msg.chat.id;
  userMemory[chatId] = [];
  bot.sendMessage(chatId, '🧹 Memory cleared.');
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith('/')) return;

  try {
    let messageId = null;
    let buffer = '';
    let lastEditTime = Date.now();

    await chatWithGPTStream(chatId, text, async (chunk) => {
      buffer += chunk;

      if (!messageId) {
        const sent = await bot.sendMessage(chatId, '💬');
        messageId = sent.message_id;
      }

      // Throttle updates (every 500ms)
      if (Date.now() - lastEditTime > 500) {
        lastEditTime = Date.now();
        await bot.editMessageText(buffer, {
          chat_id: chatId,
          message_id: messageId,
        });
      }
    });

    // Final update
    await bot.editMessageText(buffer, {
      chat_id: chatId,
      message_id: messageId,
    });

  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, '⚠️ GPT error.');
  }
});

// 👇 Dummy Express server for Render
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_, res) => {
  res.send('✅ GPT-4o Telegram Bot is running!');
});

app.listen(PORT, () => {
  console.log(`🌐 Dummy server active at http://localhost:${PORT}`);
});
