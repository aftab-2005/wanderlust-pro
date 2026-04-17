if (process.env.NODE_ENV != "production") {
  require("dotenv").config();
}
const express = require("express");
const app = express();
const path = require("path");
const mongoose = require("mongoose");
const dburl = process.env.Atlasdb_Url;
const listing = require("./models/listing");
const methodoverride = require("method-override");
const ejsmate = require("ejs-mate");
const wrapAsync = require("./utils/wrapAsync.js");
const ExpressError = require("./utils/ExpressError.js");
const { listingschema, reviewSchema } = require("./schema.js");
const Review = require("./models/review.js");
const session = require("express-session");
const flash = require("connect-flash");
const MongoStore = require("connect-mongo").default;
const passport = require("passport");
const localstrategy = require("passport-local");
const user = require("./models/user.js");

const {
  isLoggedIn,
  saveRedirectUrl,
  isOwner,
  isReviewAuthore,
} = require("./middleware.js");
const multer = require("multer");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodoverride("_method"));
app.engine("ejs", ejsmate);
app.use(express.static(path.join(__dirname, "/public")));
const { storage } = require("./cloudeconfig.js");
const upload = multer({ storage });

//session store on cloude db
const store = MongoStore.create({
  mongoUrl: dburl,
  crypto: {
    secret: process.env.SECRET,
  },
  touchAfter: 24 * 3600,
});
store.on("error", () => {
  console.log("error in mongo session store", err);
});
// create sessions
const sessionoption = {
  store,
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};
app.use(session(sessionoption));
//flash messages
app.use(flash());

//here passport code always
app.use(passport.initialize());
app.use(passport.session());
passport.use(new localstrategy(user.authenticate()));
passport.serializeUser(user.serializeUser());
passport.deserializeUser(user.deserializeUser());

//middleware for flash messages
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.curruser = req.user;
  next();
});

//connection set to Mongodb through default main function
main()
  .then(() => {
    console.log("connect to DB");
  })
  .catch((err) => {
    console.log(err);
  });
async function main() {
  await mongoose.connect(dburl);
}

//middleware of joi {validation for form}
const validateListing = (req, res, next) => {
  let { error } = listingschema.validate(req.body);
  if (error) {
    let err_msg = error.details.map((el) => el.message).join(",");
    next(new ExpressError(400, error));
  } else {
    next();
  }
};

//validation for reviews form
const validateReview = (req, res, next) => {
  let { error } = reviewSchema.validate(req.body);
  if (error) {
    let err_msg = error.details.map((el) => el.message).join(",");
    next(new ExpressError(400, error));
  } else {
    next();
  }
};

// signup/login routes
app.get("/signup", (req, res) => {
  res.render("users/signup.ejs");
});

app.get("/login", (req, res) => {
  res.render("users/login.ejs");
});
app.post("/signup", async (req, res) => {
  try {
    let { username, email, password } = req.body;
    const newuser = new user({ email, username });
    const registeruser = await user.register(newuser, password);
    //direct move to login after signup
    req.login(registeruser, (err) => {
      if (err) {
        return next(err);
      }
      req.flash("success", "welcome to wonderlist");
      res.redirect("/listings");
    });
  } catch (e) {
    req.flash("error", e.message);
    res.redirect("/signup");
  }
});
app.post(
  "/login",
  saveRedirectUrl,
  passport.authenticate("local", {
    failureRedirect: "/login",
    failureFlash: true,
  }),
  async (req, res) => {
    // let { username, email, password } = req.body;
    req.flash("success", "you are login successfully");
    let redirectUrl = res.locals.redirectUrl || "/listings";
    res.redirect(redirectUrl);
  },
);

//logout routes
app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.flash("success", "you are logged out");
    res.redirect("/listings");
  });
});

//index route
app.get(
  "/listings",
  wrapAsync(async (req, res) => {
    const all_listing = await listing.find({});
    res.render("listings/index.ejs", { all_listing });
  }),
);
//category Routes
app.get("/listings/category/:name", async (req, res) => {
  let category = await listing.find({ category: req.params.name });
  res.render("listings/category.ejs", { category });
});

