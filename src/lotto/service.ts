import axios, { AxiosInstance, isAxiosError } from 'axios';
import { load } from 'cheerio';
import iconv from 'iconv-lite';
import logger from '../utils/logger.js';
import { generateLottoNumber } from './generate.js';

type ResponseMessage = {
  success: boolean;
  message: string;
};

type LottoBuyResult = {
  buyRound: string;
  barCode1: string;
  barCode2: string;
  barCode3: string;
  barCode4: string;
  barCode5: string;
  barCode6: string;
  nBuyAmount: string;
  arrGameChoiceNum: string[];
  resultMsg: string;
};

enum URL {
  DIRECT = "INTCOM2",
  SESSION = "https://dhlottery.co.kr/gameResult.do?method=byWin&wiselog=H_C_1_1",
  BUY = "https://ol.dhlottery.co.kr/olotto/game/execBuy.do",
  ROUND_INFO = "https://www.dhlottery.co.kr/common.do?method=main",
  SYSTEM_CHECK = "https://dhlottery.co.kr/index_check.html",
  MAIN = "https://dhlottery.co.kr/common.do?method=main",
  LOGIN_REQUEST = "https://www.dhlottery.co.kr/userSsl.do?method=login",
}

enum ERROR {
  maintenance = "동행복권 사이트가 현재 시스템 점검중입니다.",
  requestFailed = "데이터 요청에 실패하였습니다.",
  cookieNotFound = "쿠키가 정상적으로 세팅되지 않았습니다.",
  // undefinedUser = "아이디와 비밀번호가 undefined입니다.",
  loginFailed = "로그인에 실패했습니다.",
  buyFailed = "구매에 실패했습니다.",
  emptyResult = "result message is empty",
}

const getLottoRequestHeaders = () => ({
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Host': 'dhlottery.co.kr',
  'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
  'sec-ch-ua-mobile': '?0',
  'Upgrade-Insecure-Requests': '1',
  'Origin': 'https://dhlottery.co.kr',
  'Content-Type': 'application/x-www-form-urlencoded',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  'Referer': 'https://dhlottery.co.kr/',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
});

export default class LottoService {
  axiosClient: AxiosInstance;

  constructor() {
    this.axiosClient = axios.create({
      timeout: 10000,
      headers: getLottoRequestHeaders(),
      responseType: 'arraybuffer',
    });
    this.axiosClient.interceptors.request.use((config) => {
      if (config.method?.toLowerCase() !== 'post') {
        delete config.headers['Content-Type'];
      }
      return config;
    });
    this.axiosClient.interceptors.response.use((response) => {
      response.data = iconv.decode(response.data, 'EUC-KR');
      return response;
    }, (err) => {
      if (isAxiosError(err) && err.response?.data) {
        err.response.data = iconv.decode(err.response.data, 'EUC-KR');
      }
      throw err;
    });
  }

  /**
   * 1단계) 동행복권 사이트 세션 생성
   */
  async createSession(): Promise<ResponseMessage> {
    const response = await this.axiosClient.get(URL.SESSION);
    const cookies = response.headers['set-cookie']?.map((c) => c.split(';')[0].trim());

    if (response.request.res.responseUrl === URL.SYSTEM_CHECK) {
      return { success: false, message: ERROR.maintenance };
    }

    if (response.status < 200 || response.status >= 300) {
      return {success: false, message: `${ERROR.requestFailed} ${response.status} ${response.statusText}`};
    }

    const jsessionId = cookies?.find((c) => c.includes('JSESSIONID'));
    if (jsessionId) {
      this.axiosClient.defaults.headers.common['Cookie'] = jsessionId;
      logger.debug('JSESSIONID was successfully extracted.', jsessionId);
      return { success: true, message: 'OK' };
    }

    return { success: false, message: ERROR.cookieNotFound };
  }

  /**
   * 2단계) 동행복권 사이트 로그인
   * @param userId 사용자ID
   * @param userPw 사용자비밀번호
   */
  async doLogin(userId: string, userPw: string): Promise<ResponseMessage> {
    const sessionResult = await this.createSession();
    if (!sessionResult.success) {
      return sessionResult;
    }

    const response = await this.axiosClient.post(URL.LOGIN_REQUEST, {
      returnUrl: URL.MAIN,
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

    return { success: false, message: ERROR.loginFailed };
  }

  /**
   * 3단계) 현재 로또 진행회차 가져오기 (마지막회차 +1)
   */
  async getRound() {
    const response = await this.axiosClient.get(URL.ROUND_INFO);
    const $load = load(response.data);
    const lastRound = parseInt($load('strong#lottoDrwNo').text(), 10);
    return String(lastRound + 1);
  }

  /**
   * 4단계) 로또 구매
   */
  async buyLotto(gameCount = 5) {
    if (gameCount < 1 || gameCount > 5) {
      throw new Error('한 회차 당 최대 5,000원 까지만 구매 가능합니다.');
    }

    const choiceParams = [];
    for (let i = 0; i < gameCount; i++) {
      const numbers = generateLottoNumber();
      choiceParams.push({
        genType: '1', // 수동
        arrGameChoiceNum: numbers.join(','),  // 선택한 번호 6개
        alpabet: 'ABCDE'.charAt(i),
      });
    }

    const round = await this.getRound();
    const body = {
      round,
      direct: URL.DIRECT,
      nBuyAmount: String(1000 * gameCount),
      param: JSON.stringify(choiceParams),
      gameCnt: String(gameCount),
    };

    logger.debug('request body: ', JSON.stringify(body));

    const response = await this.axiosClient.post(URL.BUY, body);
    const result: LottoBuyResult = response.data?.result;
    if (result?.resultMsg?.toUpperCase() !== 'SUCCESS') {
      return { success: false, message: `${ERROR.buyFailed}\n${result?.resultMsg || ERROR.emptyResult}`};
    }

    // 구매 성공!
    return {
      success: true,
      message: `✅ 구매를 완료하였습니다.
------------------
구매회차:\t\t제 ${result.buyRound}회
바코드:\t${result.barCode1} ${result.barCode2} ${result.barCode3} ${result.barCode4} ${result.barCode5} ${result.barCode6}
금액:\t\t${result.nBuyAmount}
구매번호:\n${this.formatLottoNumbers(result)}
결과메세지:\t${result.resultMsg}
----------------------`,
    };
  }

  private formatLottoNumbers(result: LottoBuyResult) {
    return result.arrGameChoiceNum.map((line) => `\t\t${line.slice(0, -1)}`).join('\n');
  }
}
