require('dotenv').config();
const jwt = require('jsonwebtoken');

// Get token from command line argument
const token = process.argv[2];

if (!token) {
  console.error('❌ Please provide a token as argument');
  console.log('Usage: node decode-token.js <token>');
  process.exit(1);
}

// Remove "Bearer " prefix if present
const cleanToken = token.replace(/^Bearer\s+/i, '');

try {
  // Decode without verification first to see what's inside
  const decodedWithoutVerify = jwt.decode(cleanToken);
  console.log('\n=== TOKEN DECODED (without verification) ===');
  console.log(JSON.stringify(decodedWithoutVerify, null, 2));
  
  // Now verify with secret
  const JWT_SECRET = process.env.JWT_SECRET || "your_secret_key";
  const decoded = jwt.verify(cleanToken, JWT_SECRET);
  
  console.log('\n=== TOKEN VERIFIED ===');
  console.log('userId:', decoded.userId);
  console.log('userId type:', typeof decoded.userId);
  console.log('role:', decoded.role);
  console.log('Full decoded:', JSON.stringify(decoded, null, 2));
  
  // Check if userId is a valid ObjectId
  const mongoose = require("mongoose");
  const isValidObjectId = mongoose.Types.ObjectId.isValid(decoded.userId);
  console.log('\n=== VALIDATION ===');
  console.log('Is valid ObjectId?', isValidObjectId);
  console.log('userId length:', decoded.userId?.length);
  
} catch (error) {
  console.error('\n❌ Error decoding token:', error.message);
  if (error.name === 'JsonWebTokenError') {
    console.error('Token is invalid or malformed');
  } else if (error.name === 'TokenExpiredError') {
    console.error('Token has expired');
  }
  process.exit(1);
}
