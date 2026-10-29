'use strict';

/**
 * 极简 multipart/form-data 解析器（零依赖）。
 * 只支持本项目所需的能力：文本字段 + 单文件上传。
 */
function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return { fields: {}, files: [] };
  const boundary = (m[1] || m[2]).trim();
  const delimiter = Buffer.from(`--${boundary}`);

  const fields = {};
  const files = [];

  let cursor = buffer.indexOf(delimiter);
  if (cursor === -1) return { fields, files };

  while (cursor !== -1) {
    let start = cursor + delimiter.length;
    // 结束标记 --boundary--
    if (buffer.slice(start, start + 2).toString() === '--') break;
    if (buffer.slice(start, start + 2).toString() === '\r\n') start += 2;

    const next = buffer.indexOf(delimiter, start);
    if (next === -1) break;

    // 去掉分段末尾的 \r\n
    let end = next;
    if (end >= 2 && buffer.slice(end - 2, end).toString() === '\r\n') end -= 2;

    const part = buffer.slice(start, end);
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headerText = part.slice(0, headerEnd).toString('utf8');
      const body = part.slice(headerEnd + 4);

      const nameMatch = /name="([^"]*)"/i.exec(headerText);
      const fileMatch = /filename="([^"]*)"/i.exec(headerText);
      const typeMatch = /content-type:\s*([^\r\n]+)/i.exec(headerText);

      if (nameMatch) {
        const fieldName = nameMatch[1];
        if (fileMatch && fileMatch[1]) {
          files.push({
            field: fieldName,
            filename: fileMatch[1],
            contentType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
            data: body,
          });
        } else {
          fields[fieldName] = body.toString('utf8');
        }
      }
    }

    cursor = next;
  }

  return { fields, files };
}

module.exports = { parseMultipart };
