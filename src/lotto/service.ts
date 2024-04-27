import axios, { AxiosInstance, isAxiosError } from 'axios';
import { load } from 'cheerio';
import { stringify } from 'node:querystring';
import iconv from 'iconv-lite';
import logger from '../utils/logger.js';
import { generateLottoNumbers } from './generate.js';
import {
  ERROR_COOKIE_NOT_FOUND, ERROR_EMPTY_RESULT, ERROR_LOGIN_FAILED,
  ERROR_MAINTENANCE,
  ERROR_REQUEST_FAILED, URL_BUY, URL_GAME_RESULT, URL_LOGIN_REQUEST, URL_MAIN, URL_MYPAGE, URL_MAINPAGE,
  URL_SESSION,
  URL_SYSTEM_CHECK, URL_USER_READY
} from './constrants.js';

type ResponseMessage = {
  success: boolean;
  message: string;
};

type UserReadyResponse = {
  direct_yn: string;
  ready_ip: string;
  ready_time: string;
  ready_cnt: string;
};

type LottoBuyResult = {
  oltInetUserId: string;
  issueTime: string;
  issueDay: string;
  weekDay: string;
  buyRound: string;
  barCode1: string;
  barCode2: string;
  barCode3: string;
  barCode4: string;
  barCode5: string;
  barCode6: string;
  nBuyAmount: number;
  arrGameChoiceNum: string[];
  resultCode: string;
  resultMsg: string;
};

type LottoBuyResponse = {
  loginYn: string;
  result: LottoBuyResult;
};

const getLottoRequestHeaders = () => ({
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Upgrade-Insecure-Requests': '1',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Referer': 'https://dhlottery.co.kr/',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
});

const getResponseCharset = (contentType: string) => {
  if (contentType) {
    const matches = contentType.match(/charset=(.+)/);
    if (matches && matches.length > 1) {
      return matches[1];
    }
  }
  return 'UTF-8';
}

class LottoService {
  axiosClient: AxiosInstance;

  constructor() {
    this.axiosClient = axios.create({
      timeout: 10000,
      responseType: 'arraybuffer',
      headers: getLottoRequestHeaders(),
    });
    this.axiosClient.interceptors.request.use((config) => {
      if (config.method?.toLowerCase() !== 'post') {
        delete config.headers['Content-Type'];
      }
      return config;
    });
    this.axiosClient.interceptors.response.use((response) => {
      const contentType = response.headers['content-type'];
      response.data = iconv.decode(response.data, getResponseCharset(contentType));
      if (contentType.includes('application/json')) {
        try {
          response.data = JSON.parse(response.data);
        } catch {}
      }
      return response;
    }, (err) => {
      if (isAxiosError(err) && err.response?.data) {
        err.response.data = iconv.decode(err.response.data, getResponseCharset(err.response.headers['content-type']));
      }
      throw err;
    });
  }

  /**
   * 동행복권 사이트 세션 생성
   */
  async createSession(): Promise<ResponseMessage> {
    const response = await this.axiosClient.get(URL_SESSION);
    const cookies = response.headers['set-cookie']?.map((c) => c.split(';')[0].trim());

    if (response.request.res.responseUrl === URL_SYSTEM_CHECK) {
      return { success: false, message: ERROR_MAINTENANCE };
    }

    if (response.status < 200 || response.status >= 300) {
      return {success: false, message: `${ERROR_REQUEST_FAILED} ${response.status} ${response.statusText}`};
    }

    const jsessionId = cookies?.find((c) => c.includes('JSESSIONID'));
    if (jsessionId) {
      this.axiosClient.defaults.headers.common['Cookie'] = jsessionId;
      logger.debug('JSESSIONID was successfully extracted.', jsessionId);
      return { success: true, message: 'OK' };
    }

    return { success: false, message: ERROR_COOKIE_NOT_FOUND };
  }

  /**
   * 동행복권 사이트 로그인
   */
  async doLogin(): Promise<ResponseMessage> {
    const userId = process.env.LOTTO_USER_ID;
    const userPw = process.env.LOTTO_USER_PW;

    const sessionResult = await this.createSession();
    if (!sessionResult.success) {
      return sessionResult;
    }

    const response = await this.axiosClient.post(URL_LOGIN_REQUEST, {
      returnUrl: URL_MAIN,
      userId,
      password: userPw,
      checkSave: 'on',
      newsEventYn: '',
    });

    if (response.status >= 200 && response.status < 300) {
      const $load = load(response.data);
      const isSuccess = $load('a.btn_common.lrg.blu').length === 0;

      if (isSuccess) {
        return { success: true, message: '로그인 성공' };
      }
    }

    return { success: false, message: ERROR_LOGIN_FAILED };
  }

  /**
   * 마지막 로또 회차 가져오기
   */
  async getLastRound() {
    const response = await this.axiosClient.get(URL_MAINPAGE);
    const $ = load(response.data);
    const round = parseInt($('strong#lottoDrwNo').text(), 10) || -1;
    const numbers = $('a#numView > span[id^="drwtNo"]').map((_, el) => parseInt($(el).text().trim(), 10)).get();
    const bonusNo = parseInt($('a#numView > span#bnusNo').text(), 10);
    return { round, numbers, bonusNo };
  }

