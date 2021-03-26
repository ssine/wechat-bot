import { Wechaty, Room } from 'wechaty'
import {
  MessageType,
} from 'wechaty-puppet'

type MessageSyncerConfig = {
  fromRooms: Record<string, string>
  toRooms: Record<string, string>
}

class MessageSyncer {
  bot: Wechaty
  config: MessageSyncerConfig
  fromRooms: { room: Room, name: string }[]
  toRooms: { room: Room, name: string }[]

  constructor(bot: Wechaty, config: MessageSyncerConfig) {
    this.bot = bot
    this.config = config
    this.fromRooms = []
    this.toRooms = []
  }

  async init() {
    for (let topic of Object.keys(this.config.fromRooms)) {
      const room = await this.bot.Room.find({ topic: topic })
      if (!room) {
        console.error(`room for ${topic} not found!`)
        return
      }
      this.fromRooms.push({
        room: room,
        name: this.config.fromRooms[topic]
      })
    }
    for (let topic of Object.keys(this.config.toRooms)) {
      const room = await this.bot.Room.find({ topic: topic })
      if (!room) {
        console.error(`room for ${topic} not found!`)
        return
      }
      this.toRooms.push({
        room: room,
        name: this.config.toRooms[topic]
      })
    }

    this.bot.on('message', async (msg) => {
      try {

        const fromRoomId = msg.room()?.id;
        if (!fromRoomId) return
        let fromName = ''
        if (this.fromRooms.some((rm) => {
          if (rm.room.id === fromRoomId) {
            fromName = rm.name
            return true
          }
          return false
        })) {
          for (const targetRoom of this.toRooms) {
            if (targetRoom.room.id === fromRoomId)
              continue
            const from = msg.talker()
            if (msg.type() === MessageType.Text && from) {
              const dispName = (await msg.room().alias(from)) || from.name() || from.id;
              targetRoom.room.say(`[${dispName}@${fromName}] ${msg.text()}`)
            } else {
              targetRoom.room.say(msg)
            }
          }
        }

      } catch (err) {
        console.log(err)
      }

    })
  }
}

export default MessageSyncer
