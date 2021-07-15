import * as fs from 'fs'
import fetch from 'node-fetch'
import { Wechaty, Room, Message, Contact } from 'wechaty'
import {
  MessageType, RoomQueryFilter,
} from 'wechaty-puppet'
import { CronJob } from 'cron'

export class GFMWatch {
  bot: Wechaty
  rooms: Room[]
  config: RoomQueryFilter[]

  constructor(bot: Wechaty, config: RoomQueryFilter[]) {
    this.bot = bot
    this.config = config
    this.rooms = []
  }

  async init() {
    for (let q of this.config) {
      const room = await this.bot.Room.find(q)
      if (!room) {
        console.error(`room for ${q.id || q.topic} not found!`)
        return
      }
      this.rooms.push(room)
    }

    let last = -1
    const check = async () => {
      console.log('checking for gfm update...')
      const res = await fetch('https://www.gofundme.com/f/mjzebp-lawsuit-against-pp10043-for-affected-chn-students')
      const body = await res.text()
      const raw = /m-progress-meter-heading">\$([\d,]+)/.exec(body)[1]
      const dollar = parseInt(raw.replace(',', ''))
      if (dollar !== last) {
        if (last !== -1) {
          for (let r of this.rooms) {
            await r.say(`GoFundMe 筹款数额： $${dollar} (~ ￥${dollar * 6.46})`)
          }
        }
        last = dollar
        console.log(`new amount: ${dollar}, report done`)
      }
      await fs.promises.appendFile('./data/gfm.csv', `${(new Date()).getTime()},${dollar}\n`)
    }

    new CronJob('0 0 * * * *', () => {
      check()
    }, null, true, 'Asia/Shanghai')
    check()
  }
}

