import * as fs from 'fs'
import { Wechaty, Room, Message, Contact } from 'wechaty'
import {
  FriendshipType,
  MessageType, RoomQueryFilter,
} from 'wechaty-puppet'

type Account = {
  balance: number
}

type CoinConfig = {
  storage: string
  adminId: string
}

type CmpState = {
  contact: Contact
  mortage: number
  alive: boolean
  point?: number
  bets: {
    contact: Contact
    mortage: number
  }[]
}

class Coin {
  bot: Wechaty
  config: CoinConfig
  accounts: Record<string, Account>
  writeQueue: Promise<unknown>[]
  inGame: boolean

  constructor(bot: Wechaty, config: CoinConfig) {
    this.bot = bot
    this.config = config
    this.accounts = {}
    this.writeQueue = []
    this.inGame = false
  }

  async init() {
    this.accounts = JSON.parse(await fs.promises.readFile(this.config.storage, 'utf-8'))

    this.bot.on('message', async (msg: Message) => {
      if (msg.self() || msg.age() > 3 * 60) {
        return
      }

      const text = msg.text()
      if (text.includes('充值') && msg.talker().id === this.config.adminId) {
        const res = /\d+/.exec(text)
        if (!res) return
        const amount = parseInt(res[0])
        const targets = await msg.mentionList()
        if (text.includes('庄家')) targets.push(msg.talker())
        for (let target of targets) {
          (await this.getAccount(target.id)).balance += amount
        }
        const dispNames = await Promise.all(targets.map(t => getDispName(t, msg.room())))
        await this.saveData()
        msg.say(`已为${dispNames.join('&')}充值 ${amount} 7U币`)
        return
      }

      if (!await msg.mentionSelf()) return

      if (text.includes('7u币') || text.includes('7U币')) {
        msg.say('输入“我的”查看余额\n输入“富豪榜”查看排行榜\n输入“比大小”开始比大小游戏')
        return
      }

      if (text.includes('我的')) {
        const target = msg.talker()
        msg.say(`${await getDispName(target, msg.room())} 余额： ${(await this.getAccount(target.id)).balance} B`)
        return
      }

      if (text.includes('富豪榜')) {
        const room = msg.room()
        if (!room) return
        const members = await room.memberAll()

        const accounts = members.filter((mem) => this.accounts[mem.id]).map(mem => ({
          contact: mem, 
          account: this.accounts[mem.id]
        })).sort((a, b) => b.account.balance - a.account.balance)

        let resp = '7U币 富豪榜'
        for (let act of accounts) {
          resp = resp + `\n${await getDispName(act.contact, room)}: ${act.account.balance}`
        }
        msg.say(resp)
        return
      }

      if (text.includes('比大小')) {
        const room = msg.room()
        if (!room) return
        if (this.inGame) {
          msg.say('已在游戏中！')
          return
        }
        this.inGame = true
        const state: CmpState[] = []
        msg.say('输入「来」付出 5B 进行挑战，请开始输入：')
        // 输入「押 编号 [5~100]B」押注某个玩家，

        const addPlayer = async (m: Message) => {
          if (await m.mentionSelf() && m.room()?.id === room.id && m.text().includes('来')) {
            const act = await this.getAccount(m.talker().id)
            if (state.map(s => s.contact.id).includes(m.talker().id)) {
              m.say(`${await getDispName(m.talker(), room)} 无效，您已加入`)
              return
            }
            if (act.balance < 5) {
              m.say(`${await getDispName(m.talker(), room)} 余额不足 5B ，无法加入`)
              return
            }
            act.balance -= 5
            state.push({
              contact: m.talker(),
              mortage: 5,
              alive: true,
              bets: []
            })
            const idx = state.length
            await m.say(`${idx}. ${await getDispName(m.talker(), room)} 成功加入，自动押 5B`)
          }
        }
        this.bot.on('message', addPlayer)

        await sleep(15000)
        
        if (state.length === 0) {
          room.say('20秒无玩家加入，游戏结束。')
          this.bot.off('message', addPlayer)
        }

        while (true) {
          await sleep(5000)
          let resp = ''
          let hasBig = false
          for (let idx = 0; idx < state.length; idx++) {
            const s = state[idx]
            if (!s.alive) continue
            const point = Math.floor(Math.random() * 6) + 1
            const big = point > 3.5
            resp += `${idx+1}.${await getDispName(s.contact, room)} ${point}点： ${big ? '大' : '小'}\n`
            s.point = point
            if (big) hasBig = true
          }
          if (hasBig) {
            state.forEach(s => {
              if (s.alive && s.point < 3.5) {
                s.alive = false
              }
            })
          }

          const alives = state.map((s, idx) => ({idx: idx, s: s})).filter(s => s.s.alive)
          if (alives.length === 0) {
            break
          }
          if (alives.length === 1) {
            const gain = state.map(s => s.mortage).reduce((a, b) => a + b, 0);
            (await this.getAccount(alives[0].s.contact.id)).balance += gain
            resp += `赢家 ${alives[0].idx+1}.${await getDispName(alives[0].s.contact, room)}\n`
            resp += '收益列表:\n'
            resp += `${await getDispName(alives[0].s.contact, room)} ${gain} B\n`
            resp += '游戏结束，欢迎下次来玩'
            msg.say(resp)
            break
          }

          resp += '幸存者：'
          for (let a of alives) {
            resp += `${a.idx+1}.${await getDispName(a.s.contact, room)} `
          }
          resp += '\n游戏继续...'
          msg.say(resp)
        }
        
        this.bot.off('message', addPlayer)
        await this.saveData()
        this.inGame = false
      }

    })
  }

  async getAccount(wxid: string) {
    if (!this.accounts[wxid]) {
      this.accounts[wxid] = {
        balance: 30
      }
    }
    return this.accounts[wxid]
  }

  async saveData() {
    const promise = new Promise(async (resolve, reject) => {
      if (this.writeQueue.length > 0) {
        await this.writeQueue[this.writeQueue.length - 1]
      }
      await fs.promises.writeFile(this.config.storage, JSON.stringify(this.accounts, null, 2))
      resolve(null)
      this.writeQueue.splice(0, 1)
    })
    this.writeQueue.push(promise)
    return promise
  }

}

const getDispName = async (contact: Contact, room?: Room) => {
  return (await room?.alias(contact)) || contact.name() || contact.id
}

const sleep = async (ms: number) => {
  return new Promise((res, rej) => {
    setTimeout(() => {
      res(null)
    }, ms);
  })
}

const filterAsync = (array: any[], filter: any) =>
  Promise.all(array.map(entry => filter(entry)))
  .then(bits => array.filter(entry => bits.shift()));

const backUp = () => {
  // let lastAdd = Date.now() / 1000
  // const addPlayer = async (m: Message) => {
  //   if (await m.mentionSelf() && m.room()?.id === room.id && m.text().includes('来')) {
  //     players.push(m.talker())
  //     const idx = players.length
  //     lastAdd = Date.now() / 1000
  //     await m.say(`${idx}. ${await getDispName(m.talker(), room)} 成功加入，自动押 5B`)
  //   }
  // }
  // this.bot.on('message', addPlayer)
  // while (true) {
  //   await sleep(1000)
  //   if (Date.now() / 1000 - lastAdd > 5)
  //     break
  // }
  // this.bot.off('message', addPlayer)
}

export default Coin
