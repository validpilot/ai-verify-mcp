const fs = require('fs');
const path = require('path');
const https = require('https');

const onnxDir = path.join(__dirname, '../node_modules/ddddocr-node/onnx');

const models = [
  {
    name: 'common.onnx',
    url: 'https://github.com/renhaoyeh/ddddocr-node/raw/main/onnx/common.onnx'
  },
  {
    name: 'common_old.onnx',
    url: 'https://github.com/renhaoyeh/ddddocr-node/raw/main/onnx/common_old.onnx'
  }
];

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302) {
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
        }).on('error', reject);
      } else {
        response.pipe(file);
      }
      
      file.on('finish', () => {
        file.close(() => {
          const size = fs.statSync(dest).size;
          console.log(`✓ 下载成功: ${path.basename(dest)} (${(size / 1024 / 1024).toFixed(2)} MB)`);
          resolve(size);
        });
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('=== 下载 ddddocr-node OCR 模型 ===\n');
  
  if (!fs.existsSync(onnxDir)) {
    fs.mkdirSync(onnxDir, { recursive: true });
  }

  for (const model of models) {
    const dest = path.join(onnxDir, model.name);
    
    if (fs.existsSync(dest)) {
      const size = fs.statSync(dest).size;
      console.log(`✓ 已存在: ${model.name} (${(size / 1024 / 1024).toFixed(2)} MB)`);
      continue;
    }

    console.log(`正在下载: ${model.name}...`);
    try {
      await downloadFile(model.url, dest);
    } catch (err) {
      console.log(`✗ 下载失败: ${model.name}`);
      console.log(`  错误: ${err.message}`);
      console.log(`  手动下载地址: ${model.url}`);
    }
  }

  console.log('\n=== 模型下载完成 ===');
  
  const existingModels = fs.readdirSync(onnxDir).filter(f => f.endsWith('.onnx'));
  console.log(`\n当前可用模型:`);
  existingModels.forEach(model => {
    const size = fs.statSync(path.join(onnxDir, model)).size;
    console.log(`  - ${model} (${(size / 1024 / 1024).toFixed(2)} MB)`);
  });

  if (fs.existsSync(path.join(onnxDir, 'common.onnx'))) {
    console.log('\n🎉 OCR 模型已就绪！browser_captcha_read 将自动使用 ddddocr-node 进行识别。');
  } else {
    console.log('\n⚠️  模型下载失败，请手动下载并放置到以下目录:');
    console.log(`   ${onnxDir}`);
  }
}

main().catch(console.error);