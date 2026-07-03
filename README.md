# 自律星球（Self-Discipline Tracker）

监督每天学习和生活的自律网站：习惯打卡、任务清单、番茄钟、数据统计复盘，配合游戏化激励（XP / 等级 / 成就）与惩罚机制（未完成任务扣积分、失败记录、复盘）。

## 技术栈

- Spring Boot 3.3 + Java 17
- Spring Data JPA + MySQL
- Spring Security + JWT（多用户注册登录）
- Vue 3（CDN）+ ECharts 前端，无需 Node 构建
- Spring `@Scheduled` 每日结算

## 本地运行

前置：JDK 17+，本地 MySQL 已启动（默认 root/123456，首次启动自动建 `discipline` 库）。

```bash
mvn spring-boot:run
# 或
mvn package && java -jar target/self-discipline-0.0.1-SNAPSHOT.jar
```

打开 http://localhost:8080 （首次先注册账号）。

数据库连接不同时用环境变量覆盖：

```bash
DB_USER=root DB_PASSWORD=你的密码 mvn spring-boot:run
```

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
  java -jar target/self-discipline-0.0.1-SNAPSHOT.jar
```

## API 一览

- `POST /api/auth/register` / `POST /api/auth/login`
- `GET/POST/PUT/DELETE /api/habits`，`POST /api/habits/{id}/checkin`，`GET /api/habits/{id}/heatmap?year=`
- `GET/POST/PUT/DELETE /api/tasks`，`GET /api/tasks/today`，`POST /api/tasks/{id}/complete`
- `POST /api/focus`，`GET /api/focus/today`
- `GET /api/stats/summary?range=week|month`
- `GET /api/profile`（XP、等级、成就、失败记录、积分流水）
- `GET/POST /api/reviews`（每日复盘）
- `POST /api/dev/settle`（手动触发每日结算，用于测试）
