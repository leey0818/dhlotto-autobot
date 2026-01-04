type Nullable<T> = {
  [K in keyof T]: T[K] | null;
}

type ApiResponse<T> = {
  data: T;
  resultCode: string | null;
  resultMessage: string | null;
}

export type MainInfoResponse = ApiResponse<{
  result: {
    pstLtEpstInfo: {
      lt645: {
        ltEpsd: number;   //게임회차
        ltRflYmd: string; //추첨일자
        tm1WnNo: number;  //1번숫자
        tm2WnNo: number;  //2번숫자
        tm3WnNo: number;  //3번숫자
        tm4WnNo: number;  //4번숫자
        tm5WnNo: number;  //5번숫자
        tm6WnNo: number;  //6번숫자
        bnsWnNo: number;  //보너스숫자
      }[];
    }
  }
}>;

/* 마이페이지 응답 */
export type UserDetailResponse = ApiResponse<{
  userMndp: Nullable<{
    crntEntrsAmt: number;  // 현재예치금(구매가능)
    crntLstlLtNuseAmt: number;
    crntMilgAmt: number;
    csblDpstAmt: number;
    csblTkmnyAmt: number;
    dataChgDt: string;
    dataChgUserId: string;
    dataCrtDt: string;
    dataCrtUserId: string;
    dawAplyAmt: number;  // 입출금신청금액
    entrsAmt: number;
    feeAmt: number;  // 수수료금액
    ipAddr: string;
    ncsblDpstAmt: number;
    ncsblTkmnyAmt: number;
    pntDpstAmt: number;
    pntTkmnyAmt: number;
    rsvtOrdrAmt: number;  // 예약주문금액
    tkmnyPsbltyAmt: number;
    totalAmt: number;
    useDsalAmt: number;
  }>;
}>;

export type UserReadyResponse = {
  direct_yn: string;
  ready_ip: string;
  ready_time: string;
  ready_cnt: string;
};

export type LottoBuyResult = {
  oltInetUserId: string;
  issueTime: string;  //구매시간
  issueDay: string;   //구매일자
  weekDay: string;    //구매요일
  buyRound: string;   //구매회차
  barCode1: string;   //구매바코드1
  barCode2: string;   //구매바코드2
  barCode3: string;   //구매바코드3
  barCode4: string;   //구매바코드4
  barCode5: string;   //구매바코드5
  barCode6: string;   //구매바코드6
  nBuyAmount: number;  //구매금액
  arrGameChoiceNum: string[];  //구매번호
  resultCode: string;
  resultMsg: string;
};

export type LottoBuyResponse = {
  loginYn?: string;
  isAllowed?: string;
  isGameManaged?: string;
  checkOltSaleTime?: boolean;
  errorMsg?: string;
  result: LottoBuyResult;
};
