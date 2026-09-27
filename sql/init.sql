-- ===================================================================
-- 高中教师学业管理系统 数据库脚本 (MySQL)
-- 库名: student_mgmt
-- 执行: mysql -u root -p < init.sql
-- ===================================================================

DROP DATABASE IF EXISTS student_mgmt;
CREATE DATABASE student_mgmt DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE student_mgmt;

-- ------------------------- 教师 / 登录 -------------------------
CREATE TABLE teacher (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  username     VARCHAR(50)  NOT NULL UNIQUE COMMENT '登录账号',
  password     VARCHAR(100) NOT NULL COMMENT '密码(演示明文)',
  real_name    VARCHAR(50)  NOT NULL COMMENT '姓名',
  role         VARCHAR(20)  NOT NULL COMMENT 'ADMIN班主任/TEACHER科任',
  subject_id   INT          NULL COMMENT '科任老师负责科目',
  phone        VARCHAR(20)
) COMMENT '教师账号';

-- ------------------------- 班级 -------------------------
CREATE TABLE class (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  name         VARCHAR(50) NOT NULL COMMENT '班级名',
  grade        VARCHAR(20) NOT NULL COMMENT '年级',
  head_teacher_id INT      NULL COMMENT '班主任',
  FOREIGN KEY (head_teacher_id) REFERENCES teacher(id)
) COMMENT '班级';

-- ------------------------- 学生档案 -------------------------
CREATE TABLE student (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  student_no    VARCHAR(30) NOT NULL UNIQUE COMMENT '学号',
  name          VARCHAR(50) NOT NULL,
  gender        VARCHAR(10) NOT NULL COMMENT '男/女',
  birth_date    DATE        NULL,
  class_id      INT         NOT NULL,
  enroll_year   INT         NULL COMMENT '入学年份',
  address       VARCHAR(200),
  phone         VARCHAR(20),
  guardian_name VARCHAR(50) COMMENT '家长姓名',
  guardian_phone VARCHAR(20) COMMENT '家长电话',
  status        VARCHAR(20) NOT NULL DEFAULT '在读' COMMENT '在读/休学/转班/毕业',
  photo         VARCHAR(20) COMMENT '头像占位(姓名首字母色块)',
  FOREIGN KEY (class_id) REFERENCES class(id)
) COMMENT '学生基本信息';

-- ------------------------- 科目 -------------------------
CREATE TABLE subject (
  id    INT PRIMARY KEY AUTO_INCREMENT,
  name  VARCHAR(30) NOT NULL COMMENT '科目名',
  code  VARCHAR(20) NOT NULL UNIQUE
) COMMENT '科目';

-- ------------------------- 考试 -------------------------
CREATE TABLE exam (
  id      INT PRIMARY KEY AUTO_INCREMENT,
  name    VARCHAR(50) NOT NULL COMMENT '考试名称',
  exam_date DATE NOT NULL,
  term    VARCHAR(30) NOT NULL COMMENT '学期'
) COMMENT '考试批次';

-- ------------------------- 成绩 -------------------------
CREATE TABLE score (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  student_id  INT NOT NULL,
  subject_id  INT NOT NULL,
  exam_id     INT NOT NULL,
  score       DECIMAL(5,1) NOT NULL COMMENT '分数',
  FOREIGN KEY (student_id) REFERENCES student(id),
  FOREIGN KEY (subject_id) REFERENCES subject(id),
  FOREIGN KEY (exam_id) REFERENCES exam(id),
  UNIQUE KEY uk_score (student_id, subject_id, exam_id)
) COMMENT '成绩';

-- ------------------------- 出勤 -------------------------
CREATE TABLE attendance (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  student_id  INT NOT NULL,
  att_date    DATE NOT NULL,
  status      VARCHAR(20) NOT NULL COMMENT '出勤/迟到/早退/请假/缺勤',
  remark      VARCHAR(200),
  FOREIGN KEY (student_id) REFERENCES student(id),
  UNIQUE KEY uk_att (student_id, att_date)
) COMMENT '每日出勤';

-- ------------------------- 奖惩记录 -------------------------
CREATE TABLE discipline (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  student_id  INT NOT NULL,
  type        VARCHAR(10) NOT NULL COMMENT '奖励/惩罚',
  content     VARCHAR(200) NOT NULL,
  event_date  DATE NOT NULL,
  FOREIGN KEY (student_id) REFERENCES student(id)
) COMMENT '奖惩记录';

