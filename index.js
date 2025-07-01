// index.js (GPT-4o Chat with Memory + Typing Effect + Word-by-Word Streaming)
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

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
  history.push({ role: 'user', content: prompt });

  const result = await streamText({
    model: openai.chat('gpt-4o'),
    messages: history,
  });

  let reply = '';
  for await (const chunk of result.textStream) {
    reply += chunk;
    await sendChunk(chunk);
  }

  history.push({ role: 'assistant', content: reply });
  userMemory[chatId] = history.slice(-20);
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

    await chatWithGPTStream(chatId, text, async (chunk) => {
      buffer += chunk;

      if (!messageId) {
        const sent = await bot.sendMessage(chatId, chunk);
        messageId = sent.message_id;
      } else {
        await bot.editMessageText(buffer, {
          chat_id: chatId,
          message_id: messageId,
        });
      }
    });
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, '⚠️ GPT error.');
  }
});
