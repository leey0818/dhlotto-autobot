import { randomInt } from 'node:crypto';

/**
 * 로또 번호 6개 생성
 */
export const generateLottoNumbers = () => {
  const numbers: number[] = [];

  while (true) {
    if (numbers.length >= 6) break;
    const number = randomInt(1, 46); // 1 ~ 45번까지 생성
    if (numbers.includes(number)) continue;
    numbers.push(number);
  }

  // 오름차순 정렬
  numbers.sort((a, b) => a > b ? 1 : -1);

  return numbers;
};