//create new route
app.get("/listings/new", isLoggedIn, (req, res) => {
  res.render("listings/new.ejs");
});
app.post(
  "/listings",isLoggedIn,
  upload.single("list[image]"),
  validateListing,
  wrapAsync(async (req, res, next) => {
    console.log(req.file); // terminal mein dekh kya aa raha hai
  console.log(req.body);
    let url = req.file.path;
    let filename = req.file.filename;
    const newlisting = new listing(req.body.list);
    newlisting.image = { url, filename };
    newlisting.owner = req.user._id;
    await newlisting.save();
    req.flash("success", "new listing created!");
    res.redirect("/listings");
  }),
);

//show route
app.get(
  "/listings/:id",
  wrapAsync(async (req, res) => {
    let { id } = req.params;
    const list = await listing
      .findById(id)
      .populate({ path: "reviews", populate: { path: "author" } })
      .populate("owner");
    console.log(list);
    //access list whose deleted
    if (!list) {
      req.flash("error", "this listing is deleted!");
      return res.redirect("/listings");
    }
    res.render("listings/show.ejs", { list });
  }),
);

//edit route//update route
app.get(
  "/listings/:id/edit",
  isLoggedIn,
  isOwner,
  wrapAsync(async (req, res) => {
    let { id } = req.params;
    let list = await listing.findById(id);
    //edit list whose deleted
    if (!list) {
      req.flash("error", "this listing is deleted!");
      return res.redirect("/listings");
    }
    // see preview
    let originalimage = list.image.url;
    originalimage.replace("/upload", "/upload/h_100,w_100");
    res.render("listings/edit.ejs", { list, originalimage });
  }),
);
app.put(
  "/listings/:id",
  isLoggedIn,
  isOwner,
  upload.single("list[image]"),
  validateListing,
  wrapAsync(async (req, res) => {
    console.log("PUT route hit"); // ← yeh add karo
    let { id } = req.params;
    let updatelisting = await listing.findByIdAndUpdate(
      id,
      {
        ...req.body.list,
      },
      { new: true },
    );
    if (req.file) {
      let url = req.file.path;
      let filename = req.file.filename;
      updatelisting.image = { url, filename };
      await updatelisting.save();
    }
    req.flash("success", "listing update!");
    res.redirect(`/listings/${id}`);
  }),
);

app.get("/contact", (req, res) => {
  res.render("listings/contact.ejs");
});

//delete route
app.delete(
  "/listings/:id",
  isLoggedIn,
  isOwner,
  wrapAsync(async (req, res) => {
    let { id } = req.params;
    let deletedlist = await listing.findByIdAndDelete(id);
    req.flash("success", "listing deleted!");
    res.redirect("/listings");
  }),
);

//create review
app.post(
  "/listings/:id/reviews",
  validateReview,
  isLoggedIn,
  wrapAsync(async (req, res) => {
    let newlisting = await listing.findById(req.params.id);
    let newreview = new Review(req.body.review); //created model
    newreview.author = req.user._id;
    console.log(newreview);
    newlisting.reviews.push(newreview);
    await newreview.save();
    await newlisting.save();
    req.flash("success", "new review created!");
    res.redirect(`/listings/${newlisting._id}`);
  }),
);

//delete review
app.delete(
  "/listings/:id/reviews/:reviewId",
  isLoggedIn,
  isReviewAuthore,
  wrapAsync(async (req, res) => {
    let { id, reviewId } = req.params; //yaha destructing ke liye bc
    await listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
    await Review.findByIdAndDelete(reviewId);
    req.flash("success", "review deleted!");
    res.redirect(`/listings/${id}`);
  }),
);
//page not found * => match with all incoming request
app.all("*splat", (req, res, next) => {
  next(new ExpressError(404, "page not found"));
});

//middleware for handle server side error or custom error handeler
app.use((err, req, res, next) => {
  let { statuscode = 500, message = "something went wrong" } = err; // add karo
  res.render("listings/error.ejs", { message });
  // res.status(statuscode).send(message);
});

app.listen(3000, () => {
  console.log("server running at 8080");
});
