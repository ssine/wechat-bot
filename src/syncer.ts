import { Wechaty, Room, Message } from 'wechaty'
import {
  MessageType, RoomQueryFilter,
} from 'wechaty-puppet'

type MessageSyncerConfig = {
  fromRooms: Record<string, RoomQueryFilter>
  toRooms: Record<string, RoomQueryFilter>
  blacklist?: string[]
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
    for (let [name, query] of Object.entries(this.config.fromRooms)) {
      const room = await this.bot.Room.find(query)
      if (!room) {
        console.error(`room for ${query.id || query.topic} not found!`)
        return
      }
      if (this.config.blacklist) {
        room.on('join', (invitees) => {
          const blocked = invitees.filter(invitee => this.config.blacklist.includes(invitee.id))
          if (blocked.length > 0) {
            room.say(`=== Warning ===\nBlocked contact ${blocked.join(',')} joined room!`)
          }
        })
      }
      this.fromRooms.push({
        room: room,
        name: name
      })
    }
    for (let [name, query] of Object.entries(this.config.toRooms)) {
      const room = await this.bot.Room.find(query)
      if (!room) {
        console.error(`room for ${query.id || query.topic} not found!`)
        return
      }
      this.toRooms.push({
        room: room,
        name: name
      })
    }

    this.bot.on('message', async (msg: Message) => {
      if (msg.self() || msg.age() > 3 * 60) {
        return
      }

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

          if (this.config.blacklist && this.config.blacklist.includes(msg.talker().id)) {
            msg.say(`User ${msg.talker().id} blocked, stop forwarding.`)
            return
          }

          for (const targetRoom of this.toRooms) {
            if (targetRoom.room.id === fromRoomId)
              continue
            const from = msg.talker()
            if (msg.type() === MessageType.Text && from) {
              const dispName = (await msg.room().alias(from)) || from.name() || from.id;
              targetRoom.room.say(`[${dispName}@${fromName}] ${msg.text()}`)
            } else if (msg.type() === MessageType.Url) {
              targetRoom.room.say(await msg.toUrlLink())
            } else if ([MessageType.Image, MessageType.Emoticon].includes(msg.type())) {
              msg.forward(targetRoom.room)
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
