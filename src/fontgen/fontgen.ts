import { Wechaty, Room, Message } from 'wechaty'
import {
  MessageType,
} from 'wechaty-puppet'
import { createCanvas, registerFont, loadImage } from 'canvas'
import * as fs from 'fs'
import GIFEncoder from 'gifencoder'
import { FileBox }  from 'file-box'


registerFont('./src/fontgen/ErZiYuanMengManJian.ttf', {family: 'ErZiYuanMengManJian'})
let shadowColor = 'red'

export class FontGen {
  bot: Wechaty

  constructor(bot: Wechaty) {
    this.bot = bot
  }

  async init() {
    this.bot.on('message', async (msg: Message) => {
      if (!msg.text().startsWith('fg')) return
      if (msg.text().length > 17) return
      for (let i = 3; i < msg.text().length; i++) {
        const fb = FileBox.fromBuffer(await gen(msg.text()[i]), 't.png')
        await msg.say(fb)
      }
    })
  }
}

const gen = async (text: string) => {
  const L = 500
  const M = 50
  const canvas = createCanvas(L + 2 * M, L + 2 * M)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = "#F5F5F5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = await loadImage('./src/fontgen/bg.png')
  ctx.textBaseline = "bottom";
  
  // Write "Awesome!"
  ctx.font = `${L}px ErZiYuanMengManJian`
  // ctx.rotate(0.1)
  ctx.fillStyle = ctx.createPattern(img, 'repeat');
  ctx.shadowColor = 'red'
  // ctx.shadowBlur = 100
  ctx.shadowOffsetX = 10
  ctx.shadowOffsetY = 10
  ctx.fillText(text[0], M, M + L)
  
  // const encoder = new GIFEncoder(L + 2 * M, L + 2 * M);
  // encoder.start();
  // const s = encoder.createWriteStream({ repeat: -1, quality: 10, delay: 0 })
  // s.push(canvas.toBuffer('image/png'))
  // encoder.finish();
  return canvas.toBuffer('image/png');
  // s.pipe(fs.createWriteStream('myanimated.gif'));
}
