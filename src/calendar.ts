import { get_file_content, put_file } from './oss'
import { Wechaty, Contact } from 'wechaty'

let calendar_items: string[] = []

async function get_life_calendar(bot: Wechaty, me: Contact, date_str: string) {
  const file_name = 'life_calendar/events.html';

  console.log('life calendar event triggered');
  console.log('getting today\'s data.');

  await me.say('今天做了些什么呢？');
  me.say('每个事件一条，空语句或句号结束。');
  while (true) {
    let content = (await bot.waitForMessage({contact: me.id})).text();
    if (content === '.' || content.trim() === '' || content === '。') break;
    calendar_items.push(content);
  }

  me.say('那么，给今天分配一个分数吧！');
  let score = (await bot.waitForMessage({contact: me.id})).text();

  let slot = '<div date="' + date_str + '" credit="' + score + '">' + calendar_items.join('<br/>') + '</div>\r\n';
  console.log('slot to append: ' + slot);

  console.log('getting file from oss');
  let event_file = await get_file_content(file_name);
  let events = event_file.split('\n');
  events = events.map(s => s.trim());

  events.splice(events.length - 1, 0, slot);

  event_file = events.join('\n');
  console.log('saving file to oss');
  await put_file(file_name, event_file);

  me.say(`事件\n${calendar_items.join('\n')}\n保存成功`);
  // me.say(823188494, '你的男朋友 lsy 记录了\n' + calendar_items.join('\n') + '\n，打分 ' + score + ' 。');
  calendar_items = [];
  console.log('done');
}

let calender_promises_lst: Promise<any>[] = [];

async function sequenced_get_calender(bot: Wechaty, me: Contact) {
  let date = new Date();
  let date_str = date.getMonth() + 1 +
    '/' + date.getDate() +
    '/' + date.getFullYear();
  calender_promises_lst.push(new Promise(async (res, rej) => {
    if (calender_promises_lst.length > 0) {
      me.say(`上次的日历还没有记录，正在等待之前的完成。`);
      await calender_promises_lst[calender_promises_lst.length - 1];
    }
    await get_life_calendar(bot, me, date_str);
    res();
    calender_promises_lst.splice(0, 1);
  }));
}

async function get_calendar_items(bot: Wechaty, me: Contact) {
  await me.say('今日已记录事件：\n' + calendar_items.join('\n'));
  return;
}

function add_calendar_item(event: string) {
  calendar_items.push(event);
  return;
}

function del_calendar_item(idx: number) {
  let item = calendar_items[idx];
  calendar_items.splice(idx, 1);
  return item;
}

function clear_calendar_items() {
  calendar_items = [];
  return;
}

export {
  sequenced_get_calender,
  get_calendar_items,
  add_calendar_item,
  del_calendar_item,
  clear_calendar_items
}
