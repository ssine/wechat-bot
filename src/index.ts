import { getBotInstance } from './bot'
import ExercisePuncher from './exercise-puncher'
import MessageSyncer from './syncer'
import { message_sync, message_sync_2, message_sync_test, puncher as pc,  } from './config'
import {
  sequenced_get_calender,
  get_calendar_items,
  add_calendar_item,
  del_calendar_item,
  clear_calendar_items
} from './calendar'
import { CronJob } from 'cron'
import { Wechaty, Message } from 'wechaty'

(async () => {
  const bot = await getBotInstance()

  // const puncherTest = new ExercisePuncher(bot, pc.exercisePuncherTest)
  // await puncherTest.init()

  // const puncher = new ExercisePuncher(bot, pc.exercisePuncher)
  // await puncher.init()

  const syncer = new MessageSyncer(bot, message_sync)
  await syncer.init()

  const syncer2 = new MessageSyncer(bot, message_sync_test)
  await syncer2.init()

  const syncer3 = new MessageSyncer(bot, message_sync_2)
  await syncer3.init()

  let me = await bot.Contact.find({alias: 'master'})

  if (!me) {
    console.log('failed to get master.')
  } else {
    me.say('启动成功。')
  }

  let cmd_table: [RegExp, (msg: Message) => void][] = [];

  bot.on('message', (msg: Message): void => {
    for (let [reg, callback] of cmd_table) {
      if (reg.test(msg.text())) callback(msg);
    }
  });

  cmd_table.push([
    /^roll$/,
    (msg) => {
      console.log('roll instruction received.');
      msg.say((Math.random() * 100).toFixed(2).toString());
    }
  ]);

})()
