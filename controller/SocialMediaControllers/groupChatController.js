const GroupChat = require('../../model/SocialMediaModels/groupChatModel');
const mongoose = require('mongoose');
const path = require('path');
const { getIo } = require('../../websocket/socket');
const { s3Client, DeleteObjectCommand } = require('../../config/s3Config');
const { successResponse, errorResponse } = require('../../utils/apiResponse');

// 1. Create Group Chat
exports.createGroupChat = async (req, res) => {
  try {
    let { groupName, groupMembers, creator } = req.body;
    let groupImage = req.file ? req.file.location : "";

    if (!groupName) groupName = "New Group";
    if (!groupMembers || !Array.isArray(groupMembers) || groupMembers.length === 0) {
      return errorResponse(res, "At least one group member is required.", 400);
    }

    // Ensure creator is included in group members
    if (!groupMembers.includes(creator)) {
      groupMembers.push(creator);
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

    // Prepare a simplified group object for socket emission
    const groupForSocket = {
      _id: newGroup._id,
      groupName: newGroup.groupName,
      groupImage: newGroup.groupImage,
      creator: newGroup.creator,
      createdAt: newGroup.createdAt
    };

    // Notify all group members
    const io = getIo();
    if (io) {
      console.log(`Notifying ${groupMembers.length} members about new group ${newGroup._id}`);
      
      groupMembers.forEach(memberId => {
        // Emit to each member's personal room
        io.to(memberId.toString()).emit('newGroup', groupForSocket);
        console.log(`Emitted newGroup event to user ${memberId}`);
        
        // Also emit addedToGroup event for better client handling
        io.to(memberId.toString()).emit('addedToGroup', {
          groupId: newGroup._id,
          groupName: newGroup.groupName
        });
      });
    } else {
      console.error('Socket.io instance not available');
    }

    return successResponse(res, newGroup, "Group created successfully", 201);
  } catch (error) {
    console.error('Error creating group chat:', error);
    return errorResponse(res, error.message, 500);
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
      return errorResponse(res, "Group not found", 404);
    }
    return successResponse(res, group, "", 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
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
    
    return successResponse(res, groups, "", 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// 3. Get All Group Chats
exports.getAllGroupChats = async (req, res) => {
  try {
    const groups = await GroupChat.find()
      .populate('groupMembers.user', 'firstName lastName profilePicture')
      .populate('creator', 'firstName lastName profilePicture');
    return successResponse(res, groups, "", 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// 4. Send Group Message
exports.sendGroupMessage = async (req, res) => {
  try {
    const { groupId, sender, message } = req.body;
    
    const group = await GroupChat.findById(groupId)
      .populate('groupMembers.user', 'firstName lastName profilePicture');
      
    if (!group) {
      // Delete uploaded file if group not found
      if (req.file) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: req.file.key
          }));
        } catch (error) {
          console.error('Error deleting file:', error);
        }
      }
      return errorResponse(res, "Group not found", 404);
    }

    // Check if sender is group member
    const isMember = group.groupMembers.some(
      member => member.user._id.toString() === sender.toString()
    );
    
    if (!isMember) {
      // Delete uploaded file if not a member
      if (req.file) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: req.file.key
          }));
        } catch (error) {
          console.error('Error deleting file:', error);
        }
      }
      return errorResponse(res, "Not a group member", 403);
    }

    // Create new message object
    const newMessage = {
      sender,
      message: message || 'Image', // Default text for image-only messages
      attachments: req.file ? [{
        type: 'image',
        url: req.file.location,
        name: req.file.originalname,
        size: req.file.size
      }] : [],
      readBy: [],
      createdAt: new Date()
    };

    // Add message to group
    group.groupMessages.push(newMessage);
    await group.save();

    // Get the last message (the one we just added)
    const sentMessage = group.groupMessages[group.groupMessages.length - 1];
    const senderInfo = group.groupMembers.find(
      member => member.user._id.toString() === sender.toString()
    );

    // Prepare message data for socket emission
    const messageData = {
      groupId,
      message: {
        ...sentMessage.toObject(),
        sender: {
          _id: senderInfo.user._id,
          fullName: `${senderInfo.user.firstName} ${senderInfo.user.lastName}`,
          profilePicture: senderInfo.user.profilePicture
        }
      }
    };

    // Emit to all group members including sender
    const io = getIo();
    if (io) {
      console.log(`Emitting new group message to room group:${groupId}`);
      
      // Emit to the group room
      io.to(`group:${groupId}`).emit('newGroupMessage', messageData);
      
      // Also emit individually to ensure delivery
      group.groupMembers.forEach(member => {
        const memberId = member.user._id.toString();
        io.to(memberId).emit('newGroupMessage', messageData);
        console.log(`Emitted message to group member: ${memberId}`);
      });
    } else {
      console.error('Socket.io instance not available');
    }

    return successResponse(res, {
      ...sentMessage.toObject(),
      sender: {
        _id: senderInfo.user._id,
        fullName: `${senderInfo.user.firstName} ${senderInfo.user.lastName}`,
        profilePicture: senderInfo.user.profilePicture
      }
    }, "Message sent successfully", 200);
  } catch (error) {
    // Delete uploaded file if error occurs
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
    console.error('Send group message error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// 5. Get All Messages for a Group
exports.getGroupMessages = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const userId = req.user._id;
    
    const skip = (page - 1) * limit;

    const group = await GroupChat.findById(groupId)
      .populate({
        path: 'groupMessages.sender',
        select: 'firstName lastName profilePicture'
      })
      .slice('groupMessages', [skip, parseInt(limit)]);

    if (!group) {
      return errorResponse(res, "Group not found", 404);
    }

    // Check if user is a group member
    const isMember = group.groupMembers.some(
      member => member.user.toString() === userId.toString()
    );

    if (!isMember) {
      return errorResponse(res, "Not authorized to view messages", 403);
    }

    // Mark messages as read for this user
    group.groupMessages.forEach(msg => {
      if (!msg.readBy.some(read => read.user.toString() === userId.toString())) {
        msg.readBy.push({ user: userId, readAt: new Date() });
      }
    });
    await group.save();

    // Messages will be automatically decrypted due to schema getter
    const messages = group.groupMessages.map(msg => msg.toObject());

    return successResponse(res, {
      messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: group.groupMessages.length
      }
    }, "", 200);
  } catch (error) {
    console.error('Get group messages error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// 6. Delete Group Message
exports.deleteGroupMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    const userId = req.user._id;

    const group = await GroupChat.findById(groupId);
    if (!group) {
      return errorResponse(res, "Group not found", 404);
    }

    // Find the message
    const messageIndex = group.groupMessages.findIndex(
      msg => msg._id.toString() === messageId
    );

    if (messageIndex === -1) {
      return errorResponse(res, "Message not found", 404);
    }

    const message = group.groupMessages[messageIndex];

    // Check if user is admin or message sender
    const isAdmin = group.admins.includes(userId);
    const isSender = message.sender.toString() === userId.toString();
    
    if (!isAdmin && !isSender) {
      return errorResponse(res, "Not authorized to delete this message", 403);
    }

     // Delete attachments if any
     if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        if (attachment.url) {
          try {
            // Extract key using URL parsing for more reliability
            const url = new URL(attachment.url);
            const key = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;
            
            console.log(`Attempting to delete attachment from S3: ${key}`);
            
            if (!key) {
              console.error('Failed to extract S3 key from URL:', attachment.url);
              continue;
            }
            
            await s3Client.send(new DeleteObjectCommand({
              Bucket: process.env.AWS_BUCKET_NAME,
              Key: key
            }));
            
            console.log(`Successfully deleted attachment from S3: ${key}`);
          } catch (error) {
            console.error('Error deleting attachment:', error.message);
            console.error('Attachment URL:', attachment.url);
          }
        }
      }
    }


    // Remove the message
    group.groupMessages.pull({ _id: messageId });
    await group.save();

    // Notify group members about message deletion
    const io = getIo();
    group.groupMembers.forEach(member => {
      io.to(member.user.toString()).emit('groupMessageDeleted', {
        groupId,
        messageId
      });
    });

    return successResponse(res, "", "Message deleted successfully", 200);
  } catch (error) {
    console.error('Delete group message error:', error);
    return errorResponse(res, error.message, 500);
  }
};

