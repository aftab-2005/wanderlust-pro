const listing = require("./models/listing");
const Review = require("./models/review");
module.exports.isLoggedIn = (req, res, next) => {
  if (!req.isAuthenticated()) {
    req.session.redirectUrl = req.originalUrl;
    req.flash("error", "you must be looged in to create listing");
    return res.redirect("/login");
  }
  next();
};

module.exports.saveRedirectUrl = (req, res, next) => {
  if (req.session.redirectUrl) {
    res.locals.redirectUrl = req.session.redirectUrl;
  }
  next();
};

module.exports.isOwner = async (req, res, next) => {
  let { id } = req.params;
  let list = await listing.findById(id);
  if (!list.owner.equals(res.locals.curruser._id)) {
    req.flash("error", "you don't have permission to edit this!");
    return res.redirect(`/listings/${id}`);
  }
  next();
};

module.exports.isReviewAuthore = async (req, res, next) => {
  let { id, reviewId } = req.params;
  let review = await Review.findById(reviewId);
  if (!review.author.equals(res.locals.curruser._id)) {
    req.flash("error", "you don't have permission to edit this!");
    return res.redirect(`/listings/${id}`);
  }
  next();
};
