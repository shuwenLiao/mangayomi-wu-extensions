const mangayomiSources = [{
  "name": "AGE动漫",
  "lang": "zh",
  "baseUrl": "https://www.agedm.io",
  "apiUrl": "",
  "iconUrl": "https://www.agedm.io/favicon.ico",
  "typeSource": "single",
  "itemType": 1,
  "isNsfw": false,
  "version": "0.0.14",
  "dateFormat": "",
  "dateFormatLocale": "",
  "pkgPath": "age.js"
}];

// v0.0.13: 纯 JS 密码学（MD5 + AES-128-CBC），不依赖 WASM/WebView。
// hxm_encrypt/hxm_decrypt 的密钥与 IV 都是 "ni po jie ni  **"（16 字节），
// 从解析器 WASM (jx.wuzhoupai.com.wasm) 内存中提取并经服务端验证通过。
// 0.0.12 的 WebView 路线失败是因为手机上 WASM 域名 cdn.xmfxgjzx.com 不加载；
// 这版直接用扩展自带的 Client 调 Api.php，全程不需要 WASM。
// ---------- MD5 (RFC 1321) ----------
function md5hex(str) {
  // str is a JS string; encode as UTF-8 bytes (inputs here are ASCII)
  var bytes = [];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c < 128) bytes.push(c);
    else if (c < 2048) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
    else if (c < 65536) { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
    else { bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
  }
  var origLen = bytes.length;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  var bitLen = origLen * 8;
  // 64-bit little-endian length; high 32 bits are 0 for our short inputs
  bytes.push(bitLen & 0xff, (bitLen >>> 8) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 24) & 0xff, 0, 0, 0, 0);
  function rol(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }
  function f1(x, y, z) { return (x & y) | (~x & z); }
  function f2(x, y, z) { return (x & z) | (y & ~z); }
  function f3(x, y, z) { return x ^ y ^ z; }
  function f4(x, y, z) { return y ^ (x | ~z); }
  var K = [];
  for (var i = 0; i < 64; i++) K.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
  var S = [7,12,17,22, 7,12,17,22, 7,12,17,22, 7,12,17,22,
           5,9,14,20, 5,9,14,20, 5,9,14,20, 5,9,14,20,
           4,11,16,23, 4,11,16,23, 4,11,16,23, 4,11,16,23,
           6,10,15,21, 6,10,15,21, 6,10,15,21, 6,10,15,21];
  var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (var off = 0; off < bytes.length; off += 64) {
    var M = [];
    for (var j = 0; j < 16; j++) {
      M.push((bytes[off + j * 4] | (bytes[off + j * 4 + 1] << 8) | (bytes[off + j * 4 + 2] << 16) | (bytes[off + j * 4 + 3] << 24)) >>> 0);
    }
    var A = a0, B = b0, C = c0, D = d0;
    for (var i = 0; i < 64; i++) {
      var F, g;
      if (i < 16) { F = f1(B, C, D); g = i; }
      else if (i < 32) { F = f2(B, C, D); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = f3(B, C, D); g = (3 * i + 5) % 16; }
      else { F = f4(B, C, D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + rol(F, S[i])) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  function hex32(x) {
    var s = '';
    for (var i = 0; i < 4; i++) s += ('0' + ((x >>> (i * 8)) & 0xff).toString(16)).slice(-2);
    return s;
  }
  return hex32(a0) + hex32(b0) + hex32(c0) + hex32(d0);
}

// ---------- AES-128 ----------
var AES_SBOX = [
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16];
var AES_INV_SBOX = [
  0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
  0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
  0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
  0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
  0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
  0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
  0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
  0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
  0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
  0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
  0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
  0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
  0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
  0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
  0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
  0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d];
var AES_RCON = [0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36];

function aesExpandKey(keyBytes) {
  var w = [];
  for (var i = 0; i < 4; i++) w.push([keyBytes[i*4], keyBytes[i*4+1], keyBytes[i*4+2], keyBytes[i*4+3]]);
  for (var i = 4; i < 44; i++) {
    var temp = w[i-1].slice();
    if (i % 4 === 0) {
      temp = [AES_SBOX[temp[1]] ^ AES_RCON[i/4 - 1], AES_SBOX[temp[2]], AES_SBOX[temp[3]], AES_SBOX[temp[0]]];
    }
    w.push([w[i-4][0] ^ temp[0], w[i-4][1] ^ temp[1], w[i-4][2] ^ temp[2], w[i-4][3] ^ temp[3]]);
  }
  return w;
}
function aesAddRoundKey(state, w, round) {
  for (var c = 0; c < 4; c++)
    for (var r = 0; r < 4; r++)
      state[r][c] ^= w[round * 4 + c][r];
}
function aesSubBytes(state, inv) {
  var box = inv ? AES_INV_SBOX : AES_SBOX;
  for (var r = 0; r < 4; r++)
    for (var c = 0; c < 4; c++)
      state[r][c] = box[state[r][c]];
}
function aesShiftRows(state, inv) {
  for (var r = 1; r < 4; r++) {
    var row = [state[r][0], state[r][1], state[r][2], state[r][3]];
    for (var c = 0; c < 4; c++) state[r][c] = inv ? row[(c - r + 4) % 4] : row[(c + r) % 4];
  }
}
function xtime(a) { return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff; }
function gmul(a, b) {
  var p = 0;
  for (var i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    var hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}
function aesMixColumns(state, inv) {
  for (var c = 0; c < 4; c++) {
    var a0 = state[0][c], a1 = state[1][c], a2 = state[2][c], a3 = state[3][c];
    if (!inv) {
      state[0][c] = gmul(a0,2) ^ gmul(a1,3) ^ a2 ^ a3;
      state[1][c] = a0 ^ gmul(a1,2) ^ gmul(a2,3) ^ a3;
      state[2][c] = a0 ^ a1 ^ gmul(a2,2) ^ gmul(a3,3);
      state[3][c] = gmul(a0,3) ^ a1 ^ a2 ^ gmul(a3,2);
    } else {
      state[0][c] = gmul(a0,14) ^ gmul(a1,11) ^ gmul(a2,13) ^ gmul(a3,9);
      state[1][c] = gmul(a0,9) ^ gmul(a1,14) ^ gmul(a2,11) ^ gmul(a3,13);
      state[2][c] = gmul(a0,13) ^ gmul(a1,9) ^ gmul(a2,14) ^ gmul(a3,11);
      state[3][c] = gmul(a0,11) ^ gmul(a1,13) ^ gmul(a2,9) ^ gmul(a3,14);
    }
  }
}
function aesEncryptBlock(block, w) {
  var s = [[],[],[],[]];
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) s[r][c] = block[c*4 + r];
  aesAddRoundKey(s, w, 0);
  for (var round = 1; round < 10; round++) {
    aesSubBytes(s, false); aesShiftRows(s, false); aesMixColumns(s, false); aesAddRoundKey(s, w, round);
  }
  aesSubBytes(s, false); aesShiftRows(s, false); aesAddRoundKey(s, w, 10);
  var out = [];
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) out.push(s[r][c]);
  return out;
}
function aesDecryptBlock(block, w) {
  var s = [[],[],[],[]];
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) s[r][c] = block[c*4 + r];
  aesAddRoundKey(s, w, 10);
  for (var round = 9; round >= 1; round--) {
    aesShiftRows(s, true); aesSubBytes(s, true); aesAddRoundKey(s, w, round); aesMixColumns(s, true);
  }
  aesShiftRows(s, true); aesSubBytes(s, true); aesAddRoundKey(s, w, 0);
  var out = [];
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) out.push(s[r][c]);
  return out;
}
function strToBytes(s) {
  var b = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 128) b.push(c);
    else if (c < 2048) { b.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
    else { b.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
  }
  return b;
}
function bytesToStr(b) {
  var s = '';
  for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}
