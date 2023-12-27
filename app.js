//jshint esversion:6
require("dotenv").config();
const { request, response } = require("express");
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const findOrCreate = require("mongoose-findorcreate");
const nodemailer = require("nodemailer");
const _ = require("lodash");
const { format } = require("date-fns");
const PDFDocument = require("./pdfkit-tables");
const multer = require("multer");
const path = require("path");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const fs = require("fs");
const pdfTable = require("pdfkit-table");
const { el } = require("date-fns/locale");

const app = express();

var http = require("http").Server(app);
var io = require("socket.io")(http);

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));
app.use("/abstracts", express.static("abstracts"));
app.set("view engine", "ejs");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(
  session({
    secret: "Our Little Secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

//Connecting to DB
main().catch((err) => console.log(err));

async function main() {
  await mongoose.connect(process.env.MONGODB);
}

var db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", function () {
  console.log("We are connected");
});

const messageSchema = new mongoose.Schema({
  sender_name: String,
  sender_email: String,
  message: String,
  time: Date,
});
// const Message = mongoose.model("Message", messageSchema);

const notificationSchema = new mongoose.Schema({
  sender: String,
  conferenceName: String,
  notification: String,
  time: Date,
});
// const Notification = mongoose.model("Notification",notificationSchema);

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  role: String,
  title: String,
  themes: String,
  prefix: String,
  first_name: String,
  last_name: String,
  designation: String,
  institution: String,
  phone: Number,
  gender: String,
  researcher: String,
  dob: Date,
  address: String,
  city: String,
  state: String,
  zip: Number,
  country: String,
  presenter: String,
  coauthor: String,
  abstractFileLocation: String,
  uploadedDocLocation: [String],
  conference_name: [String],
  status: String,
  payment: String,
  amountCurrency: String,
  amountPaid: Number,
  paymentId: String,
  paymentTime: Date,
  orderId: String,
  orderSignature: String,
  support_chat: [messageSchema],
  isSolved: Boolean,
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, cb) {
  process.nextTick(function () {
    return cb(null, {
      id: user.id,
      username: user.username,
      picture: user.picture,
    });
  });
});

passport.deserializeUser(function (user, cb) {
  process.nextTick(function () {
    return cb(null, user);
  });
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "abstracts/");
  },
  filename: function (req, file, cb) {
    const FileName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const Extension = path.extname(file.originalname);
    cb(null, FileName + Extension);
  },
});

const fileFilter = (req, file, cb) => {
  // Check file type, allow only PDF
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"), false);
  }
};

const storageUserDoc = multer.diskStorage({
  destination: function (req, file, cb) {
    // console.log(req);
    const fileUploadLocation = "uploads/";
    cb(null, fileUploadLocation);
  },
  filename: function (req, file, cb) {
    const FileName = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const Extension = path.extname(file.originalname);
    cb(null, FileName + Extension);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB file size limit
});

const uploadDocument = multer({ storage: storageUserDoc });

const conferenceSchema = {
  conf_title: String,
  name: String,
  web_page: String,
  venue: String,
  city: String,
  region: String,
  num_submission: Number,
  first_day: Date,
  last_day: Date,
  fee: Number,
  feeCurrency: String,
  created_by: userSchema,
  users: [userSchema],
  group_chat: [messageSchema],
  notification: [notificationSchema],
};
const Conference = mongoose.model("Conference", conferenceSchema);

//Sending Mails
let mailTransporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  auth: {
    user: process.env.MAILID,
    pass: process.env.MAILPASS,
  },
});
function sendEmail(to, subject, text) {
  let mailDetails = {
    from: {
      name: "Conference Management Portal | IITR",
      address: process.env.MAILID,
    },
    to: to,
    subject: subject,
    text: text,
  };
  mailTransporter.sendMail(mailDetails, function (err, data) {
    if (err) {
      console.log("Error Occurs", err);
    } else {
      // console.log("Email sent successfully");
    }
  });
}

app.get("/sendmail/:mailId", function (req, res) {
  var text = "This is Testing Email via get request";
  sendEmail(req.params.mailId, "Testing Mail Via Get Method", text);
  res.send("Mail Sent Successfully");
});

app.get("/", async function (req, res) {
  if (req.isAuthenticated()) {
    const userName = req.user.username;
    const user = await User.findOne({ username: userName });
    if (user.role === "admin") {
      res.redirect("/admindashboard");
    } else if (user.role === "venuehead") {
      res.redirect("/venuedashboard");
    } else if (user.role === "vehiclehead") {
      res.redirect("/vehicledashboard");
    } else if (user.role === "guesthousehead") {
      res.redirect("/guesthousedashboard");
    } else if (user.role === "user") {
      res.redirect("/dashboard");
    }
  } else res.render("home");
});

app.get("/dashboard", function (req, res) {
  if (req.isAuthenticated()) {
    findDetails();
    async function findDetails() {
      try {
        // console.log(req.user.username);
        const foundUser = await User.findOne({ username: req.user.username });
        const registeredConferences = foundUser.conference_name;

        const conferences = await Conference.find({
          name: { $in: registeredConferences },
          "users.username": foundUser.username,
        });

        // Fetch user details for each conference
        const conferenceDetails = [];
        for (const conference of conferences) {
          const userInConference = conference.users.find(
            (user) => user.username === foundUser.username
          );
          //Payment Button Colour
          var paymentButtonColor = "";
          var guestHouseBookingTextColor = "";
          if (
            userInConference.status === "Waiting" ||
            userInConference.status === "Rejected"
          ) {
            paymentButtonColor = "Not-Pay-Now";
            guestHouseBookingTextColor = "guest_house2";
          } else if (
            userInConference.status === "Accepted" &&
            userInConference.payment === "Pay Now"
          ) {
            paymentButtonColor = "Pay-Now-Payment";
            guestHouseBookingTextColor = "guest_house2";
          } else if (
            userInConference.status === "Accepted" &&
            userInConference.payment === "Paid"
          ) {
            paymentButtonColor = "Accepted";
            guestHouseBookingTextColor = "guest_house";
          }

          // Assuming there's a status and payment field in the user document within the conference
          const userDetailsInConference = {
            confTitle: conference.conf_title,
            status: userInConference.status,
            payment: userInConference.payment,
            name: conference.name,
            username: userInConference.username,
            nameOfUser:
              userInConference.prefix +
              " " +
              userInConference.first_name +
              " " +
              userInConference.last_name,
            email: userInConference.username,
            phone: userInConference.phone,
            paymentButton: paymentButtonColor,
            guestHouseButton: guestHouseBookingTextColor,
            fileLocation: userInConference.uploadedDocLocation,
            razorpayKey: process.env.RAZORPAY_ID_KEY,
          };
          conferenceDetails.push(userDetailsInConference);
        }
        // console.log(conferenceDetails);

        res.render("dashboard", {
          userDetails: foundUser,
          conferenceDetails: conferenceDetails,
        });
      } catch (e) {
        console.log(e.message);
      }
    }
  } else {
    res.redirect("/");
  }
});

