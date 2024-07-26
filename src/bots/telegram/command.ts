import format from 'string-template';
import { getLottoService } from '../../lotto/service.js';
import TelegramService from './service.js';
import { isAxiosError } from 'axios';
import TelegramBot from 'node-telegram-bot-api';

const getErrorMessage = (err: unknown) => {
  if (isAxiosError(err)) {
    return `${err.response?.status} ${err.response?.statusText}`;
  } else if (err instanceof Error) {
    return err.message;
  } else {
    return String(err);
  }
};

export type TelegramCommandLayout = [RegExp, string, (msg: TelegramBot.Message, telegram: TelegramService) => Promise<string>];
export const telegramCommands: TelegramCommandLayout[] = [
  [
    /\/money/,
    '내 예치금을 조회합니다.',
    async (msg, telegramService) => {
      const lottoService = getLottoService();
      const loginResult = await lottoService.doLogin();
      if (!loginResult.success) {
        return `사이트 로그인에 실패하였습니다: ${loginResult.message}`;
      }

      try {
        // 예치금 조회
        const money = await lottoService.getMyAccountMoney();
        return format('현재 내 예치금은 {money}원 입니다.', { money: money.toLocaleString() });
      } catch (err) {
        return '예치금 조회에 실패했습니다.\n' + getErrorMessage(err);
      }
    },
  ],
];