function bytesToHex(b) {
  var s = '';
  for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2);
  return s;
}
function hexToBytes(h) {
  var b = [];
  for (var i = 0; i < h.length; i += 2) b.push(parseInt(h.substr(i, 2), 16));
  return b;
}
function aesCbcEncryptBytes(plainBytes, keyBytes, ivBytes) {
  var w = aesExpandKey(keyBytes);
  var data = plainBytes.slice();
  var pad = 16 - (data.length % 16);
  for (var i = 0; i < pad; i++) data.push(pad);
  var out = [], prev = ivBytes.slice();
  for (var off = 0; off < data.length; off += 16) {
    var block = [];
    for (var j = 0; j < 16; j++) block.push(data[off + j] ^ prev[j]);
    var enc = aesEncryptBlock(block, w);
    out = out.concat(enc);
    prev = enc;
  }
  return out;
}
function aesCbcDecryptBytes(cipherBytes, keyBytes, ivBytes) {
  var w = aesExpandKey(keyBytes);
  var out = [], prev = ivBytes.slice();
  for (var off = 0; off < cipherBytes.length; off += 16) {
    var block = cipherBytes.slice(off, off + 16);
    var dec = aesDecryptBlock(block, w);
    for (var j = 0; j < 16; j++) dec[j] ^= prev[j];
    out = out.concat(dec);
    prev = block;
  }
  // strip PKCS7
  var pad = out[out.length - 1];
  if (pad >= 1 && pad <= 16) out = out.slice(0, out.length - pad);
  return out;
}
// hxm_encrypt / hxm_decrypt equivalents (key = IV = "ni po jie ni  **")
var HXM_KEY = strToBytes('ni po jie ni  **');
function hxmEncryptJS(plaintext) {
  return bytesToHex(aesCbcEncryptBytes(strToBytes(plaintext), HXM_KEY, HXM_KEY));
}
function hxmDecryptJS(hexCipher) {
  return bytesToStr(aesCbcDecryptBytes(hexToBytes(hexCipher), HXM_KEY, HXM_KEY));
}
// response AES-CBC decrypt (key = MD5hex[0:16] Latin1, IV = MD5hex[16:32])
function aesCbcDeJS(hexData, md5hex) {
  var key = strToBytes(md5hex.substring(0, 16));
  var iv = strToBytes(md5hex.substring(16, 32));
  return bytesToStr(aesCbcDecryptBytes(hexToBytes(hexData), key, iv));
}
class DefaultExtension extends MProvider {
  stringUTF8(text, d) {
    if (!d) {
      return text;
    }
    // v0.0.3 fix: 桥已按 UTF-8 解出中文时（任一字符码 > 255），不再二次解码，否则标题变乱码
    for (var j = 0; j < text.length; j++) {
      if (text.charCodeAt(j) > 255) return text;
    }
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      bytes.push(text.charCodeAt(i));
    }
    var charCodes = [];
    var i = 0;
    while (i < bytes.length) {
      var byte1 = bytes[i];
      var charCode;
      if (byte1 < 0x80) {
        charCode = byte1;
        i += 1;
      } else if (byte1 < 0xE0) {
        var byte2 = bytes[i + 1];
        charCode = ((byte1 & 0x1F) << 6) | (byte2 & 0x3F);
        i += 2;
      } else if (byte1 < 0xF0) {
        var byte2 = bytes[i + 1];
        var byte3 = bytes[i + 2];
        charCode = ((byte1 & 0x0F) << 12) | ((byte2 & 0x3F) << 6) | (byte3 & 0x3F);
        i += 3;
      } else {
        var byte2 = bytes[i + 1];
        var byte3 = bytes[i + 2];
        var byte4 = bytes[i + 3];
        charCode = ((byte1 & 0x07) << 18) | ((byte2 & 0x3F) << 12) | ((byte3 & 0x3F) << 6) | (byte4 & 0x3F);
        i += 4;
      }
      charCodes.push(charCode);
    }
    return String.fromCharCode.apply(null, charCodes);
  }

  // 名字可能是正确的 UTF-8（站声明了 charset=utf-8，桥直接给正确中文），
  // 也可能是 Latin-1 乱码（站没声明 charset 时桥按 Latin-1 解）。
  // 已有中文就直接用，没有中文才按 UTF-8 重新解一次，避免把正确中文二次解成乱码。
  fixText(text) {
    if (!text) return "";
    if (/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(text)) return text;
    return this.stringUTF8(text, true);
  }

  // 列表页在内置浏览器里打开，等卡片出现后把整页 HTML 交回来；
  // 静态请求拿不到内容（VPN/网络抖动、空响应）时的兜底，静态能拿到时不用它
  async loadListViaWebview(url, readySelector) {
    if (typeof evaluateJavascriptViaWebview !== "function") return "";
    const script = `(function(){
      if (window.__ageListRead) return;
      window.__ageListRead = true;
      var done = false, started = Date.now(), interval;
      function send(value) {
        if (done) return;
        done = true;
        if (interval) clearInterval(interval);
        window.flutter_inappwebview.callHandler("setResponse", JSON.stringify(value));
      }
      function poll() {
        var body = document.body;
        if (body) {
          var markup = document.documentElement.outerHTML || "";
          var guarded = /Just a moment|Checking your browser|Attention Required/i.test(String(document.title || "")) ||
            /cf-challenge|challenge-platform|cf-turnstile|_cf_chl/i.test(markup);
          if (!guarded && document.querySelector('${readySelector}')) {
            send({html: markup, error: ""});
            return;
          }
        }
        if (Date.now() - started > 14500) send({html: "", error: "timeout"});
      }
      interval = setInterval(poll, 500);
      poll();
    })();`;
    let result;
    try {
      result = await evaluateJavascriptViaWebview(url, {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }, [script], 18);
    } catch (err) {
      return "";
    }
    try {
      const data = JSON.parse(String(result || ""));
      return (data && data.html) ? data.html : "";
    } catch (_) {
      return "";
    }
  }

  // 根因（2026-11-14 实测）：agedm.io 对不带 User-Agent 的请求返回 403，
  // 带浏览器 UA 才返回 200。扩展的 Client() 默认不发 UA，所以列表/搜索一直是空的。
  headers() {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    };
  }

  getBaseUrl() {
    const preference = new SharedPreferences();
    var base_url = preference.get("domain_url");
    if (!base_url) {
      base_url = "https://www.agedm.io";
    }
    if (base_url.endsWith("/")) {
      return base_url.slice(0, -1);
    }
    return base_url;
  }

  fullUrl(url) {
    if (!url) return "";
    if (url.indexOf("http") === 0) return url;
    if (url.charAt(0) === "/") return this.getBaseUrl() + url;
    return this.getBaseUrl() + "/" + url;
  }

  // v0.0.8：封面直连图床，不走百度 gimg 代理。
  // 站源 data-original 是百度代理地址（gimg*.baidu.com/gimg?...&src=<urlencoded 真地址>），
  // 代理在部分网络下会返回错图/旧图（手机上黄金神威显示成鬼灭/地错封面，图床源文件本身是对的）。
  // 从地址里抠出 covers/<id>.jpg，直接拼图床直链 cdn.aqdstatic.com:966。
  // 抠不到 id 时原样返回，不破坏原有逻辑。
  coverUrl(raw) {
    if (!raw) return "";
    const m = raw.match(/covers(?:\/|%2F)(\d+)\.jpg/i);
    if (m) return "https://cdn.aqdstatic.com:966/age/covers/" + m[1] + ".jpg";
    return raw;
  }

  // 首页 / 最近更新的卡片都是 div.video_item
  parseVideoItems(doc) {
    const items = [];
    const elements = doc.select("div.video_item");
    for (const el of elements) {
      const a = el.selectFirst("div.video_item-title a");
      const img = el.selectFirst("img");
      if (!a || !img) continue;
      const name = (a.text || "").trim();
      const link = a.attr("href") || "";
      const imageUrl = this.coverUrl(img.attr("data-original") || img.attr("src") || "");
      if (!name || !link) continue;
      items.push({
        name: this.fixText(name),
        imageUrl: imageUrl,
        link: link
      });
    }
    return { list: items, hasNextPage: false };
  }

  async getPopular(page) {
    const url = this.getBaseUrl() + "/";
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    let result = this.parseVideoItems(new Document(res ? (res.body || "") : ""));
    if (result.list.length === 0) {
      const html = await this.loadListViaWebview(url, "div.video_item");
      if (html) result = this.parseVideoItems(new Document(html));
    }
    return result;
  }

  async getLatestUpdates(page) {
    const url = this.getBaseUrl() + "/update";
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    let result = this.parseVideoItems(new Document(res ? (res.body || "") : ""));
    if (result.list.length === 0) {
      const html = await this.loadListViaWebview(url, "div.video_item");
      if (html) result = this.parseVideoItems(new Document(html));
    }
    return result;
  }

  parseSearchItems(doc) {
    const items = [];
    const elements = doc.select("div.card.cata_video_item");
    for (const el of elements) {
      const a = el.selectFirst("h5.card-title a");
      const img = el.selectFirst("img.video_thumbs");
      if (!a) continue;
      const name = (a.text || "").trim();
      const link = a.attr("href") || "";
      const imageUrl = img ? this.coverUrl(img.attr("data-original") || img.attr("src") || "") : "";
      if (!name || !link) continue;
      items.push({
        name: this.fixText(name),
        imageUrl: imageUrl,
        link: link
      });
    }
    return { list: items, hasNextPage: false };
  }

  async search(query, page, filters) {
    const url = this.getBaseUrl() + "/search?query=" + encodeURIComponent(query);
    let res = null;
    try { res = await new Client().get(url, this.headers()); } catch (e) { res = null; }
    let result = this.parseSearchItems(new Document(res ? (res.body || "") : ""));
    if (result.list.length === 0) {
      const html = await this.loadListViaWebview(url, "div.card.cata_video_item");
      if (html) result = this.parseSearchItems(new Document(html));
    }
    return result;
  }

  async getDetail(url) {
    let body = "";
    try {
      const res = await new Client().get(this.fullUrl(url), this.headers());
      body = res.body || "";
    } catch (_) { body = ""; }
    // v0.0.5：直连被拦（手机上 0 集、无描述）时走 WebView 兜底，
    // 复用 loadListViaWebview（等 div.tab-pane 出现再读 HTML）。
    let doc = new Document(body);
    let pane = doc.selectFirst("div.tab-pane");
    if (!pane) {
      const html = await this.loadListViaWebview(this.fullUrl(url), "div.tab-pane");
      if (html) doc = new Document(html);
    }
    pane = doc.selectFirst("div.tab-pane");
    const titleEl = doc.selectFirst("title");
    let name = titleEl ? (titleEl.text || "") : "";
    name = name.split(" - ")[0].trim();
    const cover = doc.selectFirst("img.video_thumbs");
    // v0.0.9：详情页正文里的 img.video_thumbs 全是“相关推荐”的封面，第一张根本不是本片
    // （实测黄金神威详情页 12 张全是别的番，第一张是 20150076）。点进详情页后 App 用这个错封面
    // 覆盖掉原来正确的封面，所以“一点进去封面就串，不点就不错”。
    // 本片封面只在 <meta property="og:image"> 里，先取 og:image，取不到再退回 img.video_thumbs。
    let imageUrl = "";
    const og = body.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
      || body.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    if (og) imageUrl = og[1].replace(/&amp;/g, "&");
    if (!imageUrl) {
      imageUrl = cover ? (cover.attr("data-original") || cover.attr("src") || "") : "";
    }
    imageUrl = this.coverUrl(imageUrl);
    const meta = doc.selectFirst('meta[name="description"]');
    const description = meta ? this.fixText(meta.attr("content") || "") : "";
    // 只取默认（第一个）播放源的剧集，避免 8 个源重复
    const eps = [];
    if (pane) {
      const links = pane.select("ul.video_detail_episode li a");
      for (const a of links) {
        const epName = (a.text || "").trim();
        const epUrl = a.attr("href") || "";
        if (!epName || !epUrl) continue;
        eps.push({ name: this.fixText(epName), url: epUrl });
      }
    }
    return {
      name: this.fixText(name),
      imageUrl: imageUrl,
      description: description,
      genre: [],
      episodes: eps
    };
  }

  // v0.0.14：三条线路。AGE 的 /play/<id>/<line>/<ep> 里 line 就是线路：
  // 1=自建云（/vip/ 加密接口）、2=暴风（/m3u8/）、3=红牛（/m3u8/）。
  // /m3u8/ 线路的解析器页直接把直链写在 HTML 里：var Vurl = '...index.m3u8'，
  // 不用 WASM、不用加密。实测红牛返回真 m3u8（多段 .ts，首段 200）；
  // 自建云的 /vip/ 接口目前只返回 3 秒错误视频（784KB，时长 3.08s）。
  getPreferredLine() {
    try {
      const pref = new SharedPreferences();
      const v = pref.get("line");
      if (v === "1" || v === "2" || v === "3") return v;
    } catch (_) {}
    return "3";
  }

  // 取一条 /m3u8/ 线路的直链：播放页 -> 解析器 iframe -> 解析器页里的 var Vurl。
  // 校验 m3u8 真实可用（取回内容含 #EXTM3U 且有 .ts），否则返回空，让调用方换下一条线。
  async loadM3u8Line(playUrl) {
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    let html = "";
    try {
      const res = await new Client().get(playUrl, { "User-Agent": UA });
      html = res ? (res.body || "") : "";
    } catch (e) { return { url: "", error: "play-get-fail" }; }
    if (!html) return { url: "", error: "play-empty" };
    const m = html.match(/<iframe[^>]*src="(https:\/\/jx\.wuzhoupai\.com:8443\/m3u8\/\?url=[^"]+)"/);
    if (!m) return { url: "", error: "no-m3u8-iframe" };
    const parserUrl = m[1].replace(/&amp;/g, "&");
    let phtml = "";
    try {
      const pres = await new Client().get(parserUrl, { "User-Agent": UA, "Referer": playUrl });
      phtml = pres ? (pres.body || "") : "";
    } catch (e) { return { url: "", error: "parser-get-fail" }; }
    if (!phtml) return { url: "", error: "parser-empty" };
    const vm = phtml.match(/var Vurl = '([^']+)'/);
    if (!vm) return { url: "", error: "no-vurl" };
    const vurl = vm[1];
    if (vurl.indexOf(".m3u8") === -1) return { url: "", error: "not-m3u8" };
    // 校验：取回 m3u8 内容，确认是真播放列表（#EXTM3U + .ts），不是 404 页
    try {
      const mres = await new Client().get(vurl, { "User-Agent": UA, "Referer": parserUrl });
      const mbody = mres ? (mres.body || "") : "";
      if (mbody.indexOf("#EXTM3U") === -1 || mbody.indexOf(".ts") === -1) {
        return { url: "", error: "m3u8-invalid" };
      }
    } catch (e) { return { url: "", error: "m3u8-check-fail" }; }
    return { url: vurl, error: "", referer: parserUrl };
  }

  // v0.0.13：API 直连（纯 JS，不用 WASM/WebView）。
  // 0.0.12 的 WebView 路线在手机上跑不通：WASM 域名 cdn.xmfxgjzx.com 不加载，
  // hxm_encrypt 永远等不到，40 秒超时后只能退回扫描。根因已解决——
  // hxm_encrypt 的密钥/IV 已从 WASM 内存提取：都是 "ni po jie ni  **"，AES-128-CBC，
  // 服务端已验证纯 JS 实现与 WASM 输出逐字节一致。
  // 这版直接用扩展 Client：取解析器页 HTML（正则抠 Vurl/Time/Version/Ref），
  // 纯 JS 算 Params/Sign，POST Api.php，纯 JS 解密，全程不碰 WASM。
  uuidv4() {
    var chars = "0123456789ABCDEF";
    var u = "";
    for (var i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) { u += "-"; continue; }
      if (i === 14) { u += "4"; continue; }
      var r = Math.floor(Math.random() * 16);
      if (i === 19) r = (r & 0x3) | 0x8;
      u += chars[r];
    }
    return u;
  }

  async loadParserApiDirect(parserUrl, playUrl) {
    const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    // 1. 取解析器页 HTML，正则抠全局变量
    let html = "";
    try {
      const res = await new Client().get(parserUrl, { "User-Agent": UA, "Referer": playUrl });
      html = res ? (res.body || "") : "";
    } catch (e) { return { url: "", error: "parser-get-fail" }; }
    if (!html) return { url: "", error: "parser-empty" };
    const pick = (re) => { const m = html.match(re); return m ? m[1] : ""; };
    const Vurl = pick(/var Vurl = "([0-9A-F]+)"/);
    const Time = pick(/var Time = "(\d+)"/);
    const Version = pick(/var Version = "([^"]+)"/);
    const Ref = pick(/var Ref = "([^"]+)"/);
    if (!Vurl || !Time || !Version || !Ref) return { url: "", error: "no-globals" };
    const Host = "jx.wuzhoupai.com";
    const Api = "https://jx.wuzhoupai.com:8443/vip";
    // 2. 纯 JS 算 Params / Sign（服务端已验证：与 WASM 输出一致）
    const uuid = this.uuidv4();
    const payload = JSON.stringify({ url: Vurl, wap: "1", ios: "0", host: Host, referer: Ref, time: Time });
    let Params, Sign;
    try {
      Params = hxmEncryptJS(payload).toUpperCase();
      Sign = hxmEncryptJS(Host + " | " + uuid + " | " + Time + " | " + Version + " | " + Params).toUpperCase();
    } catch (e) { return { url: "", error: "encrypt-fail" }; }
    // 3. POST Api.php
    let apiRes = null;
    try {
      apiRes = await new Client().post(Api + "/Api.php", {
        "User-Agent": UA,
        "Content-Type": "application/x-www-form-urlencoded",
        "Video-Parse-Uuid": uuid,
        "Video-Parse-Time": String(Time),
        "Video-Parse-Version": Version,
        "Video-Parse-Sign": Sign,
        "Referer": parserUrl
      }, "Params=" + encodeURIComponent(Params));
    } catch (e) { return { url: "", error: "api-post-fail" }; }
    let resp = null;
    try { resp = JSON.parse((apiRes && apiRes.body) || ""); } catch (_) { return { url: "", error: "bad-json" }; }
    if (!resp || resp.Status != 1) return { url: "", error: "api-status" };
    // 4. 纯 JS 解密
    try {
      if (resp.Code == 10) {
        const ctId = pick(/<meta http-equiv="Content-Type"[^>]*id="([^"]+)"/);
        const vpId = pick(/<meta name="viewport"[^>]*id="([^"]+)"/);
        const i1 = (ctId + vpId).replace("viewport", "");
        const k = md5hex(String(resp.Code) + i1 + resp.Appkey + resp.Version);
        const info = JSON.parse(aesCbcDeJS(resp.Data, k));
        return { url: decodeURIComponent(hxmDecryptJS(info.url)), error: "" };
      } else {
        const k2 = md5hex(String(resp.Code) + resp.Appkey + resp.Version);
        const info2 = JSON.parse(aesCbcDeJS(resp.Data, k2));
        return { url: decodeURIComponent(info2.url), error: "" };
      }
    } catch (e) {
      return { url: "", error: "decrypt-fail" };
    }
  }

  // v0.0.12：API 直连路线（2026-11-22 22:45 服务端跑通）。
  // 解析器 API 已完整逆向：POST https://jx.wuzhoupai.com:8443/vip/Api.php，
  // Params = hxm_encrypt(JSON{url:Vurl,wap,ios,host,referer,time}).toUpperCase()，
  // Sign = hxm_encrypt(Host | uuid | Time | Version | Params).toUpperCase()，
  // 响应 {Status,Code,Appkey,Version,Data} 用 AES-CBC 解（key=MD5(Code+Appkey+Version)[0:16]，
  // IV=[16:32]，Data 是 hex；Code==10 时改用 meta-id 密钥 + hxm_decrypt(info.url)）。
  // 实测地错 S1E1 返回阿里云 OSS 直链 mp4（不用 Referer/cookie，原生播放器可直接播）。
  // 扩展跑不了 WASM，所以在 WebView 里跑这套流程：解析器页自带 jQuery+CryptoJS+WASM，
  // 注入脚本等 hxm_encrypt 就绪后自己调 Api.php、解密、把 info.url 交回来。
  // 比 performance 扫描更准（拿的是解析器返回的权威地址，不是猜的网络记录）。
  isDirectStream(u) {
    if (!u) return false;
    var low = u.toLowerCase();
    // xvip/ymjigou 是解析器返回的非直链（手机实测转 00:00），不算直链
    if (low.indexOf("xvip") !== -1) return false;
    if (low.indexOf("ymjigou") !== -1) return false;
    if (/\.mp4(\?|$)/.test(low)) return true;
    if (/\.m3u8(\?|$)/.test(low)) return true;
    if (low.indexOf("akamaized") !== -1) return true;
    if (low.indexOf("aliyuncs.com") !== -1) return true;
    if (low.indexOf("oss-cn-") !== -1) return true;
    if (low.indexOf("amazonaws.com") !== -1) return true;
    return false;
  }

  async loadParserApiVideo(parserUrl, referer) {
    if (typeof evaluateJavascriptViaWebview !== "function") {
      return { url: "", error: "no-webview" };
    }
    const script = String.raw`(function(){
      if (window.__ageApiRead) return;
      window.__ageApiRead = true;
      var done = false, started = Date.now(), interval;
      function send(value) {
        if (done) return;
        done = true;
        if (interval) clearInterval(interval);
        window.flutter_inappwebview.callHandler("setResponse", JSON.stringify(value));
      }
      function uuidv4() {
        var chars = "0123456789ABCDEF";
        var u = "";
        for (var i = 0; i < 36; i++) {
          if (i === 8 || i === 13 || i === 18 || i === 23) { u += "-"; continue; }
          if (i === 14) { u += "4"; continue; }
          var r = Math.floor(Math.random() * 16);
          if (i === 19) r = (r & 0x3) | 0x8;
          u += chars[r];
        }
        return u;
      }
      function aesCbcDe(hexData, md5hex) {
        var key = CryptoJS.enc.Latin1.parse(md5hex.substring(0, 16));
        var iv = CryptoJS.enc.Latin1.parse(md5hex.substring(16, 32));
        var b64 = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Hex.parse(hexData));
        var dec = CryptoJS.AES.decrypt(b64, key, {iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7});
        return CryptoJS.enc.Utf8.stringify(dec);
      }
      function poll() {
        if (typeof hxm_encrypt !== "function" || typeof CryptoJS === "undefined") {
          if (Date.now() - started > 40000) send({url: "", error: "wasm-timeout"});
          return;
        }
        if (typeof Vurl === "undefined" || typeof Api === "undefined" || typeof Time === "undefined") {
          if (Date.now() - started > 40000) send({url: "", error: "no-globals"});
          return;
        }
        clearInterval(interval);
        try {
          var uuid = uuidv4();
          var ua = navigator.userAgent || "";
          var wap = /iPad|iPhone|Android|Linux|iPod|SymbianOS|Windows Phone/i.test(ua) ? "1" : "0";
          var ios = /iPad|iPhone|iPod/i.test(ua) ? "1" : "0";
          var payload = JSON.stringify({url: Vurl, wap: wap, ios: ios, host: Host, referer: Ref, time: Time});
          var Params = hxm_encrypt(payload).toUpperCase();
          var Sign = hxm_encrypt(Host + " | " + uuid + " | " + Time + " | " + Version + " | " + Params).toUpperCase();
          fetch(Api + "/Api.php", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Video-Parse-Uuid": uuid,
              "Video-Parse-Time": String(Time),
              "Video-Parse-Version": Version,
              "Video-Parse-Sign": Sign
            },
            body: "Params=" + encodeURIComponent(Params)
          }).then(function(r){ return r.json(); }).then(function(resp){
            if (!resp || resp.Status != 1) { send({url: "", error: "api-status"}); return; }
            try {
              if (resp.Code == 10) {
                var ctEl = document.querySelector('meta[http-equiv="Content-Type"]');
                var vpEl = document.querySelector('meta[name="viewport"]');
                var ctId = ctEl ? (ctEl.id || "") : "";
                var vpId = vpEl ? (vpEl.id || "") : "";
                var i1 = (ctId + vpId).replace("viewport", "");
                var k = CryptoJS.MD5(String(resp.Code) + i1 + resp.Appkey + resp.Version).toString();
                var infoJson = aesCbcDe(resp.Data, k);
                var info = JSON.parse(infoJson);
                var u = decodeURIComponent(hxm_decrypt(info.url));
                send({url: u, error: ""});
              } else {
                var k2 = CryptoJS.MD5(String(resp.Code) + resp.Appkey + resp.Version).toString();
                var infoJson2 = aesCbcDe(resp.Data, k2);
                var info2 = JSON.parse(infoJson2);
                var u2 = decodeURIComponent(info2.url);
                send({url: u2, error: ""});
              }
            } catch (e) {
              send({url: "", error: "decrypt-fail:" + (e && e.message ? e.message : e)});
            }
          }).catch(function(e){ send({url: "", error: "fetch-fail:" + (e && e.message ? e.message : e)}); });
        } catch (e) {
          send({url: "", error: "js-err:" + (e && e.message ? e.message : e)});
        }
      }
      interval = setInterval(poll, 500);
      poll();
    })();`;
    let result;
    try {
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      };
      if (referer) headers["Referer"] = referer;
      result = await evaluateJavascriptViaWebview(parserUrl, headers, [script], 45);
    } catch (err) {
      return { url: "", error: "webview-throw" };
    }
    try {
      const data = JSON.parse(String(result || ""));
      return { url: (data && data.url) ? data.url : "", error: (data && data.error) ? data.error : "" };
    } catch (_) {
      return { url: "", error: "bad-json" };
    }
  }

  // v0.0.7：播放页静态 HTML 已无解析器 iframe（JS 渲染后才注入），
