const fs = require('fs');
const path = require('path');

async function testOCR() {
  const screenshotPath = 'C:\\Users\\Administrator\\screenshots\\captcha-1783191695665.png';
  
  if (!fs.existsSync(screenshotPath)) {
    console.log('截图文件不存在:', screenshotPath);
    return;
  }

  const stats = fs.statSync(screenshotPath);
  console.log('截图文件大小:', stats.size, '字节');

  try {
    const modelPath = path.join(__dirname, '../node_modules/ddddocr-node/onnx/common.onnx');
    console.log('模型文件路径:', modelPath);
    console.log('模型文件存在:', fs.existsSync(modelPath));

    if (fs.existsSync(modelPath)) {
      const { DdddOcr, CHARSET_RANGE } = require('ddddocr-node');
      const ddddOcr = new DdddOcr();
      ddddOcr.setRanges(CHARSET_RANGE.NUM_CASE);

      const result = await ddddOcr.classification(screenshotPath);
      console.log('OCR识别结果:', JSON.stringify(result));
      console.log('识别结果长度:', result ? result.length : 0);
    } else {
      console.log('模型文件缺失');
    }
  } catch (error) {
    console.error('OCR识别失败:', error.message);
    console.error('堆栈:', error.stack);
  }
}

testOCR();