// Update Group Details (Name, Image, Members)
exports.updateGroupDetails = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { groupName, description } = req.body;
    const userId = req.user._id;

    const group = await GroupChat.findById(groupId);
    if (!group) {
      return errorResponse(res, "Group not found", 404);
    }

    // Check if user is admin
    if (!group.admins.includes(userId)) {
      return errorResponse(res, "Only admins can update group details", 403);
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

    return successResponse(res, group, "Group updated successfully", 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Add typing indicator for groups
exports.handleGroupTyping = async (socket, groupId) => {
  try {
    const group = await GroupChat.findById(groupId);
    if (!group) return;

    group.groupMembers.forEach(member => {
      if (member.user.toString() !== socket.userId.toString()) {
        socket.to(member.user.toString()).emit('userTypingInGroup', {
          userId: socket.userId,
          groupId
        });
      }
    });
  } catch (error) {
    console.error('Error handling group typing:', error);
  }
};

// Leave group
exports.leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await GroupChat.findById(groupId);
    if (!group) {
      return errorResponse(res, "Group not found", 404);
    }

    // Check if user is in group
    const isMember = group.groupMembers.some(
      member => member.user.toString() === userId.toString()
    );

    if (!isMember) {
      return errorResponse(res, "You are not a member of this group", 400);
    }

    // Check admin status
    const isAdmin = group.admins.includes(userId);
    if (isAdmin) {
      // If there are other admins, allow leaving
      const otherAdmins = group.admins.filter(adminId => 
        adminId.toString() !== userId.toString()
      );

      if (otherAdmins.length === 0) {
        // If no other admins, make the longest-standing member an admin
        const oldestMember = group.groupMembers
          .filter(member => member.user.toString() !== userId.toString())
          .sort((a, b) => a.joinedAt - b.joinedAt)[0];

        if (oldestMember) {
          group.admins.push(oldestMember.user);
          const memberIndex = group.groupMembers.findIndex(
            m => m.user.toString() === oldestMember.user.toString()
          );
          if (memberIndex !== -1) {
            group.groupMembers[memberIndex].role = 'admin';
          }
        }
      }
    }

    // Remove user from group
    group.groupMembers = group.groupMembers.filter(
      member => member.user.toString() !== userId.toString()
    );
    group.admins = group.admins.filter(
      adminId => adminId.toString() !== userId.toString()
    );

    if (group.groupMembers.length === 0) {
      await group.deleteOne();
      return successResponse(res, "", "Group deleted as no members remain", 200);
    }

    await group.save();

    // Notify other members
    const io = getIo();
    group.groupMembers.forEach(member => {
      io.to(member.user.toString()).emit('groupMemberLeft', {
        groupId,
        userId,
        remainingMembers: group.groupMembers.length
      });
    });

    return successResponse(res, "", "Successfully left the group", 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Update group icon
exports.updateGroupIcon = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    if (!req.file) {
      return errorResponse(res, "No image file provided", 400);
    }

    const group = await GroupChat.findById(groupId);
    if (!group) {
      return errorResponse(res, "Group not found", 404);
    }

    // Check if user is admin
    if (!group.admins.includes(userId)) {
      return errorResponse(res, "Only admins can update group icon", 403);
    }

    // Delete old icon if exists
    if (group.groupImage) {
      const oldKey = group.groupImage.split('.com/')[1]; // Extract key from URL
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: oldKey
        }));
      } catch (deleteError) {
        console.error('Error deleting old icon:', deleteError);
        // Continue with update even if delete fails
      }
    }

    // Update with new icon
    group.groupImage = req.file.location;
    await group.save();

    // Notify members
    const io = getIo();
    group.groupMembers.forEach(member => {
      io.to(member.user.toString()).emit('groupIconUpdated', {
        groupId,
        newIcon: group.groupImage
      });
    });

    return successResponse(res, { groupImage: group.groupImage }, "Group icon updated successfully", 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Check group membership
exports.checkMembership = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user._id;

    const group = await GroupChat.findById(groupId);
    if (!group) {
      return errorResponse(res, "Group not found", 404);
    }

    const isMember = group.groupMembers.some(
      member => member.user.toString() === userId.toString()
    );
    const isAdmin = group.admins.includes(userId);

    return successResponse(res, {
      isMember,
      isAdmin,
      memberCount: group.groupMembers.length
    }, "", 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Add members to group
exports.addMembers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { members } = req.body;
    const userId = req.user._id;

    const group = await GroupChat.findById(groupId);
    if (!group) {
      return errorResponse(res, "Group not found", 404);
    }

    // Check if user is admin
    if (!group.admins.includes(userId)) {
      return errorResponse(res, "Only admins can add members", 403);
    }

    // Filter out existing members
    const newMembers = members.filter(memberId => 
      !group.groupMembers.some(m => m.user.toString() === memberId)
    );

    // Add new members
    group.groupMembers.push(...newMembers.map(memberId => ({
      user: memberId,
      role: 'member'
    })));

    await group.save();

    // Notify new members
    const io = getIo();
    newMembers.forEach(memberId => {
      io.to(memberId.toString()).emit('addedToGroup', {
        groupId: group._id,
        groupName: group.groupName
      });
    });

    return successResponse(res, { addedMembers: newMembers }, "Members added successfully", 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

// Update group name
exports.updateGroupName = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { groupName } = req.body;
    const userId = req.user._id;

    const group = await GroupChat.findById(groupId);
    if (!group) {
      return errorResponse(res, "Group not found", 404);
    }

    // Check if user is admin
    if (!group.admins.includes(userId)) {
      return errorResponse(res, "Only admins can update group name", 403);
    }

    group.groupName = groupName;
    await group.save();

    // Notify members
    const io = getIo();
    group.groupMembers.forEach(member => {
      io.to(member.user.toString()).emit('groupUpdated', {
        groupId: group._id,
        groupName: group.groupName
      });
    });

    return successResponse(res, { groupName: group.groupName }, "Group name updated successfully", 200);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};