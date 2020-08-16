import { getBotInstance } from './bot'
import ExercisePuncher from './exercise-puncher'
import { puncher as pc } from './config'
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

  const puncherTest = new ExercisePuncher(bot, pc.exercisePuncherTest)
  await puncherTest.init()

  const puncher = new ExercisePuncher(bot, pc.exercisePuncher)
  await puncher.init()

  let me = await bot.Contact.find({alias: 'master'})

  if (!me) {
    console.log('failed to get master.')
  } else {
    me.say('启动成功。')
  }

  new CronJob('0 30 23 * * *', () => {
    console.log('it\'s ' + new Date().toLocaleTimeString() + ' now, asking for life calendar update.');
    sequenced_get_calender(bot, me);
  }, null, true, 'Asia/Shanghai');

  new CronJob('0 0 0 * * *', () => {
    me.say('一亩三分地签到')
  }, null, true, 'Asia/Shanghai');

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

  cmd_table.push([
    /(^cal add|^记录) ([\s\S]+)/,
    (msg) => {
      let content = /(^cal add|^记录) ([\s\S]+)/.exec(msg.text())[2];
      add_calendar_item(content);
      msg.say(`日历条目 "${content}" 已添加。`);
    }
  ]);

  cmd_table.push([
    /^cal show/,
    (msg) => {
      get_calendar_items(bot, msg.from());
    }
  ]);

  cmd_table.push([
    /(^cal del|^删除条目) (\d+)/,
    (msg) => {
      let idx = parseInt(/(^cal del|^删除条目) (\d+)/.exec(msg.text())[2]);
      let item = del_calendar_item(idx);
      msg.say(`日历条目 "${item}" 已删除。`);
    }
  ]);

  cmd_table.push([
    /(^cal clear|^清空日历)/,
    (msg) => {
      clear_calendar_items();
      msg.say(`当日日历内容已清空。`);
    }
  ]);
})()
