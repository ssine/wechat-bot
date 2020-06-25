import * as fs from 'fs'
import moment from 'moment'
import { CronJob } from 'cron'
import { Wechaty, Room, Contact } from 'wechaty'

type ExercisePuncherConfig = {
  roomTopic: string
  fileName: string
}

type ExercisePuncherData = {
  infos: ExercisePunchInfo[]
  contests: ContestPunchInfo[]
}

class ExercisePunchInfo {
  name: string = ''
  id: string = ''
  time: moment.Moment = moment()
  num: number = 0
  recommend: string = ''
  comment: string = ''
}

class ContestPunchInfo {
  name: string = ''
  id: string = ''
  time: moment.Moment = moment()
  num: number = 0
  percentile: number = 0
  comment: string = ''
}

function isSameDay(a: moment.Moment, b: moment.Moment): boolean {
  return a.year() === b.year() && a.month() === b.month() && a.day() === b.day()
}

class ExercisePuncher {
  bot: Wechaty
  config: ExercisePuncherConfig
  room: Room
  data: ExercisePuncherData
  inProcess: Set<string>
  writeQueue: Promise<unknown>[]

  constructor(bot: Wechaty, config: ExercisePuncherConfig) {
    this.bot = bot
    this.config = config
    this.data = {
      infos: [],
      contests: []
    }
    this.inProcess = new Set()
    this.writeQueue = []
  }

  async init() {
    this.room = await this.bot.Room.find({ topic: this.config.roomTopic })
    if (!this.room) {
      console.log('room not found!')
      return
    }
    await this.loadData()
    this.room.on('message', async (msg, date) => {
      if (msg.text() === '打卡') {
        this.punchExercise(msg.from(), date)
      } else if (msg.text() === '周赛') {
        this.punchContest(msg.from(), date)
      } else if (msg.text() === '帮助') {
        await this.room.say(
          `欢迎使用打卡 bot ，支持的指令：
打卡： 进行每日打卡
周赛： 记录周赛
帮助： 显示本条帮助`)
      }
    })

    new CronJob('0 59 23 * * *', () => {
      // new CronJob('0 45 2 * * *', () => {
      this.dailyReport()
    }, null, true, 'Asia/Shanghai');
  }

  async punchExercise(contact: Contact, date: Date) {
    if (this.inProcess.has(contact.id)) {
      await this.room.say(`[${contact.name()}] 已在打卡对话中。`)
      return
    }
    this.inProcess.add(contact.id)
    const waitMsg = async () => {
      const reply = await this.bot.waitForMessage({ room: this.room.id, contact: contact.id })
      if (reply.text() === '取消') {
        throw new Error('cancel')
      }
      return reply
    }

    let info = new ExercisePunchInfo()
    info.time = moment(date)
    const alias = await this.room.alias(contact)
    const name = alias ? alias : contact.name()
    info.name = name
    info.id = contact.id

    let previous = this.data.infos.filter((info) => info.id == contact.id)
    if (previous.length > 0 && isSameDay(previous[previous.length - 1].time, info.time)) {
      await this.room.say(`[${name}] 今天已经打过卡啦。`)
      return
    }

    const save = async () => {
      this.data.infos.push(info)
      await this.saveData()
      await this.room.say(`[${name}] 打卡内容已记录。 您已连续打卡 ${this.getConsecutivePunchNum(info.id)} 天，感谢使用^_^`)
    }

    await this.room.say(`[${name}] 开始打卡。 回复“数字 .”或“数字 。”只记录做题个数，回复取消中止打卡。 请输入今天做题个数：`)
    try {
      while (true) {
        const reply = await waitMsg()
        const text = reply.text()
        const exerciseNumber = parseInt(text)
        if (isNaN(exerciseNumber)) {
          await this.room.say(`输入数字无效。 请输入正整数：`)
        } else {
          info.num = exerciseNumber
          if (text[text.length - 1] === '.' || text[text.length - 1] === '。') {
            await save()
            this.inProcess.delete(contact.id)
            return
          }
          break
        }
      }

      await this.room.say(`请输入推荐好题，无推荐请回复 n 。`)
      let reply = await waitMsg()
      let recommendResponse = '无推荐。'
      if (reply.text().trim() !== 'n') {
        info.recommend = reply.text()
        recommendResponse = '推荐题目已记录。'
      }

      await this.room.say(`${recommendResponse} 请输入备注，无备注请回复 n 。`)
      reply = await waitMsg()
      let commentResponse = '无备注。'
      if (reply.text().trim() !== 'n') {
        info.comment = reply.text()
        commentResponse = '备注已记录。'
      }
      await this.room.say(commentResponse)

      await save()
    } catch (err) {
      await this.room.say(`[${name}] 打卡取消。`)
    }
    this.inProcess.delete(contact.id)
  }

