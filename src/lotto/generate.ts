import { randomInt } from 'node:crypto';

/**
 * 로또 번호 6개 생성
 * @param gameNo 게임번호(1~5)
 */
export const generateLottoNumbers = (gameNo: number) => {
  // 사용자정의 번호 가져오기
  const envKey = `LOTTO_GAME${gameNo}`;
  const userNumbers = (process.env[envKey] ?? '').split(' ')
    .map((v) => parseInt(v, 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= 45);

  // 중복 번호 제외하고 사용자 번호로 초기화
  const numbers = [...new Set(userNumbers)];

  // 랜덤 번호 생성
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
