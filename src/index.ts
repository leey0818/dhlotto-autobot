import schedule from 'node-schedule';
import 'dotenv/config';
import logger from './utils/logger.js';
import { getLottoService } from './lotto/service.js';
import { sendNotification } from './utils/notify.js';
import { isAxiosError } from 'axios';

// 환경변수 필수값 체크
if (!process.env.LOTTO_USER_ID || !process.env.LOTTO_USER_PW) {
  process.stderr.write('동행복권 계정 정보가 없습니다!');
  process.exit(1);
}

// 로또 구매 갯수 (허용가능범위 1 ~ 5)
const gameCount = (process.env.LOTTO_BUY_COUNT && parseInt(process.env.LOTTO_BUY_COUNT, 10)) || 5;
if (gameCount < 1 || gameCount > 5) {
  process.stderr.write('인터넷로또는 한 회차 당 최소 1,000원 ~ 최대 5,000원 사이만 구매 가능합니다.');
  process.exit(1);
}

logger.info('동행복권 자동구매 봇 실행!');

logger.debug('Register cron schedule:', process.env.JOB_SCHEDULE);
const job = schedule.scheduleJob(process.env.JOB_SCHEDULE, async () => {
  logger.info('로또 구매를 시작합니다.');

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

  logger.info('작업 완료. 다음 스케쥴까지 대기:', job.nextInvocation()?.toString());
});
logger.info('스케쥴 실행 대기:', job.nextInvocation()?.toString());


// 매주 토요일 20:45 ~ 21:30분 사이에 당첨번호 알림
(async () => {
  let prevRound = 0;
  try {
    const curRound = await getLottoService().getLastRound();
    prevRound = curRound.round;
  } catch (e) {
    logger.warn('현재 담첨회차 가져오기 실패', e);
  }

  const notifyWinnerNumberSchedule = async () => {
    const lottoService = getLottoService();
    try {
      const roundInfo = await lottoService.getLastRound();

      if (prevRound !== roundInfo.round) {
        await sendNotification(`제 ${roundInfo.round}회 당첨번호 🎉`, roundInfo.numbers.join(' ') + ' + ' + roundInfo.bonusNo);
        prevRound = roundInfo.round;
      }
    } catch (e) {
      await sendNotification('당첨번호 조회실패', String(e));
    }
  };
  schedule.scheduleJob('0 45-59 20 * * 6', notifyWinnerNumberSchedule);
  schedule.scheduleJob('0 0-30 21 * * 6', notifyWinnerNumberSchedule);
})();
