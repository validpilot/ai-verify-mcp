const fs = require('fs');
const { createWorker } = require('tesseract.js');

async function testTesseract() {
  const screenshotPath = 'C:\\Users\\Administrator\\screenshots\\captcha-1783191695665.png';
  
  if (!fs.existsSync(screenshotPath)) {
    console.log('截图文件不存在:', screenshotPath);
    return;
  }

  const stats = fs.statSync(screenshotPath);
  console.log('截图文件大小:', stats.size, '字节');

  try {
    const worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
      tessedit_pageseg_mode: '7'
    });

    const { data: { text, confidence } } = await worker.recognize(screenshotPath);
    console.log('Tesseract识别结果:', JSON.stringify(text.trim()));
    console.log('置信度:', confidence);

    await worker.terminate();
  } catch (error) {
    console.error('Tesseract识别失败:', error.message);
    console.error('堆栈:', error.stack);
  }
}

testTesseract();