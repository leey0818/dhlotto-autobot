import schedule from 'node-schedule';
import 'dotenv/config';
import logger from './utils/logger.js';
import LottoService from './lotto/service.js';
import { sendNotification } from './integrations/notify/index.js';
import { isAxiosError } from 'axios';

logger.debug('Starting lotto bot!');
logger.info('Register cron schedule:', process.env.JOB_SCHEDULE);

const job = schedule.scheduleJob(process.env.JOB_SCHEDULE, async function () {
  const lottoService = new LottoService();
  try {
    // 동행복권 사이트 로그인
    if (process.env.LOTTO_USER_ID && process.env.LOTTO_USER_PW) {
      const result = await lottoService.doLogin(process.env.LOTTO_USER_ID, process.env.LOTTO_USER_PW);
      if (!result.success) {
        await sendNotification('로그인 실패', result.message);
        return;
      }
    } else {
      logger.error('로또 계정정보가 없습니다. 프로세스를 종료합니다.');
      job.cancel(false);
      return;
    }

    // 로또 구매
    const gameCount = parseInt(process.env.LOTTO_BUY_COUNT || '5', 10) || 5;
    const result = await lottoService.buyLotto(gameCount);
    if (result.success) {
      await sendNotification('구매 성공', result.message);
    } else {
      await sendNotification('구매 실패', result.message);
    }
  } catch (err) {
    let message;
    if (isAxiosError(err)) {
      message = `${err.response?.status} ${err.response?.statusText}:\n${err.response?.data.trim()}`;
    } else if (err instanceof Error) {
      message = err.message;
    } else {
      message = err?.toString();
    }

    await sendNotification('구매 오류', `알 수 없는 오류로 구매에 실패하였습니다.\n\n${message}`);
  }

  logger.info('Next schedule time:', job.nextInvocation()?.toString());
});

logger.info('Next schedule time:', job.nextInvocation().toString());
