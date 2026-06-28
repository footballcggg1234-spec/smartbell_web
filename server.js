const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

dotenv.config();
const app = express();

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🗄️ เชื่อมต่อ MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smartbell')
  .then(() => console.log('✅ เชื่อมต่อ MongoDB สำเร็จพร้อมลุย!'))
  .catch(err => console.error('❌ เชื่อมต่อ MongoDB พลาด:', err));

// 📝 แบบแปลนข้อมูล (Schema) - ⚠️ เพิ่ม owner
const scheduleSchema = new mongoose.Schema({
  owner: { type: String, required: true }, // ระบุว่าตารางนี้เป็นของใคร
  time: String,
  title: String,
  audio: String,
  activeDays: [Number], 
  isActive: { type: Boolean, default: true }
});
const Schedule = mongoose.model('Schedule', scheduleSchema);

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// ================= 🔌 ระบบ Socket.io Real-time (แยกห้องตามบัญชี) =================
io.on('connection', (socket) => {
  console.log(`⚡ มีอุปกรณ์เชื่อมต่อเข้ามา: ${socket.id}`);

  // เมื่อเว็บหรือแอปล็อกอินสำเร็จ ให้ส่งชื่อ user มาเข้าห้อง
  socket.on('join_room', (username) => {
    socket.join(username);
    console.log(`🏠 [${username}] เข้าร่วมห้องส่วนตัวแล้ว (Socket ID: ${socket.id})`);
  });

  socket.on('force_play_bell', (data) => {
    console.log(`🔔 [${data.owner}] สั่งเล่นเสียงด่วน: ${data.audio}`);
    io.to(data.owner).emit('play_bell_now', { audio: data.audio }); 
  });

  socket.on('force_stop_bell', (data) => {
    console.log(`🛑 [${data.owner}] สั่งหยุดเสียงฉุกเฉิน!`);
    io.to(data.owner).emit('stop_bell_now'); 
  });

  socket.on('disconnect', () => {
    console.log(`🔴 อุปกรณ์ยกเลิกการเชื่อมต่อ: ${socket.id}`);
  });
});

// ================= 🚀 API ROUTES =================

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้นี้มีคนใช้งานแล้ว' });
    const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const nodemailer = require('nodemailer'); // ⚠️ เอา nodemailer กลับมาแล้ว!

dotenv.config();
const app = express();

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type'] }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🗄️ เชื่อมต่อ MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smartbell')
  .then(() => console.log('✅ เชื่อมต่อ MongoDB สำเร็จพร้อมลุย!'))
  .catch(err => console.error('❌ เชื่อมต่อ MongoDB พลาด:', err));

// 📝 แบบแปลนตารางเวลา (มี owner)
const scheduleSchema = new mongoose.Schema({
  owner: { type: String, required: true },
  time: String, title: String, audio: String,
  activeDays: [Number], isActive: { type: Boolean, default: true }
});
const Schedule = mongoose.model('Schedule', scheduleSchema);

// 📝 แบบแปลนผู้ใช้ (เอา email กลับมา)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// ================= 📧 ระบบอีเมล และ OTP =================
const otpStore = new Map();
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // ใช้ 587 STARTTLS
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// ================= 🔌 ระบบ Socket.io (แยกห้อง) =================
io.on('connection', (socket) => {
  socket.on('join_room', (username) => {
    socket.join(username);
    console.log(`🏠 [${username}] เข้าร่วมห้องส่วนตัวแล้ว`);
  });

  socket.on('force_play_bell', (data) => {
    io.to(data.owner).emit('play_bell_now', { audio: data.audio }); 
  });

  socket.on('force_stop_bell', (data) => {
    io.to(data.owner).emit('stop_bell_now'); 
  });
});

// ================= 🚀 API ROUTES =================

// [API] ส่ง OTP
app.post('/api/send-otp', async (req, res) => {
  try {
    const { username, email } = req.body;
    if (!username || !email) return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อและอีเมล' });

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email, { otp, expires: Date.now() + 5 * 60000 }); 

    console.log(`\n🔑 [ทดสอบระบบ] รหัส OTP ของ ${email} คือ: ${otp}\n`);

    try {
      await transporter.sendMail({
        from: '"SmartBell Pro" <noreply@smartbell.com>',
        to: email,
        subject: 'รหัส OTP สมัครสมาชิก SmartBell Pro',
        html: `<h2>ยืนยันการสมัครสมาชิก</h2><p>รหัส OTP 6 หลักของคุณคือ:</p><h1 style="color:#d97706">${otp}</h1>`
      });
      res.json({ success: true, message: 'ส่งรหัส OTP ไปที่อีเมลแล้ว' });
    } catch (mailErr) {
      console.error('❌ ไม่สามารถส่งอีเมลได้:', mailErr);
      res.json({ success: true, message: 'ระบบทดสอบ: ดูรหัส OTP ได้ที่หน้าจอ Console เซิร์ฟเวอร์' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'เซิร์ฟเวอร์ขัดข้อง' });
  }
});

