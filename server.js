const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const nodemailer = require('nodemailer');

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🗄️ เชื่อมต่อ MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smartbell')
  .then(() => console.log('✅ เชื่อมต่อ MongoDB สำเร็จ!'))
  .catch(err => console.error('❌ เชื่อมต่อ MongoDB พลาด:', err));

// 📝 Schemas
const scheduleSchema = new mongoose.Schema({
  time: String, title: String, audio: String,
  activeDays: [Number], isActive: { type: Boolean, default: true }
});
const Schedule = mongoose.model('Schedule', scheduleSchema);

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// ================= 📧 ระบบอีเมล และ OTP =================
const otpStore = new Map(); // เก็บ OTP ชั่วคราว

// ตั้งค่าอีเมล (ใส่ของตัวเองในไฟล์ .env ถ้าต้องการให้ส่งเข้าเมลจริง)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
});

// [API] ส่ง OTP
app.post('/api/send-otp', async (req, res) => {
  try {
    const { username, email } = req.body;
    if (!username || !email) return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อและอีเมล' });

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้หรืออีเมลนี้ถูกใช้งานแล้ว' });

    // สุ่มรหัส 6 หลัก
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email, { otp, expires: Date.now() + 5 * 60000 }); // หมดอายุใน 5 นาที

    console.log(`\n🔑 [ทดสอบระบบ] รหัส OTP ของ ${email} คือ: ${otp}\n`);

    try {
      await transporter.sendMail({
        from: '"SmartBell Pro" <noreply@smartbell.com>',
        to: email,
        subject: 'รหัส OTP สมัครสมาชิก SmartBell Pro',
        html: `<h2>ยืนยันการสมัครสมาชิก</h2><p>รหัส OTP 6 หลักของคุณคือ:</p><h1 style="color:#d97706">${otp}</h1><p>รหัสมีอายุ 5 นาที</p>`
      });
      res.json({ success: true, message: 'ส่งรหัส OTP ไปที่อีเมลแล้ว' });
    } catch (mailErr) {
      res.json({ success: true, message: 'ระบบทดสอบ: ดูรหัส OTP ได้ที่หน้าจอ Console เซิร์ฟเวอร์' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'เซิร์ฟเวอร์ขัดข้อง' });
  }
});

// [API] ยืนยันสมัครสมาชิก
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

// [API] เข้าสู่ระบบ (Login)
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    // เผื่อไว้สำหรับ Admin ค่าเริ่มต้น
    if (username === 'admin' && password === '12345678') {
      return res.json({ success: true, message: 'เข้าสู่ระบบบัญชีแอดมินหลัก', username: 'Admin Master' });
    }
    
    const user = await User.findOne({ username, password });
    if (user) res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ', username: user.username });
    else res.status(401).json({ success: false, message: 'ชื่อผู้ใช้งานหรือรหัสผ่านผิด' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'เซิร์ฟเวอร์ขัดข้อง' });
  }
});

// ================= 🔌 Socket & ตารางเวลา =================
io.on('connection', (socket) => {
  socket.on('force_play_bell', (audio) => io.emit('play_bell_now', { audio }));
  socket.on('force_stop_bell', () => io.emit('stop_bell_now'));
});

app.get('/api/schedules', async (req, res) => {
  const schedules = await Schedule.find().sort({ time: 1 });
  res.json(schedules);
});

app.post('/api/schedules', async (req, res) => {
  const newSchedule = new Schedule(req.body);
  await newSchedule.save();
  io.emit('schedule_updated'); 
  res.status(201).json({ message: 'บันทึกสำเร็จ!' });
});

app.put('/api/schedules/:id/toggle', async (req, res) => {
  const schedule = await Schedule.findById(req.params.id);
  schedule.isActive = !schedule.isActive; 
  await schedule.save();
  io.emit('schedule_updated'); 
  res.json({ message: 'อัปเดตสถานะสำเร็จ' });
});

app.delete('/api/schedules/:id', async (req, res) => {
  await Schedule.findByIdAndDelete(req.params.id);
  io.emit('schedule_updated'); 
  res.json({ message: 'ลบสำเร็จ' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 เซิร์ฟเวอร์รันที่พอร์ต ${PORT}`));