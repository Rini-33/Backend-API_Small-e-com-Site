const express = require("express");
const router = express.Router();

const {
  signup,
  login,
  logout,
  forgotPassword,
  resetPassword,
  getUserDetails,
  changePassword,
  updateUserDetails,
  adminGetAllUsers,
  managerGetAllUsers,
  adminGetOneUser,
  adminUpdateOneUserDetails,
  adminDeleteOneUser,
} = require("../controllers/userController");
const { isLoggedIn, customRole } = require("../middlewares/user");

router.route("/signup").post(signup);
router.route("/login").post(login);
router.route("/logout").get(logout);
router.route("/forgotPassword").post(forgotPassword);
router.route("/password/reset/:token").post(resetPassword);
router.route("/userdashboard").get(isLoggedIn, getUserDetails);
router.route("/password/update").post(isLoggedIn, changePassword);
router.route("/userdashboard/update").post(isLoggedIn, updateUserDetails);

/*********ADMIN ROUTES***********/
router
  .route("/admin/users")
  .get(isLoggedIn, customRole("admin"), adminGetAllUsers);

router
  .route("/admin/user/:id")
  .get(isLoggedIn, customRole("admin"), adminGetOneUser)
  .put(isLoggedIn, customRole("admin"), adminUpdateOneUserDetails)
  .delete(isLoggedIn, customRole("admin"), adminDeleteOneUser);

/*********MANAGER ROUTES***********/
router
  .route("/manager/users")
  .get(isLoggedIn, customRole("manager"), managerGetAllUsers);

module.exports = router;
