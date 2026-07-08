const { DdddOcr, CHARSET_RANGE } = require('ddddocr-node');
const fs = require('fs');
const path = require('path');
const http = require('http');

async function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    http.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== 直接测试 ddddocr-node OCR ===\n');

  const ddddOcr = new DdddOcr();
  ddddOcr.setRanges(CHARSET_RANGE.NUM_CASE);

  const testImages = [
    { name: '数字验证码 1234', url: 'http://dummyimage.com/120x50/000/fff&text=1234', expected: '1234' },
    { name: '字母数字混合 A1B2', url: 'http://dummyimage.com/120x50/000/fff&text=A1B2', expected: 'A1B2' },
    { name: '纯字母大写 ABCD', url: 'http://dummyimage.com/120x50/000/fff&text=ABCD', expected: 'ABCD' },
    { name: '纯字母小写 abcd', url: 'http://dummyimage.com/120x50/000/fff&text=abcd', expected: 'abcd' },
    { name: '6位数字 123456', url: 'http://dummyimage.com/140x50/000/fff&text=123456', expected: '123456' },
    { name: '字母数字混合 XY99', url: 'http://dummyimage.com/120x50/fff/000&text=XY99', expected: 'XY99' },
  ];

  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  let successCount = 0;

  for (const testImg of testImages) {
    const imgPath = path.join(tempDir, `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`);
    
    try {
      await downloadImage(testImg.url, imgPath);
      
      const result = await ddddOcr.classification(imgPath);
      const cleanedResult = result.trim().replace(/\s+/g, '');
      
      const isCorrect = cleanedResult.toUpperCase() === testImg.expected.toUpperCase();
      const status = isCorrect ? '✓' : '✗';
      
      if (isCorrect) successCount++;
      
      console.log(`${status} ${testImg.name}`);
      console.log(`   期望: "${testImg.expected}"`);
      console.log(`   识别: "${cleanedResult}"`);
      console.log();
      
      fs.unlinkSync(imgPath);
    } catch (e) {
      console.log(`✗ ${testImg.name}: ${e.message}`);
      console.log();
    }
  }

  console.log(`=== 测试结果: ${successCount}/${testImages.length} 正确 (${((successCount / testImages.length) * 100).toFixed(0)}%) ===`);
  
  if (successCount === testImages.length) {
    console.log('\n🎉 ddddocr-node OCR 工作正常！');
  } else {
    console.log('\n⚠️  OCR 识别存在误差');
  }
}

main().catch(console.error);