const mongoose = require("mongoose")

const accountSchem = new mongoose.Schema({
  uid: { type: Number, unique: true },
  tgid: { type: String, required: true, unique: true },
  web3: { type: String, required: false },
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

module.exports = { accountSchem }
