# 高中教师学业管理系统 Demo

教师用来管理学生各类资料的 Web 平台。技术栈：**Java 17 + Spring Boot 3.3 + MyBatis-Plus + MySQL + Thymeleaf + Bootstrap 5**。

## 功能模块
- **首页看板**：在册学生/班级/教师/考试统计、各科平均分柱状图、出勤环形图、最新动态。
- **学生档案**：学号、姓名、性别、班级、出生日期、住址、联系方式、家长信息、学籍状态；支持搜索筛选、增删改；档案详情页聚合成绩、趋势图、出勤、奖惩、活动、评语。
- **班级管理**：新增/删除班级、指定班主任、班级人数、点击进名册。
- **成绩管理**：按考试+班级生成成绩单（各科成绩、总分、平均分、班内排名）；整班批量成绩录入（自动判分入库、可覆盖）；新增考试批次。
- **出勤管理**：按班级整班签到（出勤/迟到/早退/请假/缺勤+备注），按日期/班级查询。
- **综合素质**：奖惩记录、活动参与（社团/志愿/体育/竞赛）、教师评语，分类 Tab 管理。
- **登录鉴权**：教师账号登录，Session 拦截保护全部页面。

## 数据库
建库脚本：`sql/init.sql`（含建库 + 建表 + 演示数据：3 班级、15 学生、3 考试、成绩/出勤/奖惩/活动/评语）。

导入方式任选其一：
```bash
mysql -u root -p < sql/init.sql
```
或用 Navicat 打开 `sql/init.sql` 执行。

## 配置
`src/main/resources/application.yml` 中数据库连接：
```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/student_mgmt?...
    username: ${DB_USER:root}
    password: ${DB_PASSWORD:root}   # 改成你的 MySQL 密码，或用环境变量覆盖
```

## 运行
```bash
# 方式一：Maven
mvn spring-boot:run

# 方式二：打包后运行
mvn package -DskipTests
java -jar target/student-mgmt.jar
```
浏览器访问 **http://localhost:8080**

演示账号（密码均 `123456`）：

| 账号 | 姓名 | 角色 |
|------|------|------|
| wang | 王老师 | 班主任(管理员) |
| li   | 李老师 | 数学科任 |
| zhang| 张老师 | 英语科任 |

## 目录结构
```
src/main/java/com/school/sms
├── SmsApplication.java        启动类
├── config/                    登录拦截器 / WebMvc 配置
├── controller/                各模块控制器
├── entity/                    数据库实体
├── dto/                       成绩单/成绩视图 DTO
└── mapper/                    MyBatis-Plus Mapper
src/main/resources
├── application.yml
├── templates/                 Thymeleaf 页面
└── static/css/app.css
sql/init.sql                   建库建表 + 演示数据
```
