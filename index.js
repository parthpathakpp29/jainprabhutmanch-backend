const express = require("express");
const http = require("http");
const dbConnect = require("./config/dbConnect");
const app = express();
const dotenv = require("dotenv").config();
const PORT = process.env.PORT || 4000;
const path = require('path');
const upload = require('./middlewares/uploadMiddleware');
const bodyParser = require("body-parser");
const { notFound, errorHandler } = require("./middlewares/errorHandler");
const cors = require("cors");
const authRouter = require('./routes/UserRegistrationRoutes/authRoute');
const { logMiddleware, authMiddleware, isAdmin, isSuperAdmin } = require('./middlewares/authMiddlewares');
const jainAdharRouter = require('./routes/UserRegistrationRoutes/jainAdharRoute');
const friendshipRoutes = require('./routes/SocialMediaRoutes/friendshipRoutes');
const postRoutes = require('./routes/SocialMediaRoutes/postRoutes');
const messageRoutes = require('./routes/SocialMediaRoutes/messageRoutes');
const jainVyaparRoutes = require('./routes/jainVyaparRoutes');
const tirthSanrakshanRoute = require('./routes/TirthSanrakshanRoute');
const sadhuInfoRoutes = require('./routes/sadhuInfoRoutes');
const tirthIdPasswordRoutes = require('./routes/tirthIdPasswordRoutes');
const jainVyaparRoute = require('./routes/JainVyaparIdPassRoutes');
const sadhuRoutes = require('./routes/sadhuRoutes');
const biodataRoutes = require('./routes/biodataRoutes');
const groupChatRoutes = require('./routes/SocialMediaRoutes/groupChatRoutes');
const rojgarRoutes = require('./routes/rojgarRoute');
const reportingRoutes = require('./routes/reportingRoutes');
const suggestionComplaintRoutes = require('./routes/suggestionComplaintRoutes');
const granthRoutes = require('./routes/jainGranthRoutes');
const jainItihasRoutes = require('./routes/jainItihasRoutes');
const storyRoutes = require('./routes/SocialMediaRoutes/storyRoutes');
const notificationRoutes = require('./routes/SocialMediaRoutes/notificationRoutes');
const Story = require('./models/SocialMediaModels/storyModel');
const govtYojanaRoutes = require('./routes/govtYojanaRoutes');
const s3Client = require('./config/s3Config');
const { initializeWebSocket, getIo } = require('./websocket/socket');
const { scheduleStoryCleanup } = require('./jobs/storyCleanupJob');
const hierarchicalSanghRoutes = require('./routes/SanghRoutes/hierarchicalSanghRoute');
const sanghAccessRoutes = require('./routes/SanghRoutes/sanghAccessRoute');
const sanghPostRoutes = require('./routes/SanghRoutes/sanghPostRoutes');
const panchPostRoutes = require('./routes/SanghRoutes/panchPostRoutes');

const sanghRoutes = require('./routes/SanghRoutes/sanghRoute');
// Comment out fee routes
// const feeRoutes = require('./routes/SanghRoutes/feeRoutes');
const panchayatRoutes = require('./routes/SanghRoutes/panchRoutes');
const locationRoutes = require('./routes/locationRoutes');

dbConnect();

// Middleware
app.use(cors({
  origin: "*",  // This allows your React Native app to connect
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(logMiddleware);

// Public routes
app.use("/api/user", authRouter);

// Protected routes (require authentication)
app.use("/api/jain-aadhar", authMiddleware, jainAdharRouter);
app.use("/api/friendship", authMiddleware, friendshipRoutes);
app.use("/api/posts", authMiddleware, postRoutes);
app.use('/api/stories', authMiddleware, storyRoutes);
app.use('/api/notification', authMiddleware, notificationRoutes);
app.use("/api/messages", authMiddleware, messageRoutes);
app.use("/api/group-chats", authMiddleware, groupChatRoutes);

// Admin protected routes
app.use("/api/jainvyapar", [authMiddleware, isAdmin], jainVyaparRoutes);
app.use("/api/tirthsanrakshan", [authMiddleware, isAdmin], tirthSanrakshanRoute);
app.use("/api/sadhuinfo", [authMiddleware, isAdmin], sadhuInfoRoutes);
app.use("/api/tirthidpassword", [authMiddleware, isAdmin], tirthIdPasswordRoutes);
app.use("/api/jainvyaparidpassword", [authMiddleware, isAdmin], jainVyaparRoute);
app.use("/api/sadhu", [authMiddleware, isAdmin], sadhuRoutes);
app.use("/api/biodata", [authMiddleware, isAdmin], biodataRoutes);
app.use("/api/rojgar", [authMiddleware, isAdmin], rojgarRoutes);
app.use("/api/reporting", [authMiddleware, isAdmin], reportingRoutes);
app.use('/api/suggestion-complaint', [authMiddleware, isAdmin], suggestionComplaintRoutes);
app.use("/api/granth", [authMiddleware, isAdmin], granthRoutes);
app.use("/api/jainitihas", [authMiddleware, isAdmin], jainItihasRoutes);
app.use('/api/yojana', [authMiddleware, isAdmin], govtYojanaRoutes);

// For Future
// app.use('/api/sangh', [authMiddleware, isSuperAdmin], sanghRoutes);
// app.use('/api/panch', [authMiddleware, isSuperAdmin], panchayatRoutes);


app.use('/api/hierarchical-sangh', authMiddleware, hierarchicalSanghRoutes);
app.use('/api/sangh-access', authMiddleware, sanghAccessRoutes);
app.use('/api/sangh-posts', authMiddleware, sanghPostRoutes);
app.use('/api/panch', authMiddleware, panchayatRoutes);
app.use('/api/panch-posts', authMiddleware, panchPostRoutes);
app.use('/api/locations', locationRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// Create HTTP server
const server = http.createServer(app);

const io = initializeWebSocket(server);
app.set('socketio', io);

// Start the job scheduler
scheduleStoryCleanup();

// Start server
server.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});