  async punchContest(contact: Contact, date: Date) {
    if (this.inProcess.has(contact.id)) {
      await this.room.say(`[${contact.name()}] 已在打卡对话中。`)
      return
    }
    this.inProcess.add(contact.id)
    const waitMsg = async () => {
      const reply = await this.bot.waitForMessage({ room: this.room.id, contact: contact.id })
      if (reply.text() === '取消') {
        throw new Error('cancel')
      }
      return reply
    }

    let info = new ContestPunchInfo()
    info.time = moment(date)
    const alias = await this.room.alias(contact)
    const name = alias ? alias : contact.name()
    info.name = name
    info.id = contact.id

    if (!this.data.contests) this.data.contests = []
    let previous = this.data.contests.filter((info) => info.id == contact.id)
    if (previous.length > 0 && isSameDay(previous[previous.length - 1].time, info.time)) {
      await this.room.say(`[${name}] 今天已经记录过周赛啦。`)
      return
    }

    await this.room.say(`[${name}] 开始记录周赛。 请输入 AC 个数：`)
    try {
      while (true) {
        const reply = await waitMsg()
        const exerciseNumber = parseInt(reply.text())
        if (isNaN(exerciseNumber) || exerciseNumber <= 0) {
          await this.room.say(`输入数字无效。 请输入正整数：`)
        } else {
          info.num = exerciseNumber
          break
        }
      }

      await this.room.say(`请输入排名百分位数， 0 - 1 之间， 1 表示排名最高：`)
      while (true) {
        const reply = await waitMsg()
        const percentile = parseFloat(reply.text())
        if (isNaN(percentile) || percentile < 0 || percentile > 1) {
          await this.room.say(`输入数字无效。 请输入 0 - 1 之间的浮点数：`)
        } else {
          info.percentile = percentile
          if (percentile > 0.97) {
            await this.room.say(`大佬受我一拜_(:з」∠)_`)
          }
          break
        }
      }

      await this.room.say(`请输入备注，无备注请回复 n 。`)
      let reply = await waitMsg()
      let commentResponse = '无备注。'
      if (reply.text().trim().toLocaleLowerCase() !== 'n') {
        info.comment = reply.text()
        commentResponse = '备注已记录。'
      }
      await this.room.say(commentResponse)

      this.data.contests.push(info)
      await this.saveData()
      await this.room.say(`[${name}] 周赛内容已记录，感谢使用^_^`)

    } catch (err) {
      await this.room.say(`[${name}] 周赛记录取消。`)
    }
    this.inProcess.delete(contact.id)
  }

  async saveData() {
    const promise = new Promise(async (resolve, reject) => {
      if (this.writeQueue.length > 0) {
        await this.writeQueue[this.writeQueue.length - 1]
      }
      await fs.promises.writeFile(this.config.fileName, JSON.stringify(this.data, null, 2))
      resolve()
      this.writeQueue.splice(0, 1)
    })
    this.writeQueue.push(promise)
    return promise
  }

  async loadData() {
    try {
      const content = await fs.promises.readFile(this.config.fileName, 'utf-8')
      this.data = JSON.parse(content)
      for (let key in this.data.infos) {
        this.data.infos[key].time = moment(this.data.infos[key].time)
      }
      return
    } catch (err) {
      console.log(err)
      console.log('failed to load data, init with empty.')
      this.data = {
        infos: [],
        contests: []
      }
    }
  }

  getConsecutivePunchNum(id: string): number {
    const punches = this.data.infos.filter((info) => info.id === id).reverse()
    if (punches.length === 0) return 0;
    let count = 0
    let idx = 0
    if (isSameDay(punches[0].time, moment())) {
      count = 1
      idx = 1
    }
    let last = moment()
    while (true) {
      if (idx >= punches.length) break
      last.subtract(1, 'day')
      if (isSameDay(punches[idx].time, last)) {
        count++
        idx++
      } else {
        break
      }
    }
    return count
  }

  async dailyReport() {
    let now = moment()
    let todays = this.data.infos.filter((info) => isSameDay(info.time, now))
    let peopleCount = 0
    let problemCount = 0
    let recommends = []
    for (let info of todays) {
      peopleCount++
      problemCount += info.num
      if (info.recommend !== '') {
        recommends.push(info.recommend)
      }
    }
    await this.room.say(
      `${now.format('YYYY年MM月DD日 日报')}
今日有 ${peopleCount} 人打卡，共完成 ${problemCount} 道题目。
推荐好题： ${recommends.join(', ')}`)
  }

}

export default ExercisePuncher