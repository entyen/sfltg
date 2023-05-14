const mongoose = require("mongoose")

const accountSchem = new mongoose.Schema({
  uid: { type: Number, unique: true },
  tgid: { type: String, required: true, unique: true },
  web3: [
    {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "web3",
      },
      equiped: { type: Boolean, default: false },
    },
  ],
  nonce: { type: Number },
  lang: { type: String, default: "en" },
  acclvl: { type: Number, default: 0 },
  donate: {
    type: Number,
    default: 0,
    get: (v) => Math.floor(v),
    set: (v) => Math.floor(v),
  },
})

const web3Schem = new mongoose.Schema(
  {
    walletId: { type: String, unique: true, require: true },
    farmInventory: { type: Object, default: null },
  },
  { timestamps: true }
)

module.exports = { accountSchem, web3Schem }