  /**
   * 로또 회차별 당첨번호 가져오기 (최대 20회차)
   * @param startRound 시작 회차
   * @param endRound 종료 회차
   */
  async getGameResultByRounds(startRound: number, endRound: number) {
    if (endRound < startRound) throw new Error('종료 회차는 시작 회차보다 커야 합니다.');
    if ((endRound - startRound) > 20) throw new Error('최대 20회차만 가져올 수 있습니다.');

    const response = await this.axiosClient.get(URL_GAME_RESULT + '&' + stringify({ drwNoStart: startRound, drwNoEnd: endRound }));
    const $ = load(response.data);
    return $('table.tbl_data_col > tbody > tr').map((_, el) => {
      const $tr = $(el);
      const round = $tr.children('td:eq(0)').text().slice(0, -1);
      const numbers = $tr.find('td:eq(1) > span').map((__, span) => {
        return $(span).text();
      }).get();
      const bonusNo = $tr.find('td:eq(2) > span').text();
      return { round, numbers, bonusNo };
    }).get();
  }

  /**
   * 나의 예치금 조회
   */
  async getMyAccountMoney() {
    const response = await this.axiosClient.get(URL_MYPAGE);
    const $ = load(response.data);
    const moneyText = $('div.content_mypage_home div.money p.total_new > strong').text().replace(/[^0-9]/g, '');
    return parseInt(moneyText, 10);
  }

  /**
   * 로또 구매
   * @param gameCount 구매 게임수
   */
  async buyLotto(gameCount = 5): Promise<ResponseMessage> {
    if (gameCount < 1 || gameCount > 5) {
      throw new Error('한 회차 당 최대 5,000원 까지만 구매 가능합니다.');
    }

    const choiceParams = [];
    for (let i = 0; i < gameCount; i++) {
      const numbers = generateLottoNumbers();
      choiceParams.push({
        genType: '1', // 수동
        arrGameChoiceNum: numbers.join(','),  // 선택한 번호 6개
        alpabet: 'ABCDE'.charAt(i),
      });
    }

    const curMoney = await this.getMyAccountMoney();
    const lastRound = await this.getLastRound();
    const direct = await this.getUserReadyIp();
    const body = {
      round: String(lastRound.round + 1),
      direct,
      nBuyAmount: String(1000 * gameCount),
      param: JSON.stringify(choiceParams),
      gameCnt: String(gameCount),
    };

    logger.debug('request body: ', JSON.stringify(body));

    const response = await this.axiosClient.post<LottoBuyResponse>(URL_BUY, body);
    const result = response.data?.result;
    if (result?.resultMsg?.toUpperCase() !== 'SUCCESS') {
      logger.warn('로또 구매 실패! ', JSON.stringify(response.data));
      return { success: false, message: `${result?.resultMsg || ERROR_EMPTY_RESULT}`};
    }

    // 남은 예치금 계산
    const remainMoney = curMoney - result.nBuyAmount;
    const isNotEnoughMoney = remainMoney < result.nBuyAmount;

    // 구매 성공!
    return {
      success: true,
      message: `✅ 구매를 완료하였습니다.
==================================
제 ${result.buyRound}회
금액: ${(result.nBuyAmount || 0).toLocaleString()}원 (남은 예치금: ${remainMoney.toLocaleString()}원)
구매번호:\n${this.formatLottoNumbers(result)}
==================================
${result.barCode1} ${result.barCode2} ${result.barCode3} ${result.barCode4} ${result.barCode5} ${result.barCode6}
==================================${isNotEnoughMoney ? '\n💸 예치금이 부족합니다. 예치금을 충전해 주세요.' : ''}`,
    };
  }

  private async getUserReadyIp() {
    const response = await axios.post<UserReadyResponse>(URL_USER_READY);
    return response.data?.ready_ip;
  }

  private formatLottoNumbers(result: LottoBuyResult) {
    return result.arrGameChoiceNum.map((line) => {
      const lineArr = line.slice(0, -1).split('|');
      const alpabet = lineArr[0];
      const genType = line.slice(-1);
      const genTypeName = genType === '0' ? '자동' : genType === '1' ? '수동' : genType === '2' ? '반자동' : genType;
      const pad = (text: string) => `  ${text}`.slice(-2);

      return `${alpabet} ${genTypeName} ${pad(lineArr[1])} ${pad(lineArr[2])} ${pad(lineArr[3])} ${pad(lineArr[4])} ${pad(lineArr[5])} ${pad(lineArr[6])}`;
    }).join('\n');
  }
}

export type LottoServiceType = InstanceType<typeof LottoService>;
export const getLottoService = (() => {
  let lottoService: LottoService;

  return () => {
    if (!lottoService) {
      lottoService = new LottoService();
    }
    return lottoService;
  };
})();
