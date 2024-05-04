import schedule from 'node-schedule';
import 'dotenv/config';
import store from './utils/store.js';
import logger from './utils/logger.js';
import { getLottoService } from './lotto/service.js';
import buyLotto from './services/buy-lotto.js';
import notifyWinnerNumber from './services/notify-winner-number.js';

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
const mainSchedule = schedule.scheduleJob(process.env.JOB_SCHEDULE, async () => {
  logger.info('로또 구매를 시작합니다.');
  await buyLotto(gameCount);
  logger.info('작업 완료. 다음 스케쥴까지 대기:', mainSchedule.nextInvocation()?.toString());
});
logger.info('스케쥴 실행 대기:', mainSchedule.nextInvocation()?.toString());


(async () => {
  // 마지막 라운드 정보 가져오기
  try {
    const roundInfo = await getLottoService().getLastRound();
    store.set('lastRound', roundInfo);
  } catch (e) {
    logger.warn('현재 당첨회차 가져오기 실패', e);
  }

  // 매주 토요일 20:45 ~ 21:30분 사이에 당첨번호 알림
  schedule.scheduleJob('0 45-59 20 * * 6', notifyWinnerNumber);
  schedule.scheduleJob('0 0-30 21 * * 6', notifyWinnerNumber);
})();
