import * as fs from 'fs'
import { Wechaty, Room, Message, Contact } from 'wechaty'
import {
  FriendshipType,
  MessageType, RoomQueryFilter,
} from 'wechaty-puppet'
import {TCPGame} from './three_card_poker'
import {FCPGame} from './five_card_poker'
import {RandomRedEnvelop as RandRE, EqualRedEnvelop as EqualRE} from './red_envelop'

import {
  Account, CoinConfig, getDispName,
  sleep, filterAsync, shuffle
} from './account_utils'

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

type RRState = {
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
  TcpGame: TCPGame
  FcpGame: FCPGame
  RRE :RandRE
  ERE :EqualRE

  constructor(bot: Wechaty, config: CoinConfig) {
    this.bot = bot
    this.config = config
    this.accounts = {}
    this.writeQueue = []
    this.inGame = false
    this.TcpGame = new TCPGame(this.bot);
    this.FcpGame = new FCPGame(this.bot);
    this.RRE = new RandRE(this.bot);
    this.ERE = new EqualRE(this.bot);
  }

  async init() {
    this.accounts = JSON.parse(await fs.promises.readFile(this.config.storage, 'utf-8'))

    this.bot.on('message', async (msg: Message) => {
    /*
      if (msg.self() || msg.age() > 3 * 60) {
        return
      }
      */

      const text = msg.text()
      if (text.includes('充值') && msg.talker().id === this.config.adminId) {
        const res = /.*充值(-?\d+(\.\d+)?)/.exec(text)
        if (!res) return
        const amount = parseInt(res[1])
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

      /*
      if (!await msg.mentionSelf()) return
      */

      if (text.includes('7u币') || text.includes('7U币')) {
        msg.say(`输入“我的”查看余额
输入“富豪榜”查看排行榜
输入“比大小”开始比大小游戏
输入“比大小2”在非递减押注模式下进行
输入“轮盘”开始轮盘游戏
输入“轮盘2”在非递减押注模式下进行
输入“TCP”开始Three Card Poker游戏
输入“决斗 X”开始决斗游戏, 底注为X
输入“随机红包”开始发随机红包
输入“平分红包”开始发平分红包`)
        return
      }

      if (text.includes('我的')) {
        const target = msg.talker()
        msg.say(`${await getDispName(target, msg.room())} 余额： ${+((await this.getAccount(target.id)).balance.toFixed(2))} B`)
        return
      }

      if (text.includes('转账')) {
        const targets = (await msg.mentionList()).filter(acc => acc.id !== this.bot.userSelf().id)
        const amount = parseFloat(/\d+(.\d+)?/.exec(text)?.[0])
        if (!amount) return
        const total = amount * targets.length
        const sender = await this.getAccount(msg.talker().id)
        if (sender.balance < total) {
          msg.say(`${await getDispName(msg.talker(), msg.room())} 余额 ${sender.balance} 不足 ${total} B`)
          return
        }
        sender.balance -= total
        for (let t of targets) {
          (await this.getAccount(t.id)).balance += amount
        }
        await this.saveData()
        const dispNames = await Promise.all(targets.map(t => getDispName(t, msg.room())))
        msg.say(`${await getDispName(msg.talker(), msg.room())} 向 ${dispNames.join('&')} ${targets.length > 1 && '各'}转账 ${amount} B`)
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
          resp = resp + `\n${await getDispName(act.contact, room)}: ${+(act.account.balance.toFixed(2))}`
        }
        msg.say(resp)
        return
      }

      if(text.includes('随机红包')){
        const room = msg.room()
        if (!room) return
        if (this.inGame) {
          msg.say('已在游戏中不可发红包');
          return
        }
        this.inGame = true;
        await this.RRE.run(msg,this.accounts);
        await this.saveData()
        this.inGame = false;
      }
      if(text.includes('平分红包')){
        const room = msg.room()
        if (!room) return
        if (this.inGame) {
          msg.say('已在游戏中不可发红包');
          return
        }
        this.inGame = true;
        await this.ERE.run(msg,this.accounts);
        await this.saveData()
        this.inGame = false;
      }

      if (text.toLowerCase().includes('tcp')){
        const room = msg.room()
        if (!room) return
        if (this.inGame) {
          msg.say('已在游戏中！')
          return
        }
        this.inGame = true;
        await this.TcpGame.run(msg,this.accounts);
        await this.saveData()
        this.inGame = false
        return
      }

      if (text.includes('决斗')){
        const room = msg.room()
        if (!room) return
        if (this.inGame) {
          msg.say('已在游戏中！')
          return
        }
        this.inGame = true;
        await this.FcpGame.run(msg,this.accounts, text);
        await this.saveData()
        this.inGame = false
        return
      }

      if (text.includes('比大小')) {
        const isInc = text.includes('2')
        const room = msg.room()
        if (!room) return
        if (this.inGame) {
          msg.say('已在游戏中！')
          return
        }
        this.inGame = true
        const state: CmpState[] = []
        msg.say('输入「来 x」付出 xB 进行挑战，默认5。请开始输入：')
        // 输入「押 编号 [5~100]B」押注某个玩家。

        const addPlayer = async (m: Message) => {
          if (m.room()?.id === room.id && m.text().includes('来')) {
            const act = await this.getAccount(m.talker().id)
            if (state.map(s => s.contact.id).includes(m.talker().id)) {
              m.say(`${await getDispName(m.talker(), room)} 无效，您已加入`)
              return
            }
            const amount = parseFloat(/\d+(.\d+)?/.exec(m.text())?.[0]) || 5
            if (amount < 1) {
              m.say(`${await getDispName(m.talker(), room)} 无效，最少押注1B`)
              return
            }
            if (isInc && state.length > 0 && amount < state[state.length - 1].mortage) {
              m.say(`${await getDispName(m.talker(), room)} 押注小于上家 ${state[state.length - 1].mortage}B ，无法加入`)
              return
            }
            if (act.balance < amount) {
              m.say(`${await getDispName(m.talker(), room)} 余额不足 ${amount}B ，无法加入`)
              return
            }
            act.balance -= amount
            state.push({
              contact: m.talker(),
              mortage: amount,
              alive: true,
              bets: []
            })
            const idx = state.length
            await m.say(`${idx}. ${await getDispName(m.talker(), room)} 成功加入，押 ${amount}B`)
          }
        }
        this.bot.on('message', addPlayer)

        await sleep(20000)
        this.bot.off('message', addPlayer)

        const total = state.length
        if (total === 0) {
          room.say('20秒无玩家加入，游戏结束。')
          this.inGame = false
          return
        }
        const numWinner = Math.ceil(total / 3)

        while (true) {
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
          if (alives.length <= numWinner) {
            const gain = state.map(s => s.mortage).reduce((a, b) => a + b, 0);
            const totoalMortage = alives.map(s => s.s.mortage).reduce((a, b) => a + b, 0);
            resp += '收益列表:\n'
            for (let a of alives) {
              const benefit = gain / totoalMortage * a.s.mortage;
              (await this.getAccount(a.s.contact.id)).balance += benefit
              resp += `${a.idx+1}.${await getDispName(a.s.contact, room)} ${+(benefit.toFixed(2))} B\n`
            }
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
          await sleep(5000)
        }

        await this.saveData()
        this.inGame = false
        return
      }

      if (text.includes('轮盘')) {
        const isInc = text.includes('2')
        const room = msg.room()
        if (!room) return
        if (this.inGame) {
          msg.say('已在游戏中！')
          return
        }
        this.inGame = true
        const state: RRState[] = []
        msg.say('游戏开局，子弹 A~F 共 6 发，有 3 颗实弹，参与者轮流挨枪子儿。 输入「来 x」付出 xB 进行挑战，默认5。请开始输入：')
        // 输入「押 编号 [5~100]B」押注某个玩家。

        const addPlayer = async (m: Message) => {
          if (m.room()?.id === room.id && m.text().includes('来')) {
            const act = await this.getAccount(m.talker().id)
            if (state.map(s => s.contact.id).includes(m.talker().id)) {
              m.say(`${await getDispName(m.talker(), room)} 无效，您已加入`)
              return
            }
            const amount = parseFloat(/\d+(.\d+)?/.exec(m.text())?.[0]) || 5
            if (amount < 1) {
              m.say(`${await getDispName(m.talker(), room)} 无效，最少押注1B`)
              return
            }
            if (isInc && state.length > 0 && amount < state[state.length - 1].mortage) {
              m.say(`${await getDispName(m.talker(), room)} 押注小于上家 ${state[state.length - 1].mortage}B ，无法加入`)
              return
            }
            if (act.balance < amount) {
              m.say(`${await getDispName(m.talker(), room)} 余额不足 ${amount}B ，无法加入`)
              return
            }
            act.balance -= amount
            state.push({
              contact: m.talker(),
              mortage: amount,
              alive: true,
              bets: []
            })
            const idx = state.length
            await m.say(`${idx}. ${await getDispName(m.talker(), room)} 成功加入，押 ${amount}B`)
          }
        }
        this.bot.on('message', addPlayer)

        await sleep(20000)
        this.bot.off('message', addPlayer)

        const total = state.length
        if (total === 0) {
          room.say('20秒无玩家加入，游戏结束。')
          this.inGame = false
          return
        }
        const numWinner = Math.ceil(total / 4)

        let playerIdx = -1
        const getNextPlayer = () => {
          let localIdx = playerIdx
          while (true) {
            localIdx ++
            if (localIdx >= state.length)
              localIdx = 0
            if (state[localIdx].alive)
              return {
                idx: localIdx,
                player: state[localIdx]
              }
          }
        }

        msg.say(`\n${1}.${await getDispName(state[0].contact, room)} 😅🔫 子弹A\n`)

        let bullets = shuffle([true, true, true, false, false, false])
        let bulletIdx = 0
        while (true) {
          await sleep(5000)
          let resp = ''
          let alives:{
            idx: number;
            s: RRState;
          }[] = []

          const {idx, player} = getNextPlayer()
          playerIdx = idx

          resp += `${idx+1}.${await getDispName(player.contact, room)} `
          if (bullets[bulletIdx]) {
            resp += `🤪🔫 子弹${String.fromCharCode('A'.charCodeAt(0) + bulletIdx)}\n`
            player.alive = false
          } else {
            resp += `😎🔫 子弹${String.fromCharCode('A'.charCodeAt(0) + bulletIdx)}\n`
          }

          alives = state.map((s, idx) => ({idx: idx, s: s})).filter(s => s.s.alive)
          if (alives.length === 0) break
          resp += '幸存者：'
          for (let a of alives) {
            resp += `${a.idx+1}.${await getDispName(a.s.contact, room)} `
          }

          if (alives.length <= numWinner) {
            const gain = state.map(s => s.mortage).reduce((a, b) => a + b, 0);
            const totoalMortage = alives.map(s => s.s.mortage).reduce((a, b) => a + b, 0);
            resp += '收益列表:\n'
            for (let a of alives) {
              const benefit = gain / totoalMortage * a.s.mortage;
              (await this.getAccount(a.s.contact.id)).balance += benefit
              resp += `${a.idx+1}.${await getDispName(a.s.contact, room)} ${+(benefit.toFixed(2))} B\n`
            }
            resp += '游戏结束，欢迎下次来玩'
            msg.say(resp)
            break
          } else {
            bulletIdx += 1
            if (bulletIdx >= 6) {
              bullets = shuffle([true, true, true, false, false, false])
              bulletIdx = 0
              resp += '\n重新装弹。'
            }

            resp += '\n游戏继续...'

            const {idx: nextIdx, player: nextPlayer} = getNextPlayer()
            resp += `\n下一位：\n${nextIdx+1}.${await getDispName(nextPlayer.contact, room)} 😅🔫 子弹${String.fromCharCode('A'.charCodeAt(0) + bulletIdx)}\n`
          }

          msg.say(resp)
        }

        await this.saveData()
        this.inGame = false
        return
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