app.get("/logout", function (req, res) {
  req.logout(function (err) {
    if (err) {
      console.log(err);
    }
  });
  res.redirect("/");
});

app.get("/register/:conferenceName", function (req, res) {
  const conferenceName = _.lowerCase(req.params.conferenceName);

  findConference();
  async function findConference() {
    try {
      const find = await Conference.findOne({
        name: conferenceName,
      });
      // console.log(find);
      if (find) {
        const displayName = find.conf_title;
        //Show existing Conference List
        res.render("register", {
          conference_Name: displayName,
          conference_ShortName: conferenceName,
        });
      } else {
        res.redirect("/");
      }
    } catch (e) {
      console.log(e.message);
    }
  }
});

//Admin Portal

//Only for Temporary Use -----//
app.get("/signup", function (req, res) {
  res.render("signup");
});
//Delete This Get request -----//

// Middleware to check if the user is authenticated and has the required role
function isUser(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  } else {
    res.redirect("/");
  }
}

async function isAdmin(req, res, next) {
  if (req.isAuthenticated()) {
    const userName = req.session.passport.user.username;
    try {
      const findUser = await User.findOne({ username: userName });
      if (findUser && findUser.role === "admin") {
        // User found and has admin role
        return next();
      } else {
        // User not found or doesn't have admin role
        res.redirect("/");
      }
    } catch (error) {
      console.error("Error finding user:", error);
      res.redirect("/");
    }
  } else {
    res.redirect("/");
  }
}

async function isvenueAdmin(req, res, next) {
  if (req.isAuthenticated()) {
    const userName = req.session.passport.user.username;
    try {
      const findUser = await User.findOne({ username: userName });
      if (findUser && findUser.role === "venuehead") {
        // User found and has admin role
        return next();
      } else {
        // User not found or doesn't have admin role
        res.redirect("/");
      }
    } catch (error) {
      console.error("Error finding user:", error);
      res.redirect("/");
    }
  } else {
    res.redirect("/");
  }
}
async function isvehicleAdmin(req, res, next) {
  if (req.isAuthenticated()) {
    const userName = req.session.passport.user.username;
    try {
      const findUser = await User.findOne({ username: userName });
      if (findUser && findUser.role === "vehiclehead") {
        // User found and has admin role
        return next();
      } else {
        // User not found or doesn't have admin role
        res.redirect("/");
      }
    } catch (error) {
      console.error("Error finding user:", error);
      res.redirect("/");
    }
  } else {
    res.redirect("/");
  }
}
async function isguesthouseAdmin(req, res, next) {
  if (req.isAuthenticated()) {
    const userName = req.session.passport.user.username;
    try {
      const findUser = await User.findOne({ username: userName });
      if (findUser && findUser.role === "guesthousehead") {
        // User found and has admin role
        return next();
      } else {
        // User not found or doesn't have admin role
        res.redirect("/");
      }
    } catch (error) {
      console.error("Error finding user:", error);
      res.redirect("/");
    }
  } else {
    res.redirect("/");
  }
}

//Just Checking the isExactAdmin
function exactAdmin(conferenceName) {
  return async function isExactAdmin(req, res, next) {
    if (req.isAuthenticated()) {
      try {
        const userName = req.session.passport.user.username;
        const conferenceName = req.params.conferenceName;

        const findAdminInConference = await Conference.findOne({
          name: conferenceName,
          "created_by.username": userName,
        });
        const confCreator = findAdminInConference.created_by.username;
        const userRole = findAdminInConference.created_by.role;
        if (
          findAdminInConference &&
          userRole === "admin" &&
          confCreator === userName
        ) {
          // User found and has admin role and is the creator of that conference
          return next();
        } else {
          // User not found or doesn't have admin role or is not the creator of that conference
          res.redirect("/");
        }
      } catch (error) {
        console.error("Error finding user:", error);
        res.redirect("/");
      }
    } else {
      res.redirect("/");
    }
  };
}

app.get("/admindashboard", isAdmin, function (req, res) {
  res.render("admindashboard");
});

app.get("/allconferences", function (req, res) {
  find();
  async function find() {
    try {
      const conference = await Conference.find({}).sort({ first_day: 1 });
      res.render("allconferences", {
        conferences: conference,
      });
    } catch (e) {
      console.log(e.message);
    }
  }
});

app.get("/upcoming-conferences", function (req, res) {
  find();
  async function find() {
    try {
      const today = new Date();
      const conference = await Conference.find({
        first_day: { $gte: today },
      }).sort({ first_day: 1 });
      res.render("upcomingconferences", {
        conferences: conference,
      });
    } catch (e) {
      console.log(e.message);
    }
  }
});

app.get("/yourconferences", isAdmin, function (req, res) {
  find();
  async function find() {
    try {
      const conf_creator = await User.findOne({ username: req.user.username });
      const conference = await Conference.find({ created_by: conf_creator });
      res.render("yourconferences", {
        conferences: conference,
      });
    } catch (e) {
      console.log(e.message);
    }
  }
});

app.get("/viewsubmitted/:conferenceName", isAdmin, function (req, res) {
  const conferenceName = _.lowerCase(req.params.conferenceName);

  const executingExactAdminFunction = exactAdmin(conferenceName);
  executingExactAdminFunction(req, res, async function (err) {
    if (err) {
      // Handle errors if any
      console.error("executingExactAdminFunction error:", err);
      res.redirect("/");
      return;
    }

    findConference();
    async function findConference() {
      try {
        const find = await Conference.findOne({
          name: conferenceName,
        });
        const confName = find.conf_title;
        const confShortName = find.name;
        // console.log(find);
        if (find) {
          const submittedApplicationUser = find.users;
          // console.log(submittedApplicationUser);
          //Show existing Conference List
          res.render("submittedapplication", {
            submitted_Users: submittedApplicationUser,
            conferenceName: confName,
            conferenceShortName: confShortName,
          });
        } else {
          res.redirect("/");
        }
      } catch (e) {
        console.log(e.message);
      }
    }
  });
});

app.get("/createconference", isAdmin, function (req, res) {
  res.render("createconference");
});

