#!/usr/bin/env bash
# API 全链路冒烟测试
set -u
BASE="http://127.0.0.1:7310"
PASS=0
FAIL=0

check() { # name, expected-substring, actual
  if echo "$3" | grep -q "$2"; then
    PASS=$((PASS+1)); echo "  PASS  $1"
  else
    FAIL=$((FAIL+1)); echo "  FAIL  $1"; echo "        got: $(echo "$3" | head -c 300)"
  fi
}

echo "== 1. 认证 =="
LOGIN=$(curl -s -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}')
check "登录成功返回 token" '"token"' "$LOGIN"
TOKEN=$(echo "$LOGIN" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
AUTH="Authorization: Bearer $TOKEN"

check "错误密码被拒绝" 'AUTH_FAILED' "$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"wrong"}')"
check "未登录访问被拦截" 'UNAUTHORIZED' "$(curl -s $BASE/api/packages)"
check "当前用户" '"username":"admin"' "$(curl -s $BASE/api/auth/me -H "$AUTH")"

echo "== 2. 空间治理 =="
check "空间列表" '"namespaceList"\|"list"' "$(curl -s "$BASE/api/namespaces?scope=all&pageSize=20" -H "$AUTH")"
check "空间详情含成员" '"members"' "$(curl -s $BASE/api/namespaces/sylixos-middleware -H "$AUTH")"
NEWNS="smoke-$RANDOM"
check "创建空间" "$NEWNS" "$(curl -s -X POST $BASE/api/namespaces -H "$AUTH" -H 'Content-Type: application/json' -d "{\"namespaceId\":\"$NEWNS\",\"description\":\"冒烟测试空间\"}")"
check "重复空间被拒" 'NAMESPACE_EXISTS' "$(curl -s -X POST $BASE/api/namespaces -H "$AUTH" -H 'Content-Type: application/json' -d "{\"namespaceId\":\"$NEWNS\"}")"
check "添加成员" '"username":"zhangsan"' "$(curl -s -X POST $BASE/api/namespaces/$NEWNS/members -H "$AUTH" -H 'Content-Type: application/json' -d '{"username":"zhangsan","roleId":"ORG_MEMBER"}')"
check "调整角色" 'ORG_ADMIN' "$(curl -s -X PUT $BASE/api/namespaces/$NEWNS/members/2 -H "$AUTH" -H 'Content-Type: application/json' -d '{"roleId":"ORG_ADMIN"}')"
check "成员被移除" '"list":\[{"userId":1' "$(curl -s -X DELETE $BASE/api/namespaces/$NEWNS/members/2 -H "$AUTH")"
check "空间改名" "$NEWNS-x" "$(curl -s -X PUT $BASE/api/namespaces/$NEWNS -H "$AUTH" -H 'Content-Type: application/json' -d "{\"namespaceId\":\"$NEWNS-x\"}")"
check "设置发布确认" 'true' "$(curl -s -X PUT $BASE/api/namespaces/$NEWNS-x -H "$AUTH" -H 'Content-Type: application/json' -d '{"settings":{"publishConfirmation":true}}')"

echo "== 3. 软件包 =="
PKG="smoke-pkg"
check "创建软件包" "$PKG" "$(curl -s -X POST $BASE/api/packages -H "$AUTH" -H 'Content-Type: application/json' -d "{\"namespace\":\"$NEWNS-x\",\"name\":\"$PKG\",\"description\":\"冒烟包\"}")"
check "重名被拒" 'PACKAGE_EXISTS' "$(curl -s -X POST $BASE/api/packages -H "$AUTH" -H 'Content-Type: application/json' -d "{\"namespace\":\"$NEWNS-x\",\"name\":\"$PKG\"}")"
check "非法版本被拒" 'INVALID_VERSION' "$(curl -s -X POST $BASE/api/packages/$NEWNS-x/$PKG/versions -H "$AUTH" -F version=abc -F platform=linux -F arch=x86_64 -F file=@package.json)"
check "包搜索" '"list"' "$(curl -s "$BASE/api/packages?keyword=armory&pageSize=5" -H "$AUTH")"
check "包详情" '"versions"' "$(curl -s $BASE/api/packages/global/armory-cli -H "$AUTH")"

echo "== 4. 上传与下载 =="
head -c 4096 /dev/urandom > /tmp/depot-artifact.bin
UPLOAD=$(curl -s -X POST $BASE/api/packages/$NEWNS-x/$PKG/versions -H "$AUTH" \
  -F version=1.0.0 -F platform=linux -F arch=x86_64 -F description=冒烟版本 \
  -F 'dependencies=[{"name":"sylixos-middleware/zlib","version":">=1.2.13"}]' \
  -F file=@/tmp/depot-artifact.bin)
check "上传制品（发布确认开启→待确认）" 'PENDING' "$UPLOAD"
check "同平台架构重复上传被拒" 'ARTIFACT_EXISTS' "$(curl -s -X POST $BASE/api/packages/$NEWNS-x/$PKG/versions -H "$AUTH" -F version=1.0.0 -F platform=linux -F arch=x86_64 -F file=@/tmp/depot-artifact.bin)"
check "确认发布" 'PUBLISHED' "$(curl -s -X POST $BASE/api/packages/$NEWNS-x/$PKG/v/1.0.0/confirm -H "$AUTH" -H 'Content-Type: application/json' -d '{"confirm":true}')"
check "平台架构列表" '"linux"' "$(curl -s $BASE/api/packages/$NEWNS-x/$PKG/v/1.0.0/platforms -H "$AUTH")"

ORIG=$(sha256sum /tmp/depot-artifact.bin | awk '{print $1}')
curl -s -D /tmp/dl-headers.txt "$BASE/api/packages/$NEWNS-x/$PKG/v/1.0.0/download?platform=linux&arch=x86_64" -H "$AUTH" -o /tmp/dl.bin
DOWN=$(sha256sum /tmp/dl.bin | awk '{print $1}')
if [ "$ORIG" = "$DOWN" ]; then PASS=$((PASS+1)); echo "  PASS  下载文件 sha256 一致"; else FAIL=$((FAIL+1)); echo "  FAIL  下载文件 sha256 不一致"; fi
check "下载响应带校验头" "$ORIG" "$(cat /tmp/dl-headers.txt)"

echo "== 5. 标签/依赖/关注 =="
check "新增标签" 'smoke' "$(curl -s -X POST $BASE/api/packages/$NEWNS-x/$PKG/tags -H "$AUTH" -H 'Content-Type: application/json' -d '{"tag":"smoke"}')"
check "重复标签被拒" 'TAG_EXISTS' "$(curl -s -X POST $BASE/api/packages/$NEWNS-x/$PKG/tags -H "$AUTH" -H 'Content-Type: application/json' -d '{"tag":"smoke"}')"
check "移除标签" '"tags":\[\]' "$(curl -s -X DELETE $BASE/api/packages/$NEWNS-x/$PKG/tags/smoke -H "$AUTH")"
check "关注切换" '"watching":true' "$(curl -s -X POST $BASE/api/packages/$NEWNS-x/$PKG/watch -H "$AUTH")"
check "反向依赖" '"dependents"' "$(curl -s $BASE/api/packages/sylixos-middleware/zlib -H "$AUTH")"

echo "== 6. 审计与统计 =="
check "审计日志" '"operationName"' "$(curl -s "$BASE/api/audits?pageSize=5" -H "$AUTH")"
check "审计筛选" 'PUBLISH' "$(curl -s "$BASE/api/audits?operationType=PUBLISH&pageSize=3" -H "$AUTH")"
check "操作类型" 'REMOVE_NAMESPACE' "$(curl -s $BASE/api/audits/operation-types -H "$AUTH")"
check "概览统计" '"totals"' "$(curl -s $BASE/api/stats/overview -H "$AUTH")"
# 口径校验：概览里的命名空间数应等于「包列表覆盖到的去重命名空间数」，不写死绝对值
PKG_NS=$(curl -s "$BASE/api/packages?pageSize=200" -H "$AUTH" \
  | tr ',' '\n' | sed -n 's/.*"namespace":"\([^"]*\)".*/\1/p' | sort -u | wc -l | tr -d ' ')
check "概览命名空间口径与包分布一致（$PKG_NS）" "\"namespaces\":$PKG_NS" "$(curl -s $BASE/api/stats/overview -H "$AUTH")"
check "元数据" '"platforms"' "$(curl -s $BASE/api/meta -H "$AUTH")"

echo "== 7. 权限边界 =="
UTOKEN=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"zhangsan","password":"user123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
UAUTH="Authorization: Bearer $UTOKEN"
FTOKEN=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"username":"lisi","password":"user123"}' | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
FAUTH="Authorization: Bearer $FTOKEN"
check "普通用户不能删他人空间" 'FORBIDDEN\|不是该空间的成员' "$(curl -s -X DELETE $BASE/api/namespaces/sylixos-middleware -H "$UAUTH")"
check "非空间成员看不到受限包" 'FORBIDDEN' "$(curl -s $BASE/api/packages/zhangsan/test-pkg -H "$FAUTH")"
check "空间管理员可见受限包" '"accessLevel":"Restricted"' "$(curl -s $BASE/api/packages/zhangsan/test-pkg -H "$AUTH")"
check "访客无发布权限" 'FORBIDDEN' "$(curl -s -X POST $BASE/api/packages/qa/unified-testcase-generator/versions -H "$UAUTH" -F version=0.0.2 -F platform=any -F arch=any -F file=@package.json)"
check "内置空间禁止删除" 'PROTECTED' "$(curl -s -X DELETE $BASE/api/namespaces/global -H "$AUTH")"

echo "== 8. 删除与清理 =="
check "删除制品版本" '"deleted":true' "$(curl -s -X DELETE $BASE/api/packages/$NEWNS-x/$PKG/v/1.0.0 -H "$AUTH")"
check "删除软件包" '"deleted":true' "$(curl -s -X DELETE $BASE/api/packages/$NEWNS-x/$PKG -H "$AUTH")"
check "删除测试空间" '"deleted":true' "$(curl -s -X DELETE $BASE/api/namespaces/$NEWNS-x -H "$AUTH")"
check "登出" '"loggedOut":true' "$(curl -s -X POST $BASE/api/auth/logout -H "$AUTH")"
check "登出后 token 失效" 'UNAUTHORIZED' "$(curl -s $BASE/api/auth/me -H "$AUTH")"

echo ""
echo "结果: PASS=$PASS FAIL=$FAIL"
