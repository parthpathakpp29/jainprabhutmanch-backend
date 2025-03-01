const jwt = require('jsonwebtoken');

const generateToken = (user) => {
  return jwt.sign(
    {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName
    },
    process.env.JWT_SECRET
    // No expiresIn option = token never expires
  );
};

module.exports = { generateToken };