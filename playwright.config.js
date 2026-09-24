const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 20000,
    retries: 1,
    workers: 1,
    reporter: [
        ['list'],
        ['html', { outputFolder: 'test-report', open: 'never' }],
    ],
    use: {
        baseURL: 'https://flowershop-d26f4.web.app',
        headless: true,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],
});
