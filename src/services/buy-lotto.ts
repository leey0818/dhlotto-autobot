import { isAxiosError } from 'axios';
import { getLottoService } from '../lotto/service.js';
import { sendNotification } from '../utils/notify.js';
import logger from '../utils/logger.js';

/**
 * 로또 구매 서비스
 * @param gameCount 구매할 게임 수
 */
const buyLotto = async (gameCount: number) => {
  const lottoService = getLottoService();
  try {
    // 동행복권 사이트 로그인
    logger.info('사이트 로그인 진행...');
    const loginResult = await lottoService.doLogin();
    if (!loginResult.success) {
      await sendNotification('로그인 실패', loginResult.message);
      return;
    }

    // 로또 구매
    logger.info('로또 구매 중...');
    const buyResult = await lottoService.buyLotto(gameCount);
    if (buyResult.success) {
      await sendNotification('구매 성공', buyResult.message);
    } else {
      await sendNotification('구매 실패', buyResult.message);
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
};

export default buyLotto;
