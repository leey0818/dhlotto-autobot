import TelegramBot from 'node-telegram-bot-api';
import { TelegramCommandLayout, telegramCommands } from './command.js';
import logger from '../../utils/logger.js';

export default class TelegramService {
  botToken: string;
  chatId: string;
  botApi: TelegramBot;

  constructor(botToken: string, chatId: string) {
    this.botToken = botToken;
    this.chatId = chatId;
    this.botApi = new TelegramBot(botToken, { polling: true });
    this.setTelegramCommands(telegramCommands);
  }

  sendMessage(chatId: string, text: string) {
    return this.botApi.sendMessage(chatId, text);
  }

  sendMessageToOwner(text: string) {
    return this.sendMessage(this.chatId, text);
  }

  setTelegramCommands(commands: TelegramCommandLayout[]) {
    commands.forEach((command) => {
      const type = command[0];
      const executor = command[1];
      this.botApi.onText(type, async (msg) => {
        try {
          const resultMessage = await executor(msg, this);
          await this.botApi.sendMessage(msg.chat.id, resultMessage);
        } catch (e) {
          logger.error('텔레그램 메세지 전송 실패! ', e);
        }
      });
    });
  }
}
