const User = require("../models/user");
const BigPromise = require("../middlewares/bigPromise");
const CustomError = require("../utils/customError");
const cookieToken = require("../utils/cookieToken");
const fileUpload = require("express-fileupload");
const cloudinary = require("cloudinary");
const mailHelper = require("../utils/emailHelper");
const crypto = require("crypto");

exports.signup = BigPromise(async (req, res, next) => {
  if (!req.files) {
    return next(new CustomError("photo is required for signup", 400));
  }
  const { name, email, password } = req.body;

  if (!email || !name || !password) {
    return next(
      new CustomError("Name , Email and password are mandatory", 400)
    );
  }
  let file = req.files.photo;
  const result = await cloudinary.v2.uploader.upload(file.tempFilePath, {
    folder: "users",
    width: 150,
    crop: "scale",
  });

  const user = await User.create({
    name,
    email,
    password,
    photo: {
      id: result.public_id,
      secure_url: result.secure_url,
    },
  });

  cookieToken(user, res);
});

exports.login = BigPromise(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return next(new CustomError("please provide email and password"));
  }

  //bydefault for password in our model -> select: false, hence we need to explicitly mention so that we get the password and we can compare it
  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    return next(
      new CustomError("You are not registered, please signup first", 400)
    );
  }

  const isPasswordCorrect = await user.isEnteredPasswordCorrect(password);

  if (!isPasswordCorrect) {
    return next(new CustomError("Wrong password"));
  }
  cookieToken(user, res);
});

exports.logout = BigPromise(async (req, res, next) => {
  res.cookie("token", null, {
    expires: new Date(Date.now()),
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
});

exports.forgotPassword = BigPromise(async (req, res, next) => {
  const { email } = req.body;

  const user = await User.findOne({ email });

  console.log(user);
  if (!user) {
    return next(new CustomError("Email not found as registered", 400));
  }

  const forgotToken = user.getForgotPasswordToken();
  // validates the mongoose object before persisting it to database
  await user.save({ validateBeforeSave: false });

  const myUrl = `${req.protocol}://${req.get(
    "host"
  )}/api/v1/password/reset/${forgotToken}`;

  const message = `Copy paste this link in your browser and hit enter \n\n ${myUrl}`;

  try {
    await mailHelper({
      email: user.email,
      subject: "Password reset email",
      message,
    });

    res.status(200).json({
      success: true,
      message: "Email sent successfully",
    });
  } catch (error) {
    console.log(`Failed to send email ${error}`);
    user.forgotPasswordToken = undefined;
    user.forgotPasswordExpiry = undefined;
    await user.save({ validateBeforeSave: false });

    return next(new CustomError(error.message, 500));
  }
});

exports.resetPassword = BigPromise(async (req, res, next) => {
  const token = req.params.token;

  const encryptToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    encryptToken,
    forgotPasswordExpiry: { $gt: Date.now() },
  });
  if (!user) {
    return next(new CustomError("Token is either invalid or expired", 400));
  }

  if (req.body.password !== req.body.confirmPassword) {
    return next(
      new CustomError("Password and conifrm password does not match", 400)
    );
  }

  user.password = req.body.password;
  user.forgotPasswordToken = undefined;
  user.forgotPasswordExpiry = undefined;

  await user.save();

  cookieToken(user, res);
});

exports.getUserDetails = BigPromise(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  res.status(200).json({
    success: true,
    user,
  });
});

exports.changePassword = BigPromise(async (req, res, next) => {
  const userId = req.user.id;
  const user = await User.findById(userId).select("+password");

  const isEnteredOldPasswordCorrect = await user.isEnteredPasswordCorrect(
    req.body.oldPassword
  );
  if (!isEnteredOldPasswordCorrect) {
    return next(new CustomError("Old password is incorrect", 400));
  }

  user.password = req.body.password;
  await user.save();

  cookieToken(user, res);
});

exports.updateUserDetails = BigPromise(async (req, res, next) => {
  //assuming all the data no matter we want to update or not will be coming from the frontend
  const { name, email } = req.body;

  if (!name || !email) {
    return next(new CustomError("Name and email are mandatory", 400));
  }

  const newData = {
    name: name,
    email: email,
  };

  if (req.files && req.files.photo !== "") {
    //delete the previous photo and upload the new one
    const user = await User.findById(req.user.id);
    const imageId = user.photo.id;
    const resp = await cloudinary.v2.uploader.destroy(imageId);

    const result = await cloudinary.v2.uploader.upload(
      req.files.photo.tempFilePath,
      {
        folder: "users",
        width: 150,
        crop: "scale",
      }
    );

    newData.photo = {
      id: result.public_id,
      secure_url: result.secure_url,
    };
  }
  const user = await User.findByIdAndUpdate(req.user.id, newData, {
    new: true, //it indicates that we wnat the updated user object
    runValidators: true,
    useFindAndModify: false,
  });

  res.status(200).json({
    success: true,
  });
});

/*********ADMIN CONTROLLER***********/

exports.adminGetAllUsers = BigPromise(async (req, res, next) => {
  const users = await User.find();

  res.status(200).json({
    success: true,
    users,
  });
});

exports.adminGetOneUser = BigPromise(async (req, res, next) => {
  const id = req.params.id;
  const user = await User.findById(id);

  if (!user) {
    return next(new CustomError("No user found", 400));
  }
  res.status(200).json({
    success: true,
    user,
  });
});

exports.adminUpdateOneUserDetails = BigPromise(async (req, res, next) => {
  //assuming all the data no matter we want to update or not will be coming from the frontend
  const { name, email, role } = req.body;

  if (!name || !email) {
    return next(new CustomError("Name and email are mandatory", 400));
  }

  const newData = {
    name: name,
    email: email,
    role: role,
  };

  const user = await User.findByIdAndUpdate(req.params.id, newData, {
    new: true,
    runValidators: true,
    useFindAndModify: false,
  });

  res.status(200).json({
    success: true,
    user,
  });
});

exports.adminDeleteOneUser = BigPromise(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  console.log(user);

  if (!user) {
    return next(new CustomError("No such user found", 401));
  }

  const imageId = user.photo.id;
  await cloudinary.v2.uploader.destroy(imageId);

  await user.remove();
  res.status(200).json({
    success: true,
  });
});

/**********MANAGER CONTROLLER**********/
exports.managerGetAllUsers = BigPromise(async (req, res, next) => {
  const users = await User.find({ role: "user" });

  res.status(200).json({
    success: true,
    users,
  });
});
