import { defineConfig } from '@playwright/test';
const base=process.env.BASE_PATH??'/';
export default defineConfig({
  testDir:'tests/e2e',timeout:60000,workers:1,
  use:{baseURL:`http://127.0.0.1:4173${base}`,headless:true,launchOptions: process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}:{}},
  webServer:{command:'npm run preview -- --port 4173 --strictPort',url:`http://127.0.0.1:4173${base}`,reuseExistingServer:false},
});
