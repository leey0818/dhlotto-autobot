import store from '../utils/store.js';
import { getLottoService } from '../lotto/service.js';
import { sendNotification } from '../utils/notify.js';
import { URL_WINQR_PAGE } from '../lotto/constants.js';

const getNowDate = () => {
  const nowCal = new Date();
  const twoDigits = (v: number) => `0${v}`.slice(-2);
  return `${nowCal.getFullYear()}${twoDigits(nowCal.getMonth() + 1)}${twoDigits(nowCal.getDate())}`;
};

/**
 * 로또 당첨번호 알림 서비스
 */
const notifyWinnerNumber = async () => {
  // 이미 가져온 회차면 무시
  const nowDate = getNowDate();
  if (store.get('lastRound.date') === nowDate) return;

  try {
    const lottoService = getLottoService();
    const roundInfo = await lottoService.getLastRound();

    await sendNotification(`제 ${roundInfo.round}회 당첨번호 🎉`, roundInfo.numbers.join(' ') + ' + ' + roundInfo.bonusNo);

    // 라운드 정보 저장
    store.set('lastRound', roundInfo);

    // 구매이력 있으면 QR 링크 전송
    if (store.has(`buyRounds.${roundInfo.round}`)) {
      await notifyBuyRoundQrLink(roundInfo.round);
    }
  } catch (e) {
    await sendNotification('당첨번호 조회실패', String(e));
  }
};

const pad = (v: number) => `0${v}`.slice(-2);

/**
 * 구매한 회차 QR 링크 전송
 */
const notifyBuyRoundQrLink = async (round: number) => {
  const roundInfo = store.get(`buyRounds.${round}`) as { numbers: number[][] };
  const number = roundInfo.numbers.map((numbers) =>
    numbers.map((num) => pad(num)).join('')
  ).join('q');

  const qrLink = `${URL_WINQR_PAGE}&v=${round}q${number}`;
  await sendNotification(`제 ${round}회 당첨 확인 링크`, qrLink);
};

export default notifyWinnerNumber;
