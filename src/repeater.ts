import { Wechaty, Room, Message } from 'wechaty'
import {
  MessageType, RoomQueryFilter,
} from 'wechaty-puppet'

type RepeaterConfig = {
  rooms: RoomQueryFilter[]
}

class Repeater {
  bot: Wechaty
  config: RepeaterConfig
  msgs: Record<string, {
    pos: Set<string>,
    neg: Set<string>
  }>

  constructor(bot: Wechaty, config: RepeaterConfig) {
    this.bot = bot
    this.config = config
    this.msgs = {}
  }

  async init() {
    for (let q of this.config.rooms) {
      const room = await this.bot.Room.find(q)
      if (!room) {
        console.error(`room for ${q} not found!`)
        return
      }
      this.msgs[room.id] = {
        pos: new Set(),
        neg: new Set(),
      }
    }

    this.bot.on('message', async (msg: Message) => {
      if (msg.self() || msg.age() > 3 * 60) {
        return
      }

      const state = this.msgs[msg.room().id]
      const text = msg.text()
      if (!state || !text || state.neg.has(text)) {
        return
      }

      if (state.pos.has(text)) {
        msg.say(text)
        state.neg.add(text)
        setTimeout(() => {
          state.neg.delete(text)
        }, 60 * 1000);
        return
      }

      state.pos.add(text)
      setTimeout(() => {
        state.pos.delete(text)
      }, 60 * 1000)

    })
  }
}

export default Repeater
