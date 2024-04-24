declare global {
  namespace NodeJS {
    interface ProcessEnv {
      JOB_SCHEDULE: string;
      TZ: string;

      TELEGRAM_BOT_TOKEN?: string;
      TELEGRAM_CHAT_ID?: string;

      LOTTO_USER_ID?: string;
      LOTTO_USER_PW?: string;
      LOTTO_BUY_COUNT?: string;
    }
  }
}

export {};
