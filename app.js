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
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const findOrCreate = require("mongoose-findorcreate");
const _ = require("lodash");
const { format } = require("date-fns");
const PDFDocument = require("./pdfkit-tables");
const multer = require("multer");
const path = require("path");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const fs = require("fs");
const pdfTable = require("pdfkit-table");

const app = express();

app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));
app.use("/abstracts", express.static("abstracts"));
app.set("view engine", "ejs");
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
};
const Conference = mongoose.model("Conference", conferenceSchema);

app.get("/", async function (req, res) {
  if (req.isAuthenticated()) {
    const userName = req.user.username;
    const user = await User.findOne({ username: userName });
    if (user.role === "admin") {
      res.redirect("/admindashboard");
    } else if (user.role === "user") {
      res.redirect("/dashboard");
    }
  } else res.render("home");
});

app.get("/login", function (req, res) {
  res.render("login");
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

app.get("/vehicle", function (req, res) {
  res.render("vehicle");
});

app.get("/venue", function (req, res) {
  res.render("venue");
});

app.get("/guesthouse", function (req, res) {
  res.render("guesthouse");
});

app.get("/book", function (req, res) {
  res.render("book");
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

let port = process.env.PORT;
if ((port == null) | (port == "")) {
  port = 3000;
}

app.listen(port, function () {
  console.log("Server started on port " + port);
});
