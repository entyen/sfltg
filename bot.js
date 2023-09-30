const { Bot, session, InlineKeyboard, InputFile, Context } = require("grammy");
const { Menu } = require("@grammyjs/menu");
const Web3 = require("web3");
const mongoose = require("mongoose");
const AutoIncrement = require("mongoose-sequence")(mongoose);
mongoose.set("strictQuery", false);
const fetch = require("node-fetch");
const CronJob = require("cron").CronJob;

const config = require("./config.json");

const bot = new Bot(config.TOKEN);

//userSchem
const { accountSchem, web3Schem } = require("./schema/data.js");
const accdb = mongoose.model(
  "account",
  accountSchem.plugin(AutoIncrement, { inc_field: "uid", start_seq: 1 })
);
const web3db = mongoose.model("web3", web3Schem);

//utils
function getLocale(ctx, string, ...vars) {
  const ulang = ctx.account ? ctx.account.lang : ctx;
  let lang = require(`./lang/${ulang}.json`);

  lang = lang[string] || lang["noTranslateOrError"];

  vars.forEach((v, i) => {
    if (typeof lang == "object") {
      for (let key in lang) {
        lang[key] = lang[key].replace(/%VAR%/, v);
      }
    } else {
      lang = lang.replace(/%VAR%/, v);
    }
  });
  return lang;
}

bot.command("start", async (ctx) => {
  if (ctx.message.chat.id < 0) return;
  ctx.account = await accdb.findOne({ tgid: ctx.from.id });
  let ulang = ctx.account ? ctx : ctx.from.language_code;
  if (ulang != "en" && ulang != "ru") {
    ulang = "en";
  }
  if (!ctx.account) {
    await accdb.create({
      tgid: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      lang: ulang,
      nonce: Math.floor(Math.random() * 10000),
    });
    ctx.reply(getLocale(ulang, "welcome", ctx.from.first_name));
    bot.api.sendMessage(
      config.LOG_GROUP_ID,
      `New user: ${ctx.from.first_name} (@${ctx.from.username})`
    );
    return;
  } else {
    ctx.deleteMessage();
    ctx.reply(getLocale(ulang, "already_logged_in"));
    return;
  }
});

//MiddleWare
async function middleCheck(ctx, next) {
  if (ctx.from) {
    if (ctx.from.language_code != "en" && ctx.from.language_code != "ru") {
      ctx.from.language_code = "en";
    }
    ctx.account = await accdb.findOne({ tgid: ctx.from.id });
    if (ctx.account) {
      await next();
      return;
    } else {
      if (!ctx.message) return ctx.deleteMessage();
      if (ctx.message.text === "/start") {
        await next();
        return;
      }
      return ctx.reply(getLocale(ctx.from.language_code, "noAccount"));
    }
  }
  await next();
}

// WEB3
const ether_rpc = "https://polygon-rpc.com";
const web3 = new Web3(ether_rpc);
const sfl = require("./abi/SunflowerLand.json");
const sflContract = new web3.eth.Contract(sfl.abi, sfl.id);
// WEB3

const regExp = /(trees|stones|iron|gold)/i;
const growInfo = {
  trees: { time: 2 * 60 * 60 + 30, resAction: "choppedAt", resName: "wood" },
  stones: { time: 4 * 60 * 60 + 30, resAction: "minedAt", resName: "stone" },
  iron: { time: 8 * 60 * 60 + 30, resAction: "minedAt", resName: "stone" },
  gold: { time: 24 * 60 * 60 + 30, resAction: "minedAt", resName: "stone" },
};

