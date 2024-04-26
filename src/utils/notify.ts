import TelegramService from '../bots/telegram/service.js';
import logger from './logger.js';

const getNotifyService = (() => {
  let notifyService: TelegramService | undefined;

  // 텔레그램 활성화
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    notifyService = new TelegramService(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID);
  }

  return () => {
    if (!notifyService) {
      throw new Error('등록된 알림 서비스가 없습니다. 지원하는 알림 서비스는 다음과 같습니다: telegram');
    }

    return notifyService;
  }
})();

/**
 * Notify 서비스로 알림 전송
 * @param title 알림 제목
 * @param content 알림 내용
 */
const sendNotification = async (title: string, content: string) => {
  const text = `[${title}]\n${content}`;
  try {
    await getNotifyService().sendMessageToOwner(text);
  } catch (e) {
    logger.error('Failed to send notification: ', e);
  }
};

export { sendNotification };