-- ------------------------- 活动参与 -------------------------
CREATE TABLE activity (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  student_id  INT NOT NULL,
  name        VARCHAR(100) NOT NULL COMMENT '活动名称',
  category    VARCHAR(30)  NOT NULL COMMENT '社团/志愿/体育/竞赛',
  event_date  DATE NOT NULL,
  FOREIGN KEY (student_id) REFERENCES student(id)
) COMMENT '活动参与';

-- ------------------------- 评语 -------------------------
CREATE TABLE review (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  student_id  INT NOT NULL,
  teacher_id  INT NOT NULL,
  term        VARCHAR(30) NOT NULL COMMENT '学期',
  content     VARCHAR(500) NOT NULL COMMENT '评语',
  FOREIGN KEY (student_id) REFERENCES student(id),
  FOREIGN KEY (teacher_id) REFERENCES teacher(id)
) COMMENT '教师评语';

-- ===================================================================
-- 演示数据
-- ===================================================================

INSERT INTO subject (id, name, code) VALUES
 (1,'语文','CHINESE'),(2,'数学','MATH'),(3,'英语','ENGLISH'),
 (4,'物理','PHYSICS'),(5,'化学','CHEMISTRY'),(6,'生物','BIOLOGY'),
 (7,'历史','HISTORY'),(8,'地理','GEOGRAPHY'),(9,'政治','POLITICS');

INSERT INTO teacher (id, username, password, real_name, role, subject_id, phone) VALUES
 (1,'wang','123456','王老师','ADMIN',NULL,'13800000001'),
 (2,'li','123456','李老师','TEACHER',2,'13800000002'),
 (3,'zhang','123456','张老师','TEACHER',3,'13800000003');

INSERT INTO class (id, name, grade, head_teacher_id) VALUES
 (1,'高一(1)班','高一',1),
 (2,'高一(2)班','高一',2),
 (3,'高二(3)班','高二',3);

INSERT INTO student (id, student_no, name, gender, birth_date, class_id, enroll_year, address, phone, guardian_name, guardian_phone, status, photo) VALUES
 (1,'20240101','陈晓明','男','2008-03-12',1,2024,'北京市朝阳区1号','13900000001','陈父','13700000001','在读','C'),
 (2,'20240102','林雨欣','女','2008-05-20',1,2024,'北京市海淀区2号','13900000002','林母','13700000002','在读','L'),
 (3,'20240103','赵子豪','男','2008-01-08',1,2024,'北京市西城区3号','13900000003','赵父','13700000003','在读','Z'),
 (4,'20240104','孙梦洁','女','2008-07-15',1,2024,'北京市东城区4号','13900000004','孙母','13700000004','在读','S'),
 (5,'20240105','周天宇','男','2008-02-28',1,2024,'北京市丰台区5号','13900000005','周父','13700000005','在读','Z'),
 (6,'20240106','吴佳怡','女','2008-09-09',1,2024,'北京市石景山6号','13900000006','吴母','13700000006','在读','W'),
 (7,'20240201','郑浩然','男','2008-04-11',2,2024,'天津市和平区1号','13900000007','郑父','13700000007','在读','Z'),
 (8,'20240202','王梓萱','女','2008-06-22',2,2024,'天津市南开区2号','13900000008','王母','13700000008','在读','W'),
 (9,'20240203','冯俊杰','男','2008-08-30',2,2024,'天津市河西区3号','13900000009','冯父','13700000009','在读','F'),
 (10,'20240204','许思彤','女','2008-11-05',2,2024,'天津市河北区4号','13900000010','许母','13700000010','休学','X'),
 (11,'20230301','何志强','男','2007-03-18',3,2023,'上海市浦东新区1号','13900000011','何父','13700000011','在读','H'),
 (12,'20230302','曹雅静','女','2007-12-25',3,2023,'上海市徐汇区2号','13900000012','曹母','13700000012','在读','C'),
 (13,'20230303','邓宇航','男','2007-06-14',3,2023,'上海市长宁区3号','13900000013','邓父','13700000013','在读','D'),
 (14,'20230304','谢欣妍','女','2007-10-02',3,2023,'上海市静安区4号','13900000014','谢母','13700000014','在读','X'),
 (15,'20230305','唐鹏飞','男','2007-01-30',3,2023,'上海市黄浦区5号','13900000015','唐父','13700000015','在读','T');

INSERT INTO exam (id, name, exam_date, term) VALUES
 (1,'高一上学期期中考试','2024-11-10','2024-2025学年第一学期'),
 (2,'高一上学期期末考试','2025-01-15','2024-2025学年第一学期'),
 (3,'高二下学期第一次月考','2025-03-20','2024-2025学年第二学期');