// Define a route to display the form for editing
app.get("/edit/:name", isAdmin, async (req, res) => {
  try {
    const conference = await Conference.findOne({ name: req.params.name });
    const firstDate = format(conference.first_day, "yyyy-MM-dd");
    const lastDate = format(conference.last_day, "yyyy-MM-dd");
    const reqUser = req.user.username;
    const confCreator = conference.created_by.username;
    const userRole = conference.created_by.role;
    if (conference && userRole === "admin" && confCreator === reqUser) {
      // User found and has admin role and is the creator of that conference
      res.render("editconference", { conference, firstDate, lastDate });
    } else {
      // User not found or doesn't have admin role or is not the creator of that conference
      res.redirect("/");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

//Admin Post request
app.post("/createconference", async function (req, res) {
  try {
    const conf_creator = await User.findOne({ username: req.user.username });
    // console.log(conf_creator);
    const nameOfConference = _.lowerCase(req.body.conf_title)
      .split(" ")
      .join("");
    const existingConference = await Conference.findOne({
      name: nameOfConference,
    });

    if (existingConference) {
      // If the conference already exists, send a response to the client
      const alertMessage = "Conference with the same Name already exists";
      const script = `<script>alert('${alertMessage}'); window.location='/createconference';</script>`;
      return res.send(script);
    }

    const conference = new Conference({
      conf_title: req.body.conf_title,
      name: _.lowerCase(req.body.conf_title).split(" ").join(""),
      web_page: req.body.web_page,
      venue: req.body.venue,
      city: req.body.city,
      region: req.body.region,
      num_submission: req.body.num_submission,
      fee: req.body.fee_amount,
      feeCurrency: "INR",
      first_day: req.body.first_day,
      last_day: req.body.last_day,
      created_by: conf_creator,
    });

    await conference.save();
    res.redirect("/yourconferences");
  } catch (error) {
    // Handle MongoDB save error
    if (error.code === 11000) {
      // Duplicate key error, handle accordingly
      console.error("Duplicate key error:", error);
      res.status(400).send("Duplicate key error");
    } else {
      // Handle other errors
      console.error("Error saving conference:", error);
      res.status(500).send("Internal Server Error");
    }
  }
});

app.post("/edit/:name", async (req, res) => {
  try {
    const conference = await Conference.findOne({ name: req.params.name });
    await Conference.findByIdAndUpdate(conference.id, {
      conf_title: req.body.conf_title,
      name: _.lowerCase(req.body.conf_title).split(" ").join(""),
      web_page: req.body.web_page,
      venue: req.body.venue,
      city: req.body.city,
      region: req.body.region,
      num_submission: req.body.num_submission,
      fee: req.body.fee_amount,
      first_day: req.body.first_day,
      last_day: req.body.last_day,
    });
    res.redirect("/yourconferences");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/delete/:name", async (req, res) => {
  try {
    const conference = await Conference.findOne({ name: req.params.name });
    await Conference.findByIdAndDelete(conference.id);
    res.redirect("/yourconferences");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/decision/:conferenceName/:userName/:decision", async (req, res) => {
  try {
    const conferenceName = _.lowerCase(req.params.conferenceName);
    const userName = req.params.userName;
    const decision = req.params.decision;

    await Conference.updateOne(
      { name: conferenceName, "users.username": userName },
      { $set: { "users.$.status": decision } }
    );
    res.redirect("/viewsubmitted/" + conferenceName);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

//User Post request

app.post("/", function (req, res) {
  const user = new User({
    username: req.body.username,
    password: req.body.password,
  });

  req.login(user, function (err) {
    if (err) {
      console.log(err);
      res.redirect("/"); // Redirect to login page on authentication failure
    } else {
      passport.authenticate("local", function (err, user, info) {
        if (err) {
          console.log(err);
          return res.redirect("/"); // Redirect to login page on authentication error
        }

        if (!user) {
          return res.redirect("/"); // Redirect to login page if authentication fails
        }

        // Check user's role
        if (user.role === "admin") {
          // Redirect to admin dashboard
          res.redirect("/admindashboard");
        } else if (user.role === "user") {
          // Redirect to user dashboard
          res.redirect("/dashboard");
        } else if (user.role === "venuehead") {
          res.redirect("/venuedashboard");
        } else if (user.role === "vehiclehead") {
          res.redirect("/vehicledashboard");
        } else if (user.role === "guesthousehead") {
          res.redirect("/guesthousedashboard");
        } else {
          // Handle other roles or scenarios
          res.redirect("/");
        }
      })(req, res, function () {
        // This function is called after authentication is successful.
        // You can leave it empty or add additional logic if needed.
      });
    }
  });
});

app.post("/signup", function (req, res) {
  User.register(
    { username: req.body.username, role: "admin" },
    req.body.password,
    function (err, user) {
      if (err) {
        console.log(err);
        res.redirect("/signup");
      } else {
        passport.authenticate("local")(req, res, function () {
          res.redirect("/admindashboard");
        });
      }
    }
  );
});

app.post(
  "/register/:conferenceName",
  upload.single("myFile"),
  async function (req, res, next) {
    const conference_name = req.params.conferenceName;
    // console.log(req.file);
    try {
      // Create a new user
      const newUser = new User({
        username: req.body.username,
        title: req.body.title,
        themes: req.body.themes,
        prefix: req.body.prefix,
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        designation: req.body.designation,
        institution: req.body.institution,
        phone: req.body.phone,
        gender: req.body.gender,
        researcher: req.body.researcher,
        dob: req.body.dob,
        address: req.body.address,
        city: req.body.city,
        state: req.body.state,
        zip: req.body.zip,
        country: req.body.country,
        presenter: req.body.presenter,
        coauthor: req.body.coauthor,
        abstractFileLocation: req.file.path,
        status: "Waiting",
        payment: "Pay Now",
        role: "user",
      });

      const newUser_loginDetails = new User({
        role: "user",
        username: req.body.username,
        prefix: req.body.prefix,
        first_name: req.body.first_name,
        last_name: req.body.last_name,
        conference_name: [conference_name],
      });

      // Check if the username is already registered
      const existingUser = await User.findOne({ username: req.body.username });
      if (existingUser) {
        // Check if the user is already registered for the specified conference
        const isUserRegistered =
          existingUser.conference_name.includes(conference_name);

        if (isUserRegistered) {
          // Handle the case where the user is already registered for this conference
          return res
            .status(400)
            .send("You are already registered for this conference.");
        }
        // Add the conference name to the user's registered conferences
        existingUser.conference_name.push(conference_name);

        // Save the updated user document
        await existingUser.save();
        const conference = await Conference.findOne({ name: conference_name });
        conference.users.push(newUser);
        await conference.save();
        passport.authenticate("local")(req, res, function () {
          res.redirect("/dashboard");
        });
      } else if (!existingUser) {
        // Save the user to the database
        await User.register(newUser_loginDetails, req.body.password);

        // Find the conference by name
        const conference = await Conference.findOne({ name: conference_name });

        // If the conference exists
        if (conference) {
          // Add the user to the conference's users array
          conference.users.push(newUser);

          // Save the updated conference
          await conference.save();

          // Redirect to the dashboard or another appropriate route
          passport.authenticate("local")(req, res, function () {
            res.redirect("/dashboard");
          });
        } else {
          // Handle the case where the conference does not exist
          res.status(404).send("Conference not found");
        }
      }
    } catch (err) {
      // Handle any errors that occur during the registration process
      console.error(err);
      res.status(500).send("Internal Server Error");
    }
  }
);

app.post(
  "/dashboard/:conferenceName",
  uploadDocument.single("userUploadFile"),
  async function (req, res) {
    const userEmail = req.user.username;
    const conference_name = req.params.conferenceName;
    const conference = await Conference.findOne({ name: conference_name });
    const user = conference.users.find((user) => user.username === userEmail);
    user.uploadedDocLocation.push(req.file.path);
    await conference.save();
    res.redirect("/dashboard");
  }
);

//Generating user details pdf
app.get(
  "/viewsubmitted/:conferenceName/:userName",
  isUser,
  async (req, res) => {
    try {
      const conferenceName = _.lowerCase(req.params.conferenceName);
      const userName = req.params.userName;
      const findConference = await Conference.findOne({
        name: conferenceName,
      });

      const conference = await Conference.findOne({ name: conferenceName });
      const reqUser = req.user.username;
      const confCreator = conference.created_by.username;
      //This pdf can only be accessed by User whose information is this and admin who created this conference.
      if (reqUser === userName || reqUser === confCreator) {
        // Find the user in the array
        const User = findConference.users.find(
          (user) => user.username === userName
        );
        // console.log(User);
        function formatDate(dateString) {
          const options = { day: "2-digit", month: "2-digit", year: "numeric" };
          const formattedDate = new Date(dateString).toLocaleDateString(
            "en-GB",
            options
          );
          return formattedDate.split("/").join("-");
        }
        // Create a PDF document
        const doc = new PDFDocument();

        // Set response headers
        res.setHeader(
          "Content-disposition",
          `inline; filename=${conferenceName + "_" + User.first_name + ".pdf"}`
        );
        res.setHeader("Content-type", "application/pdf");

        // Pipe the PDF content to the response
        doc.pipe(res);
        // Add content to the PDF
        const myFont = "public/fonts/Poppins-SemiBold.ttf";
        doc
          .image("public/images/logo_img.png", 30, 30, { width: 300 })
          .moveTo(30, 100) // Adjust the Y-coordinate as needed
          .lineTo(580, 100) // Adjust the X-coordinate as needed
          .lineWidth(1.5)
          .stroke();
        doc
          .font(myFont)
          .fontSize(20)
          .text(
            "Abstract Submission of " + findConference.conf_title,
            30,
            110,
            {
              align: "left",
            }
          )
          .moveDown();

        // Add user details to the PDF
        const tableOptions = {
          headers: ["Application Details", ""],
          rows: [
            ["Title:", User.title],
            ["Name:", `${User.prefix} ${User.first_name} ${User.last_name}`],
            ["Designation:", User.designation],
            ["Institution:", User.institution],
            ["Phone:", User.phone],
            ["Gender:", User.gender],
            ["Researcher:", User.researcher],
            ["Date of Birth:", formatDate(User.dob)],
            ["Address:", User.address],
            ["City:", User.city],
            ["State:", User.state],
            ["ZIP:", User.zip],
            ["Country:", User.country],
            ["Presenter:", User.presenter],
            ["Coauthor:", User.coauthor],
            ["Status:", User.status],
            ["Payment:", User.payment],
          ],
        };

        // Draw the table with light background color
        doc.table(tableOptions, 30, 165, {
          width: 550,
          fillColor: "lightgray",
        });

        doc.end();
      } else {
        res.redirect("/");
      }
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).send("Internal Server Error");
    }
  }
);

app.get("/checkpayment", async function (req, res) {
  res.render("payment");
});

//Razorpay Payments
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_ID_KEY,
  key_secret: process.env.RAZORPAY_SECRET_KEY,
});

app.post("/create-order/:conferenceName", async (req, res) => {
  const conferenceName = req.params.conferenceName;
  const conference = await Conference.findOne({
    name: conferenceName,
  });

  const amount = conference.fee * 100; // Amount in paise (e.g., 50000 paise = ₹500)
  const currency = conference.feeCurrency;

  const options = {
    amount,
    currency,
  };

  try {
    const order = await razorpay.orders.create(options);
    res.json(order);
    // console.log(order);
  } catch (error) {
    res.status(500).json({ error: "Error creating order" });
  }
});

app.post("/capture-payment/:conferenceName/:userName", async (req, res) => {
  const { paymentId, amount, orderId, orderSignature, currency } = req.body;
  const conferenceName = req.params.conferenceName;
  const userName = req.params.userName;
  // console.log(orderSignature);
  try {
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET_KEY)
      .update(orderId + "|" + paymentId)
      .digest("hex");
    // console.log(generated_signature);
    if (generated_signature === orderSignature) {
      await Conference.updateOne(
        { name: conferenceName, "users.username": userName },
        {
          $set: {
            "users.$.payment": "Paid",
            "users.$.amountCurrency": currency,
            "users.$.amountPaid": amount / 100,
            "users.$.paymentId": paymentId,
            "users.$.orderId": orderId,
            "users.$.orderSignature": orderSignature,
            "users.$.orderSignature": orderSignature,
            "users.$.paymentTime": new Date(),
          },
        }
      );
      res.json({ Status: "Payment Successful & Verified" });
    } else {
      res.json({ Status: "Payment not Verified" });
    }
  } catch (error) {
    res.status(500).json({ error: "Error capturing payment" });
  }
});
//Payment PDF Report

app.get("/Payment-Report/:conferenceName", isAdmin, async (req, res) => {
  const conferenceName = req.params.conferenceName;
  const conference = await Conference.findOne({
    name: conferenceName,
  });
  const reqUser = req.user.username;
  const confCreator = conference.created_by.username;
  const paidUsers = conference.users.filter((user) => user.payment === "Paid");
  if (reqUser === confCreator) {
    function formatDateTime(dateString) {
      const options = {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false, // Use 24-hour format
      };

      const formattedDateTime = new Date(dateString).toLocaleString(
        "en-GB",
        options
      );
      return formattedDateTime.replace(/[/,]/g, "-"); // Replace slashes with dashes
    }
    // Create a PDF document in landscape orientation
    let doc = new pdfTable({
      margin: { top: 30, right: 30, bottom: 30, left: 30 },
      layout: "landscape",
      size: "A4",
    });

    // Pipe the PDF directly to the response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-disposition",
      `inline; filename=${conferenceName + "_Payment.pdf"}`
    );

    doc.font("Helvetica-Bold").fontSize(18); // Set font to bold and increase font size for the title

    // Center-align the title
    const titleWidth = doc.widthOfString(
      "Payment Details of " + conference.conf_title
    );
    const titleX = (doc.page.width - titleWidth) / 2;
    doc.text("Payment Details of " + conference.conf_title, titleX, 30);

    // Reset font for table headers and rows
    doc.font("Helvetica").fontSize(10);

    // Table content

    const tableArray = {
      headers: [
        " S.No.",
        " Name",
        " Email",
        " Order ID ",
        " Payment ID",
        " Amount",
        " Payment Date",
      ],
      rows: paidUsers.map((user, index) => [
        index + 1,
        user.prefix + " " + user.first_name + " " + user.last_name,
        user.username,
        user.orderId,
        user.paymentId,
        user.amountPaid + " " + user.amountCurrency,
        formatDateTime(user.paymentTime) + " Hrs",
      ]),
    };

    // Add a table to the PDF
    doc.table(tableArray, {
      width: 780, // Adjust the width according to your requirements
      x: 30,
      y: 60,
      prepareRow: (row, indexColumn, indexRow, rectRow) => {
        indexColumn === 0 &&
          doc.addBackground(rectRow, indexRow % 2 ? "#D3D3D3" : "white", 0.5);
      },
    });

    doc.pipe(res);
    doc.end();
  } else {
    res.redirect("/");
  }
});

//Support Section
//User Portal Support Section

app.get("/support", isUser, async function (req, res) {
  const reqUser = req.user.username;
  const user = await User.findOne({ username: reqUser });
  const userRegisteredInConference = user.conference_name;
  const findAllConference = await Conference.find({
    name: { $in: userRegisteredInConference },
  });
  const conferences = await Conference.find({
    name: { $in: userRegisteredInConference },
  });
  const allNotifications = [];
  conferences.forEach((conference) => {
    conference.notification.forEach((notification) => {
      allNotifications.push(notification);
    });
  });
  res.render("support", {
    userName: reqUser,
    user: user,
    conferences: findAllConference,
    allNotifications: allNotifications,
  });
});

app.get("/support/:conferenceName", isUser, async function (req, res) {
  const conferenceName = req.params.conferenceName;
  const thisConference = await Conference.findOne({ name: conferenceName });
  const reqUser = req.user.username;
  const user = await User.findOne({ username: reqUser });
  const userRegisteredInConference = user.conference_name;
  const findAllConference = await Conference.find({
    name: { $in: userRegisteredInConference },
  });
  res.render("support-group-chat", {
    userName: reqUser,
    user: user,
    conferences: findAllConference,
    thisConference: thisConference,
  });
});

app.get("/support-chat/:conferenceName", isUser, async function (req, res) {
  const conferenceName = req.params.conferenceName;
  const thisConference = await Conference.findOne({ name: conferenceName });
  const reqUser = req.user.username;
  const user = await User.findOne({ username: reqUser });
  const userRegisteredInConference = user.conference_name;
  const findAllConference = await Conference.find({
    name: { $in: userRegisteredInConference },
  });
  res.render("support-chat", {
    userName: reqUser,
    user: user,
    conferences: findAllConference,
    thisConference: thisConference,
  });
});

app.get("/messages/:conferenceName", async (req, res) => {
  try {
    const conferenceName = req.params.conferenceName;
    const conference = await Conference.findOne({ name: conferenceName });
    const messages = conference.group_chat;
    res.send(messages);
  } catch (error) {
    res.sendStatus(500);
    console.error("Error fetching messages for user:", error);
  }
});

app.post("/messages/:conferenceName", async (req, res) => {
  try {
    const conferenceName = req.params.conferenceName;
    await Conference.updateOne(
      { name: conferenceName },
      { $push: { group_chat: req.body } }
    );
    io.emit("message", req.body);
    res.sendStatus(200);
  } catch (error) {
    res.sendStatus(500);
    return console.log("error", error);
  } finally {
    // console.log("Message send");
  }
});

app.get("/support-chat-message/:conferenceName/:userName", async (req, res) => {
  try {
    const conferenceName = req.params.conferenceName;
    const userName = req.params.userName;
    const conference = await Conference.findOne({ name: conferenceName });
    const user = conference.users.find((user) => user.username === userName);
    const messages = user.support_chat;
    res.send(messages);
  } catch (error) {
    res.sendStatus(500);
    console.error("Error fetching messages for user:", error);
  }
});

app.post(
  "/support-chat-message/:conferenceName/:userName",
  async (req, res) => {
    try {
      const conferenceName = req.params.conferenceName;
      const userName = req.params.userName;
      const conference = await Conference.findOne({ name: conferenceName });
      const user = conference.users.find((user) => user.username === userName);
      await Conference.updateOne(
        { name: conferenceName, "users.username": userName },
        {
          $push: { "users.$.support_chat": req.body },
          $set: { "users.$.isSolved": false },
        }
      );
      io.emit("message", req.body);
      res.sendStatus(200);
    } catch (error) {
      res.sendStatus(500);
      return console.log("error", error);
    } finally {
      // console.log("Message send");
    }
  }
);

//Admin Portal Support Section

app.get("/admin-support", isAdmin, async function (req, res) {
  try {
    // Find the admin user
    const conf_creator = req.user.username;
    // Find conferences created by the admin
    const conferences = await Conference.find({
      "created_by.username": conf_creator,
    });
    const allNotifications = [];
    conferences.forEach((conference) => {
      conference.notification.forEach((notification) => {
        allNotifications.push(notification);
      });
    });
    // console.log(allNotifications);

    // Filter conferences based on the presence of at least one entry in support_chat and isSolved:false
    const conferencesWithSupportChat = await Conference.find({
      _id: { $in: conferences.map((conf) => conf._id) },
    });
    // Extract usernames with at least one entry in support_chat
    const usersWithSupportChat = conferencesWithSupportChat.reduce(
      (usernames, conference) => {
        conference.users.forEach((user) => {
          if (user.support_chat.length > 0 && user.isSolved == false) {
            usernames.push({
              username: user.username,
              name: user.first_name,
              conferenceName: conference.conf_title,
              conferenceShortName: conference.name,
            });
          }
        });
        return usernames;
      },
      []
    );

    res.render("admin-support", {
      usersWithSupportChat: usersWithSupportChat,
      conferences: conferences,
      allNotifications: allNotifications,
    });
  } catch (error) {
    console.error("Error in /admin-support route:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/notification", isAdmin, async function (req, res) {
  try {
    // Find the admin user
    const conf_creator = req.user.username;
    // Find conferences created by the admin
    const conferences = await Conference.find({
      "created_by.username": conf_creator,
    });
    const allNotifications = [];
    conferences.forEach((conference) => {
      conference.notification.forEach((notification) => {
        allNotifications.push(notification);
      });
    });
    // console.log(allNotifications);

    res.render("admin-notification", {
      conferences: conferences,
      allNotifications: allNotifications,
    });
  } catch (error) {
    console.error("Error in /admin-support route:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/admin-send-notification", isAdmin, async function (req, res) {
  try {
    // Find the admin user
    const conf_creator = req.user.username;
    // Find conferences created by the admin
    const conferences = await Conference.find({
      "created_by.username": conf_creator,
    });

    res.render("admin-send-notification", {
      conferences: conferences,
    });
  } catch (error) {
    console.error("Error in /admin-support route:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/admin-send-notification", async function (req, res) {
  const conferenceName = req.body.conferenceName;
  const notification = req.body.notification;
  const saveNotification = {
    sender: "Admin",
    conferenceName: conferenceName,
    notification: notification,
    time: new Date(),
  };

  await Conference.updateOne(
    { conf_title: conferenceName },
    { $push: { notification: saveNotification } }
  );
  res.redirect("/admin-support");
});

app.get(
  "/admin-support-chat/:conferenceName/:userName",
  isUser,
  async function (req, res) {
    const conferenceName = req.params.conferenceName;
    const userName = req.params.userName;
    const conf_creator = req.user.username;
    const conf = await Conference.findOne({ name: conferenceName });
    const confTitle = conf.conf_title;
    // Find conferences created by the admin
    const conferences = await Conference.find({
      "created_by.username": conf_creator,
    });
    // Filter conferences based on the presence of at least one entry in support_chat and isSolved:false
    const conferencesWithSupportChat = await Conference.find({
      _id: { $in: conferences.map((conf) => conf._id) },
    });
    // Extract usernames with at least one entry in support_chat
    const usersWithSupportChat = conferencesWithSupportChat.reduce(
      (usernames, conference) => {
        conference.users.forEach((user) => {
          if (user.support_chat.length > 0 && user.isSolved == false) {
            usernames.push({
              username: user.username,
              name: user.first_name,
              conferenceName: conference.conf_title,
              conferenceShortName: conference.name,
            });
          }
        });
        return usernames;
      },
      []
    );

    res.render("admin-support-chat", {
      usersWithSupportChat: usersWithSupportChat,
      userName: userName,
      conferenceName: conferenceName,
      confTitle: confTitle,
    });
  }
);

app.post("/isSolved/:conferenceName/:userName", async function (req, res) {
  const conferenceName = req.params.conferenceName;
  const userName = req.params.userName;

  const result = await Conference.updateOne(
    { name: conferenceName, "users.username": userName },
    { $set: { "users.$.isSolved": true } }
  );
  res.sendStatus(200);
});

io.on("connection", () => {
  // console.log("a user is connected");
});

//<<---------Coded By Prachi---------------->>

app.get("/vehicledashboard", isvehicleAdmin, function (req, res) {
  res.render("vehicledashboard");
});
app.get("/venuedashboard", isvenueAdmin, function (req, res) {
  res.render("venuedashboard");
});
app.get("/guesthousedashboard", isguesthouseAdmin, function (req, res) {
  res.render("guesthousedashboard");
});

app.get("/addvenue", isvenueAdmin, function (req, res) {
  res.render("addvenue");
});
app.get("/addvehicle", isvehicleAdmin, function (req, res) {
  res.render("addvehicle");
});
app.get("/addguesthouse", isguesthouseAdmin, function (req, res) {
  res.render("addguesthouse");
});
const addvenueSchema = {
  venue_name: String,
  name: String,
};
const addvehicleSchema = {
  vehicle_name: String,
  name: String,
};
const addguesthouseSchema = {
  guesthouse_name: String,
  name: String,
};

const Addvenue = mongoose.model("addvenue", addvenueSchema);
const Addvehicle = mongoose.model("addvehicle", addvehicleSchema);
const Addguesthouse = mongoose.model("addguesthouse", addguesthouseSchema);

app.post("/addvenue", async function (req, res) {
  try {
    const venuename = _.lowerCase(req.body.venue_name).split(" ").join("");
    const existingvenue = await Addvenue.findOne({ name: venuename });

    if (existingvenue) {
      // If the conference already exists, send a response to the client
      const alertMessage = "This Venue already exists";
      const script = `<script>alert('${alertMessage}'); window.location='/allvenue';</script>`;
      return res.send(script);
    }
    const addnewvenue = new Addvenue({
      venue_name: req.body.venue_name,
      name: _.lowerCase(req.body.venue_name).split(" ").join(""),
    });

    await addnewvenue.save();
    res.redirect("/allvenue");
  } catch (err) {
    console.error(err);
    alert(err);
    res.redirect("/addvenue");
  }
});

app.post("/addvehicle", async function (req, res) {
  try {
    const vehiclename = _.lowerCase(req.body.vehicle_name).split(" ").join("");

    const existingvehicle = await Addvehicle.findOne({
      name: vehiclename,
    });

    if (existingvehicle) {
      // If the conference already exists, send a response to the client
      const alertMessage = "This Vehicle already exists";
      const script = `<script>alert('${alertMessage}'); window.location='/addvehicle';</script>`;
      return res.send(script);
    }
    const addnewvehicle = new Addvehicle({
      vehicle_name: req.body.vehicle_name,
      name: _.lowerCase(req.body.vehicle_name).split(" ").join(""),
    });

    await addnewvehicle.save();
    res.redirect("/allvehicle");
  } catch (err) {
    console.error(err);
    alert(err);
    res.redirect("/addvehicle");
  }
});
app.post("/addguesthouse", async function (req, res) {
  try {
    const guesthousename = _.lowerCase(req.body.guesthouse_name)
      .split(" ")
      .join("");

    const existingguesthouse = await Addguesthouse.findOne({
      name: guesthousename,
    });

    if (existingguesthouse) {
      // If the conference already exists, send a response to the client
      const alertMessage = "This Guesthouse already exists";
      const script = `<script>alert('${alertMessage}'); window.location='/allguesthouse';</script>`;
      return res.send(script);
    }
    const addnewguesthouse = new Addguesthouse({
      guesthouse_name: req.body.guesthouse_name,
      name: _.lowerCase(req.body.guesthouse_name).split(" ").join(""),
    });

    await addnewguesthouse.save();
    res.redirect("/allguesthouse");
  } catch (err) {
    console.error(err);
    alert(err);
    res.redirect("/addguesthouse");
  }
});

app.get("/allvenue", isvenueAdmin, function (req, res) {
  find();

  async function find() {
    try {
      const newvenue = await Addvenue.find();
      res.render("allvenue", {
        addvenues: newvenue,
      });
    } catch (e) {
      console.log(e.message);
      // Handle the error appropriately, e.g., render an error page
      res.render("error", { message: "An error occurred" });
    }
  }
});
app.get("/allvehicle", isvehicleAdmin, function (req, res) {
  find();

  async function find() {
    try {
      const newvehicle = await Addvehicle.find();
      res.render("allvehicle", {
        addvehicles: newvehicle,
      });
    } catch (e) {
      console.log(e.message);
      // Handle the error appropriately, e.g., render an error page
      res.render("error", { message: "An error occurred" });
    }
  }
});
app.get("/allguesthouse", isguesthouseAdmin, function (req, res) {
  find();

  async function find() {
    try {
      const newguesthouse = await Addguesthouse.find();
      res.render("allguesthouse", {
        addguesthouses: newguesthouse,
      });
    } catch (e) {
      console.log(e.message);
      // Handle the error appropriately, e.g., render an error page
      res.render("error", { message: "An error occurred" });
    }
  }
});

app.post("/delete-venue/:id", async (req, res) => {
  try {
    await Addvenue.findByIdAndDelete({ _id: req.params.id });
    res.redirect("/allvenue");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});
app.post("/delete-vehicle/:id", async (req, res) => {
  try {
    await Addvehicle.findByIdAndDelete({ _id: req.params.id });
    res.redirect("/allvehicle");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});
app.post("/delete-guesthouse/:id", async (req, res) => {
  try {
    await Addguesthouse.findByIdAndDelete({ _id: req.params.id });
    res.redirect("/allguesthouse");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/venuebook", isAdmin, function (req, res) {
  find();

  async function find() {
    try {
      const newvenue = await Addvenue.find();
      res.render("venuebook", {
        addvenues: newvenue,
      });
    } catch (e) {
      console.log(e.message);
      // Handle the error appropriately, e.g., render an error page
      res.render("error", { message: "An error occurred" });
    }
  }
});

const venueSchema = {
  Purpose: String,
  no_of_participant: Number,
  time_in_venue: String,
  time_out_venue: String,
  date: Date,
  remark: String,
  select_venue: String,
  status: String,
  admin_name: String, //who booked the venue
};
const Venue = mongoose.model("venue", venueSchema);

app.post("/venuebook", async function (req, res) {
  try {
    const admin_venue = await User.findOne({ username: req.user.username });
    // console.log(admin_venue)
    const newvenue = new Venue({
      Purpose: req.body.Purpose,
      no_of_participant: req.body.no_of_participant,
      time_in_venue: req.body.time_in_venue,
      time_out_venue: req.body.time_out_venue,
      date: req.body.date,
      select_venue: req.body.select_venue,
      remark: req.body.remark,
      status: "Waiting",
      admin_name: admin_venue.username,
    });

    const venuedetails = await newvenue.save();

    // for mail
    var text = `Details of the booking are as follows : 
    Purpose : ${venuedetails.Purpose} 
    No of participants : ${venuedetails.no_of_participant}
    Time in : ${venuedetails.time_in_venue}
    Time out : ${venuedetails.time_out_venue}
    Date : ${venuedetails.date}
    Venue : ${venuedetails.select_venue}
    Remark : ${venuedetails.remark}
    Status : ${venuedetails.status}
    `;

    sendEmail(
      process.env.VENUEMAIL,
      "Venue Booking Request by " + venuedetails.admin_name,
      text
    );

    res.redirect("/venue");
  } catch (err) {
    console.error(err);
    res.redirect("/venue");
  }
});

app.get("/venue", isAdmin, function (req, res) {
  find();
  async function find() {
    try {
      const admin_venue = await Venue.find({ admin_name: req.user.username });
      // console.log(admin_venue);
      res.render("venue", {
        created_venues: admin_venue,
      });
    } catch (e) {
      console.log(e.message);
      res.render("error", { message: "An error occurred" });
    }
  }
});
app.get("/vehicle", isAdmin, function (req, res) {
  find();
  async function find() {
    try {
      //const vadmin_name = await User.findOne({ username: req.user.username });
      const admin_vehicle = await Vehicle.find({
        admin_name: req.user.username,
      });
      // console.log(admin_vehicle);
      res.render("vehicle", {
        created_vehicles: admin_vehicle,
      });
    } catch (e) {
      console.log(e.message);
      res.render("error", { message: "An error occurred" });
    }
  }
});
app.get("/guesthouse", isAdmin, function (req, res) {
  find();
  async function find() {
    try {
      //const vadmin_name = await User.findOne({ username: req.user.username });
      const admin_guesthouse = await Guesthouse.find({
        admin_name: req.user.username,
      });
      //console.log(admin_guesthouse);
      res.render("guesthouse", {
        created_guesthouses: admin_guesthouse,
      });
    } catch (e) {
      console.log(e.message);
      res.render("error", { message: "An error occurred" });
    }
  }
});

app.post("/deleteVenue/:id", async (req, res) => {
  try {
    await Venue.findByIdAndUpdate(
      { _id: req.params.id },
      { $set: { status: "Cancelling" } }
    );
    res.redirect("/venue");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/deleteVehicle/:id", async (req, res) => {
  try {
    await Vehicle.findByIdAndUpdate(
      { _id: req.params.id },
      { $set: { status: "Cancelling" } }
    );
    res.redirect("/vehicle");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});
app.post("/deleteGuesthouse/:id", async (req, res) => {
  try {
    await Guesthouse.findByIdAndUpdate(
      { _id: req.params.id },
      { $set: { status: "Cancelling" } }
    );
    res.redirect("/guesthouse");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/requestforvenue", isvenueAdmin, function (req, res) {
  find();
  async function find() {
    try {
      const submitted_venue = await Venue.find({
        status: { $nin: ["Cancelling", "Cancelled", "Cancellation-Rejected"] },
      });
      // console.log(submitted_venue);
      res.render("requestforvenue", {
        submitted_venues: submitted_venue,
      });
    } catch (e) {
      console.log(e.message);
      res.render("error", { message: "An error occurred" });
    }
  }
});

app.get("/requestforvehicle", isvehicleAdmin, function (req, res) {
  find();
  async function find() {
    try {
      const submitted_vehicle = await Vehicle.find({
        status: { $nin: ["Cancelling", "Cancelled", "Cancellation-Rejected"] },
      });
      // console.log(submitted_vehicle);
      res.render("requestforvehicle", {
        submitted_vehicles: submitted_vehicle,
      });
    } catch (e) {
      console.log(e.message);
      res.render("error", { message: "An error occurred" });
    }
  }
});

app.get("/requestforguesthouse", isguesthouseAdmin, function (req, res) {
  find();
  async function find() {
    try {
      const submitted_guesthouse = await Guesthouse.find({
        status: { $nin: ["Cancelling", "Cancelled", "Cancellation-Rejected"] },
      });
      // console.log(submitted_guesthouse);
      res.render("requestforguesthouse", {
        submitted_guesthouses: submitted_guesthouse,
      });
    } catch (e) {
      console.log(e.message);
      res.render("error", { message: "An error occurred" });
    }
  }
});
app.get("/cancellationrequestforvenue", isvenueAdmin, function (req, res) {
  find();
  async function find() {
    try {
      const submitted_venue = await Venue.find({
        status: { $in: ["Cancelling", "Cancelled", "Cancellation-Rejected"] },
      });
      // console.log(submitted_venue);
      res.render("cancellationrequestforvenue", {
        submitted_venues: submitted_venue,
      });
    } catch (e) {
      console.log(e.message);
      res.render("error", { message: "An error occurred" });
    }
  }
});

app.get("/cancellationrequestforvehicle", isvehicleAdmin, function (req, res) {
  find();
  async function find() {
    try {
      const submitted_vehicle = await Vehicle.find({
        status: { $in: ["Cancelling", "Cancelled", "Cancellation-Rejected"] },
      });
      // console.log(submitted_vehicle);
      res.render("cancellationrequestforvehicle", {
        submitted_vehicles: submitted_vehicle,
      });
    } catch (e) {
      console.log(e.message);
      res.render("error", { message: "An error occurred" });
    }
  }
});

app.get(
  "/cancellationrequestforguesthouse",
  isguesthouseAdmin,
  function (req, res) {
    find();
    async function find() {
      try {
        const submitted_guesthouse = await Guesthouse.find({
          status: { $in: ["Cancelling", "Cancelled", "Cancellation-Rejected"] },
        });
        // console.log(submitted_guesthouse);
        res.render("cancellationrequestforguesthouse", {
          submitted_guesthouses: submitted_guesthouse,
        });
      } catch (e) {
        console.log(e.message);
        res.render("error", { message: "An error occurred" });
      }
    }
  }
);

// for vehicle booking
app.get("/vehiclebook", isAdmin, function (req, res) {
  find();

  async function find() {
    try {
      const newvehicle = await Addvehicle.find();
      res.render("vehiclebook", {
        addvehicles: newvehicle,
      });
    } catch (e) {
      console.log(e.message);
      // Handle the error appropriately, e.g., render an error page
      res.render("error", { message: "An error occurred" });
    }
  }
});
const vehicleSchema = {
  Purpose: String,
  date_for_vehicle: Date,
  time_for_vehicle: String,
  start: String,
  end: String,
  pickup: String,
  dropping: String,
  vname: String,
  vmobile: Number,
  no_of_pessengers: Number,
  select_vehicle: String,
  remark: String,
  status: String,
  admin_name: String,
};
const Vehicle = mongoose.model("vehicle", vehicleSchema);
app.post("/vehiclebook", async function (req, res) {
  //console.log("def");
  try {
    const admin_vehicle = await User.findOne({ username: req.user.username });
    const newvehicle = new Vehicle({
      Purpose: req.body.Purpose,
      date_for_vehicle: req.body.date_for_vehicle,
      time_for_vehicle: req.body.time_for_vehicle,
      start: req.body.start,
      end: req.body.end,
      pickup: req.body.pickup,
      dropping: req.body.dropping,
      vname: req.body.vname,
      vmobile: req.body.vmobile,
      no_of_pessengers: req.body.no_of_pessengers,
      select_vehicle: req.body.select_vehicle,
      status: "Waiting",
      admin_name: admin_vehicle.username,
      remark: req.body.remark,
    });
    // console.log(newvehicle);
    const vehicledetails = await newvehicle.save();

    var text = `Details of the booking are as follows : 
                Purpose : ${vehicledetails.Purpose} 
                Date : ${vehicledetails.date_for_vehicle} 
                Time : ${vehicledetails.time_for_vehicle} 
                End : ${vehicledetails.end} 
                Start : ${vehicledetails.start} 
                Dropping : ${vehicledetails.dropping} 
                Pickup : ${vehicledetails.pickup} 
                Vehicle Name : ${vehicledetails.vname} 
                Vehicle Mobile : ${vehicledetails.vmobile} 
                No of Pessengers : ${vehicledetails.no_of_pessengers} 
                Remark : ${vehicledetails.remark} `;

    sendEmail(
      process.env.VEHICLEEMAIL,
      "Vehicle Booking Request by " + vehicledetails.admin_name,
      text
    );
    res.redirect("/vehicle");
  } catch (err) {
    console.error(err);
    res.redirect("/vehicle");
  }
});
// for guesthouse booking
app.get("/guesthousebook", isAdmin, function (req, res) {
  find();

  async function find() {
    try {
      const newguesthouse = await Addguesthouse.find();
      res.render("guesthousebook", {
        addguesthouses: newguesthouse,
      });
    } catch (e) {
      console.log(e.message);
      // Handle the error appropriately, e.g., render an error page
      res.render("error", { message: "An error occurred" });
    }
  }
});
const guestSchema = {
  guestname: String,
  Purpose: String,
  noofroom: Number,
  checkin: Date,
  checkout: Date,
  remark: String,
  status: String,
  admin_name: String,
  select_guesthouse: String,
};
const Guesthouse = mongoose.model("guesthouse", guestSchema);
app.post("/guesthousebook", async function (req, res) {
  try {
    const admin_guesthouse = await User.findOne({
      username: req.user.username,
    });
    const newguest = new Guesthouse({
      guestname: req.body.guestname,
      Purpose: req.body.Purpose,
      noofroom: req.body.noofroom,
      checkin: req.body.checkin,
      checkout: req.body.checkout,
      remark: req.body.remark,
      select_guesthouse: req.body.select_guesthouse,
      status: "Waiting",
      admin_name: admin_guesthouse.username,
    });
    // console.log(newguest);
    const guestdetails = await newguest.save();

    // for mail
    var text = `Details of the booking are as follows :
                Guest Name : ${guestdetails.guestname}
                Purpose : ${guestdetails.Purpose}
                No of Rooms : ${guestdetails.noofroom}
                Checkin : ${guestdetails.checkin}
                Checkout : ${guestdetails.checkout}
                Remark : ${guestdetails.remark}`;

    sendEmail(
      process.env.GUESTHOUSEMAIL,
      "Guest House Booking Request by " + guestdetails.admin_name,
      text
    );

    res.redirect("/guesthouse");
  } catch (err) {
    console.error(err);
    res.redirect("/guesthouse");
  }
});
// for guesthouse
app.post("/decision-guesthouse/:bookingId/:decision", async (req, res) => {
  try {
    const decision = req.params.decision;
    const bookingId = req.params.bookingId;
    await Guesthouse.updateOne(
      { _id: bookingId },
      { $set: { status: decision } }
    );
    if (
      decision === "Accepted" ||
      decision === "Rejected" ||
      decision === "Waiting"
    ) {
      res.redirect("/requestforguesthouse");
    } else {
      res.redirect("/cancellationrequestforguesthouse");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});
app.post("/decision-vehicle/:bookingId/:decision", async (req, res) => {
  try {
    const decision = req.params.decision;
    const bookingId = req.params.bookingId;
    await Vehicle.updateOne({ _id: bookingId }, { $set: { status: decision } });
    if (
      decision === "Accepted" ||
      decision === "Rejected" ||
      decision === "Waiting"
    ) {
      res.redirect("/requestforvehicle");
    } else {
      res.redirect("/cancellationrequestforvehicle");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});
app.post("/decision-venue/:bookingId/:decision", async (req, res) => {
  try {
    const decision = req.params.decision;
    const bookingId = req.params.bookingId;
    await Venue.updateOne({ _id: bookingId }, { $set: { status: decision } });
    if (
      decision === "Accepted" ||
      decision === "Rejected" ||
      decision === "Waiting"
    ) {
      res.redirect("/requestforvenue");
    } else {
      res.redirect("/cancellationrequestforvenue");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// <<---------------------Prachi Code End------------------------>>

let port = process.env.PORT;
if ((port == null) | (port == "")) {
  port = 3000;
}

http.listen(port, function () {
  console.log("Server started on port " + port);
});
