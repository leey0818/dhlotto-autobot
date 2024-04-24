import TelegramService from './telegram.js';
import logger from '../../utils/logger.js';
import { AxiosResponse } from 'axios';

type ServiceLayout = {
  pushNotify(text: string): Promise<AxiosResponse>;
};

const notifyServices: ServiceLayout[] = [];

// 텔레그램 활성화
if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
  notifyServices.push(new TelegramService(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID));
}

/**
 * Notify 서비스로 알림 전송
 * @param title 알림 제목
 * @param content 알림 내용
 */
const sendNotification = async (title: string, content: string) => {
  const text = `[${title}]\n${content}`;
  const responses = await Promise.all(notifyServices.map((service) => service.pushNotify(text)));
  const results = await Promise.all(responses.map(async (res) => {
    if (res.status < 200 || res.status >= 300) {
      logger.error('Failed to send notification: ', res.request.url, res.status, res.statusText, res.data);
      return false;
    }
    return true;
  }));

  if (responses.length === 0) {
    logger.warn('Not send as there is no registered notification service.');
  }

  return results.every((ok) => ok);
};

export { sendNotification };