-- 成绩: 为1-6号学生(高一1班)在三场考试, 语数英物化 五科录入
INSERT INTO score (student_id, subject_id, exam_id, score) VALUES
 (1,1,1,112.5),(1,2,1,135.0),(1,3,1,120.0),(1,4,1,88.0),(1,5,1,79.5),
 (2,1,1,125.0),(2,2,1,118.0),(2,3,1,132.5),(2,4,1,76.0),(2,5,1,85.0),
 (3,1,1,98.0),(3,2,1,142.0),(3,3,1,105.0),(3,4,1,92.0),(3,5,1,90.5),
 (4,1,1,130.0),(4,2,1,110.0),(4,3,1,128.0),(4,4,1,70.0),(4,5,1,82.0),
 (5,1,1,105.0),(5,2,1,125.5),(5,3,1,99.0),(5,4,1,85.0),(5,5,1,77.0),
 (6,1,1,118.0),(6,2,1,108.0),(6,3,1,135.0),(6,4,1,68.5),(6,5,1,80.0),
 (1,1,2,115.0),(1,2,2,138.0),(1,3,2,122.0),(1,4,2,90.0),(1,5,2,81.0),
 (2,1,2,128.0),(2,2,2,120.0),(2,3,2,134.0),(2,4,2,78.0),(2,5,2,86.0),
 (3,1,2,100.0),(3,2,2,145.0),(3,3,2,108.0),(3,4,2,94.0),(3,5,2,91.0),
 (4,1,2,132.0),(4,2,2,112.0),(4,3,2,129.0),(4,4,2,72.0),(4,5,2,83.0),
 (5,1,2,107.0),(5,2,2,127.0),(5,3,2,101.0),(5,4,2,86.0),(5,5,2,78.0),
 (6,1,2,120.0),(6,2,2,110.0),(6,3,2,136.0),(6,4,2,70.0),(6,5,2,81.0);

-- 考试3: 高二(3)班 11-15号学生 五科成绩
INSERT INTO score (student_id, subject_id, exam_id, score) VALUES
 (11,1,3,108.0),(11,2,3,132.0),(11,3,3,115.0),(11,4,3,89.0),(11,5,3,84.0),
 (12,1,3,126.0),(12,2,3,114.0),(12,3,3,131.0),(12,4,3,73.0),(12,5,3,86.0),
 (13,1,3,99.0),(13,2,3,141.0),(13,3,3,102.0),(13,4,3,93.0),(13,5,3,88.0),
 (14,1,3,133.0),(14,2,3,106.0),(14,3,3,127.0),(14,4,3,69.0),(14,5,3,81.0),
 (15,1,3,111.0),(15,2,3,123.0),(15,3,3,97.0),(15,4,3,85.0),(15,5,3,79.0);

INSERT INTO attendance (student_id, att_date, status, remark) VALUES
 (1,'2025-03-25','出勤',NULL),(2,'2025-03-25','出勤',NULL),(3,'2025-03-25','迟到','迟到5分钟'),
 (4,'2025-03-25','出勤',NULL),(5,'2025-03-25','请假','病假'),(6,'2025-03-25','出勤',NULL),
 (1,'2025-03-26','出勤',NULL),(2,'2025-03-26','缺勤','未请假'),(3,'2025-03-26','出勤',NULL),
 (4,'2025-03-26','早退','身体不适'),(5,'2025-03-26','出勤',NULL),(6,'2025-03-26','出勤',NULL);

INSERT INTO discipline (student_id, type, content, event_date) VALUES
 (1,'奖励','校级数学竞赛二等奖','2024-12-01'),
 (2,'奖励','三好学生','2025-01-20'),
 (3,'惩罚','课堂玩手机，口头警告','2025-03-10'),
 (5,'奖励','志愿服务优秀个人','2024-11-15');

INSERT INTO activity (student_id, name, category, event_date) VALUES
 (1,'校园篮球联赛','体育','2024-10-15'),
 (2,'文学社读书分享','社团','2024-11-20'),
 (4,'社区环保志愿','志愿','2025-03-05'),
 (6,'机器人大赛','竞赛','2025-01-10');

INSERT INTO review (student_id, teacher_id, term, content) VALUES
 (1,1,'2024-2025学年第一学期','学习踏实，理科思维突出，望加强英语积累。'),
 (2,1,'2024-2025学年第一学期','文科素养好，认真负责，是老师得力助手。'),
 (3,2,'2024-2025学年第一学期','数学天赋佳，需提升课堂自律。');
