# YISUN SPACE — API Contract

> **Base URL** `https://api.yisun.space`
> **Version** derived from `121.ts` — last updated 2026-03-04

---

## 全局约定 Global Conventions

### 请求格式 Request Format

所有带请求体的端点均使用 JSON，必须携带：

```
Content-Type: application/json
```

### 响应格式 Response Format

所有响应均为 JSON，`Content-Type: application/json`。

成功响应直接返回数据对象，**不包裹** `{ data: ... }` 层。
失败响应统一格式：

```json
{ "error": "<error_code>" }
```

### CORS

所有端点均支持跨域请求：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

`OPTIONS` 预检请求：所有路径均返回 `204 No Content`，无响应体。

### 认证方式 Authentication

需要认证的端点必须在请求头携带：

```
Authorization: Bearer <token>
```

`token` 为注册或登录时服务端返回的 base64url 字符串（32 字节随机，URL 安全编码，无填充符）。

### Session 有效期

Session 有效期为 **7 天**，到期后 token 自动失效。

### 账号锁定规则 Account Lock

- 连续认证失败 **3 次**（`/login`、`/recovery/lookup`、`/recovery/reset` 共享同一计数器）
- 触发锁定后账号被锁 **72 小时**
- 锁定期间以下端点全部拒绝，统一返回 401，**不泄露锁定状态**：
  `/login` · `/me` · `/logout` · `/handle` · `/recovery/lookup` · `/recovery/reset`
- 登录成功后计数器清零

### 字段格式约束 Field Formats

| 字段 | 格式 | 说明 |
|------|------|------|
| `handle` (default) | `[A-Z]{4}-[A-Z]{4}-[A-Z]{4}-[A-Z]{4}-[A-Z]{4}` | 系统生成，不可变，用于登录 |
| `recovery_key` | `[A-Z]{4}-[A-Z]{4}-[A-Z]{4}-[A-Z]{4}-[A-Z]{4}` | 系统生成，一次性展示，用于恢复 |
| `public_handle` | `^[a-zA-Z0-9_]{3,20}$` | 用户自定义，可变，展示用 |
| `password` | 最短 8 个字符 | 无最大长度限制 |
| `token` | base64url，无填充 | 32 字节随机，URL 安全 |

### 错误码一览 Error Codes

| error_code | HTTP | 含义 |
|------------|------|------|
| `invalid_credentials` | 401 | 凭证错误、账号不存在、账号锁定（统一，不区分） |
| `unauthorized` | 401 | token 无效、已过期、账号锁定（认证类端点） |
| `weak_password` | 400 | 密码少于 8 个字符 |
| `invalid_handle` | 400 | `public_handle` 不符合正则 |
| `handle_unavailable` | 409 | `public_handle` 已被其他账号占用 |
| `server_error` | 500 | 服务端内部错误（如 handle 碰撞重试耗尽） |
| `not_found` | 404 | 路由不存在 |

---

## 端点详情 Endpoints

---

### `GET /health`

**用途** 健康检查，无需认证。

**请求** 无请求体。

**响应**

```
200 OK
```
```json
{ "ok": true }
```

---

### `POST /register`

**用途** 注册新账号。`handle` 和 `recovery_key` 由服务端生成，客户端不可指定。

**请求体**

```json
{
  "password": "string"
}
```

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `password` | string | ✅ | 最短 8 个字符 |

**成功响应**

```
201 Created
```
```json
{
  "handle": "ABCD-EFGH-IJKL-MNOP-QRST",
  "recovery_key": "UVWX-YZAB-CDEF-GHIJ-KLMN",
  "token": "<base64url>"
}
```

| 字段 | 说明 |
|------|------|
| `handle` | 系统生成的登录凭证，**不可变**，请妥善保存 |
| `recovery_key` | 账号恢复密钥，**仅此一次展示**，丢失后无法找回 |
| `token` | 当前 session token，有效期 7 天 |

**错误响应**

| 情形 | HTTP | error |
|------|------|-------|
| password 缺失或少于 8 字符 | 400 | `weak_password` |
| handle 碰撞重试耗尽（极罕见） | 500 | `server_error` |

**副作用**

- 创建用户记录，生成 `handle`、`password_hash`、`recovery_key_hash`、`recovery_lookup_hash`
- 同时创建有效期 7 天的 session，直接返回 token，**无需再次登录**

---

### `POST /login`

**用途** 使用 `handle`（default_handle）和密码登录，获取 session token。

