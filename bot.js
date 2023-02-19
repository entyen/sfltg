const { Bot, session, InlineKeyboard } = require("grammy")
const mongoose = require("mongoose")
const AutoIncrement = require("mongoose-sequence")(mongoose)
mongoose.set("strictQuery", false)
const fetch = require("node-fetch")

const config = require("./config.json")

const bot = new Bot(config.TOKEN)

//userSchem
const { accountSchem } = require("./schema/data.js")
const accdb = mongoose.model(
  "account",
  accountSchem.plugin(AutoIncrement, { inc_field: "uid", start_seq: 1 })
)

//utils
function getLocale(ctx, string, ...vars) {
  const ulang = ctx.account ? ctx.account.lang : ctx
  let lang = require(`./lang/${ulang}.json`)

  lang = lang[string] || lang["noTranslateOrError"]

  vars.forEach((v, i) => {
    if (typeof lang == "object") {
      for (let key in lang) {
        lang[key] = lang[key].replace(/%VAR%/, v)
      }
    } else {
      lang = lang.replace(/%VAR%/, v)
    }
  })
  return lang
}

bot.command("start", async (ctx) => {
  if (ctx.message.chat.id < 0) return
  ctx.account = await accdb.findOne({ tgid: ctx.from.id })
  let ulang = ctx.account ? ctx : ctx.from.language_code
  if (ulang != "en" && ulang != "ru") {
    ulang = "en"
  }
  if (!ctx.account) {
    await accdb.create({
      tgid: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      lang: ulang,
      nonce: Math.floor(Math.random() * 10000),
    })
    ctx.reply(getLocale(ulang, "welcome", ctx.from.first_name))
    bot.api.sendMessage(
      config.LOG_GROUP_ID,
      `New user: ${ctx.from.first_name} (@${ctx.from.username})`
    )
    return
  } else {
    ctx.deleteMessage()
    ctx.reply(getLocale(ulang, "already_logged_in"))
    return
  }
})

//MiddleWare
async function middleCheck(ctx, next) {
  if (ctx.from) {
    if (ctx.from.language_code != "en" && ctx.from.language_code != "ru") {
      ctx.from.language_code = "en"
    }
    ctx.account = await accdb.findOne({ tgid: ctx.from.id })
    if (ctx.account) {
      await next()
      return
    } else {
      if (!ctx.message) return ctx.deleteMessage()
      if (ctx.message.text === "/start") {
        await next()
        return
      }
      ctx.reply(getLocale(ctx.from.language_code, "noAccount"))
      await next()
      return
    }
  }
  await next()
}

bot.use(middleCheck)

bot.command("mine", async (ctx) => {
  const farmId = +ctx.match
  if (!farmId) {
    return ctx.reply("Please enter your farm id")
  }
  try {
    const inventory = await fetch(
      `https://api.sunflower-land.com/visit/${farmId}`
    ).then((res) => res.json())
    const ts = inventory.state.treasureIsland
    if (!ts.holes) {
      return ctx.reply("You have not discovered the island yet")
    }
    const resArr = []
    for (const [key, value] of Object.entries(ts.holes)) {
      if (value.discovered !== null) {
        resArr.push(`${key} - ${value.discovered}`)
      }
    }
    ctx.reply(resArr.join("\n"))
  } catch (err) {
    ctx.reply("Wait 10 sec and try again")
  }
})

bot.command("ct", async (ctx) => {
  ctx.reply(`https://grk.pw/connect/?id=${ctx.account.uid}&nonce=${ctx.account.nonce}&sig=sfl`)
})

const express = require('express')
const app = express()

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

const PORT = process.env.PORT || 2002

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})

app.post('/sfl/connect:user_id', async (req, res) => {
    const user = await accdb.findOne({ uid: req.body.userId })
    //res.header("Access-Control-Allow-Origin", "*");
    if (!user) {
        res.send({ error: 'User not found' }).status(404)
    } else {
        if (user.nonce.toString() !== req.body.nonce) {
            return res.send({ error: 'Nonce not match' }).status(400)
        }
        if (user.web3) {
            return res.send({ error: 'User already connected' }).status(400)
        }
        bot.api.sendMessage(user.tgid, `Wallet connected: ${req.body.address}`)
        user.web3 = req.body.address
        user.nonce = Math.floor(Math.random() * 10000)
        user.save()
        res.send({
            msg: 'Wallet connected. Please close this page and check for a message form the SFL INFO Bot',
        }).status(200)
    }
})

main()
  .then(() => {
    console.log("DB Connected")
    // Start the bot.
    bot.start()
    console.log("Bot Started")
  })
  .catch((err) => console.log(err))

async function main() {
  await mongoose.connect(
    `mongodb://${config.DBUSER}:${config.DBPASS}@${config.SERVER}/${config.DB}`
  )
}
