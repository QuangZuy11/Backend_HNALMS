const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

// Register - Tạo tài khoản mới
exports.register = async (req, res) => {
  try {
    const { username, fullname, email, password, role } = req.body;

    // 1. Validate input
    if (!username || !fullname || !email || !password) {
      return res.status(400).json({
        message: "Username, fullname, email and password are required"
      });
    }

    // 2. Check if user already exists
    const existingEmail = await User.findOne({ email });
    const existingUsername = await User.findOne({ username });
    
    if (existingEmail && existingUsername) {
      return res.status(400).json({
        message: "Email and username already exist"
      });
    }
    
    if (existingEmail) {
      return res.status(400).json({
        message: "Email already exists"
      });
    }
    
    if (existingUsername) {
      return res.status(400).json({
        message: "Username already exists"
      });
    }

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Create new user
    const newUser = new User({
      username,
      fullname,
      email,
      password: hashedPassword,
      role: role || "tenant", // Default role is tenant
      status: "active"
    });

    await newUser.save();

    // 5. Generate JWT
    const token = jwt.sign(
      {
        userId: newUser._id,
        role: newUser.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // 6. Response (không trả về password)
    res.status(201).json({
      message: "Registration successful",
      token,
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        fullname: newUser.fullname,
        role: newUser.role
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validate input
    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    // 2. Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        message: "Email or password is incorrect"
      });
    }

    // 3. Check account status
    if (user.status !== "active") {
      return res.status(403).json({
        message: "Account is not active"
      });
    }

    // 4. Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Email or password is incorrect"
      });
    }

    // 5. Generate JWT
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // 6. Response
    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        fullname: user.fullname,
        role: user.role
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};