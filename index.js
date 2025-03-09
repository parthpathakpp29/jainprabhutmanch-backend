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
const { logMiddleware } = require('./middlewares/authMiddlewares');
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

const sanghRoutes = require('./routes/SanghRoutes/sanghRoute');
// Comment out fee routes
// const feeRoutes = require('./routes/SanghRoutes/feeRoutes');
const panchayatRoutes = require('./routes/SanghRoutes/panchRoutes');

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

// Routes
app.use("/api/user", authRouter);
app.use("/api/jain-aadhar", jainAdharRouter);
app.use("/api/friendship", friendshipRoutes);
app.use("/api/posts", postRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/notification', notificationRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/group-chats", groupChatRoutes); 
app.use("/api/jainvyapar", jainVyaparRoutes);
app.use("/api/tirthsanrakshan", tirthSanrakshanRoute);
app.use("/api/sadhuinfo", sadhuInfoRoutes);

app.use("/api/tirthidpassword", tirthIdPasswordRoutes);
app.use("/api/jainvyaparidpassword", jainVyaparRoute);
app.use("/api/sadhu", sadhuRoutes);
app.use("/api/biodata", biodataRoutes);
app.use("/api/rojgar", rojgarRoutes);
app.use("/api/reporting", reportingRoutes);
app.use('/api/suggestion-complaint', suggestionComplaintRoutes);
app.use("/api/granth", granthRoutes);
app.use("/api/jainitihas", jainItihasRoutes);
app.use('/api/yojana', govtYojanaRoutes);
app.use('/api/sangh', sanghRoutes);
// Comment out fee routes
// app.use('/api/fees', feeRoutes);
app.use('/api/panch', panchayatRoutes);

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