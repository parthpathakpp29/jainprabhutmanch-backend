const Message = require('../../model/SocialMediaModels/messageModel');
const User = require('../../model/UserRegistrationModels/userModel');
const { getIo } = require('../../websocket/socket');

// Create a new message
exports.createMessage = async (req, res) => {
  try {
    const { sender, receiver, message } = req.body;
    
    // Validate message
    if (!message || message.trim() === "") {
      return res.status(400).json({ 
        success: false,
        message: 'Message cannot be empty' 
      });
    }

    // Verify sender matches authenticated user
    if (sender !== req.user._id.toString()) {
      return res.status(403).json({ 
        success: false,
        message: 'Sender ID must match authenticated user' 
      });
    }

    const senderUser = await User.findById(sender);
    const receiverUser = await User.findById(receiver);
    
    if (!senderUser || !receiverUser) {
      return res.status(400).json({ 
        success: false,
        message: 'Sender or receiver not found',
        details: {
          senderFound: !!senderUser,
          receiverFound: !!receiverUser
        }
      });
    }

    const newMessage = new Message({
      sender,
      receiver,
      message,
      createdAt: new Date(),
    });
    
    await newMessage.save();

    // Emit real-time message event
    const io = getIo();
    io.to(receiver.toString()).emit('newMessage', {
      message: newMessage,
      sender: {
        _id: senderUser._id,
        fullName: senderUser.fullName,
        profilePicture: senderUser.profilePicture
      }
    });

    res.status(201).json({ 
      success: true,
      message: 'Message sent successfully', 
      data: newMessage 
    });
  } catch (error) {
    console.error('Message creation error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error sending message', 
      error: error.message 
    });
  }
};

// Get messages between sender and receiver with pagination
exports.getMessages = async (req, res) => {
  try {
    const { sender, receiver, page = 1, limit = 20 } = req.query;
    
    if (!sender || !receiver) {
      return res.status(400).json({ message: 'Sender and receiver are required' });
    }

    const skip = (page - 1) * limit;

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

    // Emit read receipt
    const io = getIo();
    io.to(receiver.toString()).emit('messagesRead', { sender, receiver });

    res.status(200).json({
      message: 'Messages retrieved successfully',
      data: messages.reverse(),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error retrieving messages', error });
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
    res.status(200).json({ messages });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching messages', error });
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
      return res.status(404).json({ message: 'Message not found' });
    }
    res.status(200).json({ message });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching message', error });
  }
};

// Delete message
exports.deleteMessageById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(id);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Verify message ownership
    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'You can only delete your own messages' });
    }

    await message.deleteOne();

    // Notify other user about message deletion
    const io = getIo();
    io.to(message.receiver.toString()).emit('messageDeleted', { messageId: id });

    res.status(200).json({ message: 'Message deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting message', error: error.message });
  }
};

// Get unread messages count
exports.getUnreadMessagesCount = async (req, res) => {
  try {
    const { userId } = req.params;
    const count = await Message.countDocuments({
      receiver: userId,
      isRead: false
    });
    res.status(200).json({ unreadCount: count });
  } catch (error) {
    res.status(500).json({ message: 'Error getting unread count', error });
  }
};

// Send image message
exports.sendImageMessage = async (req, res) => {
  try {
    const { sender, receiver } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No image file provided' });
    }

    const senderUser = await User.findById(sender);
    const receiverUser = await User.findById(receiver);
    
    if (!senderUser || !receiverUser) {
      return res.status(400).json({ message: 'Sender or receiver not found' });
    }

    const newMessage = new Message({
      sender,
      receiver,
      message: 'Image', // Default text for image messages
      attachments: [{
        type: 'image',
        url: req.file.location,
        name: req.file.originalname,
        size: req.file.size
      }],
      createdAt: new Date(),
    });

    await newMessage.save();

    // Emit real-time message event
    const io = getIo();
    io.to(receiver.toString()).emit('newMessage', {
      message: newMessage,
      sender: {
        _id: senderUser._id,
        fullName: senderUser.fullName,
        profilePicture: senderUser.profilePicture
      }
    });

    res.status(201).json({ 
      message: 'Image sent successfully', 
      data: newMessage 
    });
  } catch (error) {
    console.error('Error sending image:', error);
    res.status(500).json({ 
      message: 'Error sending image', 
      error: error.message 
    });
  }
};