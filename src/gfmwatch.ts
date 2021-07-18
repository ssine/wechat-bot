import * as fs from 'fs'
import fetch from 'node-fetch'
import { Wechaty, Room, Message, Contact } from 'wechaty'
import {
  MessageType, RoomQueryFilter,
} from 'wechaty-puppet'
import { CronJob } from 'cron'

const getCurrentAmount = async () => {
  const res = await fetch('https://www.gofundme.com/f/mjzebp-lawsuit-against-pp10043-for-affected-chn-students')
  const body = await res.text()
  const raw = /m-progress-meter-heading">\$([\d,]+)/.exec(body)[1]
  return parseInt(raw.replace(',', ''))
}

const getRecentDonations = async (intervalSecond: number) => {
  const resp = await fetch('https://gateway.gofundme.com/web-gateway/v1/feed/mjzebp-lawsuit-against-pp10043-for-affected-chn-students/donations?limit=100&sort=recent')
  const body = JSON.parse(await resp.text())
  const donations = body.references.donations.filter((d: any) => Date.now() - new Date(d.created_at).getTime() < intervalSecond * 1000)
  return donations.sort((a: any, b: any) => b.amount - a.amount)
}

const getRecentComments = async (intervalSecond: number) => {
  const resp = await fetch('https://gateway.gofundme.com/web-gateway/v1/feed/mjzebp-lawsuit-against-pp10043-for-affected-chn-students/comments?limit=100&sort=recent')
  const body = JSON.parse(await resp.text())
  const contents = body.references.contents.filter((d: any) => Date.now() - new Date(d.comment.timestamp + '.000-05:00').getTime() < intervalSecond * 1000)
  return contents.sort((a: any, b: any) => b.donation.amount - a.donation.amount).map((c: any) => c.comment)
}

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

    const check = async () => {
      console.log('checking for gfm update...')
      const donations = await getRecentDonations(3600)
      if (!donations || donations.length === 0) {
        console.log('no amount change.')
        return
      }
      const inc = donations.map((d: any) => d.amount).reduce((a: number, b: number) => a + b, 0)
      const total = await getCurrentAmount()

      let text = `GoFundMe筹款数额+${inc}，总计${total}💵，约合${total * 6.46}💴。\n捐款名单：`
      for (let d of donations) {
        text += `\n${d.name}： ${d.amount}`
      }
      try {
        const comments = await getRecentComments(3600)
        let more = ''
        if (comments && comments.length > 0) {
          more += '\n新增评论：'
          for (let c of comments) {
            more += `\n${c.name}： ${c.comment}`
          }
        }
        text += more
      } catch (err) {
        console.log(err)
      }
      for (let r of this.rooms) {
        await r.say(text)
      }
      console.log(`new amount: ${total}, report done`)

      await fs.promises.appendFile('./data/gfm.csv', `${(new Date()).getTime()},${total}\n`)
    }

    new CronJob('0 0 * * * *', () => {
      check()
    }, null, true, 'Asia/Shanghai')
  }
}