// [API] สมัครสมาชิก (ตรวจ OTP)
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, otp } = req.body;
    const stored = otpStore.get(email);

    if (!stored) return res.status(400).json({ success: false, message: 'ไม่พบคำขอ OTP หรือหมดอายุแล้ว' });
    if (Date.now() > stored.expires) {
      otpStore.delete(email);
      return res.status(400).json({ success: false, message: 'รหัส OTP หมดอายุแล้ว' });
    }
    if (stored.otp !== otp) return res.status(400).json({ success: false, message: 'รหัส OTP ไม่ถูกต้อง' });

    const newUser = new User({ username, email, password });
    await newUser.save();
    otpStore.delete(email);

    res.json({ success: true, message: 'สมัครสมาชิกสำเร็จ! เข้าสู่ระบบได้เลย' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'ไม่สามารถสร้างบัญชีได้' });
  }
});

// [API] เข้าสู่ระบบ
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (user) res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', username: user.username });
    else res.status(401).json({ success: false, message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์' });
  }
});

// จัดการตารางเวลา (ต้องมี owner)
app.get('/api/schedules', async (req, res) => {
  try {
    const owner = req.query.owner;
    if (!owner) return res.status(400).json({ error: 'กรุณาระบุเจ้าของ' });
    const schedules = await Schedule.find({ owner }).sort({ time: 1 });
    res.json(schedules); 
  } catch (error) { res.status(500).json({ error: 'ดึงข้อมูลไม่สำเร็จ' }); }
});

app.post('/api/schedules', async (req, res) => {
  try {
    const newSchedule = new Schedule(req.body);
    await newSchedule.save();
    io.to(req.body.owner).emit('schedule_updated'); 
    res.status(201).json({ message: 'บันทึกสำเร็จ!', schedule: newSchedule });
  } catch (error) { res.status(500).json({ error: 'บันทึกไม่สำเร็จ' }); }
});

app.put('/api/schedules/:id/toggle', async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    schedule.isActive = !schedule.isActive; 
    await schedule.save();
    io.to(schedule.owner).emit('schedule_updated'); 
    res.json({ message: 'อัปเดตสถานะสำเร็จ' });
  } catch (error) { res.status(500).json({ error: 'อัปเดตไม่สำเร็จ' }); }
});

app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if(schedule) {
      await Schedule.findByIdAndDelete(req.params.id);
      io.to(schedule.owner).emit('schedule_updated'); 
    }
    res.json({ message: 'ลบข้อมูลสำเร็จ' });
  } catch (error) { res.status(500).json({ error: 'ลบข้อมูลไม่สำเร็จ' }); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 ระบบศูนย์ควบคุมรันอยู่ที่พอร์ต ${PORT}`));
    const newUser = new User({ username, password });
    await newUser.save();
    res.json({ success: true, message: 'สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการสมัครสมาชิก' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (user) res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', username: user.username });
    else res.status(401).json({ success: false, message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์' });
  }
});

// ⚠️ ดึงข้อมูลตารางเวลา (เฉพาะของ owner)
app.get('/api/schedules', async (req, res) => {
  try {
    const owner = req.query.owner;
    if (!owner) return res.status(400).json({ error: 'กรุณาระบุเจ้าของ' });
    const schedules = await Schedule.find({ owner }).sort({ time: 1 });
    res.json(schedules); 
  } catch (error) {
    res.status(500).json({ error: 'ดึงข้อมูลไม่สำเร็จ' });
  }
});

// ⚠️ เพิ่มข้อมูลตารางเวลา (บันทึก owner ด้วย)
app.post('/api/schedules', async (req, res) => {
  try {
    const newSchedule = new Schedule(req.body);
    await newSchedule.save();
    io.to(req.body.owner).emit('schedule_updated'); 
    res.status(201).json({ message: 'บันทึกสำเร็จ!', schedule: newSchedule });
  } catch (error) {
    res.status(500).json({ error: 'บันทึกไม่สำเร็จ' });
  }
});

// ⚠️ สลับสถานะตารางเวลา (แจ้งเตือนเฉพาะห้อง)
app.put('/api/schedules/:id/toggle', async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    schedule.isActive = !schedule.isActive; 
    await schedule.save();
    io.to(schedule.owner).emit('schedule_updated'); 
    res.json({ message: 'อัปเดตสถานะสำเร็จ', isActive: schedule.isActive });
  } catch (error) {
    res.status(500).json({ error: 'อัปเดตสถานะไม่สำเร็จ' });
  }
});

// ⚠️ ลบตารางเวลา (แจ้งเตือนเฉพาะห้อง)
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if(schedule) {
      await Schedule.findByIdAndDelete(req.params.id);
      io.to(schedule.owner).emit('schedule_updated'); 
    }
    res.json({ message: 'ลบข้อมูลสำเร็จ' });
  } catch (error) {
    res.status(500).json({ error: 'ลบข้อมูลไม่สำเร็จ' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 ระบบศูนย์ควบคุมรันอยู่ที่พอร์ต ${PORT}`));