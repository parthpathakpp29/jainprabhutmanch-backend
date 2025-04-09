const Message = require('../../models/SocialMediaModels/messageModel');
const User = require('../../models/UserRegistrationModels/userModel');
const Conversation = require('../../models/SocialMediaModels/conversationModel');
const { getIo } = require('../../websocket/socket');
const { s3Client, DeleteObjectCommand } = require('../../config/s3Config');
const { successResponse, errorResponse } = require('../../utils/apiResponse');
const { getOrSetCache,invalidateCache,invalidatePattern } = require('../../utils/cache');
const { getUserStatus } = require('../../websocket/socket');
const { convertS3UrlToCDN } = require('../../utils/s3Utils');



exports.createMessage = async (req, res) => {
  try {
    // Trim the sender and receiver IDs to remove any extra spaces
    const sender = req.body.sender.trim();
    const receiver = req.body.receiver.trim();
    const message = req.body.message;
    
    // Check if there's either a message or an image
    if (!message && !req.file) {
      return errorResponse(res, 'Message or image is required', 400);
    }

    const senderUser = await User.findById(sender);
    const receiverUser = await User.findById(receiver);
    
    if (!senderUser || !receiverUser) {
      // Delete uploaded file if users not found
      if (req.file) {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: req.file.key
        }));
      }
      return errorResponse(res, 'Sender or receiver not found', 400);
    }

    const conversationCacheKey = `conversation:${sender}:${receiver}`;
    // Find or create conversation
    let conversation = await getOrSetCache(conversationCacheKey, async () => {
      return await Conversation.findOne({
        participants: { $all: [sender, receiver] }
      });
    }, 300);
    

    if (!conversation) {
      conversation = new Conversation({
        participants: [sender, receiver]
      });
      await conversation.save();
    }

    // Create message object - encryption happens automatically via schema middleware
    const messageData = {
      sender,
      receiver,
      conversation: conversation._id,
      message: message || 'Image', // Default text for image-only messages
      attachments: req.file ? [{
        type: 'image',
        url: convertS3UrlToCDN(req.file.location),
        name: req.file.originalname,
        size: req.file.size
      }] : [],
      
      createdAt: new Date()
    };

    const newMessage = new Message(messageData);
    await newMessage.save();

    // Update conversation
    conversation.messages.push(newMessage._id);
    conversation.lastMessage = newMessage._id;
    await conversation.save();

    await invalidateCache(`conversation:${sender}:${receiver}`);
await invalidateCache(`conversation:${receiver}:${sender}`); 

    // Get decrypted message for socket emission
    const decryptedMessage = newMessage.decryptedMessage;

    // Emit real-time message event with decrypted message
    const io = getIo();
    io.to(receiver.toString()).emit('newMessage', {
      message: {
        ...newMessage.toObject(),
        message: decryptedMessage // Send decrypted message in real-time
      },
      sender: {
        _id: senderUser._id,
        fullName: `${senderUser.firstName} ${senderUser.lastName}`,
        profilePicture: senderUser.profilePicture
      }
    });
   



    return successResponse(res, {
      ...newMessage.toObject(),
      message: decryptedMessage // Send decrypted message in response
    }, 'Message sent successfully', 201);
  } catch (error) {
    // Delete uploaded file if message creation fails
    if (req.file) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: req.file.key
        }));
      } catch (deleteError) {
        console.error('Error deleting file:', deleteError);
      }
    }
    console.error('Message creation error:', error);
    return errorResponse(res, 'Error sending message', 500, error.message);
  }
};

