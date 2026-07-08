const { DdddOcr, CHARSET_RANGE } = require('ddddocr-node');
const fs = require('fs');
const path = require('path');

async function testDdddOcr() {
  console.log('=== Testing ddddocr-node OCR ===\n');

  const ddddOcr = new DdddOcr();
  ddddOcr.setRanges(CHARSET_RANGE.NUM_CASE);

  const testImages = [
    { name: '测试图片 1 (数字)', path: path.join(__dirname, '../local-test/v3-admin-vite/src/pages/login/images/face.png') },
    { name: '测试图片 2 (图标)', path: path.join(__dirname, '../local-test/v3-admin-vite/src/common/assets/icons/dashboard.svg') },
  ];

  for (const testImg of testImages) {
    try {
      if (fs.existsSync(testImg.path)) {
        const result = await ddddOcr.classification(testImg.path);
        console.log(`${testImg.name}: ${testImg.path}`);
        console.log(`  识别结果: "${result.trim()}"`);
        console.log();
      } else {
        console.log(`${testImg.name}: 文件不存在 - ${testImg.path}`);
        console.log();
      }
    } catch (e) {
      console.log(`${testImg.name}: 识别失败 - ${e.message}`);
      console.log();
    }
  }

  console.log('=== Testing with sample captcha ===\n');
  
  const http = require('http');
  const url = require('url');
  
  console.log('测试方法:');
  console.log('1. browser_captcha_detect - 检测验证码元素');
  console.log('2. browser_captcha_screenshot - 截取验证码图片');
  console.log('3. browser_captcha_read - 使用 ddddocr-node 识别');
  console.log();
  console.log('ddddocr-node 支持:');
  console.log('- 基本OCR识别能力');
  console.log('- 数字+字母字符集');
  console.log('- 滑块验证码匹配');
  console.log('- 对象检测能力');
}

testDdddOcr().catch(e => {
  console.error('测试失败:', e.message);
  process.exit(1);
});