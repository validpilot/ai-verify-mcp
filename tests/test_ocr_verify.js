const { DdddOcr, CHARSET_RANGE } = require('ddddocr-node');
const fs = require('fs');
const path = require('path');
const https = require('https');

async function downloadTestImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== 测试 ddddocr-node OCR 识别能力 ===\n');

  const ddddOcr = new DdddOcr();
  ddddOcr.setRanges(CHARSET_RANGE.NUM_CASE);

  const testImages = [
    { name: '数字验证码', url: 'http://dummyimage.com/120x50/000/fff&text=1234', expected: '1234' },
    { name: '字母数字混合', url: 'http://dummyimage.com/120x50/000/fff&text=A1B2', expected: 'A1B2' },
    { name: '纯字母', url: 'http://dummyimage.com/120x50/000/fff&text=ABCD', expected: 'ABCD' },
    { name: '大写字母', url: 'http://dummyimage.com/120x50/000/fff&text=XYZW', expected: 'XYZW' },
  ];

  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  let successCount = 0;
  let totalCount = 0;

  for (const testImg of testImages) {
    totalCount++;
    const imgPath = path.join(tempDir, `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`);

    try {
      console.log(`测试: ${testImg.name}`);
      console.log(`URL: ${testImg.url}`);
      
      await downloadTestImage(testImg.url, imgPath);
      
      const result = await ddddOcr.classification(imgPath);
      const cleanedResult = result.trim().replace(/\s+/g, '');
      
      console.log(`期望结果: "${testImg.expected}"`);
      console.log(`识别结果: "${cleanedResult}"`);
      
      const isCorrect = cleanedResult.toUpperCase() === testImg.expected.toUpperCase();
      if (isCorrect) {
        successCount++;
        console.log('✓ 识别正确！');
      } else {
        console.log('✗ 识别错误');
      }
      
      fs.unlinkSync(imgPath);
    } catch (e) {
      console.log(`✗ 测试失败: ${e.message}`);
    }
    console.log();
  }

  console.log('=== 测试结果 ===');
  console.log(`总数: ${totalCount}, 正确: ${successCount}, 正确率: ${((successCount / totalCount) * 100).toFixed(0)}%`);

  if (successCount === totalCount) {
    console.log('\n🎉 OCR 模型工作正常！');
  } else {
    console.log('\n⚠️  OCR 识别存在误差，请检查测试图片或模型配置');
  }
}

main().catch(console.error);