**请求体**

```json
{
  "handle": "ABCD-EFGH-IJKL-MNOP-QRST",
  "password": "string"
}
```

| 字段 | 类型 | 必填 |
|------|------|------|
| `handle` | string | ✅ |
| `password` | string | ✅ |

**成功响应**

```
200 OK
```
```json
{
  "token": "<base64url>"
}
```

**错误响应**

| 情形 | HTTP | error |
|------|------|-------|
| 字段缺失 | 401 | `invalid_credentials` |
| handle 不存在 | 401 | `invalid_credentials` |
| 密码错误 | 401 | `invalid_credentials` |
| 账号已锁定 | 401 | `invalid_credentials` |

> 所有失败情形统一返回相同错误码，**不区分**账号是否存在、是否锁定，防止枚举攻击。

**副作用**

- 失败：`failed_attempts + 1`；达到 3 次则写入 `locked_until = NOW() + 72h`
- 成功：`failed_attempts = 0`，`locked_until = NULL`，创建新 session

---

### `GET /me`

**用途** 获取当前登录用户的信息。需要认证。

**请求头**

```
Authorization: Bearer <token>
```

**请求体** 无。

**成功响应**

```
200 OK
```
```json
{
  "user": {
    "id": 1,
    "handle": "ABCD-EFGH-IJKL-MNOP-QRST",
    "public_handle": "ziyi",
    "role": "user",
    "created_at": "2026-03-04T00:00:00.000Z"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 内部数据库 ID |
| `handle` | string | 系统生成的登录用 handle，不可变 |
| `public_handle` | string \| null | 用户自定义展示名，未设置时为 `null` |
| `role` | string | 当前固定为 `"user"` |
| `created_at` | string | ISO 8601 时间戳 |

**错误响应**

| 情形 | HTTP | error |
|------|------|-------|
| token 缺失或格式错误 | 401 | `unauthorized` |
| token 无效或已过期 | 401 | `unauthorized` |
| 账号已锁定 | 401 | `unauthorized` |

---

### `POST /logout`

**用途** 注销当前 session（删除当前 token）。需要认证。

**请求头**

```
Authorization: Bearer <token>
```

**请求体** 无。

**成功响应**

```
200 OK
```
```json
{ "ok": true }
```

**错误响应**

| 情形 | HTTP | error |
|------|------|-------|
| token 缺失或格式错误 | 401 | `unauthorized` |
| token 无效或已过期 | 401 | `unauthorized` |
| 账号已锁定 | 401 | `unauthorized` |

**副作用**

- 仅删除当前 token 对应的 session，其他设备的 session 不受影响
- 锁定期间禁止登出（防止锁定状态下清除凭证）

---

### `POST /handle`

**用途** 设置或修改当前用户的 `public_handle`（展示名）。需要认证。

**请求头**

```
Authorization: Bearer <token>
```

**请求体**

```json
{
  "public_handle": "string"
}
```

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `public_handle` | string | ✅ | `^[a-zA-Z0-9_]{3,20}$` |

**成功响应**

```
200 OK
```
```json
{
  "ok": true,
  "public_handle": "ziyi"
}
```

**错误响应**

| 情形 | HTTP | error |
|------|------|-------|
| token 无效或已过期 | 401 | `unauthorized` |
| 账号已锁定 | 401 | `unauthorized` |
| `public_handle` 格式不符合正则 | 400 | `invalid_handle` |
| `public_handle` 已被占用 | 409 | `handle_unavailable` |

**副作用**

- 写入 `public_handle`，同时记录 `public_handle_updated_at = NOW()`
- 不影响 `handle`（登录用 handle）和认证体系

---

### `POST /recovery/lookup`

**用途** 使用 `recovery_key` 反查 `handle`（default_handle）。适用于忘记 handle 的场景。无需认证。

**请求体**

```json
{
  "recovery_key": "UVWX-YZAB-CDEF-GHIJ-KLMN"
}
```

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `recovery_key` | string | ✅ | `^[A-Z]{4}-[A-Z]{4}-[A-Z]{4}-[A-Z]{4}-[A-Z]{4}$` |

**成功响应**

```
200 OK
```
```json
{
  "handle": "ABCD-EFGH-IJKL-MNOP-QRST"
}
```

**错误响应**

| 情形 | HTTP | error |
|------|------|-------|
| 字段缺失或格式不符 | 401 | `invalid_credentials` |
| `recovery_key` 不匹配任何账号 | 401 | `invalid_credentials` |
| 账号已锁定 | 401 | `invalid_credentials` |

> 所有失败统一返回相同错误码，**不区分** key 是否存在、账号是否锁定。

**副作用**

- **Read-only**，不消耗 `recovery_key`，不轮换 key，不创建 session
- 失败时（key 有效但 PBKDF2 二次验证异常）计入 `failed_attempts`，达 3 次锁定

**安全说明**

- 内部通过 `sha256(recovery_key)` 索引查找，再以 PBKDF2 慢哈希二次确认，防止碰撞
- 无论 key 是否存在，响应耗时一致（dummy PBKDF2 推导保证）

---

### `POST /recovery/reset`

**用途** 使用 `handle` + `recovery_key` 重置密码，并轮换 `recovery_key`。无需认证。

**请求体**

```json
{
  "handle": "ABCD-EFGH-IJKL-MNOP-QRST",
  "recovery_key": "UVWX-YZAB-CDEF-GHIJ-KLMN",
  "new_password": "string"
}
```

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `handle` | string | ✅ | 系统生成的 default handle |
| `recovery_key` | string | ✅ | `^[A-Z]{4}-[A-Z]{4}-[A-Z]{4}-[A-Z]{4}-[A-Z]{4}$` |
| `new_password` | string | ✅ | 最短 8 个字符 |

**成功响应**

```
200 OK
```
```json
{
  "recovery_key": "NEWK-EYYY-ABCD-EFGH-IJKL"
}
```

> ⚠️ 响应中的 `recovery_key` 是**新的恢复密钥**，**仅此一次展示**。请立即妥善保存，旧的 recovery_key 已永久失效。

**错误响应**

| 情形 | HTTP | error |
|------|------|-------|
| 字段缺失或 key 格式不符 | 401 | `invalid_credentials` |
| `new_password` 少于 8 字符 | 400 | `weak_password` |
| handle 或 recovery_key 不匹配 | 401 | `invalid_credentials` |
| 账号已锁定 | 401 | `invalid_credentials` |

**副作用（成功时，原子执行）**

1. 更新 `password_hash`（新密码的 PBKDF2 哈希）
2. 轮换 `recovery_key_hash`（新 recovery_key 的 PBKDF2 哈希）
3. 更新 `recovery_lookup_hash`（新 recovery_key 的 SHA-256 索引）
4. 清零 `failed_attempts`，清除 `locked_until`
5. 删除该用户**所有**现有 session（所有设备强制下线）

**安全说明**

- 无论用户是否存在，响应耗时一致（两次 dummy PBKDF2 推导）
- 失败时计入 `failed_attempts`；handle 存在但 key 不匹配时也会计数
- 成功后旧 token 立即全部失效，需重新登录

---

## 端点汇总 Summary Table

| 端点 | 方法 | 需要认证 | 影响失败计数 | 说明 |
|------|------|----------|-------------|------|
| `/health` | GET | ❌ | ❌ | 健康检查 |
| `/register` | POST | ❌ | ❌ | 注册 |
| `/login` | POST | ❌ | ✅ | 登录 |
| `/me` | GET | ✅ | ❌ | 获取用户信息 |
| `/logout` | POST | ✅ | ❌ | 注销当前 session |
| `/handle` | POST | ✅ | ❌ | 设置展示名 |
| `/recovery/lookup` | POST | ❌ | ✅ | 用 recovery_key 查 handle |
| `/recovery/reset` | POST | ❌ | ✅ | 用 recovery_key 重置密码 |

---

## 身份模型说明 Identity Model

```
┌─────────────────────────────────────────────┐
│                  用户身份                    │
│                                             │
│  handle          ABCD-EFGH-IJKL-MNOP-QRST  │
│  (default_handle) ← 系统生成，不可变         │
│                    用于登录 + 恢复           │
│                                             │
│  public_handle   ziyi                       │
│                  ← 用户自定义，可变          │
│                    用于展示 / 分享           │
│                                             │
│  recovery_key    UVWX-YZAB-CDEF-GHIJ-KLMN  │
│                  ← 系统生成，仅展示一次      │
│                    丢失后无法找回            │
└─────────────────────────────────────────────┘
```

**重要提示**：`handle` 和 `recovery_key` 任意一个丢失，可通过另一个找回访问权限。**两者同时丢失，账号永久不可访问，无任何人工恢复途径。**