let gkdSync = null;
const menu = new Menu("main-menu", { autoAnswer: false })
  .dynamic(async (ctx, range) => {
    const web3acc = await web3db.findById(ctx.account.web3[0]);
    const web3parce = web3acc
      ? `💳 WEB3 ${
          web3acc.walletId.slice(1, 6) + "..." + web3acc.walletId.slice(-4)
        }`
      : getLocale(ctx, "state")[0];
    ctx.account.web3[0]
      ? range.text(web3parce, (ctx) => ctx.answerCallbackQuery(web3parce))
      : range.url(
          "Connect Web3",
          `https://grk.pw/connect/?id=${ctx.account.uid}&nonce=${ctx.account.nonce}&sig=sfl`
        );
  })
  .row()
  .submenu("Settings", "setting-menu", (ctx) =>
    !ctx.account.web3[0]
      ? ctx.answerCallbackQuery("Connect wallet first")
      : null
  )
  .text("♻️", async (ctx) => {
    if (
      ctx.update.callback_query.message.date <
      Date.now() - 48 * 60 * 60 * 1000
    ) {
      ctx.deleteMessage();
    }
    const menuText = getLocale(ctx.account.lang, "menu", ctx.account.uid);
    return await ctx.reply(menuText, { reply_markup: menu });
  })
  .text("Sync", async (ctx) => {
    try {
      if (!ctx.account.web3[0])
        return ctx.answerCallbackQuery("Connect wallet first");
      const equipedWallet = ctx.account.web3.find((x) => x.equiped);
      const wallet = await web3db
        .findById(equipedWallet._id)
        .catch(console.error);
      if (!wallet)
        return await ctx.answerCallbackQuery("You don't have equiped wallet");
      if (gkdSync && Date.now() - gkdSync < 15 * 1000)
        return await ctx.answerCallbackQuery(
          `Wait ${Math.floor(15 - (Date.now() - gkdSync) / 1000)} second ⏳`
        );
      wallet.farmId = await sflContract.methods
        .tokenOfOwnerByIndex(wallet.walletId, 0)
        .call();
      if (!wallet.farmId)
        return await ctx.answerCallbackQuery(
          "This web3 account don't have any farm"
        );
      const farmInfo = await fetch(
        `https://api.sunflower-land.com/visit/${wallet.farmId}`,
        { method: "GET" }
      );
      if (farmInfo.status == 200) {
        const { state } = await farmInfo.json();
        let check = {};
        for (const [key, value] of Object.entries(state)) {
          if (regExp.test(key)) {
            check[key] = [];
            if (wallet.farmInventory) {
              for (const [key1, value1] of Object.entries(
                wallet.farmInventory[key]
              )) {
                if (value1[growInfo[key].resName]) {
                  const resCheck =
                    value1[growInfo[key].resName][growInfo[key].resAction] ==
                    state[key][key1][growInfo[key].resName][
                      growInfo[key].resAction
                    ];
                  check[key].push(resCheck);
                }
              }
              if (check[key].every((value) => value === true)) {
                value.alerted = wallet.farmInventory[key].alerted;
              } else {
                value.alerted = 0;
              }
            } else {
              value.alerted = 0;
            }
          }
        }
        gkdSync = Date.now();
        wallet.farmInventory = state;
        await wallet.save();
        return await ctx.answerCallbackQuery("Succesful Sync ✅");
      } else {
        return await ctx.answerCallbackQuery(`${farmInfo.statusText} ❌`);
      }
    } catch (e) {
      console.error(e);
      return await ctx.answerCallbackQuery(e.message);
    }
  });

const setting = new Menu("setting-menu")
  .dynamic(async (ctx, range) => {
    const farmAccount = await web3db.findById(ctx.account.web3[0]);
    for (const [key, value] of Object.entries(farmAccount.alerts)) {
      range
        .text(`${key} alert: ${value ? "on" : "off"}`, async (ctx) => {
          farmAccount.alerts[key] = !farmAccount.alerts[key];
          await farmAccount.save();
          ctx.menu.update();
          return;
        })
        .row();
    }
  })
  .back("Go Back");

menu.register([setting]);
bot.use(middleCheck, menu);

const resourceCheck = async (key, value, growInfo, iFarm) => {
  const farmOwner = await accdb.findOne({ "web3._id": { _id: iFarm._id } });
  const resArr = [];
  let count = 0;
  for (const [key1, value1] of Object.entries(value)) {
    if (value1[growInfo.resName]) {
      const resGrow = Math.floor(
        (value1[growInfo.resName][growInfo.resAction] / 1000 +
          growInfo.time -
          Math.floor(Date.now() / 1000)) /
          60
      );
      resArr.push(resGrow <= 0);
      count += value1[growInfo.resName]?.amount;
    }
  }
  if (resArr.every((value) => value === true)) {
    const itemCount = Math.floor(count * 10) / 10;
    await bot.api.sendMessage(
      farmOwner.tgid,
      getLocale(farmOwner.lang, "recoverInfo", key, itemCount, key),
      {
        parse_mode: "HTML",
      }
    );
    iFarm.set(`farmInventory.${key}.alerted`, 1);
    return;
  }
};

