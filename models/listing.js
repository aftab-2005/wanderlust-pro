const mongoose = require("mongoose");
const Review = require("./review.js");
const schema = mongoose.Schema;
const listing_schema = new schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  image: {
    url: String,
    filename: String,
  },
  price: Number,
  location: String,
  country: String,
  reviews: [{ type: schema.Types.ObjectId, ref: "Review" }],
  owner: {
    type: schema.Types.ObjectId,
    ref: "User",
    // might be an error u or U
  },
  category:{
    type:String,
    enum:["Trending","Rooms","Iconic cities","Mountains","Castles","Amazing Pools","Camping","Farms","Arctic"],
  }
});
//post middleware:if any listing delete then all reviews also delete
listing_schema.post("findOneAndDelete", async (listing) => {
  if (listing) {
    await Review.deleteMany({ _id: { $in: listing.reviews } });
  }
});
const listing = mongoose.model("Listing", listing_schema);
module.exports = listing;