exports.deleteMessageById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(id);
    if (!message) {
      return errorResponse(res, 'Message not found', 404);
    }

    // Verify message ownership
    if (message.sender.toString() !== userId.toString()) {
      return errorResponse(res, 'You can only delete your own messages', 403);
    }

    // Delete image from S3 if exists
    if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        if (attachment.url) {
          const key = extractS3KeyFromUrl(attachment.url); // Use the utility function
          if (key) {
            await s3Client.send(new DeleteObjectCommand({
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: key
            }));
          }
        }
      }
    }

    await message.deleteOne();
    const sender = message.sender.toString();
    const receiver = message.receiver.toString();
   

    // Notify other user about message deletion
    const io = getIo();
    io.to(message.receiver.toString()).emit('messageDeleted', { 
      messageId: id
    });

    return successResponse(res, null, 'Message deleted successfully', 200);
  } catch (error) {
    return errorResponse(res, 'Error deleting message', 500, error.message);
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { sender, receiver, page = 1, limit = 20 } = req.query;

    if (!sender || !receiver) {
      return errorResponse(res, 'Sender and receiver are required', 400);
    }

    const skip = (page - 1) * limit;
    const cacheKey = `messages:${sender}:${receiver}:page:${page}:limit:${limit}`;

    const result = await getOrSetCache(cacheKey, async () => {
      const messages = await Message.find({
        $or: [
          { sender, receiver },
          { sender: receiver, receiver: sender },
        ],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('sender', 'fullName profilePicture')
        .populate('receiver', 'fullName profilePicture');

      // Mark messages as read
      await Message.updateMany(
        { sender: receiver, receiver: sender, isRead: false },
        { isRead: true }
      );

      return {
        messages: messages.reverse(), // chronological order
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        }
      };
    }, 180); // TTL 3 mins

    // Emit read receipt (optional, keep if needed)
    const io = getIo();
    io.to(receiver.toString()).emit('messagesRead', { sender, receiver });

  
    const senderStatus = getUserStatus(sender);
    const receiverStatus = getUserStatus(receiver);

    result.participants = {
      [sender]: senderStatus,
      [receiver]: receiverStatus
    };
    await invalidateCache(`unreadCount:${sender}`);

    return successResponse(res, result, 'Messages retrieved successfully', 200);
  } catch (error) {
    return errorResponse(res, 'Error retrieving messages', 500, error);
  }
};


// Get all messages for a user
exports.getAllMessages = async (req, res) => {
  try {
    const userId = req.params.userId;
    const messages = await Message.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .populate('sender', 'fullName profilePicture') 
      .populate('receiver', 'fullName profilePicture')
      .sort({ createdAt: -1 });
    return successResponse(res, messages, 'Messages retrieved successfully', 200);
  } catch (error) {
    return errorResponse(res, 'Error fetching messages', 500, error);
  }
};

// Get message by ID
exports.getMessageById = async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId)
      .populate('sender', 'fullName profilePicture')
      .populate('receiver', 'fullName profilePicture');

    if (!message) {
      return errorResponse(res, 'Message not found', 404);
    }
    return successResponse(res, message, 'Message retrieved successfully', 200);
  } catch (error) {
    return errorResponse(res, 'Error fetching message', 500, error);
  }
};

// Get unread messages count
exports.getUnreadMessagesCount = async (req, res) => {
  try {
    const { userId } = req.params;
    const count = await getOrSetCache(`unreadCount:${userId}`, async () => {
      return await Message.countDocuments({
        receiver: userId,
        isRead: false
      });
    }, 60);
    return successResponse(res, { unreadCount: count }, 'Unread count retrieved successfully', 200);
  } catch (error) {
    return errorResponse(res, 'Error getting unread count', 500, error);
  }
};

// Add to messageController.js
exports.getConversations = async (req, res) => {
  try {
    const userId = req.params.userId;
    const cacheKey = `conversations:${userId}`;
    
    const conversations = await getOrSetCache(cacheKey, async () => {
      return await Conversation.find({
        participants: userId
      })
      .populate('participants', 'fullName profilePicture')
      .sort({ updatedAt: -1 });
    }, 60); // Cache for 1 minute
    if (!conversations || conversations.length === 0) {
      return errorResponse(res, 'No conversations found', 404);
    }
    
    return successResponse(res, conversations, 'Conversations retrieved', 200);
  } catch (error) {
    return errorResponse(res, 'Error fetching conversations', 500, error);
  }
};