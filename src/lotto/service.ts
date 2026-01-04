import axios, { AxiosInstance, isAxiosError, RawAxiosRequestHeaders } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { CheerioAPI, load } from 'cheerio';
import NodeRSA from 'node-rsa';
import { stringify } from 'node:querystring';
import iconv from 'iconv-lite';
import logger from '../utils/logger.js';
import { generateLottoNumbers } from './generate.js';
import {
  ERROR_LOGIN_FAILED,
  URL_BUY,
  URL_CHANGE_PASSWORD,
  URL_GAME_RESULT,
  URL_PAGE_HOME,
  URL_PAGE_LOTTO645,
  URL_REQUEST_LOGIN,
  URL_REQUEST_MAININFO,
  URL_REQUEST_MYPAGE,
  URL_SELECT_RSA_MODULUS,
  URL_USER_READY
} from './constants.js';
import store from '../utils/store.js';
import { LottoBuyResponse, LottoBuyResult, MainInfoResponse, UserDetailResponse, UserReadyResponse } from './types.js';

type ResponseMessage = {
  success: boolean;
  message: string;
};

const getLottoRequestHeaders = (): RawAxiosRequestHeaders => ({
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
    const cookieJar = new CookieJar();
    this.axiosClient = wrapper(axios.create({
      jar: cookieJar,
      timeout: 10000,
      responseType: 'arraybuffer',
      headers: getLottoRequestHeaders(),
    }));
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
  // async createSession(): Promise<ResponseMessage> {
  //   const response = await this.axiosClient.get(URL_HOMEPAGE);
  //   const cookies = response.headers['set-cookie']?.map((c) => c.split(';')[0].trim());
  //
  //   if (response.request.res.responseUrl === URL_SYSTEM_CHECK) {
  //     return { success: false, message: ERROR_MAINTENANCE };
  //   }
  //
  //   if (response.status < 200 || response.status >= 300) {
  //     return { success: false, message: `${ERROR_REQUEST_FAILED} ${response.status} ${response.statusText}`};
  //   }
  //
  //   const jsessionId = cookies?.find((c) => c.includes('JSESSIONID'));
  //   if (jsessionId) {
  //     this.axiosClient.defaults.headers.common['Cookie'] = jsessionId;
  //     logger.debug('JSESSIONID was successfully extracted.', jsessionId);
  //     return { success: true, message: 'OK' };
  //   } else {
  //     const cookie = response.request.getHeader('cookie');
  //     if (typeof cookie === 'string' && cookie.includes('JSESSIONID')) {
  //       logger.debug('JSESSIONID already exists');
  //       return { success: true, message: 'OK' };
  //     }
  //   }
  //
  //   return { success: false, message: ERROR_COOKIE_NOT_FOUND };
  // }

  /**
   * 동행복권 사이트 로그인
   */
  async doLogin(): Promise<ResponseMessage> {
    const userId = process.env.LOTTO_USER_ID;
    const userPw = process.env.LOTTO_USER_PW;

    // 세션 생성을 위해 메인페이지 호출
    await this.axiosClient.get(URL_PAGE_HOME);

    const rsaKey = await this.#initRsaModulus();
    if (!rsaKey) {
      return { success: false, message: '암호화 모듈 초기화 실패' };
    }

    const response = await this.axiosClient.post(URL_REQUEST_LOGIN, {
      inpUserId: userId,
      userId: rsaKey.encrypt(userId, 'hex'),
      userPswdEncn: rsaKey.encrypt(userPw, 'hex'),
    }, {
      maxRedirects: 0,
      validateStatus: (code) => (code >= 200 && code < 400),
    });

    logger.debug('로그인 호출 응답코드:', response.status, response.statusText);

    // 로그인 성공 시 페이지 리다이렉트됨
    if (response.status >= 300 && response.status < 400) {
      const redirectUrl = response.headers['location'];
      logger.debug('로그인 응답 리다이렉트:', redirectUrl);
      if (redirectUrl?.includes('loginSuccess.do')) {
        return { success: true, message: '로그인 성공' };
      }
      return { success: false, message: '로그인 실패 (리다이렉트 URL 확인필요)' };
    }

    if (response.status >= 200 && response.status < 300) {
      const $load = load(response.data);
      let isSuccess: boolean;

      // 비밀번호 변경 페이지인지 확인
      if ($load('div.content_change_password').length > 0) {
        isSuccess = await this.doSkipChangePassword($load);
      } else {
        isSuccess = $load('a.btn_common.lrg.blu').length === 0;
      }

      if (isSuccess) {
        return { success: true, message: '로그인 성공' };
      }
    }

    return { success: false, message: ERROR_LOGIN_FAILED };
  }

  /**
   * 비밀번호 변경 페이지 우회
   * @param $dom
   */
  async doSkipChangePassword($dom: CheerioAPI) {
    const $form = $dom('form[name="userIdCheckForm"] input');
    if ($form.length > 0) {
      const inputs: Record<string, string> = {};
      $form.each((i, el) => {
        const $input = $dom(el);
        const name = $input.attr('name');
        const value = $input.val();
        if (name && typeof value === 'string') {
          inputs[name] = value;
        }
      });

      await this.axiosClient.post(URL_CHANGE_PASSWORD, inputs);
      return true;
    }

    return false;
  }

  // 암호화 모듈 초기화
  async #initRsaModulus() {
    const response = await this.axiosClient.get(URL_SELECT_RSA_MODULUS);
    logger.debug('selectRsaModulus result:', response.status, JSON.stringify(response.data));
    if (response.status === 200) {
      const result = response.data as { data: { publicExponent: string; rsaModulus: string }; };
      const key = new NodeRSA();
      key.setOptions({ encryptionScheme: 'pkcs1' });
      key.importKey({
        n: Buffer.from(result.data.rsaModulus, 'hex'),
        e: parseInt(result.data.publicExponent, 16),
      });
      return key;
    }
    return null;
  }

  /**
   * 마지막 로또 회차 가져오기
   */
  async getLastRound() {
    const response = await this.axiosClient.get<MainInfoResponse>(URL_REQUEST_MAININFO);
    const lt645Games = response.data.data?.result?.pstLtEpstInfo?.lt645 || [];

    const lastGame = lt645Games.sort((o1, o2) => o2.ltEpsd - o1.ltEpsd)[0];
    const numbers = [
      lastGame.tm1WnNo, lastGame.tm2WnNo,
      lastGame.tm3WnNo, lastGame.tm4WnNo,
      lastGame.tm5WnNo, lastGame.tm6WnNo,
    ];

    return {
      round: lastGame.ltEpsd,
      date: lastGame.ltRflYmd,
      bonusNo: lastGame.bnsWnNo,
      numbers,
    };
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
    const response = await this.axiosClient.get<UserDetailResponse>(URL_REQUEST_MYPAGE);
    const result = response.data;
    return Number(result?.data?.userMndp?.crntEntrsAmt || 0);
  }

  /**
   * 로또 구매
   * @param gameCount 구매 게임수
   */
  async buyLotto(gameCount = 5): Promise<ResponseMessage> {
    if (gameCount < 1 || gameCount > 5) {
      throw new Error('한 회차 당 최대 5,000원 까지만 구매 가능합니다.');
    }

    // 사이트 세션 생성을 위해 로또구매 페이지 호출
    await this.axiosClient.get(URL_PAGE_LOTTO645);

    const genType = process.env.LOTTO_BUY_TYPE === 'M' ? '1' : '0';
    const choiceParams = [];
    for (let i = 0; i < gameCount; i++) {
      choiceParams.push({
        genType, // 0: 자동, 1: 수동, 2: 반자동
        alpabet: 'ABCDE'.charAt(i),
        // 수동 일 때 번호 생성
        arrGameChoiceNum: genType === '1' ? generateLottoNumbers(i + 1).join(',') : '',
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
      saleMdaDcd: '10',
    };

    logger.debug('로또 구매 요청:', JSON.stringify(body));
    const response = await this.axiosClient.post<LottoBuyResponse>(URL_BUY, body);
    logger.debug('로또 구매 응답:', JSON.stringify(response.data));

    if (response.data.loginYn === 'N') {
      return { success: false, message: '로또 구매 실패: 로그인 오류' };
    }
    if (response.data.isAllowed === 'N') {
      return { success: false, message: '로또 구매 실패: 비정상적인 접속' };
    }
    if (response.data.isGameManaged === 'Y') {
      return { success: false, message: `로또 구매 실패: ${response.data.errorMsg || '알 수 없는 오류'}` };
    }
    if (response.data.checkOltSaleTime === false) {
      return { success: false, message: '로또 구매 실패: 잘못된 요청' };
    }

    const result = response.data?.result;
    if (result?.resultCode !== '100') {
      return { success: false, message: `로또 구매 실패: ${result?.resultMsg || '응답 메세지 없음'}` };
    }

    // 남은 예치금 계산
    const remainMoney = curMoney - result.nBuyAmount;
    const isNotEnoughMoney = remainMoney < result.nBuyAmount;

    // 구매 데이터 저장
    store.set(`buyRounds.${result.buyRound}`, { numbers: this.getLottoNumbers(result) });
    store.set('lastBuyRound', Number(result.buyRound));

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

  private getLottoNumbers(result: LottoBuyResult) {
    return result.arrGameChoiceNum.map((line) => {
      const lineArr = line.slice(0, -1).split('|');
      const toNum = (str: string) => parseInt(str, 10);
      return [toNum(lineArr[1]), toNum(lineArr[2]), toNum(lineArr[3]), toNum(lineArr[4]), toNum(lineArr[5]), toNum(lineArr[6])];
    });
  }

  private formatLottoNumbers(result: LottoBuyResult) {
    return result.arrGameChoiceNum.map((line) => {
      const lineArr = line.slice(0, -1).split('|');
      const alpabet = lineArr[0];
      const genType = line.slice(-1);
      const genTypeName = genType === '3' ? '자동' : genType === '1' ? '수동' : genType === '2' ? '반자동' : genType;
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
