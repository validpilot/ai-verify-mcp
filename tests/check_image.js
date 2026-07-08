const fs = require('fs');

function checkImage() {
  const screenshotPath = 'C:\\Users\\Administrator\\screenshots\\captcha-1783191695665.png';
  
  if (!fs.existsSync(screenshotPath)) {
    console.log('截图文件不存在:', screenshotPath);
    return;
  }

  const data = fs.readFileSync(screenshotPath);
  console.log('文件大小:', data.length, '字节');
  
  const header = data.slice(0, 8).toString('hex');
  console.log('文件头:', header);
  
  if (header === '89504e470d0a1a0a') {
    console.log('这是一个有效的PNG文件');
  } else {
    console.log('不是有效的PNG文件');
  }

  const ihdrOffset = data.indexOf('IHDR');
  if (ihdrOffset !== -1) {
    const width = data.readUInt32BE(ihdrOffset + 4);
    const height = data.readUInt32BE(ihdrOffset + 8);
    console.log('图片尺寸:', width, 'x', height);
  } else {
    console.log('无法找到IHDR块');
  }
}

checkImage();