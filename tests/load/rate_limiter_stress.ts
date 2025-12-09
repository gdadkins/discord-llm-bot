
import { RateLimiter } from '../../src/services/rate-limiting/RateLimiter';
import { logger } from '../../src/utils/logger';
import * as fs from 'fs';

// Mock logger to avoid noise
(logger as any).info = () => { };
(logger as any).warn = () => { };
(logger as any).error = console.error;

const TEST_STATE_FILE = './data/rate_limit_stress_test.json';

async function runStressTest() {
    console.log('Starting Rate Limiter Stress Test...');

    // clean up previous test
    if (fs.existsSync(TEST_STATE_FILE)) {
        fs.unlinkSync(TEST_STATE_FILE);
    }

    const limiter = new RateLimiter(1000, 10000, TEST_STATE_FILE);
    // @ts-ignore - access protected method
    await limiter.performInitialization();

    const CONCURRENCY = 500;
    const DURATION_MS = 5000;
    let active = true;
    let successCount = 0;
    let failCount = 0;

    // Stop after DURATION_MS
    setTimeout(() => {
        active = false;
    }, DURATION_MS);

    const workers = Array(CONCURRENCY).fill(0).map(async (_, id) => {
        while (active) {
            try {
                await limiter.checkAndIncrement();
                successCount++;
                // randomly force a flush/sync to provoke race conditions
                if (Math.random() < 0.01) {
                    // @ts-ignore
                    limiter.performMemorySync().catch(() => { });
                }
            } catch (e) {
                failCount++;
            }
            // Small delay to prevent complete event loop starvation
            await new Promise(r => setTimeout(r, Math.random() * 5));
        }
    });

    await Promise.all(workers);

    console.log('Stress Test Completed.');
    console.log(`Success: ${successCount}`);
    console.log(`Failures: ${failCount}`);

    // @ts-ignore
    await limiter.performShutdown();

    if (fs.existsSync(TEST_STATE_FILE)) {
        fs.unlinkSync(TEST_STATE_FILE);
    }
}

runStressTest().catch(console.error);
