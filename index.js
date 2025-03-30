const express = require("express");
const http = require("http");
const dbConnect = require("./config/dbConnect");
const app = express();
const helmet = require('helmet');
const dotenv = require("dotenv").config();
const PORT = process.env.PORT || 4000;
const path = require('path');
const upload = require('./middlewares/uploadMiddleware');
const bodyParser = require("body-parser");
const { notFound, errorHandler } = require("./middlewares/errorHandler");
const cors = require("cors");
const session = require('express-session');
const authRouter = require('./routes/UserRegistrationRoutes/authRoute');
const { logMiddleware, authMiddleware, isAdmin, isSuperAdmin } = require('./middlewares/authMiddlewares');
const jainAdharRouter = require('./routes/UserRegistrationRoutes/jainAdharRoute');
const friendshipRoutes = require('./routes/SocialMediaRoutes/friendshipRoutes');
const postRoutes = require('./routes/SocialMediaRoutes/postRoutes');
const messageRoutes = require('./routes/SocialMediaRoutes/messageRoutes');
const biodataRoutes = require('./routes/biodataRoutes');
const groupChatRoutes = require('./routes/SocialMediaRoutes/groupChatRoutes');
const rojgarRoutes = require('./routes/rojgarRoute');
const reportingRoutes = require('./routes/reportingRoutes');
const suggestionComplaintRoutes = require('./routes/suggestionComplaintRoutes');
const granthRoutes = require('./routes/jainGranthRoutes');
const jainItihasRoutes = require('./routes/jainItihasRoutes');
const storyRoutes = require('./routes/SocialMediaRoutes/storyRoutes');
const notificationRoutes = require('./routes/SocialMediaRoutes/notificationRoutes');
const govtYojanaRoutes = require('./routes/govtYojanaRoutes');
const { initializeWebSocket, getIo } = require('./websocket/socket');
const { scheduleStoryCleanup } = require('./jobs/storyCleanupJob');
const hierarchicalSanghRoutes = require('./routes/SanghRoutes/hierarchicalSanghRoute');
const sanghPostRoutes = require('./routes/SanghRoutes/sanghPostRoutes');
const panchPostRoutes = require('./routes/SanghRoutes/panchPostRoutes');
const panchRoutes = require('./routes/SanghRoutes/panchRoutes');

// Import JainVyapar routes
const vyaparRoutes = require('./routes/VyaparRoutes/vyaparRoutes');
const vyaparPostRoutes = require('./routes/VyaparRoutes/vyaparPostRoutes');

const locationRoutes = require('./routes/locationRoutes');

// Import Tirth routes
const tirthRoutes = require('./routes/TirthRoutes/tirthRoutes');
const tirthPostRoutes = require('./routes/TirthRoutes/tirthPostRoutes');

const sadhuRoutes = require('./routes/SadhuRoutes/sadhuRoutes');
const sadhuPostRoutes = require('./routes/SadhuRoutes/sadhuPostRoutes');

dbConnect();

app.use(helmet());
// Middleware
app.use(cors({
  origin: "*",
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(logMiddleware);

// Session configuration for payment flow
app.use(session({
  secret: process.env.SESSION_SECRET || 'jainprabhutmanch-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

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

// JainVyapar routes
app.use("/api/vyapar", authMiddleware, vyaparRoutes);
app.use("/api/vyapar/posts", authMiddleware, vyaparPostRoutes);

// Tirth routes
app.use('/api/tirth', authMiddleware, tirthRoutes);
app.use('/api/tirth/posts', authMiddleware, tirthPostRoutes);

// Sangh routes
app.use('/api/hierarchical-sangh', hierarchicalSanghRoutes);
app.use('/api/sangh-posts', sanghPostRoutes);
app.use('/api/panch/',panchRoutes)
app.use('/api/panch-posts', panchPostRoutes);
app.use('/api/location', locationRoutes);

// Sadhu routes
app.use('/api/sadhu', sadhuRoutes);
app.use('/api/sadhu/posts', sadhuPostRoutes);

// Admin protected routes
app.use("/api/biodata", biodataRoutes);
app.use("/api/rojgar", rojgarRoutes);
app.use("/api/reporting", reportingRoutes);
app.use('/api/suggestion-complaint', suggestionComplaintRoutes);
app.use("/api/granth", [authMiddleware, isAdmin], granthRoutes);
app.use("/api/jainitihas", [authMiddleware, isAdmin], jainItihasRoutes);
app.use('/api/yojana', [authMiddleware, isAdmin], govtYojanaRoutes);
app.use('/api/pricing', require('./routes/PaymentRoutes/pricingRoutes'));

// Error handling
app.use(notFound);
app.use(errorHandler);

// Initialize WebSocket
const server = http.createServer(app);
initializeWebSocket(server);

// Schedule story cleanup job
scheduleStoryCleanup();

server.listen(PORT, () => {
    console.log(`Server is running at PORT ${PORT}`);
});

module.exports = { app, server };