//   静态正则抓不到直链时改走播放页 WebView 路线（loadPlayPageVideo）：
//   把播放页放进内置浏览器，等 JS 注入解析器并开始播后，
//   同时扫 <video> currentSrc 和 performance 网络记录，过滤广告后挑正片直链。
//   与 DM84 v0.0.8 同一套做法。手机实测为准。
// 解析器页（jx.wuzhoupai.com 云播放器）在内置浏览器里跑完 JS 后，
  // ArtPlayer 会把最终直链放到 <video> 上；轮询抓那个地址回来。
  // 已验证：最终地址是直链 MP4（akamaized.net，无扩展名、无签名），
  // 不用登录、不用 Referer；但广告贴片（adposter.mp4）和解析失败时
  // 的兜底错误视频（kjjsaas-sh…mp4，3 秒）要排除掉。
  // v0.0.4：解析器页在手机 UA 下 Autoplay=false（它按 UA 判断，含 Android
  // 就不自动播放），光等 currentSrc 可能一直是空的；改成每轮主动触发播放，
  // 并把超时从 17 秒放宽到 28 秒（解析器解密+加载经常超过 17 秒）。
  // v0.0.10：解析器页（jx.wuzhoupai 云播放器）可能校验 Referer（它平时是被 agedm.io 播放页
  // 以 iframe 嵌进去的，直接顶层打开时 Referer 为空可能拒绝解密/播放），所以带上播放页做 Referer；
  // 另外外层 WebView 超时 32s 会先于脚本内部 55s 杀掉轮询，改成 60s 对齐。
  async loadParserVideo(parserUrl, referer) {
    if (typeof evaluateJavascriptViaWebview !== "function") {
      return "";
    }
    const script = String.raw`(function(){
      if (window.__ageRead) return;
      window.__ageRead = true;
      var done = false, started = Date.now(), interval;
      function send(value) {
        if (done) return;
        done = true;
        if (interval) clearInterval(interval);
        window.flutter_inappwebview.callHandler("setResponse", JSON.stringify(value));
      }
      // v0.0.8：解析器用 MSE/hls.js 时 <video> 的 currentSrc 是 blob:，直链只在网络记录里。
      // 所以除了扫 <video>，还要扫 performance 网络记录（与 DM84 v0.0.8、loadPlayPageVideo 同一套）。
      function isAdUrl(u) {
        if (!u) return true;
        var low = u.toLowerCase();
        if (low.indexOf("adposter") !== -1) return true;
        if (low.indexOf("kjjsaas-sh") !== -1) return true;
        if (low.indexOf("pujing") !== -1) return true;
        if (low.indexOf("xinpu") !== -1) return true;
        if (low.indexOf("casino") !== -1) return true;
        if (low.indexOf("aomen") !== -1) return true;
        if (low.indexOf("promo") !== -1) return true;
        if (low.indexOf("banner") !== -1) return true;
        if (/\/ad[\/_-]/i.test(u)) return true;
        if (/[\/_-]ad[\/_.-]/i.test(u)) return true;
        return false;
      }

      function isVideoCandidate(u) {
        if (!u) return false;
        var low = u.toLowerCase();
        if (low.indexOf(".m3u8") !== -1) return true;
        if (low.indexOf(".mp4") !== -1) return true;
        // v0.0.11: 解析器解密出的正片地址不一定带 .m3u8/.mp4 后缀（实测走 xvip.ymjigou.com:18443），
        // 只认后缀会漏掉。视频 CDN 域名本身就是正片信号。
        if (low.indexOf("ymjigou") !== -1) return true;
        if (low.indexOf("xvip") !== -1) return true;
        if (low.indexOf("akamaized") !== -1) return true;
        if (low.indexOf("wuzhoupai") !== -1) return true;
        return false;
      }
      function isContentCdn(u) {
        return u.indexOf("akamaized") !== -1 || u.indexOf("wuzhoupai") !== -1;
      }
      function pickBest(list) {
        var best = null, bestScore = -1;
        for (var i = 0; i < list.length; i++) {
          var u = list[i];
          if (isAdUrl(u)) continue;
          var score = 0;
          if (isContentCdn(u)) score += 10;
          if (u.indexOf("ymjigou") !== -1 || u.indexOf("xvip") !== -1) score += 10;
          if (/\.mp4(\?|$)/.test(u)) score += 5;
          else if (/\.m3u8(\?|$)/.test(u)) score += 2;
          if (score > bestScore) { bestScore = score; best = u; }
        }
        return best;
      }
      function tryPlay() {
        // 每轮都主动触发一次播放：静音 play + 点播放按钮 + 点播放器容器本身
        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          try { videos[i].muted = true; var p = videos[i].play(); if (p && p.catch) p.catch(function(){}); } catch (e) {}
          try { videos[i].click(); } catch (e) {}
        }
        var btns = document.querySelectorAll(".artplayer-play, .art-icon-play, .art-play, .artplayer-video-play, .vjs-big-play-button, [class*='play-btn'], .artplayer");
        for (var j = 0; j < btns.length; j++) {
          try { btns[j].click(); } catch (e) {}
        }
        // ArtPlayer 实例如果挂在 window 上，直接调它的 play
        try {
          var ap = window.artplayer || (window.__artplayer) || null;
          if (ap && ap.play) { ap.muted = true; ap.play(); }
        } catch (e) {}
        // 有些播放器要先点掉加载/封面层
        try {
          var cov = document.querySelector(".artplayer-poster, .artplayer-loading, #loading .mov");
          if (cov) cov.click();
        } catch (e) {}
      }
      function poll() {
        tryPlay();
        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          var v = videos[i];
          var src = v.currentSrc || v.src || "";
          if (!src) {
            var s = v.querySelector("source");
            if (s) src = s.src || "";
          }
          if (!src) continue;
          if (src.indexOf("adposter") !== -1) continue;
          if (src.indexOf("kjjsaas-sh") !== -1) continue;
          if (src.indexOf("blob:") === 0 || src.indexOf("data:") === 0) continue;
          var dur = v.duration;
          if (src.indexOf("akamaized.net") !== -1 ||
              /\.m3u8(\?|$)/.test(src) || /\.mp4(\?|$)/.test(src) ||
              (typeof dur === "number" && !isNaN(dur) && dur > 30)) {
            send({url: src, error: ""});
            return;
          }
        }
        // v0.0.8：播放器用 MSE 时 <video> 的 src 是 blob:，直链在网络记录里
        try {
          var entries = performance.getEntriesByType("resource") || [];
          var cands = [];
          for (var k = 0; k < entries.length; k++) {
            var name = entries[k].name || "";
            if (!isVideoCandidate(name)) continue;
            cands.push(name);
          }
          var best = pickBest(cands);
          if (best) { send({url: best, error: ""}); return; }
        } catch (e) {}
        // 解析器出错时会显示 #error；一直停在 #loading 说明还没跑完，继续等
        var errEl = document.querySelector("#error");
        if (errEl && errEl.offsetParent !== null && errEl.innerText && errEl.innerText.trim()) {
          send({url: "", error: "parser-error"});
          return;
        }
        if (Date.now() - started > 55000) send({url: "", error: "timeout"});
      }
      interval = setInterval(poll, 500);
      poll();
    })();`;
    let result;
    try {
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      };
      if (referer) headers["Referer"] = referer;
      result = await evaluateJavascriptViaWebview(parserUrl, headers, [script], 60);
    } catch (err) {
      return "";
    }
    try {
      const data = JSON.parse(String(result || ""));
      return (data && data.url) ? data.url : "";
    } catch (_) {
      return "";
    }
  }

  // v0.0.7：播放页静态 HTML 里已没有解析器 iframe（JS 渲染后才注入），
  // 静态正则抓不到直链。改成把播放页本身放进内置浏览器：等页面 JS 跑完、
  // 解析器注入并开始播后，同时扫 <video> 的 currentSrc 和 performance 网络记录，
  // 收集全部 .m3u8/.mp4 候选，过滤广告，挑正片直链回来。
  // 与 DM84 v0.0.8 同一套做法（performance 扫描 + pickBest）。
  async loadPlayPageVideo(playUrl) {
    if (typeof evaluateJavascriptViaWebview !== "function") return "";
    const script = String.raw`(function(){
      if (window.__agePlayRead) return;
      window.__agePlayRead = true;
      var done = false, started = Date.now(), interval;
      function send(value) {
        if (done) return;
        done = true;
        if (interval) clearInterval(interval);
        window.flutter_inappwebview.callHandler("setResponse", JSON.stringify(value));
      }
      function isAdUrl(u) {
        if (!u) return true;
        var low = u.toLowerCase();
        if (low.indexOf("adposter") !== -1) return true;
        if (low.indexOf("kjjsaas-sh") !== -1) return true;
        if (low.indexOf("pujing") !== -1) return true;
        if (low.indexOf("xinpu") !== -1) return true;
        if (low.indexOf("casino") !== -1) return true;
        if (low.indexOf("aomen") !== -1) return true;
        if (low.indexOf("promo") !== -1) return true;
        if (low.indexOf("banner") !== -1) return true;
        if (/\/ad[\/_-]/i.test(u)) return true;
        if (/[\/_-]ad[\/_.-]/i.test(u)) return true;
        return false;
      }

      function isVideoCandidate(u) {
        if (!u) return false;
        var low = u.toLowerCase();
        if (low.indexOf(".m3u8") !== -1) return true;
        if (low.indexOf(".mp4") !== -1) return true;
        // v0.0.11: 解析器解密出的正片地址不一定带 .m3u8/.mp4 后缀（实测走 xvip.ymjigou.com:18443），
        // 只认后缀会漏掉。视频 CDN 域名本身就是正片信号。
        if (low.indexOf("ymjigou") !== -1) return true;
        if (low.indexOf("xvip") !== -1) return true;
        if (low.indexOf("akamaized") !== -1) return true;
        if (low.indexOf("wuzhoupai") !== -1) return true;
        return false;
      }
      function isContentCdn(u) {
        return u.indexOf("akamaized") !== -1 || u.indexOf("wuzhoupai") !== -1;
      }
      function pickBest(list) {
        var best = null, bestScore = -1;
        for (var i = 0; i < list.length; i++) {
          var u = list[i];
          if (isAdUrl(u)) continue;
          var score = 0;
          if (isContentCdn(u)) score += 10;
          if (u.indexOf("ymjigou") !== -1 || u.indexOf("xvip") !== -1) score += 10;
          if (/\.mp4(\?|$)/.test(u)) score += 5;
          else if (/\.m3u8(\?|$)/.test(u)) score += 2;
          if (score > bestScore) { bestScore = score; best = u; }
        }
        return best;
      }
      function tryPlay() {
        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          try { videos[i].muted = true; var p = videos[i].play(); if (p && p.catch) p.catch(function(){}); } catch (e) {}
          try { videos[i].click(); } catch (e) {}
        }
        var btns = document.querySelectorAll(".artplayer-play, .art-icon-play, .art-play, .artplayer-video-play, .vjs-big-play-button, [class*='play-btn'], .artplayer");
        for (var j = 0; j < btns.length; j++) {
          try { btns[j].click(); } catch (e) {}
        }
        try {
          var ap = window.artplayer || (window.__artplayer) || null;
          if (ap && ap.play) { ap.muted = true; ap.play(); }
        } catch (e) {}
        try {
          var cov = document.querySelector(".artplayer-poster, .artplayer-loading, #loading .mov");
          if (cov) cov.click();
        } catch (e) {}
      }
      function poll() {
        tryPlay();
        var videos = document.querySelectorAll("video");
        for (var i = 0; i < videos.length; i++) {
          var v = videos[i];
          var src = v.currentSrc || v.src || "";
          if (!src) {
            var s = v.querySelector("source");
            if (s) src = s.src || "";
          }
          if (!src) continue;
          if (isAdUrl(src)) continue;
          if (src.indexOf("blob:") === 0 || src.indexOf("data:") === 0) continue;
          var dur = v.duration;
          if (src.indexOf("akamaized.net") !== -1 ||
              /\.m3u8(\?|$)/.test(src) || /\.mp4(\?|$)/.test(src) ||
              (typeof dur === "number" && !isNaN(dur) && dur > 30)) {
            send({url: src, error: ""});
            return;
          }
        }
        // 播放器用 MSE 时 <video> 的 src 是 blob:，直链在网络记录里
        try {
          var entries = performance.getEntriesByType("resource") || [];
          var cands = [];
          for (var k = 0; k < entries.length; k++) {
            var name = entries[k].name || "";
            if (!isVideoCandidate(name)) continue;
            cands.push(name);
          }
          var best = pickBest(cands);
          if (best) { send({url: best, error: ""}); return; }
        } catch (e) {}
        var errEl = document.querySelector("#error");
        if (errEl && errEl.offsetParent !== null && errEl.innerText && errEl.innerText.trim()) {
          send({url: "", error: "parser-error"});
          return;
        }
        if (Date.now() - started > 55000) send({url: "", error: "timeout"});
      }
      interval = setInterval(poll, 500);
      poll();
    })();`;
    let result;
    try {
      result = await evaluateJavascriptViaWebview(playUrl, {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
      }, [script], 60);
    } catch (err) {
      return "";
    }
    try {
      const data = JSON.parse(String(result || ""));
      return (data && data.url) ? data.url : "";
    } catch (_) {
      return "";
    }
  }

  async getVideoList(url) {
    const res = await new Client().get(this.fullUrl(url), this.headers());
    const body = res.body || "";
    const found = [];
    const seen = {};
    // 1. 播放页静态 HTML 里有直链就直接用（目前一般没有，留作兜底）
    const patterns = [
      /https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/g,
      /\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/g,
      /https?:\/\/[^\s"'\\]+\.mp4[^\s"'\\]*/g
    ];
    for (const pat of patterns) {
      let m;
      while ((m = pat.exec(body)) !== null) {
        let u = m[0];
        if (u.indexOf("//") === 0) u = "https:" + u;
        if (!seen[u]) {
          seen[u] = true;
          found.push({ url: u, originalUrl: u, quality: "Origin" });
        }
      }
    }
    if (found.length > 0) return found;
    // v0.0.14：三条线路。播放页 URL 是 /play/<id>/<line>/<ep>，line 即线路：
    // 1=自建云（/vip/ 加密接口）、2=暴风（/m3u8/）、3=红牛（/m3u8/）。
    // 按偏好顺序逐条尝试：/m3u8/ 线路的解析器页直接写明 Vurl（真 m3u8，直出）；
    // /vip/ 线路走纯 JS API 直连。任一线路拿到直链即返回。
    const playUrlFull = this.fullUrl(url);
    const mLine = playUrlFull.match(/\/play\/(\d+)\/(\d+)\/(\d+)/);
    if (mLine) {
      const aid = mLine[1], ep = mLine[3];
      const pref = this.getPreferredLine();
      const order = [pref];
      for (const l of ["3", "2", "1"]) if (order.indexOf(l) === -1) order.push(l);
      for (const line of order) {
        const linePlayUrl = this.fullUrl("/play/" + aid + "/" + line + "/" + ep);
        let lineHtml = "";
        try {
          const lres = await new Client().get(linePlayUrl, this.headers());
          lineHtml = lres ? (lres.body || "") : "";
        } catch (e) { continue; }
        if (!lineHtml) continue;
        const liframe = lineHtml.match(/<iframe[^>]*src="([^"]*jx\.wuzhoupai[^"]*)"/i);
        let lineParser = "";
        if (liframe) lineParser = liframe[1].replace(/&amp;/g, "&");
        if (!lineParser) {
          const d = lineHtml.match(/https:\/\/jx\.wuzhoupai\.com:8443\/(?:vip|m3u8)\/\?url=age_[^"'\s&]+/);
          if (d) lineParser = d[0];
        }
        if (!lineParser) continue;
        if (lineParser.indexOf("/m3u8/") !== -1) {
          const r = await this.loadM3u8Line(linePlayUrl);
          if (r.url) {
            return [{ url: r.url, originalUrl: r.url, quality: "Origin", headers: { "Referer": linePlayUrl, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" } }];
          }
          continue;
        }
        // /vip/ 线路：纯 JS API 直连
        const api = await this.loadParserApiDirect(lineParser, linePlayUrl);
        if (api.url) {
          // kjjsaas-sh 的 mp4 是 3 秒错误视频（784KB，时长 3.08s，多个番共用同一条），
          // 不是正片；跳过它，继续试下一条线。
          if (api.url.indexOf("kjjsaas-sh") !== -1 && /\.mp4(\?|$)/.test(api.url)) continue;
          if (this.isDirectStream(api.url)) {
            return [{ url: api.url, originalUrl: api.url, quality: "Origin" }];
          }
          // 非直链（xvip 等）不返回，避免转 00:00；继续试下一条线
          continue;
        }
      }
    }
    // 兜底：沿用旧的单线路解析（抓当前页 iframe 走 API/WebView/扫描）
    let parserUrl = "";
    const iframe = body.match(/<iframe[^>]*src="([^"]*jx\.wuzhoupai[^"]*)"/i);
    if (iframe) {
      parserUrl = iframe[1].replace(/&amp;/g, "&");
    } else {
      const direct = body.match(/https:\/\/jx\.wuzhoupai\.com:8443\/vip\/\?url=age_[^"'\s&]+/);
      if (direct) parserUrl = direct[0];
    }
    if (parserUrl) {
      const apiWv = await this.loadParserApiVideo(parserUrl, playUrlFull);
      if (apiWv.url) {
        if (this.isDirectStream(apiWv.url)) {
          return [{ url: apiWv.url, originalUrl: apiWv.url, quality: "Origin" }];
        }
        return [];
      }
      const videoUrl = await this.loadParserVideo(parserUrl, playUrlFull);
      if (videoUrl) return [{ url: videoUrl, originalUrl: videoUrl, quality: "Origin" }];
    }
    const playUrl = await this.loadPlayPageVideo(playUrlFull);
    if (!playUrl) return [];
    return [{ url: playUrl, originalUrl: playUrl, quality: "Origin" }];
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      "key": "domain_url",
      "editTextPreference": {
        "title": "Url",
        "summary": "AGE动漫网址",
        "value": "https://www.agedm.io",
        "dialogTitle": "URL",
        "dialogMessage": ""
      }
    }, {
      // v0.0.14：播放线路。AGE 有三条线（自建云=1、暴风=2、红牛=3），
      // 每条线是独立的播放源；自建云（/vip/ 加密接口）目前只返回 3 秒错误视频，
      // 红牛（/m3u8/ 直链）实测可用。默认红牛；扩展会按偏好顺序逐条尝试。
      "key": "line",
      "listPreference": {
        "title": "播放线路",
        "summary": "自建云 / 暴风 / 红牛",
        "valueIndex": 2,
        "entries": ["自建云", "暴风", "红牛"],
        "entryValues": ["1", "2", "3"]
      }
    }];
  }
}
