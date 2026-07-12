const cron = require('node-cron');
const { refreshAllPrices, snapshotNetWorth, getAllUserIds } = require('../services/priceRefreshService');

// 매일 한국시간(KST) 오후 6시에 실행됩니다.
// - 국내 주식장 마감(15:30) 이후로 여유를 둔 시각입니다.
// - 시세는 전체 사용자 공통으로 한 번만 갱신하고, 자산 스냅샷은 사용자별로 각각 찍습니다.
const DAILY_CRON_EXPRESSION = '0 18 * * *';

function startDailyPriceScheduler() {
  cron.schedule(
    DAILY_CRON_EXPRESSION,
    async () => {
      const startedAt = new Date().toISOString();
      console.log(`[스케줄러] 일일 시세 수집 시작: ${startedAt}`);
      try {
        const result = await refreshAllPrices();
        const successCount = result.results.filter((r) => r.status === 'ok').length;
        const failCount = result.results.filter((r) => r.status === 'error').length;

        const userIds = getAllUserIds();
        userIds.forEach((userId) => snapshotNetWorth(userId));

        console.log(
          `[스케줄러] 완료 - 시세 성공 ${successCount}건, 실패 ${failCount}건, 사용자 ${userIds.length}명 스냅샷 갱신 (${result.updated_at})`
        );
      } catch (err) {
        console.error('[스케줄러] 실행 중 오류 발생:', err);
      }
    },
    { timezone: 'Asia/Seoul' }
  );

  console.log(`일일 시세 수집 스케줄러 등록 완료 (매일 18:00 KST, cron: ${DAILY_CRON_EXPRESSION})`);
}

module.exports = { startDailyPriceScheduler };
