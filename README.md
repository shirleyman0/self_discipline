# 自律星球（Self-Discipline Tracker）

监督每天学习和生活的沉浸式自律网站：习惯打卡、任务清单、番茄钟、数据统计复盘，配合游戏化激励（XP / 等级 / 成就）与惩罚机制（未完成任务扣积分、失败记录、复盘）。首页是一颗悬浮在深空中的实时 3D 星球，点击即可降落到 Minecraft 风格的可探索世界。

## 技术栈

- Spring Boot 3.3 + Java 17
- Spring Data JPA + MySQL
- Spring Security + JWT（多用户注册登录）
- Vue 3（CDN）+ ECharts 前端，无需 Node 构建
- Three.js 程序化 3D 星球与方块世界
- MediaPipe Hands 可选摄像头手势控制（未开启时不会申请摄像头权限）
- Spring `@Scheduled` 每日结算

## 本地运行

前置：**JDK 17**，本地 MySQL 已启动（账号密码以 `application.yml` 或环境变量为准，首次启动自动建 `discipline` 库）。注册验证码通过 Resend 邮件 API 发送。

```bash
# macOS 如果同时安装了多个 JDK，先明确切到 17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export PATH="$JAVA_HOME/bin:$PATH"

mvn spring-boot:run
# 或
mvn package && java -jar target/self-discipline-0.0.1-SNAPSHOT.jar
```

打开 http://localhost:8080 （首次先注册账号）。

## 3D 星球玩法

- 首页：拖动旋转中央星球，点击星球降落；深空星云、流星、极光会随生态状态变化。
- 探索：电脑使用 `WASD / 方向键` 移动、`Shift` 奔跑、拖动环视、滚轮缩放；触屏使用虚拟摇杆、拖动与双指缩放。
- 创造：在地表打开「创造」，选择森林、湖泊、木屋、农场、图书馆、城堡等蓝图，再点击地面放置。建筑会永久保存。
- 积分：打卡和完成任务获得积分；创建森林、湖泊和建筑会由服务端校验并扣除积分，余额不足无法建造。
- 角色：可选择探险家、建筑师、游侠或宇航员，并自定义服装、肤色和发色；角色可以在世界中自由行走。
- 手势（可选）：点击「开启手势」后，捏合再张开可进入/退出星球，左右挥动可旋转视角。普通鼠标、键盘和触屏操作始终可用。

数据库连接不同时用环境变量覆盖：

```bash
DB_USER=root DB_PASSWORD=你的密码 \
RESEND_API_KEY=re_你的Resend密钥 MAIL_FROM='自律星球 <onboarding@resend.dev>' \
mvn spring-boot:run
```

在 [Resend](https://resend.com) 创建 API Key 后填入 `RESEND_API_KEY`，不再需要邮箱密码或 SMTP 授权码。测试阶段可以使用 `onboarding@resend.dev`，但通常只能发给 Resend 账号自己的邮箱；向其他用户发信前，需要在 Resend 验证自己的域名，并把 `MAIL_FROM` 改为该域名下的邮箱。

注册流程：输入邮箱 → 点击「获取验证码」→ 填写邮件中的 6 位验证码 → 提交注册。验证码 10 分钟有效，同一邮箱 60 秒内不能重复发送，连续输错 5 次后失效。

## 玩法规则

| 行为 | 结果 |
|---|---|
| 习惯打卡 | +10 XP / +10 积分，连续 7 天 +30，连续 30 天 +100 |
| 完成任务 | +任务分值（默认 20）XP 和积分 |
| 完成番茄钟（≥25 分钟） | +5 XP / +5 积分 |
| 解锁成就 | +50 积分 |
| **每日任务当天未完成** | 每日 0:05 结算：**扣除任务分值**，记入失败记录 |
| **每周任务周日结束未完成** | 周一结算扣分 |
| **一次性任务逾期** | 标记失败并扣分 |

等级公式：`level = floor(sqrt(xp / 100)) + 1`。

## 部署

```bash
mvn package
JWT_SECRET=换成随机长字符串 DB_URL=jdbc:mysql://服务器:3306/discipline?... DB_USER=... DB_PASSWORD=... \
RESEND_API_KEY=re_你的Resend密钥 MAIL_FROM='自律星球 <noreply@你的域名>' \
  java -jar target/self-discipline-0.0.1-SNAPSHOT.jar
```

## API 一览

- `POST /api/auth/send-code`（发送注册邮箱验证码）
- `POST /api/auth/register`（邮箱验证码校验通过后注册）/ `POST /api/auth/login`
- `GET/POST/PUT/DELETE /api/habits`，`POST /api/habits/{id}/checkin`，`GET /api/habits/{id}/heatmap?year=`
- `GET/POST/PUT/DELETE /api/tasks`，`GET /api/tasks/today`，`POST /api/tasks/{id}/complete`
- `POST /api/focus`，`GET /api/focus/today`
- `GET /api/stats/summary?range=week|month`
- `GET /api/profile`（XP、等级、成就、失败记录、积分流水）
- `GET/POST /api/reviews`（每日复盘）
- `GET /api/planet`（3D 世界、角色、建造目录）
- `POST/DELETE /api/planet/world/objects`（建造/拆除世界物件）
- `PUT /api/planet/avatar`（保存角色形象）
- `POST /api/dev/settle`（手动触发每日结算，用于测试）