//cron scan
const job = new CronJob("*/1 * * * *", null, false, "Europe/Moscow");
job.addCallback(async () => {
  const farms = await web3db.find();
  for (const farm of farms) {
    if (farm.farmInventory) {
      for (const [key, value] of Object.entries(farm.farmInventory)) {
        if (value.alerted == 0 && regExp.test(key) && farm.alerts[key]) {
          await resourceCheck(key, value, growInfo[key], farm);
        }
      }
      await farm.save();
    }
  }
});

// let syncIttreation = 1
// const autoSync = new CronJob("*/15 * * * * *", null, false, "Europe/Moscow")
// autoSync.addCallback(async () => {
// const farmInfo = await fetch(
//   `https://api.sunflower-land.com/visit/124863`,
//   { method: "GET" }
// )
// const { state } = await farmInfo.json()
// console.log(farmInfo.status)
// syncIttreation++
// })

// bot.on("message", async (ctx) => {
//   console.log(ctx.message)
// })

bot.command("menu", async (ctx) => {
  const menuText = getLocale(ctx.account.lang, "menu", ctx.account.uid);
  await ctx.reply(menuText, { reply_markup: menu });
  return;
});

bot.command("ct", async (ctx) => {
  ctx.reply(
    `https://grk.pw/connect/?id=${ctx.account.uid}&nonce=${ctx.account.nonce}&sig=sfl`
  );
});

const Jimp = require("jimp");

bot.command("ti", async (ctx) => {
  // Generate a random image using the Jimp library
  const width = 400;
  const height = 100;
  const bgColor = parseInt(
    Math.floor(Math.random() * 16777215).toString(16),
    16
  );
  const image = new Jimp(width, height, bgColor);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  const watermark = await Jimp.read("./sfl.png");

  const equipedWallet = ctx.account.web3.find((x) => x.equiped);
  const wallet = await web3db.findById(equipedWallet._id).catch(console.error);

  const text = `FarmID: ${wallet.farmId}\nName: ${ctx.from.first_name}`;
  const lines = text.split("\n");

  // Print each line of text to the image
  let y = (image.bitmap.height - lines.length * font.common.lineHeight) / 2;
  for (const line of lines) {
    const textWidth = Jimp.measureText(font, line);
    image.print(font, (image.bitmap.width - textWidth) / 2, y, line);
    y += font.common.lineHeight;
  }

  // Add the watermark to the bottom right corner of the image and resize it
  watermark.resize(25, 25);
  const watermarkX = image.bitmap.width - watermark.bitmap.width - 10;
  const watermarkY = image.bitmap.height - watermark.bitmap.height - 10;
  image.composite(watermark, watermarkX, watermarkY);

  // Convert the image to a buffer and send it as a photo message
  const buffer = await image.getBufferAsync(Jimp.MIME_PNG);

  // Send the generated image as a photo message
  await ctx.replyWithPhoto(new InputFile(buffer));
});

const express = require("express");
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = process.env.PORT || 2002;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.post("/sfl/connect:user_id", async (req, res) => {
  const user = await accdb.findOne({ uid: req.body.userId });
  //res.header("Access-Control-Allow-Origin", "*");
  if (!user) {
    res.send({ error: "User not found" }).status(404);
  } else {
    if (user.nonce.toString() !== req.body.nonce) {
      return res.send({ error: "Nonce not match" }).status(400);
    }
    if (user.web3[0]) {
      return res.send({ error: "User already connected" }).status(400);
    }
    bot.api.sendMessage(user.tgid, `Wallet connected: ${req.body.address}`);
    let web3 = null;
    web3 = await web3db.findOne({ walletId: req.body.address });
    if (!web3)
      web3 = await web3db.create({
        walletId: req.body.address,
      });
    user.web3.push({ _id: web3._id, equiped: true });
    user.nonce = Math.floor(Math.random() * 10000);
    await user.save();
    res
      .send({
        msg: "Wallet connected. Please close this page and check for a message form the SFL INFO Bot",
      })
      .status(200);
  }
});

//catch uncaught Error's
process.on("uncaughtException", function (err) {
  console.error(err);
});

bot.catch((ctx) => {
  if (ctx.error.error_code === 400) {
    // console.log(ctx.error.description)
  } else {
    console.log(ctx.error);
  }
});

main()
  .then(() => {
    console.log("DB Connected");
    // Start the bot.
    bot.start();
    console.log("Bot Started");
  })
  .catch((err) => console.log(err));

async function main() {
  await mongoose.connect(
    `mongodb://${config.DBUSER}:${config.DBPASS}@${config.SERVER}/${config.DB}`
  );
}
