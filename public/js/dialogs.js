/* 翼辉云枢 · 通用弹窗（新建软件包 / 新建空间 / 添加成员 / 新建问题反馈） */

import { api } from './api.js';
import { escapeHtml, message, modal, formItem, input, textarea, select, btn, icon } from './ui.js';

function footerBtns(okText = '确 定') {
  return `<button class="ant-btn" data-cancel>取 消</button><button class="ant-btn ant-btn-primary" data-ok>${escapeHtml(okText)}</button>`;
}

/* ---------- 新建软件包 ---------- */
export function createPackageDialog(onDone, presetNamespace = '') {
  let namespacesPromise;
  try {
    namespacesPromise = api.get('/api/namespaces', { scope: 'mine', pageSize: 999 });
  } catch {
    namespacesPromise = Promise.resolve({ list: [] });
  }
  namespacesPromise.then((res) => {
    const options = res.list.map((n) => ({ value: n.namespaceId, label: n.namespaceId }));
    const m = modal({
      title: '新建软件包',
      content: `
        ${formItem({ label: '所属空间', required: true, control: select({ name: 'namespace', options, value: presetNamespace || (options[0] || {}).value || '' }) })}
        ${formItem({ label: '软件包名称', required: true, control: input({ name: 'name', placeholder: '小写字母、数字、- _ + .' }), extra: '软件包名称仅允许小写字母、数字、- _ + .，且以字母或数字开头。' })}
        ${formItem({ label: '描述', control: textarea({ name: 'description', rows: 4, placeholder: '请输入软件包描述', attrs: 'maxlength="300"' }) })}
        ${formItem({ label: '访问级别', control: select({ name: 'accessLevel', options: [{ value: 'Open', label: 'Open（登录可见）' }, { value: 'Restricted', label: 'Restricted（受限）' }], value: 'Open' }) })}`,
      footer: footerBtns(),
    });
    m.mask.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.mask.querySelector('[data-ok]').addEventListener('click', async () => {
      const body = {
        namespace: m.mask.querySelector('[name="namespace"]').value,
        name: m.mask.querySelector('[name="name"]').value.trim(),
        description: m.mask.querySelector('[name="description"]').value,
        accessLevel: m.mask.querySelector('[name="accessLevel"]').value,
      };
      if (!body.name) { message.warning('请输入软件包名称'); return; }
      try {
        await api.post('/api/packages', body);
        message.success('新建成功');
        m.close();
        if (onDone) onDone();
      } catch (e) { message.error(e.message); }
    });
  });
}

/* ---------- 新建空间 ---------- */
export function createNamespaceDialog(onDone) {
  const m = modal({
    title: '新建空间',
    content: `
      <div class="ant-alert ant-alert-info" style="margin-bottom:16px"><span class="anticon">${icon('alert', 14)}</span><span class="ant-alert-description">空间名称创建后将被永久占用，即使删除也无法重复使用，请谨慎命名。</span></div>
      ${formItem({ label: '空间名称', required: true, control: input({ name: 'namespaceId', placeholder: '请输入空间名称', attrs: 'maxlength="30"' }), extra: '空间名称由小写字母、数字、中文和特殊字符“-”、“_”组成，且长度不能超过 30 个字符。' })}
      ${formItem({ label: '描述', control: textarea({ name: 'description', rows: 5, placeholder: '请输入空间描述，例如用途或使用范围', attrs: 'maxlength="1024"' }) })}`,
    footer: footerBtns(),
  });
  m.mask.querySelector('[data-cancel]').addEventListener('click', m.close);
  m.mask.querySelector('[data-ok]').addEventListener('click', async () => {
    const namespaceId = m.mask.querySelector('[name="namespaceId"]').value.trim().toLowerCase();
    const description = m.mask.querySelector('[name="description"]').value;
    if (!namespaceId) { message.warning('请输入空间名称'); return; }
    try {
      await api.post('/api/namespaces', { namespaceId, description });
      message.success('新建成功');
      m.close();
      if (onDone) onDone();
    } catch (e) { message.error(e.message); }
  });
}

/* ---------- 添加成员 ---------- */
export async function addMemberDialog(ns, onDone) {
  let users = [];
  try {
    const res = await api.get('/api/users');
    users = res.list || res.users || [];
  } catch { /* 忽略 */ }
  const m = modal({
    title: '添加成员',
    width: 'sm',
    content: `
      ${formItem({ label: '用户', required: true, control: select({ name: 'userId', options: users.map((u) => ({ value: u.id, label: `${u.realName || u.username}（${u.username}）` })) }) })}
      ${formItem({ label: '角色', control: select({ name: 'roleId', options: [
        { value: 'ORG_ADMIN', label: '管理员' },
        { value: 'ORG_MEMBER', label: '成员' },
        { value: 'ORG_GUEST', label: '访客' },
      ], value: 'ORG_MEMBER' }) })}`,
    footer: footerBtns(),
  });
  m.mask.querySelector('[data-cancel]').addEventListener('click', m.close);
  m.mask.querySelector('[data-ok]').addEventListener('click', async () => {
    try {
      await api.post(`/api/namespaces/${encodeURIComponent(ns)}/members`, {
        userId: m.mask.querySelector('[name="userId"]').value,
        roleId: m.mask.querySelector('[name="roleId"]').value,
      });
      message.success('添加成功');
      m.close();
      if (onDone) onDone();
    } catch (e) { message.error(e.message); }
  });
}

/* ---------- 新建问题反馈 ---------- */
export function createIssueDialog(ns, name, onDone) {
  const m = modal({
    title: '新建问题反馈',
    content: `
      ${formItem({ label: '标题', required: true, control: input({ name: 'title', placeholder: '请输入问题描述', attrs: 'maxlength="100"' }) })}
      ${formItem({ label: '详细内容', control: textarea({ name: 'content', rows: 5, placeholder: '请补充复现步骤或期望行为' }) })}`,
    footer: footerBtns('提 交'),
  });
  m.mask.querySelector('[data-cancel]').addEventListener('click', m.close);
  m.mask.querySelector('[data-ok]').addEventListener('click', async () => {
    const title = m.mask.querySelector('[name="title"]').value.trim();
    if (!title) { message.warning('请输入问题描述'); return; }
    try {
      await api.post(`/api/packages/${encodeURIComponent(ns)}/${encodeURIComponent(name)}/issues`, {
        title, content: m.mask.querySelector('[name="content"]').value,
      });
      message.success('提交成功');
      m.close();
      if (onDone) onDone();
    } catch (e) { message.error(e.message); }
  });
}
