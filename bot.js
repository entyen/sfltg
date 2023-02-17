const { Bot, session, InlineKeyboard } = require("grammy")
const mongoose = require("mongoose")
mongoose.set('strictQuery', false)
const AutoIncrement = require("mongoose-sequence")(mongoose)

const config = require("./config.json")

const bot = new Bot(config.TOKEN)

bot.command("start", (ctx) => {
  ctx.reply("Welcome to the bot")
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
