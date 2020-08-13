import { Wechaty } from 'wechaty'
import { PuppetPadplus } from 'wechaty-puppet-padplus'
import { QRCodeTerminal, MessageAwaiter } from 'wechaty-plugin-contrib'
import { token } from './config'

export async function getBotInstance(): Promise<Wechaty> {
  const puppet = new PuppetPadplus({ token: token })

  const bot = new Wechaty({
    puppet: puppet,
    name: 'cosine'
  })

  return new Promise((resolve, reject) => {
    bot
      .use(
        QRCodeTerminal(),
        MessageAwaiter()
      )
      .on('login', (user) => {
        console.log(`login success, user: ${user}`)
        resolve(bot)
      })
      .on('message', async (msg) => {
        console.log(`msg : ${msg.from().id}@${await msg.room()?.topic()}: ${msg}`)
      })
      .on('logout', (user, reason: string) => {
        console.log(`logout user: ${user}, reason : ${reason}`)
      })
      .start()
  })
}
