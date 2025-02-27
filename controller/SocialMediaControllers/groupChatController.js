const GroupChat = require('../../model/SocialMediaModels/groupChatModel');
const mongoose = require('mongoose');
const path = require('path');
const { getIo } = require('../../websocket/socket');

// 1. Create Group Chat
exports.createGroupChat = async (req, res) => {
  try {
    let { groupName, groupMembers, creator } = req.body;
    let groupImage = req.file ? req.file.location : "";

    if (!groupName) groupName = "New Group";
    if (!groupMembers || !Array.isArray(groupMembers) || groupMembers.length === 0) {
      return res.status(400).json({ message: "At least one group member is required." });
    }

    const newGroup = new GroupChat({
      groupName,
      groupMembers: groupMembers.map(memberId => ({
        user: memberId,
        role: memberId === creator ? 'admin' : 'member'
      })),
      groupImage,
      creator,
      admins: [creator]
    });
    await newGroup.save();

    // Notify all group members
    const io = getIo();
    groupMembers.forEach(memberId => {
      io.to(memberId.toString()).emit('newGroup', newGroup);
    });

    res.status(201).json({ message: "Group created successfully", group: newGroup });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;
    const group = await GroupChat.findById(groupId)
      .populate('groupMembers.user', 'firstName lastName profilePicture')
      .populate('creator', 'firstName lastName profilePicture')
      .populate('admins', 'firstName lastName profilePicture');

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }
    res.status(200).json({ group });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 2. Get All Groups for a User
exports.getAllGroups = async (req, res) => {
  try {
    const userId = req.user._id;
    const groups = await GroupChat.find({
      'groupMembers.user': userId
    })
    .populate('groupMembers.user', 'firstName lastName profilePicture')
    .populate('creator', 'firstName lastName profilePicture');
    
    res.status(200).json({ groups });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 3. Get All Group Chats
exports.getAllGroupChats = async (req, res) => {
  try {
    const groups = await GroupChat.find()
      .populate('groupMembers.user', 'firstName lastName profilePicture')
      .populate('creator', 'firstName lastName profilePicture');
    res.status(200).json({ groups });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 4. Send Group Message
exports.sendGroupMessage = async (req, res) => {
  try {
    const { groupId, sender, message } = req.body;
    
    const group = await GroupChat.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const newMessage = {
      sender,
      message,
      attachments: req.file ? [{
        type: 'image',
        url: req.file.location,
        name: req.file.originalname,
        size: req.file.size
      }] : [],
      createdAt: new Date()
    };

    group.groupMessages.push(newMessage);
    await group.save();

    // Emit message to all group members
    const io = getIo();
    group.groupMembers.forEach(member => {
      if (member.user.toString() !== sender.toString()) {
        io.to(member.user.toString()).emit('newGroupMessage', {
          groupId,
          message: newMessage
        });
      }
    });

    res.status(200).json({ message: "Message sent successfully", group });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 5. Get All Messages for a Group
exports.getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const skip = (page - 1) * limit;

    const group = await GroupChat.findById(groupId)
      .populate('groupMessages.sender', 'firstName lastName profilePicture')
      .slice('groupMessages', [skip, parseInt(limit)]);

    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    res.status(200).json({
      messages: group.groupMessages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 6. Delete Group Message
exports.deleteGroupMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    const userId = req.user._id;

    const group = await GroupChat.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    const message = group.groupMessages.id(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Check if user is admin or message sender
    const isAdmin = group.admins.includes(userId);
    const isSender = message.sender.toString() === userId.toString();
    
    if (!isAdmin && !isSender) {
      return res.status(403).json({ message: "Not authorized to delete this message" });
    }

    message.remove();
    await group.save();

    // Notify group members about message deletion
    const io = getIo();
    group.groupMembers.forEach(member => {
      io.to(member.user.toString()).emit('groupMessageDeleted', {
        groupId,
        messageId
      });
    });

    res.status(200).json({ message: "Message deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ✅ Update Group Details (Name, Image, Members)
exports.updateGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { groupName, description } = req.body;
    const userId = req.user._id;

    const group = await GroupChat.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found" });
    }

    // Check if user is admin
    if (!group.admins.includes(userId)) {
      return res.status(403).json({ message: "Only admins can update group details" });
    }

    if (groupName) group.groupName = groupName;
    if (description) group.description = description;
    if (req.file) {
      group.groupImage = req.file.location;
    }

    await group.save();

    // Notify group members about update
    const io = getIo();
    group.groupMembers.forEach(member => {
      io.to(member.user.toString()).emit('groupUpdated', {
        groupId,
        groupName: group.groupName,
        groupImage: group.groupImage,
        description: group.description
      });
    });

    res.status(200).json({ message: "Group updated successfully", group });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};