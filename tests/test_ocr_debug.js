const { DdddOcr, CHARSET_RANGE } = require('ddddocr-node');
const fs = require('fs');
const path = require('path');
const http = require('http');

async function downloadImage(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    http.get(url, (response) => {
      console.log(`下载状态码: ${response.statusCode}`);
      console.log(`Content-Type: ${response.headers['content-type']}`);
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          const stats = fs.statSync(dest);
          console.log(`文件大小: ${stats.size} bytes`);
          resolve();
        });
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== 调试 ddddocr-node OCR ===\n');

  const ddddOcr = new DdddOcr();
  ddddOcr.setRanges(CHARSET_RANGE.NUM_CASE);

  const testUrl = 'http://dummyimage.com/120x50/000/fff&text=1234';
  const imgPath = path.join(__dirname, '../temp', `debug_test.png`);
  
  try {
    console.log(`下载图片: ${testUrl}`);
    await downloadImage(testUrl, imgPath);
    
    const stats = fs.statSync(imgPath);
    console.log(`文件存在: ${fs.existsSync(imgPath)}`);
    console.log(`文件大小: ${stats.size} bytes`);
    
    const buffer = fs.readFileSync(imgPath);
    console.log(`Buffer 长度: ${buffer.length}`);
    console.log(`Buffer 前20字节: ${buffer.slice(0, 20).toString('hex')}`);
    
    console.log('\n调用 OCR...');
    const result = await ddddOcr.classification(imgPath);
    console.log(`OCR 结果: "${result}"`);
    
  } catch (e) {
    console.log(`\n错误: ${e.message}`);
    console.log(`错误堆栈:\n${e.stack}`);
  } finally {
    if (fs.existsSync(imgPath)) {
      fs.unlinkSync(imgPath);
    }
  }
}

main().catch(console.error);