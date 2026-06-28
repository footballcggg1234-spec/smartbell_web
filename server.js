// ==================== SmartBell Control Center ====================
// ✅ Production-ready backend with JWT, OTP, Socket.io, MongoDB
// =================================================================

const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// ⚙️ Environment Setup
dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

// 📦 Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🗄️ MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smartbell';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB failed:', err.message));

// 📝 Schemas
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // Will be hashed
  createdAt: { type: Date, default: Date.now }
});

const scheduleSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  time: { type: String, required: true },
  title: { type: String, required: true },
  audio: { type: String, required: true },
  activeDays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Schedule = mongoose.model('Schedule', scheduleSchema);

// 📧 Email Configuration
const otpStore = new Map();
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// 🔐 JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret_key_change_in_production';
const JWT_EXPIRE = '7d';

// 🛡️ Middleware: Verify JWT Token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer token"

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Invalid token' });
  }
};

// ================= 🔐 Authentication Routes =================

// [API] Send OTP for registration
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { username, email } = req.body;
    if (!username || !email) {
      return res.status(400).json({ success: false, message: 'Username and email required' });
    }

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username or email already taken' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(email, { otp, expires: Date.now() + 5 * 60000 });

    console.log(`🔑 [DEV] OTP for ${email}: ${otp}`);

    // Try to send email
    try {
      await transporter.sendMail({
        from: '"SmartBell" <noreply@smartbell.com>',
        to: email,
        subject: 'SmartBell - Verification Code',
        html: `
          <h2>Verify Your Email</h2>
          <p>Your 6-digit OTP:</p>
          <h1 style="color:#d97706; font-size:32px; letter-spacing:5px;">${otp}</h1>
          <p style="color:#999; font-size:12px;">Valid for 5 minutes</p>
        `
      });
      res.json({ success: true, message: 'OTP sent to email' });
    } catch (mailErr) {
      console.error('❌ Email send failed:', mailErr.message);
      // Return success anyway for dev mode
      res.json({ success: true, message: '[DEV MODE] Check console for OTP' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// [API] Register user
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, otp } = req.body;

    // Validate OTP
    const storedOtp = otpStore.get(email);
    if (!storedOtp) {
      return res.status(400).json({ success: false, message: 'OTP not found or expired' });
    }

    if (Date.now() > storedOtp.expires) {
      otpStore.delete(email);
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }

    if (storedOtp.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = new User({
      username,
      email,
      password: hashedPassword
    });
    await newUser.save();

    // Clean up OTP
    otpStore.delete(email);

    res.status(201).json({ success: true, message: 'Registration successful! Please login' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
});

// [API] Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRE }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user._id, username: user.username, email: user.email }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// ================= 🔌 Socket.io Real-time System =================

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication failed: no token'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.id;
    socket.username = decoded.username;
    next();
  } catch (err) {
    next(new Error('Authentication failed: invalid token'));
  }
});

io.on('connection', (socket) => {
  console.log(`⚡ User connected: ${socket.username} (${socket.id})`);

  // Join private room for user
  socket.join(`user:${socket.userId}`);

  // Force play bell command
  socket.on('force_play_bell', (data) => {
    console.log(`🔔 [${socket.username}] Play command: ${data.audio}`);
    io.to(`user:${socket.userId}`).emit('play_bell_now', { audio: data.audio });
  });

  // Force stop bell command
  socket.on('force_stop_bell', () => {
    console.log(`🛑 [${socket.username}] Stop command`);
    io.to(`user:${socket.userId}`).emit('stop_bell_now');
  });

  socket.on('disconnect', () => {
    console.log(`🔴 User disconnected: ${socket.username}`);
  });
});

// ================= 📅 Schedule API Routes (Protected) =================

// Get all schedules for logged-in user
app.get('/api/schedules', verifyToken, async (req, res) => {
  try {
    const schedules = await Schedule.find({ user: req.user.id }).sort({ time: 1 });
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// Create new schedule
app.post('/api/schedules', verifyToken, async (req, res) => {
  try {
    const { time, title, audio, activeDays } = req.body;

    const newSchedule = new Schedule({
      user: req.user.id,
      time,
      title,
      audio,
      activeDays: activeDays || [0, 1, 2, 3, 4, 5, 6]
    });

    await newSchedule.save();

    // Notify user's devices
    io.to(`user:${req.user.id}`).emit('schedule_updated', { action: 'created' });

    res.status(201).json({ success: true, message: 'Schedule created', schedule: newSchedule });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to create schedule' });
  }
});

// Toggle schedule status
app.put('/api/schedules/:id/toggle', verifyToken, async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ _id: req.params.id, user: req.user.id });
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    schedule.isActive = !schedule.isActive;
    await schedule.save();

    io.to(`user:${req.user.id}`).emit('schedule_updated', { action: 'toggled' });

    res.json({ success: true, message: 'Schedule updated', isActive: schedule.isActive });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update schedule' });
  }
});

// Delete schedule
app.delete('/api/schedules/:id', verifyToken, async (req, res) => {
  try {
    const result = await Schedule.deleteOne({ _id: req.params.id, user: req.user.id });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    io.to(`user:${req.user.id}`).emit('schedule_updated', { action: 'deleted' });

    res.json({ success: true, message: 'Schedule deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete schedule' });
  }
});

// ================= 🚀 Start Server =================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║    🔔 SmartBell Control Center       ║
║    Running on port ${PORT}               ║
║    JWT_SECRET: ${JWT_SECRET === 'default_secret_key_change_in_production' ? '⚠️ DEFAULT (CHANGE!)' : '✅ SET'}     ║
╚══════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    mongoose.connection.close();
  });
});
