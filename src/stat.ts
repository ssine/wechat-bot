import { CronJob } from "cron";
import { Wechaty, Room, Message, Contact } from "wechaty";
import { MessageType, RoomQueryFilter } from "wechaty-puppet";

type StatConfig = {
  rooms: RoomQueryFilter[];
};

const getDispName = async (contact: Contact, room?: Room) => {
  return (await room?.alias(contact)) || contact.name() || contact.id;
};

const initRoom = async (room: Room) => {
  let counter: Record<string, number> = {};

  const showRanking = async () => {
    // new CronJob('0 * * * * *', async () => {
    const members = await room.memberAll();

    const accounts = members
      .filter((mem) => counter[mem.id])
      .sort((a, b) => counter[b.id] - counter[a.id]);

    let resp = "龙王榜(今日发送信息数)";
    for (let act of accounts) {
      resp = resp + `\n${await getDispName(act, room)}: ${counter[act.id]}`;
    }
    room.say(resp);
  };

  room.on("message", async (msg: Message) => {
    if (msg.self() || msg.age() > 3 * 60) {
      return;
    }
    if (counter[msg.talker().id]) {
      counter[msg.talker().id]++;
    } else {
      counter[msg.talker().id] = 1;
    }

    if (await msg.mentionSelf() && msg.text().includes('龙王榜')) {
      await showRanking();
    }
  });

  new CronJob(
    "0 0 0 * * *",
    () => {
      counter = {};
    },
    null,
    true,
    "Asia/Shanghai"
  );
};

class Stat {
  bot: Wechaty;
  config: StatConfig;

  constructor(bot: Wechaty, config: StatConfig) {
    this.bot = bot;
    this.config = config;
  }

  async init() {
    for (let q of this.config.rooms) {
      const room = await this.bot.Room.find(q);
      if (!room) {
        console.error(`room for ${JSON.stringify(q)} not found!`);
        return;
      }

      await initRoom(room);
    }
  }
}

export default Stat;
