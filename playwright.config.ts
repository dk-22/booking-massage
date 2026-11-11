import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests',fullyParallel:false,workers:1,timeout:30000,
 use:{baseURL:'http://127.0.0.1:4201',trace:'retain-on-failure'},
 webServer:{command:'npm start -- --host 127.0.0.1 --port 4201',url:'http://127.0.0.1:4201',reuseExistingServer:!process.env.CI,timeout:120000},
 reporter:'list',
});
