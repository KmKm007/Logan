/*
 * Copyright (c) 2018-present, 美团点评
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const path = require('path')
const moment = require('moment')
const md5 = require('blueimp-md5')

const app = express();

const config = {
  port: 4000
}

app.use(bodyParser.raw({
  type: 'binary/octet-stream',
  limit: '10mb'
}));

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.post('/logupload', (req, res) => {
  console.log('Logan client upload log file');
  if (!req.body) {
    return res.sendStatus(400);
  }
  if (fs.existsSync('./log-demo.txt')) {
    fs.unlinkSync('./log-demo.txt');
  }
  const who = {
    storeId: req.get('StoreId') || 0,
    deviceNo: md5(req.get('Deviceno')),
    versionName: req.get('VersionName')
  }
  if (!versionName) {
    who.appType = null
  } else {
    if (who.versionName.match(/[a-z]/g) !== null) {
      who.appType = 'assis_hd'
    } else {
      who.appType = 'print_service'
    }
  }
  // decode log
  decodeLog(req.body, 0, who);
  // haha
  console.log('decode log file complete');
  res.json({ success: true });
});

const decodeLog = (buf, skips, who) => {
  if (skips < buf.length) {
    const start = buf.readUInt8(skips);
    skips++;
    if (start == '1') {
      console.log('\nstart decode log file');
      const contentLen = (((buf.readUInt8(skips) & 0xFF) << 24) |
        ((buf.readUInt8(skips + 1) & 0xFF) << 16) |
        ((buf.readUInt8(skips + 2) & 0xFF) << 8) |
        (buf.readUInt8(skips + 3) & 0xFF));
      skips += 4;
      if (skips + contentLen > buf.length) {
        skips -= 4;
        decodeLog(buf, skips, who);
        return;
      }
      const content = buf.slice(skips, skips + contentLen);
      skips += contentLen;
      // decipher
      const decipher = crypto.createDecipheriv('aes-128-cbc', '0123456789012345', '0123456789012345');
      decipher.setAutoPadding(false);
      const decodedBuf = decipher.update(content);
      const finalBuf = decipher.final();
      const decoded = Buffer.concat([decodedBuf, finalBuf]);
      console.log('decrypt complete');
      // padding
      let padding1 = 0
      let padding2 = 0
      if (decoded.length === 0) {
        return
      }
      try {
        padding1 = decoded.readUInt8(decoded.length - 1);
        padding2 = decoded.readUInt8(decoded.length - 2);
      } catch (e) {
        console.log('decoded长度为' + decoded.length)
        console.log(e)
      }
      let padding = 0;
      if (padding1 > 1 && padding1 === padding2) {
        padding = padding1;
      } else if (padding === 1) {
        padding = padding1;
      }
      const realContent = decoded.slice(0, decoded.length - padding);
      console.log('remove padding complete');
      // end
      if (skips + contentLen < buf.length && buf.readUInt8(skips) == '0') {
        skips++;
      }

      // flush
      let wstream = fs.createWriteStream('./log-demo.gz');
      wstream.write(realContent);
      wstream.end();
      wstream.on('finish', () => {
        // unzip
        const unzip = zlib.createGunzip();
        const inp = fs.createReadStream('./log-demo.gz');
        const gout = fs.createWriteStream('./log-demo.txt', { flags: 'a' });
        inp.pipe(unzip).on('error', (err) => {
          // unzip error, continue recursion
          fs.unlinkSync('./log-demo.gz')
          decodeLog(buf, skips, who);
        }).pipe(gout).on('finish', (src) => {
          console.log('write finish');
          // write complete, continue recursion
          fs.unlinkSync('./log-demo.gz')
          decodeLog(buf, skips, who);
        }).on('error', (err) => {
          console.log(err);
        });
      });
    } else {
      decodeLog(buf, skips, who);
    }
  } else {
    var text = fs.readFileSync(path.resolve(__dirname, './log-demo.txt'), 'utf-8')
    const replaceText = text.replace(new RegExp('\0', 'g'), '')
    const logName = 'Logan-' + who.storeId + '-' + who.deviceNo + '-' + who.appType + '-' + moment().format('YYYY-MM-DD') + '.txt'
    fs.writeFile(path.resolve(__dirname, './' + logName), replaceText, { flag: 'w+'}, function (err) {
      if (err) {
        console.log('生成文件错误!', err)
      } else {
        if (fs.existsSync('./log-demo.txt')) {
          fs.unlinkSync('./log-demo.txt');
        }
      }
    })
  }
};

app.listen(config.port, () => console.log(`Logan demo server listening on port ${config.port}!`));