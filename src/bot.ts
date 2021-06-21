import { Message, Wechaty } from 'wechaty'
import { PuppetPadlocal } from 'wechaty-puppet-padlocal'
// import { PuppetWeChat } from 'wechaty-puppet-wechat'
import { QRCodeTerminal, MessageAwaiter } from 'wechaty-plugin-contrib'
import { token } from './config'
import { MessageType } from 'wechaty-puppet'

export async function getBotInstance(): Promise<Wechaty> {
  const puppet = new PuppetPadlocal({ token: '' })
  // const puppet = new PuppetWeChat()

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
      .on('message', async (msg: Message) => {
        if ([MessageType.Text, MessageType.Url].includes(msg.type()))
        console.log(`msg : ${msg.talker().id}@${await msg.room()?.id}: ${msg}`)
      })
      .on('logout', (user, reason: string) => {
        console.log(`logout user: ${user}, reason : ${reason}`)
      })
      .start()
  })
}
