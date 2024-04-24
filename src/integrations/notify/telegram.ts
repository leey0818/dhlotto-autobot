import axios from 'axios';

export default class TelegramService {
  botToken: string;
  chatId: string;

  constructor(botToken: string, chatId: string) {
    this.botToken = botToken;
    this.chatId = chatId;
  }

  /**
   * 텔레그램 알림메세지 푸시
   * @param text 전송할 텍스트
   */
  pushNotify(text: string) {
    return axios.post(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      chat_id: this.chatId,
      text,
    });
  }
}
