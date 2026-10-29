'use strict';

/**
 * 共享常量：角色、访问级别、平台、架构、操作类型
 * 取值与原 Armory 平台保持一致，便于后续对接或迁移。
 */

const ROLES = {
  ORG_OWNER: { id: 'ORG_OWNER', name: '所有者', level: 40, desc: '空间全部权限，含删除空间与转让' },
  ORG_ADMIN: { id: 'ORG_ADMIN', name: '管理员', level: 30, desc: '管理成员与全部软件包' },
  ORG_MEMBER: { id: 'ORG_MEMBER', name: '成员', level: 20, desc: '发布、维护自己创建的软件包' },
  ORG_GUEST: { id: 'ORG_GUEST', name: '访客', level: 10, desc: '仅可浏览与下载' },
};

const ROLE_ORDER = ['ORG_OWNER', 'ORG_ADMIN', 'ORG_MEMBER', 'ORG_GUEST'];

const ACCESS_LEVELS = [
  { id: 'Open', name: '公开', desc: '空间内所有成员可见可下载' },
  { id: 'Restricted', name: '受限', desc: '仅软件包管理员与空间管理员可见' },
];

const PLATFORMS = ['linux', 'windows', 'macos', 'sylixos', 'android', 'any'];

const ARCHS = ['x86_64', 'aarch64', 'armv7', 'mips64', 'riscv64', 'any'];

const OPERATION_TYPES = [
  { id: 'LOGIN', resourceType: 'SYS', desc: '登录' },
  { id: 'LOGIN_OUT', resourceType: 'SYS', desc: '登出' },
  { id: 'DOWNLOAD', resourceType: 'PACKAGE', desc: '下载' },
  { id: 'PUBLISH', resourceType: 'PACKAGE', desc: '发布' },
  { id: 'UN_PUBLISH', resourceType: 'PACKAGE', desc: '撤销发布' },
  { id: 'ADD_TAG', resourceType: 'PACKAGE', desc: '新建标签' },
  { id: 'REMOVE_TAG', resourceType: 'PACKAGE', desc: '移除标签' },
  { id: 'ADD_PKG_MEMBER', resourceType: 'PACKAGE', desc: '添加软件包成员' },
  { id: 'REMOVE_PKG_MEMBER', resourceType: 'PACKAGE', desc: '移除软件包成员' },
  { id: 'CHANGE_PKG_ACCESS_LEVEL', resourceType: 'PACKAGE', desc: '调整软件包访问级别' },
  { id: 'ADD_NAMESPACE', resourceType: 'SYS', desc: '创建空间' },
  { id: 'ADD_ORG_MEMBER', resourceType: 'NAMESPACE', desc: '添加空间成员' },
  { id: 'REMOVE_ORG_MEMBER', resourceType: 'NAMESPACE', desc: '移除空间成员' },
  { id: 'CHANGE_ORG_MEMBER_ROLE', resourceType: 'NAMESPACE', desc: '调整空间成员角色' },
  { id: 'CONFIRM_PUBLISH', resourceType: 'PACKAGE', desc: '确认发布' },
  { id: 'CANCEL_PUBLISH', resourceType: 'PACKAGE', desc: '取消发布' },
  { id: 'ORG_SETTING', resourceType: 'NAMESPACE', desc: '空间设置' },
  { id: 'SETTING_PUBLISH_CONFIRMATION', resourceType: 'NAMESPACE', desc: '设置版本确认发布' },
  { id: 'REMOVE_PACKAGE', resourceType: 'PACKAGE', desc: '删除软件包' },
  { id: 'RENAME_NAMESPACE', resourceType: 'NAMESPACE', desc: '修改空间名称' },
  { id: 'EDIT_NAMESPACE_DESC', resourceType: 'NAMESPACE', desc: '修改空间描述' },
  { id: 'REMOVE_NAMESPACE', resourceType: 'NAMESPACE', desc: '删除空间' },
  { id: 'UPDATE_README', resourceType: 'PACKAGE', desc: '更新 README' },
  { id: 'CREATE_PACKAGE', resourceType: 'NAMESPACE', desc: '创建软件包' },
  { id: 'UPDATE_PACKAGE_METADATA', resourceType: 'PACKAGE', desc: '更新软件包元数据' },
  { id: 'TRANSFER_PACKAGE', resourceType: 'PACKAGE', desc: '转移软件包' },
];

module.exports = { ROLES, ROLE_ORDER, ACCESS_LEVELS, PLATFORMS, ARCHS, OPERATION_TYPES };
