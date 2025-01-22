import Conf from 'conf';

type StoreSchema = {
  lastRound: {
    round: number;
    date: string;
    numbers: number[];
    bonusNo: number;
  };
  lastBuyRound: number;
  buyRounds: Record<string, {
    numbers: number[][];
  }>;
};

const store = new Conf<StoreSchema>({
  cwd: process.cwd(),
  configName: 'storeData',
  serialize: (value) => JSON.stringify(value, null, '  '),
});

export default store;
